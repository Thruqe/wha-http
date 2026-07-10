package store

import (
	"database/sql"
	"errors"
)

type WaAccount struct {
	ID        string `json:"id"`
	UserID    string `json:"userId"`
	Phone     string `json:"phone"`
	Port      int    `json:"port"`
	Status    string `json:"status"`
	CreatedAt int64  `json:"createdAt"`
}

type Hook struct {
	ID          string  `json:"id"`
	WaAccountID string  `json:"waAccountId"`
	EventType   string  `json:"eventType"`
	TargetURL   string  `json:"targetUrl"`
	Secret      *string `json:"secret,omitempty"`
	CreatedAt   int64   `json:"createdAt"`
}

func GetAccountByIDAndUser(accountID, userID string) (*WaAccount, error) {
	row := DB.QueryRow(
		`SELECT id, user_id, phone, port, status, created_at FROM wa_accounts WHERE id = ? AND user_id = ?`,
		accountID, userID,
	)
	a := &WaAccount{}
	err := row.Scan(&a.ID, &a.UserID, &a.Phone, &a.Port, &a.Status, &a.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return a, err
}

func GetAccountsByUser(userID string) ([]WaAccount, error) {
	rows, err := DB.Query(
		`SELECT id, user_id, phone, port, status, created_at FROM wa_accounts WHERE user_id = ?`,
		userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var list []WaAccount
	for rows.Next() {
		var a WaAccount
		if err := rows.Scan(&a.ID, &a.UserID, &a.Phone, &a.Port, &a.Status, &a.CreatedAt); err != nil {
			return nil, err
		}
		list = append(list, a)
	}
	return list, nil
}

func CreateAccount(a WaAccount) error {
	_, err := DB.Exec(
		`INSERT INTO wa_accounts (id, user_id, phone, port, status) VALUES (?, ?, ?, ?, ?)`,
		a.ID, a.UserID, a.Phone, a.Port, a.Status,
	)
	return err
}

func UpdateAccountStatus(accountID, status string) error {
	_, err := DB.Exec(`UPDATE wa_accounts SET status = ? WHERE id = ?`, status, accountID)
	return err
}

func DeleteAccount(accountID string) error {
	_, err := DB.Exec(`DELETE FROM wa_accounts WHERE id = ?`, accountID)
	return err
}

func AllocatePort() (int, error) {
	rows, err := DB.Query(`SELECT port FROM wa_accounts`)
	if err != nil {
		return 0, err
	}
	defer rows.Close()
	used := make(map[int]bool)
	for rows.Next() {
		var p int
		if err := rows.Scan(&p); err != nil {
			return 0, err
		}
		used[p] = true
	}
	for p := 3000; p <= 5000; p++ {
		if !used[p] {
			return p, nil
		}
	}
	return 0, errors.New("no available ports in range")
}

// Hooks

func GetHooksByAccount(accountID string) ([]Hook, error) {
	rows, err := DB.Query(
		`SELECT id, wa_account_id, event_type, target_url, secret, created_at FROM hooks WHERE wa_account_id = ?`,
		accountID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var list []Hook
	for rows.Next() {
		var h Hook
		if err := rows.Scan(&h.ID, &h.WaAccountID, &h.EventType, &h.TargetURL, &h.Secret, &h.CreatedAt); err != nil {
			return nil, err
		}
		list = append(list, h)
	}
	return list, nil
}

func CreateHook(h Hook) error {
	_, err := DB.Exec(
		`INSERT INTO hooks (id, wa_account_id, event_type, target_url, secret) VALUES (?, ?, ?, ?, ?)`,
		h.ID, h.WaAccountID, h.EventType, h.TargetURL, h.Secret,
	)
	return err
}

func DeleteHook(hookID, accountID string) error {
	_, err := DB.Exec(`DELETE FROM hooks WHERE id = ? AND wa_account_id = ?`, hookID, accountID)
	return err
}
