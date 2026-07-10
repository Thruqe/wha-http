package cli

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

var (
	zevBotBin  = envOr("ZEVBOT_BIN", "zevBot")
	scriptsDir = envOr("ZEVBOT_SCRIPTS_DIR", "/tmp/wha-http-scripts")

	// Dynamically resolve authDir fallback using current working directory
	authDir = func() string {
		if v := os.Getenv("ZEVBOT_AUTH_DIR"); v != "" {
			return v
		}
		cwd, err := os.Getwd()
		if err != nil {
			// Fail-safe to a local relative directory if os.Getwd fails
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

func SessionName(phone string) string {
	return "wa-" + phone
}

func writeScript(phone string, args []string) (string, error) {
	if err := os.MkdirAll(scriptsDir, 0o755); err != nil {
		return "", err
	}
	path := fmt.Sprintf("%s/%s.sh", scriptsDir, SessionName(phone))
	quoted := make([]string, len(args))
	for i, a := range args {
		quoted[i] = "'" + strings.ReplaceAll(a, "'", "'\\''") + "'"
	}
	content := fmt.Sprintf("#!/bin/sh\nexec %s %s\n", zevBotBin, strings.Join(quoted, " "))
	if err := os.WriteFile(path, []byte(content), 0o755); err != nil {
		return "", err
	}
	Trace("[zevbot] wrote script: %s", path)
	return path, nil
}

func removeScript(phone string) {
	os.Remove(fmt.Sprintf("%s/%s.sh", scriptsDir, SessionName(phone)))
}

func ZevBotStart(phone string, port int, watch, force bool) error {
	path, err := writeScript(phone, []string{
		"--session", phone,
		"--port", fmt.Sprintf("%d", port),
		"--auth-dir", authDir,
	})
	if err != nil {
		return err
	}
	return RpmStart(path, SessionName(phone), watch, force, nil)
}

func ZevBotStartWithQr(phone string, port int, force bool) error {
	path, err := writeScript(phone, []string{
		"--session", phone,
		"--port", fmt.Sprintf("%d", port),
		"--auth-dir", authDir,
		"--qrcode",
	})
	if err != nil {
		return err
	}
	return RpmStart(path, SessionName(phone), true, force, nil)
}

func ZevBotStartWithPairCode(phone string, port int, pairPhone string, force bool) error {
	path, err := writeScript(phone, []string{
		"--session", phone,
		"--port", fmt.Sprintf("%d", port),
		"--auth-dir", authDir,
		"--pair",
	})
	if err != nil {
		return err
	}
	return RpmStart(path, SessionName(phone), true, force, nil)
}

func ZevBotStop(phone string) error {
	return RpmStop(SessionName(phone))
}

func ZevBotRestart(phone string) error {
	return RpmRestart(SessionName(phone))
}

func ZevBotDelete(phone string) error {
	if err := RpmDelete(SessionName(phone)); err != nil {
		return err
	}
	removeScript(phone)
	return nil
}

func ZevBotGet(phone string) (*RpmProcess, error) {
	return RpmGet(SessionName(phone))
}

func ZevBotIsRunning(phone string) (bool, error) {
	return RpmIsRunning(SessionName(phone))
}

func ZevBotLogout(phone string) error {
	cmd := exec.Command(zevBotBin,
		"--session", phone,
		"--auth-dir", authDir,
		"--logout",
	)
	out, err := cmd.CombinedOutput()
	Trace("[zevbot] logout output: %s", string(out))
	if err != nil {
		return fmt.Errorf("zevBot logout failed: %w", err)
	}
	_ = RpmDelete(SessionName(phone))
	removeScript(phone)
	return nil
}
