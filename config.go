package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
)

type AccountConfig struct {
	AccountID string `json:"accountId"`
	ApiToken  string `json:"apiToken"`
}

type HostnameConfig struct {
	ID          string `json:"id"`
	Hostname    string `json:"hostname"`
	Service     string `json:"service"`
	Description string `json:"description,omitempty"`
	NoTLSVerify bool   `json:"noTlsVerify,omitempty"`
}

type TunnelConfig struct {
	ID           string           `json:"id"`
	Name         string           `json:"name"`
	TunnelID     string           `json:"tunnelId"`
	Token        string           `json:"token,omitempty"`
	ZoneID       string           `json:"zoneId,omitempty"`
	ZoneName     string           `json:"zoneName,omitempty"`
	Hostnames    []HostnameConfig `json:"hostnames"`
	AutoStart    bool             `json:"autoStart"`
	CreatedAt    string           `json:"createdAt,omitempty"`
	UpdatedAt    string           `json:"updatedAt,omitempty"`
}

type ActiveTunnelConfig struct {
	ActiveTunnelId string `json:"activeTunnelId"`
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

func (cm *ConfigManager) activeTunnelFilePath() string {
	return filepath.Join(cm.dataDir, "active_tunnel.json")
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
		if tunnels[i].ID == id || tunnels[i].TunnelID == id {
			return &tunnels[i], nil
		}
	}
	return nil, nil
}

func (cm *ConfigManager) GetTunnelByTunnelID(tunnelID string) (*TunnelConfig, error) {
	tunnels, err := cm.LoadTunnels()
	if err != nil {
		return nil, err
	}
	for i := range tunnels {
		if tunnels[i].TunnelID == tunnelID {
			return &tunnels[i], nil
		}
	}
	return nil, nil
}

func (cm *ConfigManager) UpsertTunnel(cfg TunnelConfig) error {
	tunnels, err := cm.LoadTunnels()
	if err != nil {
		return err
	}

	found := false
	for i := range tunnels {
		if tunnels[i].TunnelID == cfg.TunnelID {
			cfg.ID = tunnels[i].ID
			cfg.CreatedAt = tunnels[i].CreatedAt
			tunnels[i] = cfg
			found = true
			break
		}
	}

	if !found {
		if cfg.ID == "" {
			cfg.ID = generateID()
		}
		tunnels = append(tunnels, cfg)
	}

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
			cfg.TunnelID = tunnels[i].TunnelID
			cfg.Token = tunnels[i].Token
			cfg.CreatedAt = tunnels[i].CreatedAt
			tunnels[i] = cfg
			return cm.SaveTunnels(tunnels)
		}
	}
	return nil
}

func (cm *ConfigManager) DeleteTunnel(id string) error {
	tunnels, err := cm.LoadTunnels()
	if err != nil {
		return err
	}

	for i := range tunnels {
		if tunnels[i].ID == id || tunnels[i].TunnelID == id {
			tunnels = append(tunnels[:i], tunnels[i+1:]...)
			return cm.SaveTunnels(tunnels)
		}
	}
	return nil
}

func (cm *ConfigManager) UpdateTunnelToken(tunnelID, token string) error {
	tunnels, err := cm.LoadTunnels()
	if err != nil {
		return err
	}

	for i := range tunnels {
		if tunnels[i].TunnelID == tunnelID {
			tunnels[i].Token = token
			return cm.SaveTunnels(tunnels)
		}
	}
	return nil
}

func (cm *ConfigManager) UpdateTunnelHostnames(tunnelID string, hostnames []HostnameConfig) error {
	tunnels, err := cm.LoadTunnels()
	if err != nil {
		return err
	}

	for i := range tunnels {
		if tunnels[i].TunnelID == tunnelID {
			tunnels[i].Hostnames = hostnames
			return cm.SaveTunnels(tunnels)
		}
	}
	return nil
}

func (cm *ConfigManager) LoadActiveTunnel() (*ActiveTunnelConfig, error) {
	cm.mu.RLock()
	defer cm.mu.RUnlock()

	b, err := os.ReadFile(cm.activeTunnelFilePath())
	if err != nil {
		if os.IsNotExist(err) {
			return &ActiveTunnelConfig{}, nil
		}
		return nil, err
	}

	var config ActiveTunnelConfig
	if err := json.Unmarshal(b, &config); err != nil {
		return nil, err
	}
	return &config, nil
}

func (cm *ConfigManager) SaveActiveTunnel(activeTunnelId string) error {
	cm.mu.Lock()
	defer cm.mu.Unlock()

	config := ActiveTunnelConfig{ActiveTunnelId: activeTunnelId}
	b, err := json.MarshalIndent(config, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(cm.activeTunnelFilePath(), b, 0644)
}

func (cm *ConfigManager) GetActiveTunnel() string {
	config, _ := cm.LoadActiveTunnel()
	return config.ActiveTunnelId
}

func (cm *ConfigManager) SetActiveTunnel(id string) error {
	return cm.SaveActiveTunnel(id)
}
