CREATE TABLE IF NOT EXISTS users (
    id          TEXT PRIMARY KEY,
    email       TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS wa_accounts (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    phone       TEXT NOT NULL UNIQUE,
    port        INTEGER NOT NULL UNIQUE,
    status      TEXT NOT NULL DEFAULT 'pending_qr',
    created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS hooks (
    id              TEXT PRIMARY KEY,
    wa_account_id   TEXT NOT NULL REFERENCES wa_accounts(id) ON DELETE CASCADE,
    event_type      TEXT NOT NULL,
    target_url      TEXT NOT NULL,
    secret          TEXT,
    created_at      INTEGER NOT NULL DEFAULT (unixepoch())
);
