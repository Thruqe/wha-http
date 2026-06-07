package engine

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"time"

	"github.com/zevlion/wha-http/internal/db"
	"github.com/zevlion/wha-http/internal/logger"
)

var internalEvents = map[string]bool{
	"ack": true, "connected": true, "upstream_closed": true, "error": true,
}

type zevEvent struct {
	Type    string         `json:"type"`
	ID      *string        `json:"id,omitempty"`
	Payload map[string]any `json:"payload"`
}

func ProcessEvent(accountID, raw string) {
	var event zevEvent
	if err := json.Unmarshal([]byte(raw), &event); err != nil {
		logger.Warn("[engine] unparseable event for account %s: %s", accountID, raw)
		return
	}
	logger.Info("[engine] event type=%s account=%s", event.Type, accountID)

	if internalEvents[event.Type] {
		return
	}

	hooks, err := db.GetHooksByAccount(accountID)
	if err != nil || len(hooks) == 0 {
		return
	}

	logger.Info("[engine] delivering to %d hook(s)", len(hooks))

	for _, hook := range hooks {
		go deliver(hook, accountID, raw)
	}
}

func deliver(hook db.Hook, accountID, raw string) {
	body, _ := json.Marshal(map[string]any{
		"accountId": accountID,
		"event":     json.RawMessage(raw),
	})

	headers := map[string]string{
		"Content-Type": "application/json",
		"User-Agent":   "wha-http/1.0",
	}

	if hook.Secret != nil && *hook.Secret != "" {
		mac := hmac.New(sha256.New, []byte(*hook.Secret))
		mac.Write(body)
		headers["X-WHA-Signature"] = hex.EncodeToString(mac.Sum(nil))
	}

	req, err := http.NewRequest("POST", hook.TargetURL, bytes.NewReader(body))
	if err != nil {
		logger.Error("[engine] bad hook URL %s: %v", hook.TargetURL, err)
		return
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		logger.Error("[engine] webhook delivery failed → %s: %v", hook.TargetURL, err)
		return
	}
	defer resp.Body.Close()
	logger.Info("[engine] webhook delivered → %s (%d)", hook.TargetURL, resp.StatusCode)
}
