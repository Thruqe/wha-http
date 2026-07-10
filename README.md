# WHA-HTTP

WHA-HTTP is an open-source, self-hosted WhatsApp gateway that lets you connect multiple accounts and automate messaging workflows over HTTP, WebSockets, and webhooks.

## Features

- **Multi-account** — each WhatsApp account runs in its own isolated process on a dedicated port
- **Pairing** — link accounts via QR code or 8-digit pair code, streamed live over WebSocket
- **Real-time events** — all WhatsApp events (messages, status updates, connections) streamed to connected clients
- **Webhook delivery** — forward every event to one or more HTTP endpoints with optional HMAC-SHA256 signature verification
- **Auto-restart** — rpm watches each zevBot instance and restarts it on crash
- **JWT auth** — stateless authentication with 7-day tokens

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

## Contributing

Contributions are welcome, please feel free to submit a pull request. Please keep PRs focused and test with at least one real WhatsApp account before submitting.
