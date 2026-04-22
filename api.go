package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"time"
)

type CloudflareAPI struct {
	accountID string
	apiToken  string
	client    *http.Client
}

func NewCloudflareAPI(accountID, apiToken string) *CloudflareAPI {
	return &CloudflareAPI{
		accountID: accountID,
		apiToken:  apiToken,
		client: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

type APIResponse struct {
	Success  bool            `json:"success"`
	Errors   []APIError      `json:"errors"`
	Messages json.RawMessage `json:"messages"`
	Result   json.RawMessage `json:"result"`
}

type APIError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

type Zone struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type Tunnel struct {
	ID            string          `json:"id"`
	Name          string          `json:"name"`
	Status        string          `json:"status"`
	CreatedAt     string          `json:"created_at"`
	DeletedAt     *string         `json:"deleted_at"`
	Connections   []TunnelConn    `json:"connections"`
	ConnsActiveAt *string         `json:"conns_active_at"`
	TunType       string          `json:"tun_type"`
	RemoteConfig  bool            `json:"remote_config"`
	Token         string          `json:"token,omitempty"`
}

type TunnelConn struct {
	ColoName         string `json:"colo_name"`
	UUID             string `json:"uuid"`
	ID               string `json:"id"`
	IsPendingReconnect bool  `json:"is_pending_reconnect"`
	OriginIP         string `json:"origin_ip"`
	OpenedAt         string `json:"opened_at"`
	ClientID         string `json:"client_id"`
	ClientVersion    string `json:"client_version"`
}

type TunnelCredentials struct {
	AccountTag  string `json:"AccountTag"`
	TunnelID    string `json:"TunnelID"`
	TunnelName  string `json:"TunnelName"`
	TunnelSecret string `json:"TunnelSecret"`
}

type CreateTunnelRequest struct {
	Name       string `json:"name"`
	ConfigSrc  string `json:"config_src"`
}

type CreateTunnelResponse struct {
	ID             string            `json:"id"`
	Name           string            `json:"name"`
	Status         string            `json:"status"`
	CreatedAt      string            `json:"created_at"`
	Token          string            `json:"token"`
	CredentialsFile TunnelCredentials `json:"credentials_file"`
}

type IngressRule struct {
	Hostname      string                 `json:"hostname,omitempty"`
	Service       string                 `json:"service"`
	OriginRequest map[string]interface{} `json:"originRequest,omitempty"`
}

type TunnelIngressConfig struct {
	Ingress []IngressRule `json:"ingress"`
}

type UpdateConfigRequest struct {
	Config TunnelIngressConfig `json:"config"`
}

type DNSRecord struct {
	ID      string `json:"id,omitempty"`
	Type    string `json:"type"`
	Name    string `json:"name"`
	Content string `json:"content"`
	Proxied bool   `json:"proxied"`
	TTL     int    `json:"ttl"`
}

func (api *CloudflareAPI) request(method, path string, body interface{}) (*APIResponse, error) {
	var reqBody io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return nil, fmt.Errorf("failed to marshal request body: %v", err)
		}
		reqBody = bytes.NewReader(b)
	}

	url := fmt.Sprintf("https://api.cloudflare.com/client/v4%s", path)
	req, err := http.NewRequest(method, url, reqBody)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %v", err)
	}

	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", api.apiToken))
	req.Header.Set("Content-Type", "application/json")

	resp, err := api.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request failed: %v", err)
	}
	defer resp.Body.Close()

	var apiResp APIResponse
	if err := json.NewDecoder(resp.Body).Decode(&apiResp); err != nil {
		return nil, fmt.Errorf("failed to decode response: %v", err)
	}

	if !apiResp.Success {
		if len(apiResp.Errors) > 0 {
			return nil, fmt.Errorf("API error: %s", apiResp.Errors[0].Message)
		}
		return nil, fmt.Errorf("API request failed")
	}

	return &apiResp, nil
}

func (api *CloudflareAPI) VerifyToken() (bool, error) {
	resp, err := api.request("GET", "/user/tokens/verify", nil)
	if err != nil {
		return false, err
	}
	return resp.Success, nil
}

func (api *CloudflareAPI) ListZones() ([]Zone, error) {
	resp, err := api.request("GET", "/zones?per_page=100", nil)
	if err != nil {
		return nil, err
	}

	var zones []Zone
	if err := json.Unmarshal(resp.Result, &zones); err != nil {
		return nil, fmt.Errorf("failed to parse zones: %v", err)
	}
	return zones, nil
}

