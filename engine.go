package main

import (
	"encoding/json"

	"github.com/Thruqe/whatsrook/store"
)

var internalEvents = map[string]bool{
	"ack":            true,
	"upstream_closed": true,
	"error":          true,
}

type zevEvent struct {
	Type    string         `json:"type"`
	ID      *string        `json:"id,omitempty"`
	Payload map[string]any `json:"payload"`
}

func ProcessEvent(accountID, raw string) {
	var event zevEvent
	if err := json.Unmarshal([]byte(raw), &event); err != nil {
		Warn("[engine] unparseable event for account %s: %s", accountID, raw)
		return
	}
	Info("[engine] event type=%s account=%s", event.Type, accountID)

	// Fetch account to get the UserID for metrics tracking
	account, err := store.GetAccountByID(accountID)
	if err != nil || account == nil {
		Warn("[engine] account not found for metrics: %s", accountID)
	} else {
		// Log telemetry data to metrics table
		_ = store.RecordMetric(account.UserID, accountID, event.Type)
	}

	// update account status based on event
	switch event.Type {
	case "pair_success", "connected":
		if err := store.UpdateAccountStatus(accountID, "connected"); err != nil {
			Error("[engine] failed to update account status to connected: %v", err)
		} else {
			Info("[engine] account %s status → connected", accountID)
		}
	case "logged_out", "disconnected", "upstream_closed":
		if err := store.UpdateAccountStatus(accountID, "disconnected"); err != nil {
			Error("[engine] failed to update account status to disconnected: %v", err)
		} else {
			Info("[engine] account %s status → disconnected", accountID)
		}
	}
}
