package store

import "database/sql"

type User struct {
	ID           string `json:"id"`
	Email        string `json:"email"`
	PasswordHash string `json:"-"`
	CreatedAt    int64  `json:"createdAt"`
}

func GetUserByEmail(email string) (*User, error) {
	row := DB.QueryRow(`SELECT id, email, password_hash, created_at FROM users WHERE email = ?`, email)
	u := &User{}
	err := row.Scan(&u.ID, &u.Email, &u.PasswordHash, &u.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return u, err
}

func GetUserByID(id string) (*User, error) {
	row := DB.QueryRow(`SELECT id, email, password_hash, created_at FROM users WHERE id = ?`, id)
	u := &User{}
	err := row.Scan(&u.ID, &u.Email, &u.PasswordHash, &u.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return u, err
}

func CreateUser(u User) error {
	_, err := DB.Exec(
		`INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)`,
		u.ID, u.Email, u.PasswordHash,
	)
	return err
}