func (api *CloudflareAPI) ListTunnels() ([]Tunnel, error) {
	path := fmt.Sprintf("/accounts/%s/cfd_tunnel?per_page=100", api.accountID)
	resp, err := api.request("GET", path, nil)
	if err != nil {
		return nil, err
	}

	var tunnels []Tunnel
	if err := json.Unmarshal(resp.Result, &tunnels); err != nil {
		return nil, fmt.Errorf("failed to parse tunnels: %v", err)
	}
	return tunnels, nil
}

func (api *CloudflareAPI) GetTunnel(tunnelID string) (*Tunnel, error) {
	path := fmt.Sprintf("/accounts/%s/cfd_tunnel/%s", api.accountID, tunnelID)
	resp, err := api.request("GET", path, nil)
	if err != nil {
		return nil, err
	}

	var tunnel Tunnel
	if err := json.Unmarshal(resp.Result, &tunnel); err != nil {
		return nil, fmt.Errorf("failed to parse tunnel: %v", err)
	}
	return &tunnel, nil
}

func (api *CloudflareAPI) CreateTunnel(name string) (*CreateTunnelResponse, error) {
	path := fmt.Sprintf("/accounts/%s/cfd_tunnel", api.accountID)
	req := CreateTunnelRequest{
		Name:      name,
		ConfigSrc: "cloudflare",
	}
	resp, err := api.request("POST", path, req)
	if err != nil {
		return nil, err
	}

	var result CreateTunnelResponse
	if err := json.Unmarshal(resp.Result, &result); err != nil {
		return nil, fmt.Errorf("failed to parse tunnel response: %v", err)
	}
	return &result, nil
}

func (api *CloudflareAPI) CleanupTunnelConnections(tunnelID string) error {
	path := fmt.Sprintf("/accounts/%s/cfd_tunnel/%s/connections", api.accountID, tunnelID)
	_, err := api.request("DELETE", path, nil)
	return err
}

func (api *CloudflareAPI) DeleteTunnel(tunnelID string) error {
	path := fmt.Sprintf("/accounts/%s/cfd_tunnel/%s", api.accountID, tunnelID)
	_, err := api.request("DELETE", path, nil)
	return err
}

func (api *CloudflareAPI) GetTunnelToken(tunnelID string) (string, error) {
	path := fmt.Sprintf("/accounts/%s/cfd_tunnel/%s/token", api.accountID, tunnelID)
	resp, err := api.request("GET", path, nil)
	if err != nil {
		return "", err
	}

	var token string
	if err := json.Unmarshal(resp.Result, &token); err != nil {
		return "", fmt.Errorf("failed to parse token: %v", err)
	}
	return token, nil
}

func (api *CloudflareAPI) GetTunnelConfig(tunnelID string) (*TunnelIngressConfig, error) {
	path := fmt.Sprintf("/accounts/%s/cfd_tunnel/%s/configurations", api.accountID, tunnelID)
	resp, err := api.request("GET", path, nil)
	if err != nil {
		return nil, err
	}

	var wrapper struct {
		Config TunnelIngressConfig `json:"config"`
	}
	if err := json.Unmarshal(resp.Result, &wrapper); err != nil {
		return nil, fmt.Errorf("failed to parse tunnel config: %v", err)
	}
	return &wrapper.Config, nil
}

func (api *CloudflareAPI) UpdateTunnelConfig(tunnelID string, config *TunnelIngressConfig) error {
	path := fmt.Sprintf("/accounts/%s/cfd_tunnel/%s/configurations", api.accountID, tunnelID)
	req := UpdateConfigRequest{Config: *config}
	_, err := api.request("PUT", path, req)
	return err
}

func (api *CloudflareAPI) CreateDNSRecord(zoneID string, record *DNSRecord) (*DNSRecord, error) {
	path := fmt.Sprintf("/zones/%s/dns_records", zoneID)
	record.TTL = 1
	resp, err := api.request("POST", path, record)
	if err != nil {
		return nil, err
	}

	var result DNSRecord
	if err := json.Unmarshal(resp.Result, &result); err != nil {
		return nil, fmt.Errorf("failed to parse DNS record: %v", err)
	}
	return &result, nil
}

func (api *CloudflareAPI) ListDNSRecords(zoneID string) ([]DNSRecord, error) {
	path := fmt.Sprintf("/zones/%s/dns_records?per_page=100", zoneID)
	resp, err := api.request("GET", path, nil)
	if err != nil {
		return nil, err
	}

	var records []DNSRecord
	if err := json.Unmarshal(resp.Result, &records); err != nil {
		return nil, fmt.Errorf("failed to parse DNS records: %v", err)
	}
	return records, nil
}

