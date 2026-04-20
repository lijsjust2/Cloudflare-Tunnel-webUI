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
	TunnelID string
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
	confDir := filepath.Join(dataDir, "conf")
	os.MkdirAll(confDir, 0755)
	credsDir := filepath.Join(dataDir, "credentials")
	os.MkdirAll(credsDir, 0755)

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

func (pm *ProcessManager) configPath(tunnelID string) string {
	return filepath.Join(pm.dataDir, "conf", tunnelID+".yml")
}

func (pm *ProcessManager) logPath(tunnelID string) string {
	return filepath.Join(pm.dataDir, "logs", tunnelID+".log")
}

func (pm *ProcessManager) Start(tunnelID string, tunnel *TunnelConfig) error {
	pm.mu.Lock()
	defer pm.mu.Unlock()

	if info, ok := pm.processes[tunnelID]; ok && info.Running {
		return fmt.Errorf("tunnel %s is already running", tunnelID)
	}

	cloudflaredPath := pm.cloudflaredPath()
	if _, err := os.Stat(cloudflaredPath); err != nil {
		return fmt.Errorf("cloudflared binary not found, please install cloudflared first")
	}

	if tunnel.TunnelToken != "" {
		return pm.startWithToken(tunnelID, tunnel.TunnelToken)
	}

	return pm.startWithConfig(tunnelID, tunnel)
}

func (pm *ProcessManager) startWithToken(tunnelID string, token string) error {
	logFile := pm.logPath(tunnelID)
	lf, err := os.OpenFile(logFile, os.O_CREATE|os.O_WRONLY|os.O_TRUNC|os.O_SYNC, 0644)
	if err != nil {
		return fmt.Errorf("failed to create log file: %v", err)
	}

	cloudflaredPath := pm.cloudflaredPath()
	cmd := exec.Command(cloudflaredPath, "tunnel", "--config", "-", "run", "--token", token)
	cmd.Stdout = lf
	cmd.Stderr = lf

	if err := cmd.Start(); err != nil {
		lf.Close()
		return fmt.Errorf("failed to start cloudflared: %v", err)
	}

	info := &ProcessInfo{
		TunnelID: tunnelID,
		Cmd:      cmd,
		LogFile:  logFile,
		Running:  true,
	}
	pm.processes[tunnelID] = info

	go func() {
		cmd.Wait()
		lf.Close()
		pm.mu.Lock()
		if p, ok := pm.processes[tunnelID]; ok && p.Cmd == cmd {
			p.Running = false
		}
		pm.mu.Unlock()
		log.Printf("cloudflared process for tunnel %s exited", tunnelID)
	}()

	log.Printf("cloudflared started for tunnel %s (PID: %d)", tunnelID, cmd.Process.Pid)
	return nil
}

func (pm *ProcessManager) startWithConfig(tunnelID string, tunnel *TunnelConfig) error {
	configMgr := NewConfigManager(pm.dataDir)
	configYAML := configMgr.GenerateConfigYAML(tunnel)

	confFile := pm.configPath(tunnelID)
	if err := os.WriteFile(confFile, []byte(configYAML), 0644); err != nil {
		return fmt.Errorf("failed to write config: %v", err)
	}

	logFile := pm.logPath(tunnelID)
	lf, err := os.OpenFile(logFile, os.O_CREATE|os.O_WRONLY|os.O_TRUNC|os.O_SYNC, 0644)
	if err != nil {
		return fmt.Errorf("failed to create log file: %v", err)
	}

	cloudflaredPath := pm.cloudflaredPath()
	args := []string{"tunnel", "--config", confFile, "run", tunnel.TunnelID}

	if tunnel.NoAutoUpdate {
		args = append([]string{"--no-autoupdate"}, args...)
	}

	cmd := exec.Command(cloudflaredPath, args...)
	cmd.Stdout = lf
	cmd.Stderr = lf

	if err := cmd.Start(); err != nil {
		lf.Close()
		return fmt.Errorf("failed to start cloudflared: %v", err)
	}

	info := &ProcessInfo{
		TunnelID: tunnelID,
		Cmd:      cmd,
		LogFile:  logFile,
		Running:  true,
	}
	pm.processes[tunnelID] = info

	go func() {
		cmd.Wait()
		lf.Close()
		pm.mu.Lock()
		if p, ok := pm.processes[tunnelID]; ok && p.Cmd == cmd {
			p.Running = false
		}
		pm.mu.Unlock()
		log.Printf("cloudflared process for tunnel %s exited", tunnelID)
	}()

	log.Printf("cloudflared started for tunnel %s (PID: %d)", tunnelID, cmd.Process.Pid)
	return nil
}

func (pm *ProcessManager) Stop(tunnelID string) error {
	pm.mu.Lock()
	defer pm.mu.Unlock()

	info, ok := pm.processes[tunnelID]
	if !ok || !info.Running {
		return fmt.Errorf("tunnel %s is not running", tunnelID)
	}

	if err := info.Cmd.Process.Kill(); err != nil {
		return fmt.Errorf("failed to stop cloudflared: %v", err)
	}

	info.Cmd.Wait()
	info.Running = false
	log.Printf("cloudflared stopped for tunnel %s", tunnelID)
	return nil
}

func (pm *ProcessManager) Restart(tunnelID string, tunnel *TunnelConfig) error {
	pm.mu.Lock()
	info, ok := pm.processes[tunnelID]
	if !ok || !info.Running {
		pm.mu.Unlock()
		return fmt.Errorf("tunnel %s is not running", tunnelID)
	}
	pm.mu.Unlock()

	if err := pm.Stop(tunnelID); err != nil {
		return err
	}

	time.Sleep(1 * time.Second)

	return pm.Start(tunnelID, tunnel)
}

func (pm *ProcessManager) Status(tunnelID string) (bool, int) {
	pm.mu.RLock()
	defer pm.mu.RUnlock()

	info, ok := pm.processes[tunnelID]
	if !ok {
		return false, 0
	}

	pid := 0
	if info.Cmd != nil && info.Cmd.Process != nil {
		pid = info.Cmd.Process.Pid
	}
	return info.Running, pid
}

func (pm *ProcessManager) GetLogs(tunnelID string, lines int) (string, error) {
	logFile := pm.logPath(tunnelID)
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

func (pm *ProcessManager) ClearLogs(tunnelID string) error {
	logFile := pm.logPath(tunnelID)
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
