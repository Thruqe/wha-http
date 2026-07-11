package cli

import (
	"bufio"
	"database/sql"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"syscall"

	_ "github.com/mattn/go-sqlite3"
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
	mu            sync.Mutex
	procs         = map[string]*proc{}    // keyed by SessionName
	lastKnownArgs = map[string][]string{} // keyed by SessionName
)

// OnLog is called whenever the child process outputs a line to stdout or stderr.
var OnLog func(phone string, line string)

func scanLogs(reader io.ReadCloser, phone string, isStderr bool) {
	defer reader.Close()
	scanner := bufio.NewScanner(reader)
	for scanner.Scan() {
		line := scanner.Text()
		if isStderr {
			fmt.Fprintln(os.Stderr, fmt.Sprintf("[%s] %s", SessionName(phone), line))
		} else {
			fmt.Fprintln(os.Stdout, fmt.Sprintf("[%s] %s", SessionName(phone), line))
		}
		if OnLog != nil {
			OnLog(phone, line)
		}
	}
}

func prepareSessionDB(phone string) error {
	if err := os.MkdirAll(authDir, 0755); err != nil {
		return err
	}
	dbPath := filepath.Join(authDir, phone+".db")
	db, err := sql.Open("sqlite3", dbPath)
	if err != nil {
		return fmt.Errorf("failed to open session db: %w", err)
	}
	defer db.Close()

	_, err = db.Exec("CREATE TABLE IF NOT EXISTS call_audio_config (our_jid TEXT, sender TEXT, file_path TEXT, updated_at INTEGER);")
	if err != nil {
		return fmt.Errorf("failed to prepare call_audio_config: %w", err)
	}
	return nil
}

func runCmd(phone string, args []string) error {
	name := SessionName(phone)

	if err := prepareSessionDB(phone); err != nil {
		return fmt.Errorf("prepare db failed: %w", err)
	}

	cmd := exec.Command(whatsrookBin, args...)
	stdoutPipe, err := cmd.StdoutPipe()
	if err != nil {
		return fmt.Errorf("stdout pipe failed: %w", err)
	}
	stderrPipe, err := cmd.StderrPipe()
	if err != nil {
		return fmt.Errorf("stderr pipe failed: %w", err)
	}

	fmt.Printf("[whatsrook] starting: %s %v\n", whatsrookBin, args)
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("whatsrook start failed: %w", err)
	}

	go scanLogs(stdoutPipe, phone, false)
	go scanLogs(stderrPipe, phone, true)

	p := &proc{cmd: cmd, done: make(chan struct{})}
	mu.Lock()
	procs[name] = p
	lastKnownArgs[name] = args
	mu.Unlock()

	go func() {
		_ = cmd.Wait()
		close(p.done)
		mu.Lock()
		if procs[name] == p {
			delete(procs, name)
		}
		mu.Unlock()
		fmt.Printf("[whatsrook] process exited: %s\n", name)
	}()

	return nil
}

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

	return runCmd(phone, args)
}

// ── Public API ────────────────────────────────────────────────────────────────

func BotStart(phone string, port int, clientType string) error {
	return start(phone, []string{"--port", fmt.Sprintf("%d", port), "--client", clientType})
}

func BotStartWithQr(phone string, port int, clientType string) error {
	return start(phone, []string{"--port", fmt.Sprintf("%d", port), "--qrcode", "--client", clientType})
}

func BotStartWithPairCode(phone string, port int, pairPhone string, clientType string) error {
	return start(phone, []string{"--port", fmt.Sprintf("%d", port), "--pair", "--client", clientType})
}

func BotStop(phone string) error {
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

func BotRestart(phone string) error {
	name := SessionName(phone)
	mu.Lock()
	p, ok := procs[name]
	var args []string
	if ok {
		args = p.cmd.Args[1:]
	} else {
		args = lastKnownArgs[name]
	}
	mu.Unlock()

	if len(args) == 0 {
		return fmt.Errorf("whatsrook restart: no running process or saved configuration for %s", phone)
	}

	fmt.Printf("[whatsrook] restarting %s\n", name)
	if ok && p.cmd.Process != nil {
		_ = p.cmd.Process.Kill()
		<-p.done
	}

	return runCmd(phone, args)
}

func BotPause(phone string) error {
	name := SessionName(phone)
	mu.Lock()
	p, ok := procs[name]
	mu.Unlock()

	if !ok || p.cmd.Process == nil {
		return fmt.Errorf("whatsrook pause: process not running for %s", phone)
	}

	fmt.Printf("[whatsrook] pausing %s\n", name)
	return p.cmd.Process.Signal(syscall.SIGSTOP)
}

func BotResume(phone string) error {
	name := SessionName(phone)
	mu.Lock()
	p, ok := procs[name]
	var args []string
	if !ok {
		args = lastKnownArgs[name]
	}
	mu.Unlock()

	if ok && p.cmd.Process != nil {
		fmt.Printf("[whatsrook] resuming %s\n", name)
		return p.cmd.Process.Signal(syscall.SIGCONT)
	}

	if len(args) == 0 {
		return fmt.Errorf("whatsrook resume: no running process or saved configuration for %s", phone)
	}

	return runCmd(phone, args)
}

func BotDelete(phone string) error {
	return BotStop(phone)
}

func BotIsRunning(phone string) (bool, error) {
	mu.Lock()
	_, ok := procs[SessionName(phone)]
	mu.Unlock()
	return ok, nil
}

func BotGet(phone string) (*BotProcess, error) {
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
	return &BotProcess{Name: SessionName(phone), Status: status}, nil
}

func BotLogout(phone string) error {
	_ = BotStop(phone)

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

// DeleteAccountFiles removes on-disk session files for a phone number.
func DeleteAccountFiles(phone string) error {
	patterns := []string{
		filepath.Join(authDir, phone+".db"),
		filepath.Join(authDir, phone+".db-shm"),
		filepath.Join(authDir, phone+".db-wal"),
		filepath.Join(authDir, phone+".json"),
	}
	var lastErr error
	for _, p := range patterns {
		if err := os.Remove(p); err != nil && !os.IsNotExist(err) {
			lastErr = err
		}
	}
	return lastErr
}

type BotProcess struct {
	Name   string
	Status string
}
