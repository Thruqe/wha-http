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
	Client    string `json:"client"`
	CreatedAt int64  `json:"createdAt"`
}

func GetAccountByID(accountID string) (*WaAccount, error) {
	row := DB.QueryRow(
		`SELECT id, user_id, phone, port, status, client, created_at FROM wa_accounts WHERE id = ?`,
		accountID,
	)
	a := &WaAccount{}
	err := row.Scan(&a.ID, &a.UserID, &a.Phone, &a.Port, &a.Status, &a.Client, &a.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return a, err
}

func GetAccountByIDAndUser(accountID, userID string) (*WaAccount, error) {
	row := DB.QueryRow(
		`SELECT id, user_id, phone, port, status, client, created_at FROM wa_accounts WHERE id = ? AND user_id = ?`,
		accountID, userID,
	)
	a := &WaAccount{}
	err := row.Scan(&a.ID, &a.UserID, &a.Phone, &a.Port, &a.Status, &a.Client, &a.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return a, err
}

func GetAccountByPhone(phone string) (*WaAccount, error) {
	row := DB.QueryRow(
		`SELECT id, user_id, phone, port, status, client, created_at FROM wa_accounts WHERE phone = ?`,
		phone,
	)
	a := &WaAccount{}
	err := row.Scan(&a.ID, &a.UserID, &a.Phone, &a.Port, &a.Status, &a.Client, &a.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return a, err
}

func GetAccountsByUser(userID string) ([]WaAccount, error) {
	rows, err := DB.Query(
		`SELECT id, user_id, phone, port, status, client, created_at FROM wa_accounts WHERE user_id = ?`,
		userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var list []WaAccount
	for rows.Next() {
		var a WaAccount
		if err := rows.Scan(&a.ID, &a.UserID, &a.Phone, &a.Port, &a.Status, &a.Client, &a.CreatedAt); err != nil {
			return nil, err
		}
		list = append(list, a)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return list, nil
}

func CreateAccount(a WaAccount) error {
	_, err := DB.Exec(
		`INSERT INTO wa_accounts (id, user_id, phone, port, status, client) VALUES (?, ?, ?, ?, ?, ?)`,
		a.ID, a.UserID, a.Phone, a.Port, a.Status, a.Client,
	)
	return err
}

func UpdateAccountStatus(accountID, status string) error {
	_, err := DB.Exec(`UPDATE wa_accounts SET status = ? WHERE id = ?`, status, accountID)
	return err
}

func UpdateAccountStatusAndClient(accountID, status, client string) error {
	_, err := DB.Exec(`UPDATE wa_accounts SET status = ?, client = ? WHERE id = ?`, status, client, accountID)
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
	if err := rows.Err(); err != nil {
		return 0, err
	}
	for p := 3000; p <= 5000; p++ {
		if !used[p] {
			return p, nil
		}
	}
	return 0, errors.New("no available ports in range")
}

func GetAllActiveAccounts() ([]WaAccount, error) {
	rows, err := DB.Query(
		`SELECT id, user_id, phone, port, status, client, created_at FROM wa_accounts WHERE status NOT IN ('stopped', 'paused', 'disconnected')`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var list []WaAccount
	for rows.Next() {
		var a WaAccount
		if err := rows.Scan(&a.ID, &a.UserID, &a.Phone, &a.Port, &a.Status, &a.Client, &a.CreatedAt); err != nil {
			return nil, err
		}
		list = append(list, a)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return list, nil
}
