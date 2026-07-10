package routes

import (
	"encoding/json"
	"net/http"
	"net/url"

	"github.com/google/uuid"
	"github.com/zevlion/wha-http/store"
)

func ListHooks(w http.ResponseWriter, r *http.Request, accountID string) {
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
	hooks, _ := store.GetHooksByAccount(accountID)
	if hooks == nil {
		hooks = []store.Hook{}
	}
	jsonOK(w, hooks, 200)
}

func CreateHook(w http.ResponseWriter, r *http.Request, accountID string) {
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
		TargetURL string  `json:"targetUrl"`
		Secret    *string `json:"secret"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		jsonErr(w, "invalid JSON", 400)
		return
	}
	if body.TargetURL == "" {
		jsonErr(w, "targetUrl is required", 400)
		return
	}
	if _, err := url.ParseRequestURI(body.TargetURL); err != nil {
		jsonErr(w, "invalid targetUrl", 400)
		return
	}
	hook := store.Hook{
		ID: uuid.NewString(), WaAccountID: accountID,
		EventType: "all", TargetURL: body.TargetURL, Secret: body.Secret,
	}
	if err := store.CreateHook(hook); err != nil {
		jsonErr(w, err.Error(), 500)
		return
	}
	jsonOK(w, hook, 201)
}

func DeleteHook(w http.ResponseWriter, r *http.Request, accountID, hookID string) {
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
	store.DeleteHook(hookID, accountID)
	jsonOK(w, map[string]any{"ok": true}, 200)
}
