package cli

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
)

var (
	whatsrookBin = envOr("WHATSROOK_BIN", "whatsrook")
	authDir      = func() string {
		cwd, err := os.Getwd()
		if err != nil {
			return "./auth"
		}
		return filepath.Join(cwd, "auth")
	}()
)

func envOr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

// SessionName returns the canonical process name for a phone number.
func SessionName(phone string) string {
	return "wa-" + phone
}

// proc tracks a running whatsrook child process.
type proc struct {
	cmd  *exec.Cmd
	done chan struct{} // closed when the process exits
}

var (
	mu    sync.Mutex
	procs = map[string]*proc{} // keyed by SessionName
)

// start launches whatsrook with the given extra args and registers it in procs.
// If a process for this phone is already running it is stopped first.
func start(phone string, extraArgs []string) error {
	name := SessionName(phone)

	mu.Lock()
	// Kill any existing process for this phone
	if p, ok := procs[name]; ok {
		_ = p.cmd.Process.Kill()
		<-p.done
		delete(procs, name)
	}
	mu.Unlock()

	args := append([]string{
		"--session", phone,
		"--auth-dir", authDir,
	}, extraArgs...)

	cmd := exec.Command(whatsrookBin, args...)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	// Output dynamic info logging mapping to whatsrook execution
	fmt.Printf("[whatsrook] starting: %s %v\n", whatsrookBin, args)
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("whatsrook start failed: %w", err)
	}

	p := &proc{cmd: cmd, done: make(chan struct{})}
	mu.Lock()
	procs[name] = p
	mu.Unlock()

	// Reap the process and clean up the map when it exits
	go func() {
		_ = cmd.Wait()
		close(p.done)
		mu.Lock()
		// Only remove if it's still our entry (not replaced by a newer start)
		if procs[name] == p {
			delete(procs, name)
		}
		mu.Unlock()
		fmt.Printf("[whatsrook] process exited: %s\n", name)
	}()

	return nil
}

// ── Public API ────────────────────────────────────────────────────────────────

func ZevBotStart(phone string, port int, _, _ bool) error {
	return start(phone, []string{"--port", fmt.Sprintf("%d", port)})
}

func ZevBotStartWithQr(phone string, port int, _ bool) error {
	return start(phone, []string{"--port", fmt.Sprintf("%d", port), "--qrcode"})
}

func ZevBotStartWithPairCode(phone string, port int, _ string, _ bool) error {
	return start(phone, []string{"--port", fmt.Sprintf("%d", port), "--pair"})
}

func ZevBotStop(phone string) error {
	name := SessionName(phone)
	mu.Lock()
	p, ok := procs[name]
	mu.Unlock()

	if !ok {
		fmt.Printf("[whatsrook] stop: process not found for %s\n", phone)
		return nil
	}

	fmt.Printf("[whatsrook] stopping %s (pid %d)\n", name, p.cmd.Process.Pid)
	if err := p.cmd.Process.Kill(); err != nil {
		return fmt.Errorf("whatsrook stop failed: %w", err)
	}
	<-p.done
	return nil
}

func ZevBotRestart(phone string) error {
	mu.Lock()
	p, ok := procs[SessionName(phone)]
	var args []string
	if ok {
		args = p.cmd.Args[1:]
	}
	mu.Unlock()

	if !ok {
		return fmt.Errorf("whatsrook restart: no running process for %s", phone)
	}

	fmt.Printf("[whatsrook] restarting %s\n", SessionName(phone))
	_ = p.cmd.Process.Kill()
	<-p.done

	cmd := exec.Command(whatsrookBin, args...)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("whatsrook restart failed: %w", err)
	}

	name := SessionName(phone)
	np := &proc{cmd: cmd, done: make(chan struct{})}
	mu.Lock()
	procs[name] = np
	mu.Unlock()

	go func() {
		_ = cmd.Wait()
		close(np.done)
		mu.Lock()
		if procs[name] == np {
			delete(procs, name)
		}
		mu.Unlock()
		fmt.Printf("[whatsrook] process exited: %s\n", name)
	}()

	return nil
}

func ZevBotDelete(phone string) error {
	return ZevBotStop(phone)
}

func ZevBotIsRunning(phone string) (bool, error) {
	mu.Lock()
	_, ok := procs[SessionName(phone)]
	mu.Unlock()
	return ok, nil
}

func ZevBotGet(phone string) (*ZevBotProcess, error) {
	mu.Lock()
	p, ok := procs[SessionName(phone)]
	mu.Unlock()

	if !ok {
		return nil, nil
	}
	status := "online"
	select {
	case <-p.done:
		status = "stopped"
	default:
	}
	return &ZevBotProcess{Name: SessionName(phone), Status: status}, nil
}

func ZevBotLogout(phone string) error {
	_ = ZevBotStop(phone)

	cmd := exec.Command(whatsrookBin,
		"--session", phone,
		"--auth-dir", authDir,
		"--logout",
	)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	fmt.Printf("[whatsrook] running logout for %s\n", phone)
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("whatsrook logout failed: %w", err)
	}
	return nil
}

type ZevBotProcess struct {
	Name   string
	Status string
}
