package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/zevlion/wha-http/store"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

type client struct {
	conn      *websocket.Conn
	accountID string
	send      chan []byte
}

var (
	mu          sync.RWMutex
	subscribers = map[string]map[*client]struct{}{}
	upstreams   = map[string]*websocket.Conn{}
	lastEvent   = map[string][]byte{}
)

const (
	retryDelay = 500 * time.Millisecond
	maxRetries = 20
)

var replayEvents = map[string]bool{
	"pair_code": true,
	"pair_qr":   true,
}

func sendEvent(c *client, typ string, payload map[string]any, id *string) {
	msg := map[string]any{"type": typ, "payload": payload}
	if id != nil {
		msg["id"] = *id
	}
	b, _ := jsonMarshal(msg)
	Trace("[proxy] sendEvent type=%s account=%s", typ, c.accountID)
	c.send <- b
}

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

func broadcastEvent(accountID, typ string, payload map[string]any) {
	msg := map[string]any{"type": typ, "payload": payload}
	b, _ := jsonMarshal(msg)
	Trace("[proxy] broadcastEvent type=%s account=%s", typ, accountID)
	broadcastRaw(accountID, b)
}

func connectUpstream(accountID string, port int) {
	for attempt := 1; attempt <= maxRetries; attempt++ {
		mu.RLock()
		existing, ok := upstreams[accountID]
		mu.RUnlock()
		if ok && existing != nil {
			Trace("[proxy] upstream already connected for account %s, skipping", accountID)
			return
		}

		Trace("[proxy] upstream attempt %d/%d for account %s port %d", attempt, maxRetries, accountID, port)

		conn, _, err := websocket.DefaultDialer.Dial(
			fmt.Sprintf("ws://localhost:%d/ws", port), nil,
		)
		if err != nil {
			Trace("[proxy] upstream dial failed attempt=%d account=%s err=%v", attempt, accountID, err)
			time.Sleep(retryDelay)
			continue
		}

		mu.Lock()
		upstreams[accountID] = conn
		mu.Unlock()

		Info("[proxy] upstream connected account=%s port=%d", accountID, port)

		go func() {
			defer func() {
				Info("[proxy] upstream disconnected account=%s", accountID)
				mu.Lock()
				delete(upstreams, accountID)
				mu.Unlock()
				broadcastEvent(accountID, "upstream_closed", map[string]any{"accountId": accountID})
				closeAllSubscribers(accountID)
			}()
			for {
				_, msg, err := conn.ReadMessage()
				if err != nil {
					Trace("[proxy] upstream read error account=%s err=%v", accountID, err)
					break
				}

				Trace("[proxy] upstream message account=%s raw=%s", accountID, string(msg))

				// cache replayable events
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
		}()
		return
	}

	Error("[proxy] gave up connecting upstream after %d attempts account=%s port=%d", maxRetries, accountID, port)
	broadcastEvent(accountID, "error", map[string]any{"message": "zevBot failed to start"})
	closeAllSubscribers(accountID)
}

func closeAllSubscribers(accountID string) {
	mu.Lock()
	subs := subscribers[accountID]
	delete(subscribers, accountID)
	mu.Unlock()
	Trace("[proxy] closing %d subscriber(s) for account %s", len(subs), accountID)
	for c := range subs {
		c.conn.Close()
	}
}

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

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		Error("[proxy] upgrade failed account=%s err=%v", accountID, err)
		return
	}

	c := &client{conn: conn, accountID: accountID, send: make(chan []byte, 64)}

	mu.Lock()
	if subscribers[accountID] == nil {
		subscribers[accountID] = map[*client]struct{}{}
	}
	subscribers[accountID][c] = struct{}{}
	subCount := len(subscribers[accountID])
	mu.Unlock()

	Info("[proxy] client connected account=%s total_subscribers=%d", accountID, subCount)

	// send connected event
	sendEvent(c, "connected", map[string]any{"accountId": accountID}, nil)

	// replay last pair event if available
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

	// ensure upstream is connected
	Trace("[proxy] ensuring upstream for account=%s port=%d", accountID, account.Port)
	go connectUpstream(accountID, account.Port)

	// write pump
	go func() {
		defer conn.Close()
		for msg := range c.send {
			Trace("[proxy] write pump sending %d bytes to client account=%s", len(msg), accountID)
			if err := conn.WriteMessage(websocket.TextMessage, msg); err != nil {
				Trace("[proxy] write pump error account=%s err=%v", accountID, err)
				break
			}
		}
	}()

	// read pump
	defer func() {
		mu.Lock()
		delete(subscribers[accountID], c)
		remaining := len(subscribers[accountID])
		if remaining == 0 {
			delete(subscribers, accountID)
			up := upstreams[accountID]
			if up != nil {
				Trace("[proxy] closing upstream — no subscribers left account=%s", accountID)
				up.Close()
				delete(upstreams, accountID)
			}
		}
		mu.Unlock()
		close(c.send)
		Info("[proxy] client disconnected account=%s remaining_subscribers=%d", accountID, remaining)
	}()

	for {
		_, msg, err := conn.ReadMessage()
		if err != nil {
			Trace("[proxy] read error account=%s err=%v", accountID, err)
			break
		}

		Trace("[proxy] received control message account=%s raw=%s", accountID, string(msg))

		mu.RLock()
		up := upstreams[accountID]
		mu.RUnlock()

		if up == nil {
			Warn("[proxy] no upstream for control message account=%s", accountID)
			sendEvent(c, "error", map[string]any{"message": "upstream not connected"}, nil)
			continue
		}

		var ctrl map[string]any
		if err := jsonUnmarshal(msg, &ctrl); err != nil {
			Warn("[proxy] invalid control message account=%s err=%v", accountID, err)
			sendEvent(c, "error", map[string]any{"message": "invalid message format"}, nil)
			continue
		}
		if _, ok := ctrl["type"].(string); !ok {
			Warn("[proxy] control message missing type field account=%s", accountID)
			sendEvent(c, "error", map[string]any{"message": "invalid message format"}, nil)
			continue
		}

		Trace("[proxy] forwarding control message type=%s account=%s", ctrl["type"], accountID)
		if err := up.WriteMessage(websocket.TextMessage, msg); err != nil {
			Warn("[proxy] failed to forward control message account=%s err=%v", accountID, err)
		}
	}
}

func jsonMarshal(v any) ([]byte, error)   { return json.Marshal(v) }
func jsonUnmarshal(b []byte, v any) error { return json.Unmarshal(b, v) }
