package main

import (
	"net/http"
	"os"
	"regexp"
	"strings"

	"github.com/zevlion/wha-http/internal/db"
	"github.com/zevlion/wha-http/internal/logger"
	"github.com/zevlion/wha-http/internal/routes"
	"github.com/zevlion/wha-http/internal/ws"
)

var (
	accountRe    = regexp.MustCompile(`^/accounts/([^/]+)$`)
	accountActRe = regexp.MustCompile(`^/accounts/([^/]+)/(stop|restart)$`)
	hooksRe      = regexp.MustCompile(`^/accounts/([^/]+)/hooks$`)
	hookRe       = regexp.MustCompile(`^/accounts/([^/]+)/hooks/([^/]+)$`)
)

func main() {
	if err := db.Init(); err != nil {
		logger.Error("failed to init db: %v", err)
		os.Exit(1)
	}

	mux := http.NewServeMux()

	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path
		method := r.Method

		// WebSocket
		if strings.HasPrefix(path, "/ws/") {
			ws.Handler(w, r)
			return
		}

		// Auth
		switch {
		case path == "/auth/register" && method == "POST":
			routes.Register(w, r)
		case path == "/auth/login" && method == "POST":
			routes.Login(w, r)
		case path == "/auth/me" && method == "GET":
			routes.Me(w, r)

		// Accounts flat
		case path == "/accounts" && method == "GET":
			routes.ListAccounts(w, r)
		case path == "/accounts" && method == "POST":
			routes.AddAccount(w, r)

		// Accounts with action
		default:
			if m := accountActRe.FindStringSubmatch(path); m != nil {
				switch {
				case method == "POST" && m[2] == "stop":
					routes.StopAccount(w, r, m[1])
				case method == "POST" && m[2] == "restart":
					routes.RestartAccount(w, r, m[1])
				default:
					http.NotFound(w, r)
				}
				return
			}
			if m := hookRe.FindStringSubmatch(path); m != nil {
				if method == "DELETE" {
					routes.DeleteHook(w, r, m[1], m[2])
				} else {
					http.NotFound(w, r)
				}
				return
			}
			if m := hooksRe.FindStringSubmatch(path); m != nil {
				switch method {
				case "GET":
					routes.ListHooks(w, r, m[1])
				case "POST":
					routes.CreateHook(w, r, m[1])
				default:
					http.NotFound(w, r)
				}
				return
			}
			if m := accountRe.FindStringSubmatch(path); m != nil {
				switch method {
				case "GET":
					routes.GetAccount(w, r, m[1])
				case "DELETE":
					routes.RemoveAccount(w, r, m[1])
				default:
					http.NotFound(w, r)
				}
				return
			}
			http.NotFound(w, r)
		}
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	logger.Info("[WHA-HTTP] listening on port %s", port)
	if err := http.ListenAndServe(":"+port, mux); err != nil {
		logger.Error("server error: %v", err)
		os.Exit(1)
	}
}
