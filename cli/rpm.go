package cli

import (
	"bytes"
	"fmt"
	"os"
	"os/exec"
	"strings"
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

	Trace("[rpm] exec: %s %s", rpmBin, strings.Join(args, " "))
	err := cmd.Run()
	code := 0
	if cmd.ProcessState != nil {
		code = cmd.ProcessState.ExitCode()
	}
	Trace("[rpm] exit: %d", code)
	if stdout.Len() > 0 {
		Trace("[rpm] stdout: %s", strings.TrimSpace(stdout.String()))
	}
	if stderr.Len() > 0 {
		Trace("[rpm] stderr: %s", strings.TrimSpace(stderr.String()))
	}
	return stdout.String(), stderr.String(), code, err
}

func parseTable(output string) []RpmProcess {
	Trace("[rpm] parsing table output (%d bytes)", len(output))
	var list []RpmProcess
	for line := range strings.SplitSeq(output, "\n") {
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
			Trace("[rpm] skipping malformed row (got %d cells): %s", len(clean), trimmed)
			continue
		}
		p := RpmProcess{
			ID: clean[0], Name: clean[1], Mode: clean[2],
			PID: clean[3], CPU: clean[4], Mem: clean[5],
			Uptime: clean[6],
			Status: strings.TrimPrefix(strings.TrimSpace(clean[7]), "● "),
			Watch:  clean[8], Restarts: clean[9],
		}
		Trace("[rpm] parsed process: name=%s pid=%s status=%s restarts=%s", p.Name, p.PID, p.Status, p.Restarts)
		list = append(list, p)
	}
	Trace("[rpm] parseTable found %d process(es)", len(list))
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
	Info("[rpm] starting process name=%s script=%s watch=%v force=%v", name, scriptPath, watch, force)
	stdout, stderr, code, _ := rpmRun(args, env)
	if code != 0 {
		Error("[rpm] start failed name=%s exit=%d stderr=%s stdout=%s",
			name, code, strings.TrimSpace(stderr), strings.TrimSpace(stdout))
		return fmt.Errorf("rpm start failed (exit %d): %s", code, strings.TrimSpace(stderr))
	}
	Info("[rpm] started process name=%s", name)
	return nil
}

func RpmStop(nameOrID string) error {
	Info("[rpm] stopping process %s", nameOrID)
	stdout, stderr, code, _ := rpmRun([]string{"stop", nameOrID}, nil)
	if code != 0 {
		Error("[rpm] stop failed name=%s exit=%d stderr=%s stdout=%s",
			nameOrID, code, strings.TrimSpace(stderr), strings.TrimSpace(stdout))
		return fmt.Errorf("rpm stop failed (exit %d): %s", code, strings.TrimSpace(stderr))
	}
	Info("[rpm] stopped process %s", nameOrID)
	return nil
}

func RpmRestart(nameOrID string) error {
	Info("[rpm] restarting process %s", nameOrID)
	stdout, stderr, code, _ := rpmRun([]string{"restart", nameOrID}, nil)
	if code != 0 {
		Error("[rpm] restart failed name=%s exit=%d stderr=%s stdout=%s",
			nameOrID, code, strings.TrimSpace(stderr), strings.TrimSpace(stdout))
		return fmt.Errorf("rpm restart failed (exit %d): %s", code, strings.TrimSpace(stderr))
	}
	Info("[rpm] restarted process %s", nameOrID)
	return nil
}

func RpmDelete(nameOrID string) error {
	Info("[rpm] deleting process %s", nameOrID)
	stdout, stderr, code, _ := rpmRun([]string{"delete", nameOrID}, nil)
	if code != 0 {
		Error("[rpm] delete failed name=%s exit=%d stderr=%s stdout=%s",
			nameOrID, code, strings.TrimSpace(stderr), strings.TrimSpace(stdout))
		return fmt.Errorf("rpm delete failed (exit %d): %s", code, strings.TrimSpace(stderr))
	}
	Info("[rpm] deleted process %s", nameOrID)
	return nil
}

func RpmList() ([]RpmProcess, error) {
	Trace("[rpm] listing processes")
	stdout, stderr, code, _ := rpmRun([]string{"ls"}, nil)
	if code != 0 {
		Error("[rpm] ls failed exit=%d stderr=%s", code, strings.TrimSpace(stderr))
		return nil, fmt.Errorf("rpm ls failed (exit %d): %s", code, strings.TrimSpace(stderr))
	}
	list := parseTable(stdout)
	Trace("[rpm] list returned %d process(es)", len(list))
	return list, nil
}

func RpmGet(nameOrID string) (*RpmProcess, error) {
	Trace("[rpm] get process %s", nameOrID)
	list, err := RpmList()
	if err != nil {
		return nil, err
	}
	for _, p := range list {
		if p.Name == nameOrID || p.ID == nameOrID {
			Trace("[rpm] found process %s status=%s pid=%s", nameOrID, p.Status, p.PID)
			return &p, nil
		}
	}
	Trace("[rpm] process not found: %s", nameOrID)
	return nil, nil
}

func RpmIsRunning(nameOrID string) (bool, error) {
	Trace("[rpm] checking if running: %s", nameOrID)
	p, err := RpmGet(nameOrID)
	if err != nil {
		return false, err
	}
	running := p != nil && p.Status == "online"
	Trace("[rpm] is-running %s → %v", nameOrID, running)
	return running, nil
}
