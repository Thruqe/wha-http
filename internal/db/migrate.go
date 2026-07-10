package db

import (
	_ "embed"
)

//go:embed schema.sql
var schema string

func Migrate() error {
	_, err := DB.Exec(schema)
	return err
}
