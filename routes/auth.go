package routes

import (
	"encoding/json"
	"net/http"

	"github.com/google/uuid"
	"github.com/Thruqe/whatsrook/store"
)

func Register(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		jsonErr(w, "invalid JSON", 400)
		return
	}
	if body.Email == "" || body.Password == "" {
		jsonErr(w, "email and password are required", 400)
		return
	}
	if len(body.Password) < 8 {
		jsonErr(w, "password must be at least 8 characters", 400)
		return
	}
	existing, _ := store.GetUserByEmail(body.Email)
	if existing != nil {
		jsonErr(w, "email already registered", 409)
		return
	}
	hash, err := store.HashPassword(body.Password)
	if err != nil {
		jsonErr(w, "internal error", 500)
		return
	}
	user := store.User{ID: uuid.NewString(), Email: body.Email, PasswordHash: hash}
	if err := store.CreateUser(user); err != nil {
		jsonErr(w, err.Error(), 500)
		return
	}
	token, _ := store.SignJwt(store.JwtPayload{UserID: user.ID, Email: user.Email})
	jsonOK(w, map[string]any{"token": token, "user": map[string]any{"id": user.ID, "email": user.Email}}, 201)
}

func Login(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		jsonErr(w, "invalid JSON", 400)
		return
	}
	user, _ := store.GetUserByEmail(body.Email)
	if user == nil || !store.VerifyPassword(body.Password, user.PasswordHash) {
		jsonErr(w, "invalid credentials", 401)
		return
	}
	token, _ := store.SignJwt(store.JwtPayload{UserID: user.ID, Email: user.Email})
	jsonOK(w, map[string]any{"token": token, "user": map[string]any{"id": user.ID, "email": user.Email}}, 200)
}

func Me(w http.ResponseWriter, r *http.Request) {
	payload, err := store.Authenticate(r)
	if err != nil {
		jsonErr(w, "unauthorized", 401)
		return
	}
	jsonOK(w, map[string]any{"userId": payload.UserID, "email": payload.Email}, 200)
}
