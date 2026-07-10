package routes

import (
	"net/http"

	"github.com/Thruqe/whatsrook/store"
)

func GetStatsHandler(w http.ResponseWriter, r *http.Request) {
	p, err := store.Authenticate(r)
	if err != nil {
		jsonErr(w, "unauthorized", 401)
		return
	}

	stats, err := store.GetStats(p.UserID)
	if err != nil {
		jsonErr(w, err.Error(), 500)
		return
	}

	jsonOK(w, stats, 200)
}
