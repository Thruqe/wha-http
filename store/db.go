package store

import (
	"database/sql"
	"os"

	_ "github.com/mattn/go-sqlite3"
)

var DB *sql.DB

func Init() error {
	path := os.Getenv("DB_PATH")
	if path == "" {
		path = "wha-http.db"
	}
	db, err := sql.Open("sqlite3", path+"?_journal_mode=WAL&_foreign_keys=on")
	if err != nil {
		return err
	}
	DB = db
	return Migrate()
}
