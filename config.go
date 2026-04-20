package main

import (
	"crypto/rand"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"
)

type AccountConfig struct {
	AccountID string `json:"accountId"`
	ApiToken  string `json:"apiToken"`
}

type HostnameConfig struct {
	ID           string `json:"id"`
	Subdomain    string `json:"subdomain"`
	Domain       string `json:"domain"`
	ServiceType  string `json:"serviceType"`
	ServiceURL   string `json:"serviceUrl"`
	Path         string `json:"path,omitempty"`
	NoTLSVerify  bool   `json:"noTlsVerify,omitempty"`
}

type TunnelConfig struct {
	ID           string           `json:"id"`
	Name         string           `json:"name"`
	TunnelID     string           `json:"tunnelId"`
	TunnelToken  string           `json:"tunnelToken,omitempty"`
	Protocol     string           `json:"protocol"`
	LogLevel     string           `json:"logLevel"`
	NoAutoUpdate bool             `json:"noAutoUpdate"`
	AutoStart    *bool            `json:"autoStart"`
	Hostnames    []HostnameConfig `json:"hostnames"`
	CreatedAt    string           `json:"createdAt"`
	UpdatedAt    string           `json:"updatedAt"`
}

type ConfigManager struct {
	dataDir string
	mu      sync.RWMutex
}

func NewConfigManager(dataDir string) *ConfigManager {
	return &ConfigManager{dataDir: dataDir}
}

func (cm *ConfigManager) accountFilePath() string {
	return filepath.Join(cm.dataDir, "account.json")
}

func (cm *ConfigManager) tunnelsFilePath() string {
	return filepath.Join(cm.dataDir, "tunnels.json")
}

func (cm *ConfigManager) LoadAccount() (*AccountConfig, error) {
	cm.mu.RLock()
	defer cm.mu.RUnlock()

	b, err := os.ReadFile(cm.accountFilePath())
	if err != nil {
		if os.IsNotExist(err) {
			return &AccountConfig{}, nil
		}
		return nil, err
	}

	var account AccountConfig
	if err := json.Unmarshal(b, &account); err != nil {
		return nil, err
	}
	return &account, nil
}

