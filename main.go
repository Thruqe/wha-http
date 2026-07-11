package main

import (
	"net/http"
	"os"
	"os/signal"
	"regexp"
	"strings"
	"syscall"

	"github.com/Thruqe/whatsrook/cli"
	"github.com/Thruqe/whatsrook/routes"
	"github.com/Thruqe/whatsrook/store"
)

var (
	accountRe    = regexp.MustCompile(`^/accounts/([^/]+)$`)
	accountActRe = regexp.MustCompile(`^/accounts/([^/]+)/(start|stop|restart|pause|resume|logout|contacts)$`)
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
		var startErr error
		if a.Status == "pending_qr" {
			startErr = cli.BotStartWithQr(a.Phone, a.Port, a.Client)
		} else if a.Status == "pending_pair" {
			startErr = cli.BotStartWithPairCode(a.Phone, a.Port, a.Phone, a.Client)
		} else {
			startErr = cli.BotStart(a.Phone, a.Port, a.Client)
		}
		if startErr != nil {
			Error("[startup] failed to start bot for account=%s phone=%s err=%v", a.ID, a.Phone, startErr)
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
		if err := cli.BotStop(a.Phone); err != nil {
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

	cli.OnLog = func(phone, line string) {
		account, err := store.GetAccountByPhone(phone)
		if err == nil && account != nil {
			broadcastEvent(account.ID, "log", map[string]any{"line": line})
		}
	}

	routes.OnStateChange = func(accountID string) {
		closeAllSubscribers(accountID)
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

	spaDir := "client"
	noCacheFS := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
		w.Header().Set("Pragma", "no-cache")
		w.Header().Set("Expires", "0")
		http.FileServer(http.Dir(spaDir)).ServeHTTP(w, r)
	})
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
		case path == "/stats" && method == "GET":
			routes.GetStatsHandler(w, r)
			return
		case path == "/accounts" && method == "GET":
			routes.ListAccounts(w, r)
			return
		case path == "/accounts" && method == "POST":
			routes.AddAccount(w, r)
			return
		case path == "/logs" && method == "GET":
			_, err := store.Authenticate(r)
			if err != nil {
				http.Error(w, "unauthorized", 401)
				return
			}
			w.Header().Set("Content-Disposition", "attachment; filename=\"wha-http.log\"")
			w.Header().Set("Content-Type", "text/plain; charset=utf-8")
			http.ServeFile(w, r, "logs.txt")
			return
		}

		if m := accountActRe.FindStringSubmatch(path); m != nil {
			switch {
			case method == "POST" && m[2] == "start":
				routes.StartAccount(w, r, m[1])
			case method == "POST" && m[2] == "stop":
				routes.StopAccount(w, r, m[1])
			case method == "POST" && m[2] == "restart":
				routes.RestartAccount(w, r, m[1])
			case method == "POST" && m[2] == "pause":
				routes.PauseAccount(w, r, m[1])
			case method == "POST" && m[2] == "resume":
				routes.ResumeAccount(w, r, m[1])
			case method == "POST" && m[2] == "logout":
				routes.LogoutAccount(w, r, m[1])
			case method == "GET" && m[2] == "contacts":
				routes.GetContacts(w, r, m[1])
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
			w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
			http.ServeFile(w, r, spaDir+"/index.html")
			return
		}
		noCacheFS.ServeHTTP(w, r)
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
