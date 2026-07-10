package main

import (
	"net/http"
	"os"
	"os/signal"
	"regexp"
	"strings"
	"syscall"

	"github.com/zevlion/wha-http/cli"
	"github.com/zevlion/wha-http/routes"
	"github.com/zevlion/wha-http/store"
)

var (
	accountRe    = regexp.MustCompile(`^/accounts/([^/]+)$`)
	accountActRe = regexp.MustCompile(`^/accounts/([^/]+)/(stop|restart)$`)
	hooksRe      = regexp.MustCompile(`^/accounts/([^/]+)/hooks$`)
	hookRe       = regexp.MustCompile(`^/accounts/([^/]+)/hooks/([^/]+)$`)
)

func withCORS(h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
		if r.Method == "OPTIONS" {
			w.WriteHeader(204)
			return
		}
		h.ServeHTTP(w, r)
	})
}

func startAll() {
	accounts, err := store.GetAllActiveAccounts()
	if err != nil {
		Error("[startup] failed to load active accounts: %v", err)
		return
	}
	Info("[startup] starting %d active account(s)", len(accounts))
	for _, a := range accounts {
		a := a
		if err := cli.ZevBotStart(a.Phone, a.Port, false, false); err != nil {
			Error("[startup] failed to start zevBot for account=%s phone=%s err=%v", a.ID, a.Phone, err)
			continue
		}
		go connectUpstream(a.ID, a.Phone, a.Port)
	}
}

func stopAll() {
	accounts, err := store.GetAllActiveAccounts()
	if err != nil {
		Error("[shutdown] failed to load active accounts: %v", err)
		return
	}
	Info("[shutdown] stopping %d active account(s)", len(accounts))
	for _, a := range accounts {
		if err := cli.ZevBotStop(a.Phone); err != nil {
			Error("[shutdown] failed to stop zevBot for account=%s phone=%s err=%v", a.ID, a.Phone, err)
		} else {
			Info("[shutdown] stopped zevBot phone=%s", a.Phone)
		}
	}
}

func main() {
	if err := store.Init(); err != nil {
		Error("failed to init db: %v", err)
		os.Exit(1)
	}

	go startAll()

	// Graceful shutdown — stop all zevBot processes on SIGINT/SIGTERM
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		<-quit
		Info("[shutdown] signal received, stopping all zevBot instances")
		stopAll()
		os.Exit(0)
	}()

	mux := http.NewServeMux()

	spaDir := "client/build"
	spaFS := http.FileServer(http.Dir(spaDir))
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path
		method := r.Method

		if strings.HasPrefix(path, "/ws/") {
			Handler(w, r)
			return
		}

		switch {
		case path == "/auth/register" && method == "POST":
			routes.Register(w, r)
			return
		case path == "/auth/login" && method == "POST":
			routes.Login(w, r)
			return
		case path == "/auth/me" && method == "GET":
			routes.Me(w, r)
			return
		case path == "/accounts" && method == "GET":
			routes.ListAccounts(w, r)
			return
		case path == "/accounts" && method == "POST":
			routes.AddAccount(w, r)
			return
		}

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

		filePath := spaDir + path
		if _, err := os.Stat(filePath); os.IsNotExist(err) {
			http.ServeFile(w, r, spaDir+"/index.html")
			return
		}
		spaFS.ServeHTTP(w, r)
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	Info("[WHA-HTTP] listening on port %s", port)
	if err := http.ListenAndServe(":"+port, withCORS(mux)); err != nil {
		Error("server error: %v", err)
		os.Exit(1)
	}
}