func (api *CloudflareAPI) DeleteDNSRecord(zoneID, recordID string) error {
	path := fmt.Sprintf("/zones/%s/dns_records/%s", zoneID, recordID)
	_, err := api.request("DELETE", path, nil)
	return err
}

func (api *CloudflareAPI) FindDNSRecordByName(zoneID, name string) (*DNSRecord, error) {
	records, err := api.ListDNSRecords(zoneID)
	if err != nil {
		return nil, err
	}
	for i := range records {
		if records[i].Name == name {
			return &records[i], nil
		}
	}
	return nil, nil
}

type Connector struct {
	ID                 string `json:"id"`
	Hostname           string `json:"hostname"`
	ClientID           string `json:"client_id"`
	ClientVersion      string `json:"client_version"`
	ColoName           string `json:"colo_name"`
	OriginIP           string `json:"origin_ip"`
	Platform           string `json:"platform"`
	OpenedAt           string `json:"opened_at"`
	IsPendingReconnect bool   `json:"is_pending_reconnect"`
}

func (api *CloudflareAPI) GetTunnelConnectors(tunnelID string) ([]Connector, error) {
	path := fmt.Sprintf("/accounts/%s/cfd_tunnel/%s/connections", api.accountID, tunnelID)
	resp, err := api.request("GET", path, nil)
	if err != nil {
		return nil, err
	}

	var rawConnectors []map[string]interface{}
	if err := json.Unmarshal(resp.Result, &rawConnectors); err != nil {
		return nil, fmt.Errorf("failed to parse connectors: %v", err)
	}

	// 按机器级别返回，每个 connector 一行
	connectors := make([]Connector, 0, len(rawConnectors))
	for _, raw := range rawConnectors {
		connectorID := getString(raw, "id")
		
		// 从 conns 数组获取第一个连接的信息
		var coloName, originIP, clientVersion, openedAt, clientID string
		var isPendingReconnect bool
		
		if conns, ok := raw["conns"].([]interface{}); ok && len(conns) > 0 {
			if firstConn, ok := conns[0].(map[string]interface{}); ok {
				coloName = getString(firstConn, "colo_name")
				originIP = getString(firstConn, "origin_ip")
				clientVersion = getString(firstConn, "client_version")
				openedAt = getString(firstConn, "opened_at")
				clientID = getString(firstConn, "client_id")
				isPendingReconnect = getBool(firstConn, "is_pending_reconnect")
			}
		}
		
		// 获取 hostname（使用反向 DNS 解析）
		hostname := api.getConnectorHostname(connectorID, originIP)
		
		connectors = append(connectors, Connector{
			ID:                 connectorID,
			Hostname:           hostname,
			ClientID:           clientID,
			ClientVersion:      clientVersion,
			ColoName:           coloName,
			OriginIP:           originIP,
			Platform:           getString(raw, "arch"), // platform 在顶层的 arch 字段
			OpenedAt:           openedAt,
			IsPendingReconnect: isPendingReconnect,
		})
	}
	
	return connectors, nil
}

// getConnectorHostname 使用多种方法获取 connector 的 hostname
func (api *CloudflareAPI) getConnectorHostname(connectorID string, originIP string) string {
	// 方法 1：尝试使用 REST API /connectors/{id} 获取详细信息
	path := fmt.Sprintf("/accounts/%s/cfd_tunnel/connectors/%s", api.accountID, connectorID)
	resp, err := api.request("GET", path, nil)
	if err == nil {
		var result map[string]interface{}
		if err := json.Unmarshal(resp.Result, &result); err == nil {
			if hostname, ok := result["hostname"].(string); ok && hostname != "" {
				return hostname
			}
		}
	}
	
	// 方法 2：尝试反向 DNS 解析
	if originIP != "" {
		names, err := net.LookupAddr(originIP)
		if err == nil && len(names) > 0 {
			// 返回第一个名称（去掉末尾的点）
			hostname := names[0]
			if hostname[len(hostname)-1] == '.' {
				hostname = hostname[:len(hostname)-1]
			}
			return hostname
		}
	}
	
	// 如果都失败，使用 connector ID 作为回退
	return connectorID
}

func getString(m map[string]interface{}, key string) string {
	if v, ok := m[key]; ok {
		if s, ok := v.(string); ok {
			return s
		}
	}
	return ""
}

func getBool(m map[string]interface{}, key string) bool {
	if v, ok := m[key]; ok {
		if b, ok := v.(bool); ok {
			return b
		}
	}
	return false
}
