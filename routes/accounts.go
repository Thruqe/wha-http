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

var OnStateChange func(accountID string)

func AddAccount(w http.ResponseWriter, r *http.Request) {
	p, err := store.Authenticate(r)
	if err != nil {
		jsonErr(w, "unauthorized", 401)
		return
	}
	var body struct {
		Phone string `json:"phone"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		jsonErr(w, "invalid JSON", 400)
		return
	}
	if body.Phone == "" {
		jsonErr(w, "phone is required", 400)
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
	account := store.WaAccount{
		ID: uuid.NewString(), UserID: p.UserID,
		Phone: body.Phone, Port: port, Status: "stopped",
		Client: "chrome",
	}
	if err := store.CreateAccount(account); err != nil {
		jsonErr(w, err.Error(), 500)
		return
	}
	jsonOK(w, map[string]any{"account": account}, 201)
}

func StartAccount(w http.ResponseWriter, r *http.Request, accountID string) {
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
	var body struct {
		Mode   string `json:"mode"`
		Client string `json:"client"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		jsonErr(w, "invalid JSON", 400)
		return
	}
	if body.Mode == "" {
		body.Mode = "qr"
	}
	if body.Client == "" {
		body.Client = "chrome"
	}

	status := "pending_qr"
	if body.Mode == "pair" {
		status = "pending_pair"
	}

	if err := store.UpdateAccountStatusAndClient(accountID, status, body.Client); err != nil {
		jsonErr(w, err.Error(), 500)
		return
	}

	var startErr error
	if status == "pending_qr" {
		startErr = cli.BotStartWithQr(account.Phone, account.Port, body.Client)
	} else {
		startErr = cli.BotStartWithPairCode(account.Phone, account.Port, account.Phone, body.Client)
	}
	if startErr != nil {
		jsonErr(w, startErr.Error(), 500)
		return
	}

	if OnStateChange != nil {
		OnStateChange(accountID)
	}
	jsonOK(w, map[string]any{"ok": true}, 200)
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
	if OnStateChange != nil {
		OnStateChange(accountID)
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
	if err := store.UpdateAccountStatus(accountID, "stopped"); err != nil {
		jsonErr(w, err.Error(), 500)
		return
	}
	if OnStateChange != nil {
		OnStateChange(accountID)
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
	_ = cli.BotStop(account.Phone)

	var startErr error
	if account.Status == "pending_qr" {
		startErr = cli.BotStartWithQr(account.Phone, account.Port, account.Client)
	} else if account.Status == "pending_pair" {
		startErr = cli.BotStartWithPairCode(account.Phone, account.Port, account.Phone, account.Client)
	} else {
		startErr = cli.BotStart(account.Phone, account.Port, account.Client)
	}
	if startErr != nil {
		jsonErr(w, startErr.Error(), 500)
		return
	}
	if account.Status != "connected" {
		if err := store.UpdateAccountStatus(accountID, "connected"); err != nil {
			jsonErr(w, err.Error(), 500)
			return
		}
	}
	if OnStateChange != nil {
		OnStateChange(accountID)
	}
	jsonOK(w, map[string]any{"ok": true}, 200)
}

func PauseAccount(w http.ResponseWriter, r *http.Request, accountID string) {
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
	if err := cli.BotPause(account.Phone); err != nil {
		jsonErr(w, err.Error(), 500)
		return
	}
	if err := store.UpdateAccountStatus(accountID, "paused"); err != nil {
		jsonErr(w, err.Error(), 500)
		return
	}
	if OnStateChange != nil {
		OnStateChange(accountID)
	}
	jsonOK(w, map[string]any{"ok": true}, 200)
}

func ResumeAccount(w http.ResponseWriter, r *http.Request, accountID string) {
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
	err = cli.BotResume(account.Phone)
	if err != nil {
		var startErr error
		if account.Status == "pending_qr" {
			startErr = cli.BotStartWithQr(account.Phone, account.Port, account.Client)
		} else if account.Status == "pending_pair" {
			startErr = cli.BotStartWithPairCode(account.Phone, account.Port, account.Phone, account.Client)
		} else {
			startErr = cli.BotStart(account.Phone, account.Port, account.Client)
		}
		if startErr != nil {
			jsonErr(w, "resume failed: "+startErr.Error(), 500)
			return
		}
	}
	if err := store.UpdateAccountStatus(accountID, "connected"); err != nil {
		jsonErr(w, err.Error(), 500)
		return
	}
	if OnStateChange != nil {
		OnStateChange(accountID)
	}
	jsonOK(w, map[string]any{"ok": true}, 200)
}

func LogoutAccount(w http.ResponseWriter, r *http.Request, accountID string) {
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
	// Logout from WhatsApp and kill the process
	_ = cli.BotLogout(account.Phone)
	// Delete auth files on disk
	_ = cli.DeleteAccountFiles(account.Phone)
	// Remove from DB entirely
	if err := store.DeleteAccount(accountID); err != nil {
		jsonErr(w, err.Error(), 500)
		return
	}
	if OnStateChange != nil {
		OnStateChange(accountID)
	}
	jsonOK(w, map[string]any{"ok": true, "deleted": true}, 200)
}
