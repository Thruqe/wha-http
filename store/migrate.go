package store

import (
	_ "embed"
)

//go:embed schema.sql
var schema string

func Migrate() error {
	_, err := DB.Exec(schema)
	if err != nil {
		return err
	}
	// Add client column to wa_accounts if it doesn't exist
	_, _ = DB.Exec(`ALTER TABLE wa_accounts ADD COLUMN client TEXT NOT NULL DEFAULT 'chrome'`)
	return nil
}
