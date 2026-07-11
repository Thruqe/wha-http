package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"
	"github.com/Thruqe/whatsrook/cli"
	"github.com/Thruqe/whatsrook/store"
)

type client struct {
	conn      *websocket.Conn
	ctx       context.Context
	cancel    context.CancelFunc
	accountID string
	send      chan []byte
}

type upstreamState struct {
	ctx    context.Context
	cancel context.CancelFunc
}

var (
	mu          sync.RWMutex
	subscribers = map[string]map[*client]struct{}{}
	upstreams   = map[string]*websocket.Conn{}
	upstreamCtx = map[string]upstreamState{}
	lastEvent   = map[string][]byte{}
)

const (
	retryDelay   = 500 * time.Millisecond
	maxRetries   = 20
	restartDelay = 2 * time.Second
	maxRestarts  = 3
)

var replayEvents = map[string]bool{
	"pair_code": true,
	"pair_qr":   true,
}

// sendEvent serializes a specific event type and payload into JSON and
// pushes it onto the client's internal send channel buffer.
func sendEvent(c *client, typ string, payload map[string]any, id *string) {
	msg := map[string]any{"type": typ, "payload": payload}
	if id != nil {
		msg["id"] = *id
	}
	b, _ := jsonMarshal(msg)
	Trace("[proxy] sendEvent type=%s account=%s", typ, c.accountID)
	select {
	case c.send <- b:
	default:
		Warn("[proxy] sendEvent dropped account=%s type=%s", c.accountID, typ)
	}
}

// broadcastRaw safely copies the given raw byte array to all active
// web client connections subscribed to the specified account ID.
func broadcastRaw(accountID string, data []byte) {
	mu.RLock()
	subs := subscribers[accountID]
	mu.RUnlock()
	Trace("[proxy] broadcastRaw account=%s subscribers=%d", accountID, len(subs))
	for c := range subs {
		select {
		case c.send <- data:
		default:
			Warn("[proxy] dropped message for slow client account=%s", accountID)
		}
	}
}

// broadcastEvent wraps a structured payload into an event format and
// transmits it to all registered subscribers under the given account ID.
func broadcastEvent(accountID, typ string, payload map[string]any) {
	msg := map[string]any{"type": typ, "payload": payload}
	b, _ := jsonMarshal(msg)
	Trace("[proxy] broadcastEvent type=%s account=%s", typ, accountID)
	broadcastRaw(accountID, b)
}

// runUpstreamConn monitors the established WebSocket pipe from the upstream backend service,
// processes caching criteria, and ensures proper resource tear down via context cancellation.
func runUpstreamConn(accountID, phone string, port int, conn *websocket.Conn, ctx context.Context) {
	defer func() {
		err := conn.CloseNow()
		if err != nil {
			return
		}
		Info("[proxy] upstream disconnected account=%s", accountID)
		mu.Lock()
		delete(upstreams, accountID)
		state, exists := upstreamCtx[accountID]
		if exists {
			state.cancel()
			delete(upstreamCtx, accountID)
		}
		mu.Unlock()
		broadcastEvent(accountID, "upstream_closed", map[string]any{"accountId": accountID})
		go connectUpstream(accountID, phone, port)
	}()

	for {
		var raw json.RawMessage
		if err := wsjson.Read(ctx, conn, &raw); err != nil {
			Trace("[proxy] upstream read error account=%s err=%v", accountID, err)
			break
		}

		msg := []byte(raw)
		Trace("[proxy] upstream message account=%s raw=%s", accountID, string(msg))

		var evt map[string]any
		if json.Unmarshal(msg, &evt) == nil {
			if typ, ok := evt["type"].(string); ok {
				Trace("[proxy] upstream event type=%s account=%s", typ, accountID)
				if replayEvents[typ] {
					mu.Lock()
					lastEvent[accountID] = msg
					mu.Unlock()
					Info("[proxy] cached replay event type=%s account=%s payload=%s", typ, accountID, string(msg))
				}
				if typ == "pair_success" {
					mu.Lock()
					delete(lastEvent, accountID)
					mu.Unlock()
					Info("[proxy] cleared replay cache account=%s (pair_success)", accountID)
				}
			}
		} else {
			Warn("[proxy] failed to parse upstream message account=%s raw=%s", accountID, string(msg))
		}
		go ProcessEvent(accountID, string(msg))
		broadcastRaw(accountID, msg)
	}
}

