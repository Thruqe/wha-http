# client

Static web frontend for WHA-HTTP. Pure HTML, CSS, and JavaScript — no build step, no npm, no Node.js required.

## Structure

```
client/
├── index.html          # SPA shell — hash-based routing (#/login, #/dashboard, …)
├── style.css           # All styles; system fonts only, zero network requests
├── favicon.svg         # Inline SVG favicon
└── js/
    ├── app.js          # Entry point — registers routes, boots router
    ├── router.js       # Hash-change router with per-page cleanup
    ├── dom.js          # el(), formHandler(), statusBadge() helpers
    ├── auth.js         # Token + user state (localStorage)
    ├── api.js          # Fetch wrapper for all REST endpoints
    ├── ws.js           # WebSocket wrapper with reconnect + ack/timeout
    └── pages/
        ├── login.js
        ├── register.js
        ├── dashboard.js
        └── account.js
```

## Development

The Go server (`../main.go`) serves this directory directly on `http://localhost:8080`.
Start the backend and open `http://localhost:8080` in your browser — no separate dev server needed.

```sh
# from the repo root
go run .
```

Edit any file under `client/` and refresh the browser. Because these are native ES modules
the browser re-fetches only the changed file on each reload.

## Routing

All navigation is hash-based so the server never needs to handle client-side routes:

| Hash            | Page             |
|-----------------|------------------|
| `#/`            | → redirect       |
| `#/login`       | Login            |
| `#/register`    | Register         |
| `#/dashboard`   | Account list     |
| `#/accounts/:id`| Account detail   |
