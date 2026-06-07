package cli

import (
	"bytes"
	"fmt"
	"os"
	"os/exec"
	"strings"

	"github.com/zevlion/wha-http/internal/logger"
)

var rpmBin = func() string {
	if v := os.Getenv("RPM_BIN"); v != "" {
		return v
	}
	return "rpm"
}()

type RpmProcess struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Mode     string `json:"mode"`
	PID      string `json:"pid"`
	CPU      string `json:"cpu"`
	Mem      string `json:"mem"`
	Uptime   string `json:"uptime"`
	Status   string `json:"status"`
	Watch    string `json:"watch"`
	Restarts string `json:"restarts"`
}

func rpmRun(args []string, env map[string]string) (string, string, int, error) {
	cmd := exec.Command(rpmBin, args...)
	cmd.Env = os.Environ()
	for k, v := range env {
		cmd.Env = append(cmd.Env, k+"="+v)
	}
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	err := cmd.Run()
	code := 0
	if cmd.ProcessState != nil {
		code = cmd.ProcessState.ExitCode()
	}
	logger.Trace("[rpm] exec: %s %s", rpmBin, strings.Join(args, " "))
	logger.Trace("[rpm] exit: %d", code)
	return stdout.String(), stderr.String(), code, err
}

func parseTable(output string) []RpmProcess {
	var list []RpmProcess
	for _, line := range strings.Split(output, "\n") {
		trimmed := strings.TrimSpace(line)
		if !strings.HasPrefix(trimmed, "│") {
			continue
		}
		if strings.Contains(trimmed, "│ id") || strings.Contains(trimmed, "no processes running") {
			continue
		}
		cells := strings.Split(trimmed, "│")
		var clean []string
		for i, c := range cells {
			if i == 0 || i == len(cells)-1 {
				continue
			}
			clean = append(clean, strings.TrimSpace(c))
		}
		if len(clean) < 10 {
			continue
		}
		list = append(list, RpmProcess{
			ID: clean[0], Name: clean[1], Mode: clean[2],
			PID: clean[3], CPU: clean[4], Mem: clean[5],
			Uptime: clean[6], Status: clean[7], Watch: clean[8], Restarts: clean[9],
		})
	}
	return list
}

func RpmStart(scriptPath, name string, watch, force bool, env map[string]string) error {
	args := []string{"start", scriptPath, "--name", name}
	if watch {
		args = append(args, "--watch")
	}
	if force {
		args = append(args, "--force")
	}
	_, stderr, code, _ := rpmRun(args, env)
	if code != 0 {
		return fmt.Errorf("rpm start failed (exit %d): %s", code, strings.TrimSpace(stderr))
	}
	return nil
}

func RpmStop(nameOrID string) error {
	_, stderr, code, _ := rpmRun([]string{"stop", nameOrID}, nil)
	if code != 0 {
		return fmt.Errorf("rpm stop failed (exit %d): %s", code, strings.TrimSpace(stderr))
	}
	return nil
}

func RpmRestart(nameOrID string) error {
	_, stderr, code, _ := rpmRun([]string{"restart", nameOrID}, nil)
	if code != 0 {
		return fmt.Errorf("rpm restart failed (exit %d): %s", code, strings.TrimSpace(stderr))
	}
	return nil
}

func RpmDelete(nameOrID string) error {
	_, stderr, code, _ := rpmRun([]string{"delete", nameOrID}, nil)
	if code != 0 {
		return fmt.Errorf("rpm delete failed (exit %d): %s", code, strings.TrimSpace(stderr))
	}
	return nil
}

func RpmList() ([]RpmProcess, error) {
	stdout, stderr, code, _ := rpmRun([]string{"ls"}, nil)
	if code != 0 {
		return nil, fmt.Errorf("rpm ls failed (exit %d): %s", code, strings.TrimSpace(stderr))
	}
	return parseTable(stdout), nil
}

func RpmGet(nameOrID string) (*RpmProcess, error) {
	list, err := RpmList()
	if err != nil {
		return nil, err
	}
	for _, p := range list {
		if p.Name == nameOrID || p.ID == nameOrID {
			return &p, nil
		}
	}
	return nil, nil
}

func RpmIsRunning(nameOrID string) (bool, error) {
	p, err := RpmGet(nameOrID)
	if err != nil {
		return false, err
	}
	return p != nil && p.Status == "online", nil
}