// dialUpstream retries establishing a connection to the local port hosting
// the upstream backend, returning the connection instance or a boolean status indicator.
func dialUpstream(accountID string, port int) (*websocket.Conn, bool) {
	for attempt := 1; attempt <= maxRetries; attempt++ {
		mu.RLock()
		existing, ok := upstreams[accountID]
		mu.RUnlock()
		if ok && existing != nil {
			Trace("[proxy] upstream already connected for account %s, skipping", accountID)
			return nil, true
		}

		Trace("[proxy] upstream attempt %d/%d for account %s port %d", attempt, maxRetries, accountID, port)
		dialCtx, dialCancel := context.WithTimeout(context.Background(), 3*time.Second)
		conn, _, err := websocket.Dial(dialCtx, fmt.Sprintf("ws://localhost:%d/ws", port), nil)
		dialCancel()
		if err != nil {
			Trace("[proxy] upstream dial failed attempt=%d account=%s err=%v", attempt, accountID, err)
			time.Sleep(retryDelay)
			continue
		}
		conn.SetReadLimit(-1)

		mu.Lock()
		upstreams[accountID] = conn
		mu.Unlock()

		Info("[proxy] upstream connected account=%s port=%d", accountID, port)
		go ProcessEvent(accountID, `{"type":"connected","payload":{}}`)
		return conn, false
	}
	return nil, false
}

// connectUpstream manages the lifecycle orchestration of the upstream link, triggering
// process restarts via the CLI sub-package if direct retry windows fail to mount.
func connectUpstream(accountID, phone string, port int) {
	connCtx, connCancel := context.WithCancel(context.Background())

	conn, alreadyConnected := dialUpstream(accountID, port)
	if alreadyConnected {
		connCancel()
		return
	}
	if conn != nil {
		mu.Lock()
		upstreamCtx[accountID] = upstreamState{ctx: connCtx, cancel: connCancel}
		mu.Unlock()
		go runUpstreamConn(accountID, phone, port, conn, connCtx)
		return
	}
	connCancel()

	for restartAttempt := 1; restartAttempt <= maxRestarts; restartAttempt++ {
		Warn("[proxy] upstream did not come up, restarting process attempt=%d/%d account=%s phone=%s",
			restartAttempt, maxRestarts, accountID, phone)

		if err := cli.BotRestart(phone); err != nil {
			Error("[proxy] restart failed attempt=%d account=%s err=%v", restartAttempt, accountID, err)
			continue
		}

		Info("[proxy] process restarted, waiting before retry account=%s", accountID)
		time.Sleep(restartDelay)

		connCtx, connCancel = context.WithCancel(context.Background())
		conn, alreadyConnected = dialUpstream(accountID, port)
		if alreadyConnected {
			connCancel()
			return
		}
		if conn != nil {
			mu.Lock()
			upstreamCtx[accountID] = upstreamState{ctx: connCtx, cancel: connCancel}
			mu.Unlock()
			go runUpstreamConn(accountID, phone, port, conn, connCtx)
			return
		}
		connCancel()
	}

	Error("[proxy] gave up after %d restart attempts account=%s port=%d", maxRestarts, accountID, port)
	broadcastEvent(accountID, "error", map[string]any{"message": "zevBot failed to start"})
	closeAllSubscribers(accountID)
}

// closeAllSubscribers drops all active client WebSocket connections for the assigned
// account ID and fires their distinct context cancellation routines.
func closeAllSubscribers(accountID string) {
	mu.Lock()
	subs := subscribers[accountID]
	delete(subscribers, accountID)
	mu.Unlock()
	Trace("[proxy] closing %d subscriber(s) for account %s", len(subs), accountID)
	for c := range subs {
		c.cancel()
		err := c.conn.CloseNow()
		if err != nil {
			return
		}
	}
}

