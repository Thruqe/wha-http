package network

import (
	"net"
	"time"
)

// IsOnline checks if web.whatsapp.com is reachable on port 443.
func IsOnline() bool {
	conn, err := net.DialTimeout("tcp", "web.whatsapp.com:443", 3*time.Second)
	if err != nil {
		return false
	}
	_ = conn.Close()
	return true
}
