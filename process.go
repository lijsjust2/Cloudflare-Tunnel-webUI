package main

import (
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"sync"
	"time"
)

type ProcessInfo struct {
	ID       string
	Cmd      *exec.Cmd
	LogFile  string
	Running  bool
}

type ProcessManager struct {
	dataDir   string
	processes map[string]*ProcessInfo
	mu        sync.RWMutex
}

func NewProcessManager(dataDir string) *ProcessManager {
	logsDir := filepath.Join(dataDir, "logs")
	os.MkdirAll(logsDir, 0755)

	return &ProcessManager{
		dataDir:   dataDir,
		processes: make(map[string]*ProcessInfo),
	}
}

func (pm *ProcessManager) cloudflaredPath() string {
	name := "cloudflared"
	if runtime.GOOS == "windows" {
		name = "cloudflared.exe"
	}
	return filepath.Join(pm.dataDir, "cloudflared", name)
}

func (pm *ProcessManager) logPath(id string) string {
	return filepath.Join(pm.dataDir, "logs", id+".log")
}

func (pm *ProcessManager) Start(id string, tunnel *TunnelConfig) error {
	pm.mu.Lock()
	defer pm.mu.Unlock()

	if info, ok := pm.processes[id]; ok && info.Running {
		return fmt.Errorf("tunnel %s is already running", id)
	}

	cloudflaredPath := pm.cloudflaredPath()
	if _, err := os.Stat(cloudflaredPath); err != nil {
		return fmt.Errorf("cloudflared binary not found, please install cloudflared first")
	}

	if tunnel.Token == "" {
		return fmt.Errorf("tunnel token is required")
	}

	return pm.startWithToken(id, tunnel.Token)
}

func (pm *ProcessManager) startWithToken(id string, token string) error {
	logFile := pm.logPath(id)
	lf, err := os.OpenFile(logFile, os.O_CREATE|os.O_WRONLY|os.O_TRUNC|os.O_SYNC, 0644)
	if err != nil {
		return fmt.Errorf("failed to create log file: %v", err)
	}

	cloudflaredPath := pm.cloudflaredPath()
	cmd := exec.Command(cloudflaredPath, "tunnel", "--no-autoupdate", "run", "--token", token)
	cmd.Stdout = lf
	cmd.Stderr = lf

	if err := cmd.Start(); err != nil {
		lf.Close()
		return fmt.Errorf("failed to start cloudflared: %v", err)
	}

	info := &ProcessInfo{
		ID:      id,
		Cmd:     cmd,
		LogFile: logFile,
		Running: true,
	}
	pm.processes[id] = info

	go func() {
		cmd.Wait()
		lf.Close()
		pm.mu.Lock()
		if p, ok := pm.processes[id]; ok && p.Cmd == cmd {
			p.Running = false
		}
		pm.mu.Unlock()
		log.Printf("cloudflared process for tunnel %s exited", id)
	}()

	log.Printf("cloudflared started for tunnel %s (PID: %d)", id, cmd.Process.Pid)
	return nil
}

func (pm *ProcessManager) Stop(id string) error {
	pm.mu.Lock()
	defer pm.mu.Unlock()

	info, ok := pm.processes[id]
	if !ok || !info.Running {
		return nil
	}

	if err := info.Cmd.Process.Kill(); err != nil {
		return fmt.Errorf("failed to stop cloudflared: %v", err)
	}

	info.Cmd.Wait()
	info.Running = false
	log.Printf("cloudflared stopped for tunnel %s", id)
	return nil
}

func (pm *ProcessManager) Restart(id string, tunnel *TunnelConfig) error {
	pm.Stop(id)
	time.Sleep(1 * time.Second)
	return pm.Start(id, tunnel)
}

func (pm *ProcessManager) Status(id string) (bool, int) {
	pm.mu.RLock()
	defer pm.mu.RUnlock()

	info, ok := pm.processes[id]
	if !ok {
		return false, 0
	}

	pid := 0
	if info.Cmd != nil && info.Cmd.Process != nil {
		pid = info.Cmd.Process.Pid
	}
	return info.Running, pid
}

func (pm *ProcessManager) GetLogs(id string, lines int) (string, error) {
	logFile := pm.logPath(id)
	b, err := os.ReadFile(logFile)
	if err != nil {
		if os.IsNotExist(err) {
			return "", nil
		}
		return "", err
	}

	content := string(b)

	ansiRegex := regexp.MustCompile(`\x1b\[[0-9;]*[a-zA-Z]`)
	content = ansiRegex.ReplaceAllString(content, "")

	content = strings.TrimSpace(content)

	if lines > 0 {
		allLines := strings.Split(content, "\n")
		if len(allLines) > lines {
			allLines = allLines[len(allLines)-lines:]
		}
		content = strings.Join(allLines, "\n")
	}

	return content, nil
}

func (pm *ProcessManager) ClearLogs(id string) error {
	logFile := pm.logPath(id)
	err := os.WriteFile(logFile, []byte{}, 0644)
	if err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}

func (pm *ProcessManager) StopAll() {
	pm.mu.Lock()
	defer pm.mu.Unlock()

	for id, info := range pm.processes {
		if info.Running {
			info.Cmd.Process.Kill()
			info.Running = false
			log.Printf("cloudflared stopped for tunnel %s (shutdown)", id)
		}
	}
}
