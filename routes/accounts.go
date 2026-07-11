package routes

import (
	"encoding/json"
	"net/http"

	"github.com/google/uuid"
	"github.com/Thruqe/whatsrook/cli"
	"github.com/Thruqe/whatsrook/store"
)

func ListAccounts(w http.ResponseWriter, r *http.Request) {
	p, err := store.Authenticate(r)
	if err != nil {
		jsonErr(w, "unauthorized", 401)
		return
	}
	accounts, err := store.GetAccountsByUser(p.UserID)
	if err != nil {
		jsonErr(w, err.Error(), 500)
		return
	}
	if accounts == nil {
		accounts = []store.WaAccount{}
	}

	jsonOK(w, accounts, 200)
}

func AddAccount(w http.ResponseWriter, r *http.Request) {
	p, err := store.Authenticate(r)
	if err != nil {
		jsonErr(w, "unauthorized", 401)
		return
	}
	var body struct {
		Phone     string `json:"phone"`
		Mode      string `json:"mode"`
		PairPhone string `json:"pairPhone"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		jsonErr(w, "invalid JSON", 400)
		return
	}
	if body.Phone == "" {
		jsonErr(w, "phone is required", 400)
		return
	}
	if body.Mode == "" {
		body.Mode = "qr"
	}
	if body.Mode == "pair" && body.PairPhone == "" {
		jsonErr(w, "pairPhone is required for pair mode", 400)
		return
	}
	running, _ := cli.BotIsRunning(body.Phone)
	if running {
		jsonErr(w, "Account already running", 409)
		return
	}
	port, err := store.AllocatePort()
	if err != nil {
		jsonErr(w, err.Error(), 500)
		return
	}
	status := "pending_qr"
	if body.Mode == "pair" {
		status = "pending_pair"
	}
	account := store.WaAccount{
		ID: uuid.NewString(), UserID: p.UserID,
		Phone: body.Phone, Port: port, Status: status,
	}
	if err := store.CreateAccount(account); err != nil {
		jsonErr(w, err.Error(), 500)
		return
	}
	if body.Mode == "pair" {
		err = cli.BotStartWithPairCode(body.Phone, port, body.PairPhone, false)
	} else {
		err = cli.BotStartWithQr(body.Phone, port, false)
	}
	if err != nil {
		jsonErr(w, err.Error(), 500)
		return
	}
	jsonOK(w, map[string]any{"account": account}, 201)
}

func GetAccount(w http.ResponseWriter, r *http.Request, accountID string) {
	p, err := store.Authenticate(r)
	if err != nil {
		jsonErr(w, "unauthorized", 401)
		return
	}
	account, _ := store.GetAccountByIDAndUser(accountID, p.UserID)
	if account == nil {
		jsonErr(w, "Account not found", 404)
		return
	}
	proc, _ := cli.BotGet(account.Phone)
	jsonOK(w, map[string]any{"account": account, "process": proc}, 200)
}

func RemoveAccount(w http.ResponseWriter, r *http.Request, accountID string) {
	p, err := store.Authenticate(r)
	if err != nil {
		jsonErr(w, "unauthorized", 401)
		return
	}
	account, _ := store.GetAccountByIDAndUser(accountID, p.UserID)
	if account == nil {
		jsonErr(w, "Account not found", 404)
		return
	}
	if err := cli.BotLogout(account.Phone); err != nil {
		jsonErr(w, err.Error(), 500)
		return
	}
	if err := store.DeleteAccount(accountID); err != nil {
		jsonErr(w, err.Error(), 500)
		return
	}
	jsonOK(w, map[string]any{"ok": true}, 200)
}

func StopAccount(w http.ResponseWriter, r *http.Request, accountID string) {
	p, err := store.Authenticate(r)
	if err != nil {
		jsonErr(w, "unauthorized", 401)
		return
	}
	account, _ := store.GetAccountByIDAndUser(accountID, p.UserID)
	if account == nil {
		jsonErr(w, "Account not found", 404)
		return
	}
	if err := cli.BotStop(account.Phone); err != nil {
		jsonErr(w, err.Error(), 500)
		return
	}
	if err := store.UpdateAccountStatus(accountID, "disconnected"); err != nil {
		jsonErr(w, err.Error(), 500)
		return
	}
	jsonOK(w, map[string]any{"ok": true}, 200)
}

func RestartAccount(w http.ResponseWriter, r *http.Request, accountID string) {
	p, err := store.Authenticate(r)
	if err != nil {
		jsonErr(w, "unauthorized", 401)
		return
	}
	account, _ := store.GetAccountByIDAndUser(accountID, p.UserID)
	if account == nil {
		jsonErr(w, "Account not found", 404)
		return
	}
	if err := cli.BotRestart(account.Phone); err != nil {
		jsonErr(w, err.Error(), 500)
		return
	}
	// Preserve existing status — the process is restarting with existing auth,
	// so it will reconnect and emit "connected" which engine.go will handle.
	// Only reset to pending if it was already in a pending state.
	if account.Status != "connected" {
		if err := store.UpdateAccountStatus(accountID, account.Status); err != nil {
			jsonErr(w, err.Error(), 500)
			return
		}
	}
	jsonOK(w, map[string]any{"ok": true}, 200)
}