func (cm *ConfigManager) SaveAccount(account *AccountConfig) error {
	cm.mu.Lock()
	defer cm.mu.Unlock()

	b, err := json.MarshalIndent(account, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(cm.accountFilePath(), b, 0644)
}

func (cm *ConfigManager) LoadTunnels() ([]TunnelConfig, error) {
	cm.mu.RLock()
	defer cm.mu.RUnlock()

	b, err := os.ReadFile(cm.tunnelsFilePath())
	if err != nil {
		if os.IsNotExist(err) {
			return []TunnelConfig{}, nil
		}
		return nil, err
	}

	var tunnels []TunnelConfig
	if err := json.Unmarshal(b, &tunnels); err != nil {
		return nil, err
	}
	return tunnels, nil
}

func (cm *ConfigManager) SaveTunnels(tunnels []TunnelConfig) error {
	cm.mu.Lock()
	defer cm.mu.Unlock()

	b, err := json.MarshalIndent(tunnels, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(cm.tunnelsFilePath(), b, 0644)
}

func (cm *ConfigManager) GetTunnel(id string) (*TunnelConfig, error) {
	tunnels, err := cm.LoadTunnels()
	if err != nil {
		return nil, err
	}
	for i := range tunnels {
		if tunnels[i].ID == id {
			return &tunnels[i], nil
		}
	}
	return nil, fmt.Errorf("tunnel not found: %s", id)
}

func (cm *ConfigManager) CreateTunnel(cfg TunnelConfig) error {
	tunnels, err := cm.LoadTunnels()
	if err != nil {
		return err
	}

	cfg.ID = generateID()
	cfg.CreatedAt = time.Now().Format(time.RFC3339)
	cfg.UpdatedAt = cfg.CreatedAt

	autoStart := true
	cfg.AutoStart = &autoStart

	if cfg.Protocol == "" {
		cfg.Protocol = "auto"
	}
	if cfg.LogLevel == "" {
		cfg.LogLevel = "info"
	}

	if cfg.Hostnames == nil {
		cfg.Hostnames = []HostnameConfig{}
	}

	tunnels = append(tunnels, cfg)
	return cm.SaveTunnels(tunnels)
}

func (cm *ConfigManager) UpdateTunnel(id string, cfg TunnelConfig) error {
	tunnels, err := cm.LoadTunnels()
	if err != nil {
		return err
	}

	for i := range tunnels {
		if tunnels[i].ID == id {
			cfg.ID = id
			cfg.CreatedAt = tunnels[i].CreatedAt
			cfg.UpdatedAt = time.Now().Format(time.RFC3339)
			cfg.Hostnames = tunnels[i].Hostnames
			tunnels[i] = cfg
			return cm.SaveTunnels(tunnels)
		}
	}
	return fmt.Errorf("tunnel not found: %s", id)
}

func (cm *ConfigManager) DeleteTunnel(id string) error {
	tunnels, err := cm.LoadTunnels()
	if err != nil {
		return err
	}

	for i := range tunnels {
		if tunnels[i].ID == id {
			tunnels = append(tunnels[:i], tunnels[i+1:]...)
			return cm.SaveTunnels(tunnels)
		}
	}
	return fmt.Errorf("tunnel not found: %s", id)
}

func (cm *ConfigManager) AddHostname(tunnelID string, hostname HostnameConfig) error {
	tunnels, err := cm.LoadTunnels()
	if err != nil {
		return err
	}

	for i := range tunnels {
		if tunnels[i].ID == tunnelID {
			hostname.ID = generateID()
			tunnels[i].Hostnames = append(tunnels[i].Hostnames, hostname)
			tunnels[i].UpdatedAt = time.Now().Format(time.RFC3339)
			return cm.SaveTunnels(tunnels)
		}
	}
	return fmt.Errorf("tunnel not found: %s", tunnelID)
}

func (cm *ConfigManager) UpdateHostname(tunnelID, hostnameID string, hostname HostnameConfig) error {
	tunnels, err := cm.LoadTunnels()
	if err != nil {
		return err
	}

	for i := range tunnels {
		if tunnels[i].ID == tunnelID {
			for j := range tunnels[i].Hostnames {
				if tunnels[i].Hostnames[j].ID == hostnameID {
					hostname.ID = hostnameID
					tunnels[i].Hostnames[j] = hostname
					tunnels[i].UpdatedAt = time.Now().Format(time.RFC3339)
					return cm.SaveTunnels(tunnels)
				}
			}
			return fmt.Errorf("hostname not found: %s", hostnameID)
		}
	}
	return fmt.Errorf("tunnel not found: %s", tunnelID)
}

func (cm *ConfigManager) DeleteHostname(tunnelID, hostnameID string) error {
	tunnels, err := cm.LoadTunnels()
	if err != nil {
		return err
	}

	for i := range tunnels {
		if tunnels[i].ID == tunnelID {
			for j := range tunnels[i].Hostnames {
				if tunnels[i].Hostnames[j].ID == hostnameID {
					tunnels[i].Hostnames[j] = tunnels[i].Hostnames[len(tunnels[i].Hostnames)-1]
					tunnels[i].Hostnames = tunnels[i].Hostnames[:len(tunnels[i].Hostnames)-1]
					tunnels[i].UpdatedAt = time.Now().Format(time.RFC3339)
					return cm.SaveTunnels(tunnels)
				}
			}
			return fmt.Errorf("hostname not found: %s", hostnameID)
		}
	}
	return fmt.Errorf("tunnel not found: %s", tunnelID)
}

func (cm *ConfigManager) GenerateConfigYAML(tunnel *TunnelConfig) string {
	yaml := fmt.Sprintf("tunnel: %s\n", tunnel.TunnelID)
	yaml += fmt.Sprintf("credentials-file: /app/data/credentials/%s.json\n", tunnel.TunnelID)
	yaml += "\n"

	if tunnel.Protocol != "" && tunnel.Protocol != "auto" {
		yaml += fmt.Sprintf("protocol: %s\n", tunnel.Protocol)
	}

	yaml += "ingress:\n"
	for _, h := range tunnel.Hostnames {
		hostname := h.Subdomain
		if hostname != "" {
			hostname += "."
		}
		hostname += h.Domain

		yaml += fmt.Sprintf("  - hostname: %s\n", hostname)
		yaml += fmt.Sprintf("    service: %s://%s\n", h.ServiceType, h.ServiceURL)
		if h.NoTLSVerify {
			yaml += "    originRequest:\n"
			yaml += "      noTLSVerify: true\n"
		}
	}

	yaml += "  - service: http_status:404\n"

	return yaml
}

func generateID() string {
	b := make([]byte, 8)
	rand.Read(b)
	return fmt.Sprintf("%x", b)
}
