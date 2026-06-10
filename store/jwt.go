package store

import (
	"errors"
	"os"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

var jwtSecret = []byte(func() string {
	if s := os.Getenv("JWT_SECRET"); s != "" {
		return s
	}
	return "change-me-in-production"
}())

type JwtPayload struct {
	UserID string `json:"userId"`
	Email  string `json:"email"`
}

type claims struct {
	jwt.RegisteredClaims
	UserID string `json:"userId"`
	Email  string `json:"email"`
}

func SignJwt(p JwtPayload) (string, error) {
	c := claims{
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(7 * 24 * time.Hour)),
		},
		UserID: p.UserID,
		Email:  p.Email,
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, c).SignedString(jwtSecret)
}

func VerifyJwt(token string) (JwtPayload, error) {
	t, err := jwt.ParseWithClaims(token, &claims{}, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("unexpected signing method")
		}
		return jwtSecret, nil
	})
	if err != nil || !t.Valid {
		return JwtPayload{}, errors.New("invalid or expired token")
	}
	c := t.Claims.(*claims)
	return JwtPayload{UserID: c.UserID, Email: c.Email}, nil
}