// Handler intercepts client HTTP connections, validates authorization states,
// constructs bidirectional multiplexing pumps, and proxies events across lines.
func Handler(w http.ResponseWriter, r *http.Request) {
	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(parts) < 2 || parts[0] != "ws" {
		http.Error(w, "not found", 404)
		return
	}
	accountID := parts[1]

	payload, err := store.Authenticate(r)
	if err != nil {
		Warn("[proxy] auth failed account=%s err=%v", accountID, err)
		http.Error(w, "unauthorized", 401)
		return
	}
	Trace("[proxy] authenticated user=%s account=%s", payload.UserID, accountID)

	account, err := store.GetAccountByIDAndUser(accountID, payload.UserID)
	if err != nil || account == nil {
		Warn("[proxy] account not found or forbidden account=%s user=%s", accountID, payload.UserID)
		http.Error(w, "forbidden", 403)
		return
	}
	Trace("[proxy] account found account=%s status=%s port=%d", accountID, account.Status, account.Port)

	if account.Status == "disconnected" {
		Warn("[proxy] rejected WS for disconnected account=%s", accountID)
		http.Error(w, "account disconnected", 409)
		return
	}

	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
		InsecureSkipVerify: true,
	})
	if err != nil {
		Error("[proxy] upgrade failed account=%s err=%v", accountID, err)
		return
	}
	conn.SetReadLimit(-1)

	ctx, cancel := context.WithCancel(r.Context())
	c := &client{
		conn:      conn,
		ctx:       ctx,
		cancel:    cancel,
		accountID: accountID,
		send:      make(chan []byte, 64),
	}

	mu.Lock()
	if subscribers[accountID] == nil {
		subscribers[accountID] = map[*client]struct{}{}
	}
	subscribers[accountID][c] = struct{}{}
	subCount := len(subscribers[accountID])
	mu.Unlock()

	Info("[proxy] client connected account=%s total_subscribers=%d", accountID, subCount)

	sendEvent(c, "connected", map[string]any{"accountId": accountID}, nil)

	mu.RLock()
	cached, hasCached := lastEvent[accountID]
	mu.RUnlock()
	if hasCached {
		Info("[proxy] replaying cached event to new client account=%s payload=%s", accountID, string(cached))
		select {
		case c.send <- cached:
			Trace("[proxy] replay enqueued account=%s", accountID)
		default:
			Warn("[proxy] replay dropped — client send buffer full account=%s", accountID)
		}
	} else {
		Trace("[proxy] no cached event to replay for account=%s", accountID)
	}

	Trace("[proxy] ensuring upstream for account=%s port=%d", accountID, account.Port)
	go connectUpstream(accountID, account.Phone, account.Port)

	// write pump
	go func() {
		defer func() {
			cancel()
			err := conn.CloseNow()
			if err != nil {
				return
			}
		}()
		for {
			select {
			case <-ctx.Done():
				return
			case msg, ok := <-c.send:
				if !ok {
					return
				}
				Trace("[proxy] write pump sending %d bytes to client account=%s", len(msg), accountID)
				if err := conn.Write(ctx, websocket.MessageText, msg); err != nil {
					Trace("[proxy] write pump error account=%s err=%v", accountID, err)
					return
				}
			}
		}
	}()

	// read pump / cleanup
	defer func() {
		cancel()
		mu.Lock()
		delete(subscribers[accountID], c)
		remaining := len(subscribers[accountID])
		if remaining == 0 {
			delete(subscribers, accountID)
		}
		mu.Unlock()
		close(c.send)
		Info("[proxy] client disconnected account=%s remaining_subscribers=%d", accountID, remaining)
	}()

	for {
		var ctrl map[string]any
		if err := wsjson.Read(ctx, conn, &ctrl); err != nil {
			Trace("[proxy] read error account=%s err=%v", accountID, err)
			break
		}

		Trace("[proxy] received control message account=%s", accountID)

		mu.RLock()
		up := upstreams[accountID]
		state, hasUpCtx := upstreamCtx[accountID]
		mu.RUnlock()

		if up == nil || !hasUpCtx {
			Warn("[proxy] no upstream for control message account=%s", accountID)
			sendEvent(c, "error", map[string]any{"message": "upstream not connected"}, nil)
			continue
		}

		if _, ok := ctrl["type"].(string); !ok {
			Warn("[proxy] control message missing type field account=%s", accountID)
			sendEvent(c, "error", map[string]any{"message": "invalid message format"}, nil)
			continue
		}

		Trace("[proxy] forwarding control message type=%s account=%s", ctrl["type"], accountID)
		if err := wsjson.Write(state.ctx, up, ctrl); err != nil {
			Warn("[proxy] failed to forward control message account=%s err=%v", accountID, err)
		}
	}
}

// jsonMarshal converts a data structure to JSON bytes using standard rules.
func jsonMarshal(v any) ([]byte, error) { return json.Marshal(v) }
