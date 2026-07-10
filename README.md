# WHA-HTTP

A self-hosted, multi-tenant WhatsApp automation platform. Connect multiple WhatsApp accounts, stream real-time events, and forward them to webhooks — all managed through a simple REST and WebSocket API.

---

## Description

WHA-HTTP sits between your application and WhatsApp. Each WhatsApp account gets its own isolated `zevBot` process (a Rust binary built on `whatsapp-rust`), managed by `rpm` (a native process manager). A Bun.js backend handles authentication, account provisioning, WebSocket proxying, and webhook delivery.

---

## Architecture

```
Your App / Dashboard
        │
        │  HTTPS / WSS
        ▼
┌─────────────────────────┐
│     Bun.js Backend      │  Auth · REST API · WS Proxy · Webhook Engine
└────────────┬────────────┘
             │ WebSocket (per account)
    ┌────────┴────────┐
    ▼                 ▼
[zevBot :4000]   [zevBot :4001]   ...one per WA account
(account A)      (account B)
    └──────── managed by rpm ─────┘
```

---

## Stack

| Component       | Technology                               |
| --------------- | ---------------------------------------- |
| WhatsApp engine | Rust (`zevBot` binary, `whatsapp-rust`)  |
| Process manager | `rpm` (native PM2 alternative)           |
| Backend / API   | Bun.js + TypeScript                      |
| Database        | SQLite via Drizzle ORM                   |
| Auth            | JWT (via `jose`)                         |
| Real-time       | WebSockets (Bun native + upstream proxy) |

---

## Features

- **Multi-account** — each WhatsApp account runs in its own isolated process on a dedicated port
- **Pairing** — link accounts via QR code or 8-digit pair code, streamed live over WebSocket
- **Real-time events** — all WhatsApp events (messages, status updates, connections) streamed to connected clients
- **Webhook delivery** — forward every event to one or more HTTP endpoints with optional HMAC-SHA256 signature verification
- **Auto-restart** — rpm watches each zevBot instance and restarts it on crash
- **JWT auth** — stateless authentication with 7-day tokens

---

## API Reference

### Auth

| Method | Path             | Description               |
| ------ | ---------------- | ------------------------- |
| `POST` | `/auth/register` | Create a new user account |
| `POST` | `/auth/login`    | Login and receive a JWT   |
| `GET`  | `/auth/me`       | Get current user info     |

### WhatsApp Accounts

| Method   | Path                    | Description                               |
| -------- | ----------------------- | ----------------------------------------- |
| `GET`    | `/accounts`             | List all connected WA accounts            |
| `POST`   | `/accounts`             | Add a new WA account                      |
| `GET`    | `/accounts/:id`         | Get account details + live process status |
| `DELETE` | `/accounts/:id`         | Logout and remove account                 |
| `POST`   | `/accounts/:id/stop`    | Stop the account's process                |
| `POST`   | `/accounts/:id/restart` | Restart the account's process             |

### Webhooks

| Method   | Path                          | Description                  |
| -------- | ----------------------------- | ---------------------------- |
| `GET`    | `/accounts/:id/hooks`         | List webhooks for an account |
| `POST`   | `/accounts/:id/hooks`         | Register a webhook URL       |
| `DELETE` | `/accounts/:id/hooks/:hookId` | Remove a webhook             |

### WebSocket

| Path                | Description                      |
| ------------------- | -------------------------------- |
| `WS /ws/:accountId` | Live event stream for an account |

Authenticate via `?token=<jwt>` query param or `Authorization: Bearer <jwt>` header.

---

## Adding a WhatsApp Account

```bash
# 1. Register
curl -X POST http://localhost:8080/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"yourpassword"}'

# 2. Add account (pair code mode)
curl -X POST http://localhost:8080/accounts \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"phone":"2348012345678","mode":"pair","pairPhone":"2348012345678"}'

# 3. Connect WebSocket to receive the pair code
# ws://localhost:8080/ws/<accountId>?token=<token>
# Enter the code on your phone: WhatsApp → Linked Devices → Link with phone number
```

---

## Webhook Events

Every event emitted by a connected WhatsApp account is forwarded to registered webhooks as an HTTP POST:

```json
{
	"accountId": "8fc9e1b0-ceec-4c10-9d64-a14944fc513f",
	"event": {
		"PairingCode": {
			"code": "S42YF45F",
			"timeout": { "secs": 180, "nanos": 0 }
		}
	}
}
```

If a webhook secret is configured, each request includes an `X-WHA-Signature` header — an HMAC-SHA256 hex digest of the request body signed with your secret.

---

## Environment Variables

| Variable             | Default                     | Description                              |
| -------------------- | --------------------------- | ---------------------------------------- |
| `PORT`               | `8080`                      | Bun backend port                         |
| `JWT_SECRET`         | `change-me-in-production`   | JWT signing secret                       |
| `DB_PATH`            | `wha-http.db`               | SQLite database path                     |
| `RPM_BIN`            | `rpm`                       | Path to rpm binary                       |
| `ZEVBOT_BIN`         | `zevBot`                    | Path to zevBot binary                    |
| `ZEVBOT_AUTH_DIR`    | `/workspaces/wha-http/auth` | Directory for WA session files           |
| `ZEVBOT_SCRIPTS_DIR` | `/tmp/wha-http-scripts`     | Directory for per-session launch scripts |

---

## Contributing

Contributions are welcome — feel free to open an issue or submit a pull request. Please keep PRs focused and test with at least one real WhatsApp account before submitting.
