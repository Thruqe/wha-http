package ws

import (
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/zevlion/wha-http/internal/auth"
	"github.com/zevlion/wha-http/internal/db"
	"github.com/zevlion/wha-http/internal/engine"
	"github.com/zevlion/wha-http/internal/logger"
	"encoding/json"
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
)

const (
	retryDelay  = 500 * time.Millisecond
	maxRetries  = 20
)

func sendEvent(c *client, typ string, payload map[string]any, id *string) {
	msg := map[string]any{"type": typ, "payload": payload}
	if id != nil {
		msg["id"] = *id
	}
	b, _ := jsonMarshal(msg)
	c.send <- b
}

func broadcastRaw(accountID string, data []byte) {
	mu.RLock()
	subs := subscribers[accountID]
	mu.RUnlock()
	for c := range subs {
		select {
		case c.send <- data:
		default:
		}
	}
}

func broadcastEvent(accountID, typ string, payload map[string]any) {
	msg := map[string]any{"type": typ, "payload": payload}
	b, _ := jsonMarshal(msg)
	broadcastRaw(accountID, b)
}

func connectUpstream(accountID string, port int) {
	for attempt := 1; attempt <= maxRetries; attempt++ {
		mu.RLock()
		existing, ok := upstreams[accountID]
		mu.RUnlock()
		if ok && existing != nil {
			return
		}

		logger.Trace("[proxy] upstream attempt %d/%d for account %s", attempt, maxRetries, accountID)

		conn, _, err := websocket.DefaultDialer.Dial(
			fmt.Sprintf("ws://localhost:%d/ws", port), nil,
		)
		if err != nil {
			time.Sleep(retryDelay)
			continue
		}

		mu.Lock()
		upstreams[accountID] = conn
		mu.Unlock()

		logger.Trace("[proxy] upstream connected for account %s on port %d", accountID, port)

		go func() {
			defer func() {
				mu.Lock()
				delete(upstreams, accountID)
				mu.Unlock()
				broadcastEvent(accountID, "upstream_closed", map[string]any{"accountId": accountID})
				closeAllSubscribers(accountID)
			}()
			for {
				_, msg, err := conn.ReadMessage()
				if err != nil {
					break
				}
				go engine.ProcessEvent(accountID, string(msg))
				broadcastRaw(accountID, msg)
			}
		}()
		return
	}

	logger.Error("[proxy] gave up connecting upstream for account %s", accountID)
	broadcastEvent(accountID, "error", map[string]any{"message": "zevBot failed to start"})
	closeAllSubscribers(accountID)
}

func closeAllSubscribers(accountID string) {
	mu.Lock()
	subs := subscribers[accountID]
	delete(subscribers, accountID)
	mu.Unlock()
	for c := range subs {
		c.conn.Close()
	}
}

func Handler(w http.ResponseWriter, r *http.Request) {
	// Extract accountId from /ws/{accountId}
	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(parts) < 2 || parts[0] != "ws" {
		http.Error(w, "not found", 404)
		return
	}
	accountID := parts[1]

	// Auth
	payload, err := auth.Authenticate(r)
	if err != nil {
		http.Error(w, "unauthorized", 401)
		return
	}

	account, err := db.GetAccountByIDAndUser(accountID, payload.UserID)
	if err != nil || account == nil {
		http.Error(w, "forbidden", 403)
		return
	}
	if account.Status == "disconnected" {
		http.Error(w, "account disconnected", 409)
		return
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}

	c := &client{conn: conn, accountID: accountID, send: make(chan []byte, 64)}

	mu.Lock()
	if subscribers[accountID] == nil {
		subscribers[accountID] = map[*client]struct{}{}
	}
	subscribers[accountID][c] = struct{}{}
	mu.Unlock()

	logger.Trace("[proxy] client connected → account %s", accountID)

	// Notify connected
	sendEvent(c, "connected", map[string]any{"accountId": accountID}, nil)

	// Ensure upstream
	go connectUpstream(accountID, account.Port)

	// Write pump
	go func() {
		defer conn.Close()
		for msg := range c.send {
			if err := conn.WriteMessage(websocket.TextMessage, msg); err != nil {
				break
			}
		}
	}()

	// Read pump (control messages)
	defer func() {
		mu.Lock()
		delete(subscribers[accountID], c)
		if len(subscribers[accountID]) == 0 {
			delete(subscribers, accountID)
			mu.Lock()
			up := upstreams[accountID]
			mu.Unlock()
			if up != nil {
				up.Close()
				mu.Lock()
				delete(upstreams, accountID)
				mu.Unlock()
			}
		}
		mu.Unlock()
		close(c.send)
		logger.Trace("[proxy] client disconnected from account %s", accountID)
	}()

	for {
		_, msg, err := conn.ReadMessage()
		if err != nil {
			break
		}

		mu.RLock()
		up := upstreams[accountID]
		mu.RUnlock()

		if up == nil {
			sendEvent(c, "error", map[string]any{"message": "upstream not connected"}, nil)
			continue
		}

		// Validate control message
		var ctrl map[string]any
		if err := jsonUnmarshal(msg, &ctrl); err != nil {
			sendEvent(c, "error", map[string]any{"message": "invalid message format"}, nil)
			continue
		}
		if _, ok := ctrl["type"].(string); !ok {
			sendEvent(c, "error", map[string]any{"message": "invalid message format"}, nil)
			continue
		}

		up.WriteMessage(websocket.TextMessage, msg)
	}
}

func jsonMarshal(v any) ([]byte, error)        { return json.Marshal(v) }
func jsonUnmarshal(b []byte, v any) error      { return json.Unmarshal(b, v) }
