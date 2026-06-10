package store

import (
	"errors"
	"net/http"
	"strings"
)

var ErrUnauthorized = errors.New("unauthorized")

func Authenticate(r *http.Request) (JwtPayload, error) {
	token := r.URL.Query().Get("token")
	if token == "" {
		h := r.Header.Get("Authorization")
		token = strings.TrimPrefix(strings.TrimPrefix(h, "Bearer "), "bearer ")
	}
	if token == "" {
		return JwtPayload{}, ErrUnauthorized
	}
	p, err := VerifyJwt(token)
	if err != nil {
		return JwtPayload{}, ErrUnauthorized
	}
	return p, nil
}
