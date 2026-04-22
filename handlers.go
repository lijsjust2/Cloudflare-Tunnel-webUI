package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"runtime"
	"time"
)

type Handler struct {
	config  *ConfigManager
	process *ProcessManager
	version *VersionManager
	auth    *AuthManager
}

func NewHandler(config *ConfigManager, process *ProcessManager, version *VersionManager, auth *AuthManager) *Handler {
	return &Handler{config: config, process: process, version: version, auth: auth}
}

func jsonResponse(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func jsonError(w http.ResponseWriter, status int, msg string) {
	jsonResponse(w, status, map[string]string{"error": msg})
}

func (h *Handler) getAPI(r *http.Request) (*CloudflareAPI, error) {
	account, err := h.config.LoadAccount()
	if err != nil {
		return nil, err
	}
	if account.AccountID == "" || account.ApiToken == "" {
		return nil, nil
	}
	return NewCloudflareAPI(account.AccountID, account.ApiToken), nil
}

func (h *Handler) AuthStatus(w http.ResponseWriter, r *http.Request) {
	account, _ := h.config.LoadAccount()
	
	cookie, err := r.Cookie("auth_token")
	isLoggedIn := err == nil && cookie != nil && h.auth.ValidateSession(cookie.Value)
	
	jsonResponse(w, 200, map[string]interface{}{
		"needSetup":           !h.auth.IsSetup(),
		"isLoggedIn":          isLoggedIn,
		"cloudflaredInstalled": h.version.IsInstalled(),
		"hasAccount":          account != nil && account.AccountID != "" && account.ApiToken != "",
	})
}

func (h *Handler) AuthSetup(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Password == "" {
		jsonError(w, 400, "password is required")
		return
	}

	if err := h.auth.Setup(body.Password); err != nil {
		jsonError(w, 400, err.Error())
		return
	}

	token := h.auth.CreateSession()
	http.SetCookie(w, &http.Cookie{
		Name:     "auth_token",
		Value:    token,
		Path:     "/",
		MaxAge:   86400,
		HttpOnly: true,
	})
	jsonResponse(w, 200, map[string]string{"token": token})
}

func (h *Handler) AuthLogin(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Password == "" {
		jsonError(w, 400, "password is required")
		return
	}

	if !h.auth.Verify(body.Password) {
		jsonError(w, 401, "incorrect password")
		return
	}

	token := h.auth.CreateSession()
	http.SetCookie(w, &http.Cookie{
		Name:     "auth_token",
		Value:    token,
		Path:     "/",
		MaxAge:   86400,
		HttpOnly: true,
	})
	jsonResponse(w, 200, map[string]string{"token": token})
}

func (h *Handler) AuthChangePassword(w http.ResponseWriter, r *http.Request) {
	var body struct {
		OldPassword string `json:"oldPassword"`
		NewPassword string `json:"newPassword"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		jsonError(w, 400, "invalid request body")
		return
	}
	if body.OldPassword == "" || body.NewPassword == "" {
		jsonError(w, 400, "old and new password are required")
		return
	}
	if len(body.NewPassword) < 6 {
		jsonError(w, 400, "new password must be at least 6 characters")
		return
	}

	if err := h.auth.ChangePassword(body.OldPassword, body.NewPassword); err != nil {
		jsonError(w, 400, err.Error())
		return
	}

	jsonResponse(w, 200, map[string]string{"status": "password changed"})
}

func (h *Handler) GetAccount(w http.ResponseWriter, r *http.Request) {
	account, err := h.config.LoadAccount()
	if err != nil {
		jsonError(w, 500, err.Error())
		return
	}
	jsonResponse(w, 200, account)
}

func (h *Handler) SaveAccount(w http.ResponseWriter, r *http.Request) {
	var account AccountConfig
	if err := json.NewDecoder(r.Body).Decode(&account); err != nil {
		jsonError(w, 400, "invalid request body")
		return
	}

	if account.AccountID == "" || account.ApiToken == "" {
		jsonError(w, 400, "accountId and apiToken are required")
		return
	}

	if err := h.config.SaveAccount(&account); err != nil {
		jsonError(w, 500, err.Error())
		return
	}

	jsonResponse(w, 200, map[string]string{"status": "saved"})
}

func (h *Handler) VerifyAccount(w http.ResponseWriter, r *http.Request) {
	api, err := h.getAPI(r)
	if err != nil {
		jsonError(w, 500, err.Error())
		return
	}
	if api == nil {
		jsonError(w, 400, "account not configured")
		return
	}

	valid, err := api.VerifyToken()
	if err != nil {
		jsonResponse(w, 200, map[string]interface{}{"valid": false, "error": err.Error()})
		return
	}
	jsonResponse(w, 200, map[string]bool{"valid": valid})
}

func (h *Handler) ListZones(w http.ResponseWriter, r *http.Request) {
	api, err := h.getAPI(r)
	if err != nil {
		jsonError(w, 500, err.Error())
		return
	}
	if api == nil {
		jsonError(w, 400, "account not configured")
		return
	}

	zones, err := api.ListZones()
	if err != nil {
		jsonError(w, 500, err.Error())
		return
	}
	jsonResponse(w, 200, zones)
}

func (h *Handler) ListTunnels(w http.ResponseWriter, r *http.Request) {
	api, err := h.getAPI(r)
	if err != nil {
		jsonError(w, 500, err.Error())
		return
	}

	localTunnels, err := h.config.LoadTunnels()
	if err != nil {
		jsonError(w, 500, err.Error())
		return
	}

	if api == nil {
		result := make([]map[string]interface{}, len(localTunnels))
		for i, t := range localTunnels {
			running, pid := h.process.Status(t.ID)
			result[i] = map[string]interface{}{
				"id":        t.ID,
				"name":      t.Name,
				"tunnelId":  t.TunnelID,
				"zoneId":    t.ZoneID,
				"zoneName":  t.ZoneName,
				"autoStart": t.AutoStart,
				"running":   running,
				"pid":       pid,
				"hostnames": t.Hostnames,
			}
		}
		jsonResponse(w, 200, result)
		return
	}

	remoteTunnels, err := api.ListTunnels()
	if err != nil {
		jsonError(w, 500, err.Error())
		return
	}

	result := make([]map[string]interface{}, len(remoteTunnels))
	for i, t := range remoteTunnels {
		localTunnel, _ := h.config.GetTunnelByTunnelID(t.ID)
		running := false
		pid := 0
		autoStart := false
		var hostnames []HostnameConfig
		tunnelId := t.ID
		if localTunnel != nil {
			tunnelId = localTunnel.ID
			running, pid = h.process.Status(localTunnel.ID)
			autoStart = localTunnel.AutoStart
			hostnames = localTunnel.Hostnames
		} else {
			remoteConfig, _ := api.GetTunnelConfig(t.ID)
			if remoteConfig != nil {
				for _, rule := range remoteConfig.Ingress {
					if rule.Hostname != "" {
						hostnames = append(hostnames, HostnameConfig{
							ID:       generateID(),
							Hostname: rule.Hostname,
							Service:  rule.Service,
						})
					}
				}
			}
		}
		result[i] = map[string]interface{}{
			"id":          tunnelId,
			"name":        t.Name,
			"tunnelId":    t.ID,
			"status":      t.Status,
			"createdAt":   t.CreatedAt,
			"connections": len(t.Connections),
			"running":     running,
			"pid":         pid,
			"autoStart":   autoStart,
			"hostnames":   hostnames,
		}
	}
	jsonResponse(w, 200, result)
}

func (h *Handler) CreateTunnel(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name     string `json:"name"`
		ZoneID   string `json:"zoneId"`
		ZoneName string `json:"zoneName"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		jsonError(w, 400, "invalid request body")
		return
	}

	if body.Name == "" {
		jsonError(w, 400, "name is required")
		return
	}

	api, err := h.getAPI(r)
	if err != nil {
		jsonError(w, 500, err.Error())
		return
	}
	if api == nil {
		jsonError(w, 400, "account not configured")
		return
	}

	result, err := api.CreateTunnel(body.Name)
	if err != nil {
		jsonError(w, 500, err.Error())
		return
	}

	tunnel := TunnelConfig{
		ID:        generateID(),
		Name:      result.Name,
		TunnelID:  result.ID,
		Token:     result.Token,
		ZoneID:    body.ZoneID,
		ZoneName:  body.ZoneName,
		AutoStart: true,
		Hostnames: []HostnameConfig{},
		CreatedAt: time.Now().Format(time.RFC3339),
	}

	if err := h.config.UpsertTunnel(tunnel); err != nil {
		jsonError(w, 500, err.Error())
		return
	}

	jsonResponse(w, 201, map[string]interface{}{
		"id":        tunnel.ID,
		"tunnelId":  result.ID,
		"name":      result.Name,
		"token":     result.Token,
		"createdAt": tunnel.CreatedAt,
	})
}

func (h *Handler) DeleteTunnel(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")

	h.process.Stop(id)

	tunnel, _ := h.config.GetTunnel(id)
	if tunnel == nil {
		tunnel, _ = h.config.GetTunnelByTunnelID(id)
	}

	api, err := h.getAPI(r)
	if err != nil {
		jsonError(w, 500, err.Error())
		return
	}
	
	if tunnel != nil && tunnel.TunnelID != "" {
		if api != nil {
			if err := api.CleanupTunnelConnections(tunnel.TunnelID); err != nil {
				log.Printf("Warning: failed to cleanup tunnel connections: %v", err)
			}
			if err := api.DeleteTunnel(tunnel.TunnelID); err != nil {
				jsonError(w, 500, "Cloudflare 删除失败: "+err.Error())
				return
			}
		}
		h.config.DeleteTunnel(tunnel.ID)
	} else {
		if api == nil {
			jsonError(w, 400, "account not configured")
			return
		}

		if err := api.CleanupTunnelConnections(id); err != nil {
			log.Printf("Warning: failed to cleanup tunnel connections: %v", err)
		}
		if err := api.DeleteTunnel(id); err != nil {
			jsonError(w, 500, "Cloudflare 删除失败: "+err.Error())
			return
		}
	}

	jsonResponse(w, 200, map[string]string{"status": "deleted"})
}

func (h *Handler) GetTunnel(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")

	tunnel, _ := h.config.GetTunnel(id)
	if tunnel == nil {
		tunnel, _ = h.config.GetTunnelByTunnelID(id)
	}

	api, _ := h.getAPI(r)
	
	if tunnel == nil && api != nil {
		remoteTunnel, err := api.GetTunnel(id)
		if err != nil {
			jsonError(w, 404, "tunnel not found")
			return
		}
		if remoteTunnel != nil {
			remoteConfig, _ := api.GetTunnelConfig(remoteTunnel.ID)
			var hostnames []HostnameConfig
			if remoteConfig != nil {
				for _, rule := range remoteConfig.Ingress {
					if rule.Hostname != "" {
						hostnames = append(hostnames, HostnameConfig{
							ID:       generateID(),
							Hostname: rule.Hostname,
							Service:  rule.Service,
						})
					}
				}
			}
			result := map[string]interface{}{
				"id":          remoteTunnel.ID,
				"name":        remoteTunnel.Name,
				"tunnelId":    remoteTunnel.ID,
				"status":      remoteTunnel.Status,
				"connections": remoteTunnel.Connections,
				"createdAt":   remoteTunnel.CreatedAt,
				"running":     false,
				"hostnames":   hostnames,
			}
			jsonResponse(w, 200, result)
			return
		}
	}

	if tunnel == nil {
		jsonError(w, 404, "tunnel not found")
		return
	}

	var remoteTunnel *Tunnel
	if api != nil && tunnel.TunnelID != "" {
		remoteTunnel, _ = api.GetTunnel(tunnel.TunnelID)
	}

	running, pid := h.process.Status(tunnel.ID)

	result := map[string]interface{}{
		"id":        tunnel.ID,
		"name":      tunnel.Name,
		"tunnelId":  tunnel.TunnelID,
		"token":     tunnel.Token,
		"zoneId":    tunnel.ZoneID,
		"zoneName":  tunnel.ZoneName,
		"autoStart": tunnel.AutoStart,
		"hostnames": tunnel.Hostnames,
		"running":   running,
		"pid":       pid,
	}

	if remoteTunnel != nil {
		result["status"] = remoteTunnel.Status
		result["connections"] = remoteTunnel.Connections
		result["createdAt"] = remoteTunnel.CreatedAt
	}

	jsonResponse(w, 200, result)
}

func (h *Handler) GetTunnelConnectors(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")

	tunnel, _ := h.config.GetTunnel(id)
	if tunnel == nil {
		tunnel, _ = h.config.GetTunnelByTunnelID(id)
	}

	api, err := h.getAPI(r)
	if err != nil {
		jsonError(w, 500, err.Error())
		return
	}
	
	tunnelID := id
	if tunnel != nil && tunnel.TunnelID != "" {
		tunnelID = tunnel.TunnelID
	}

	connectors, err := api.GetTunnelConnectors(tunnelID)
	if err != nil {
		jsonError(w, 500, err.Error())
		return
	}

	result := make([]map[string]interface{}, len(connectors))
	for i, c := range connectors {
		result[i] = map[string]interface{}{
			"id":                 c.ID,
			"hostname":           c.Hostname,
			"clientID":           c.ClientID,
			"version":            c.ClientVersion,
			"coloName":           c.ColoName,
			"originIP":           c.OriginIP,
			"platform":           c.Platform,
			"openedAt":           c.OpenedAt,
			"isPending":          c.IsPendingReconnect,
		}
	}

	jsonResponse(w, 200, map[string]interface{}{
		"connectors": result,
	})
}

func (h *Handler) UpdateTunnel(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	var cfg TunnelConfig
	if err := json.NewDecoder(r.Body).Decode(&cfg); err != nil {
		jsonError(w, 400, "invalid request body")
		return
	}

	if err := h.config.UpdateTunnel(id, cfg); err != nil {
		jsonError(w, 500, err.Error())
		return
	}

	jsonResponse(w, 200, map[string]string{"status": "updated"})
}

func (h *Handler) UpdateHostnames(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")

	tunnel, _ := h.config.GetTunnel(id)
	if tunnel == nil {
		tunnel, _ = h.config.GetTunnelByTunnelID(id)
	}
	
	if tunnel == nil {
		api, err := h.getAPI(r)
		if err != nil {
			jsonError(w, 500, err.Error())
			return
		}
		if api == nil {
			jsonError(w, 400, "account not configured")
			return
		}
		
		remoteTunnel, err := api.GetTunnel(id)
		if err != nil {
			jsonError(w, 500, err.Error())
			return
		}
		if remoteTunnel == nil {
			jsonError(w, 404, "tunnel not found")
			return
		}
		
		token, err := api.GetTunnelToken(id)
		if err != nil {
			jsonError(w, 500, "failed to get token: "+err.Error())
			return
		}
		
		newTunnel := TunnelConfig{
			ID:       generateID(),
			Name:     remoteTunnel.Name,
			TunnelID: remoteTunnel.ID,
			Token:    token,
			AutoStart: false,
		}
		h.config.UpsertTunnel(newTunnel)
		tunnel = &newTunnel
	}

	var body struct {
		Hostnames []HostnameConfig `json:"hostnames"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		jsonError(w, 400, "invalid request body")
		return
	}

	api, err := h.getAPI(r)
	if err != nil {
		jsonError(w, 500, err.Error())
		return
	}
	if api == nil {
		jsonError(w, 400, "account not configured")
		return
	}

	ingress := make([]IngressRule, 0, len(body.Hostnames)+1)
	for _, h := range body.Hostnames {
		rule := IngressRule{
			Hostname: h.Hostname,
			Service:  h.Service,
		}
		if h.NoTLSVerify {
			rule.OriginRequest = map[string]interface{}{"noTLSVerify": true}
		}
		ingress = append(ingress, rule)
	}
	ingress = append(ingress, IngressRule{Service: "http_status:404"})

	config := &TunnelIngressConfig{Ingress: ingress}
	if err := api.UpdateTunnelConfig(tunnel.TunnelID, config); err != nil {
		jsonError(w, 500, err.Error())
		return
	}

	if err := h.config.UpdateTunnelHostnames(tunnel.TunnelID, body.Hostnames); err != nil {
		jsonError(w, 500, err.Error())
		return
	}

	jsonResponse(w, 200, map[string]string{"status": "updated"})
}

func (h *Handler) StartTunnel(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	
	tunnel, _ := h.config.GetTunnel(id)
	if tunnel == nil {
		tunnel, _ = h.config.GetTunnelByTunnelID(id)
	}
	
	if tunnel == nil {
		api, err := h.getAPI(r)
		if err != nil {
			jsonError(w, 500, err.Error())
			return
		}
		if api == nil {
			jsonError(w, 400, "account not configured")
			return
		}
		
		remoteTunnel, err := api.GetTunnel(id)
		if err != nil {
			jsonError(w, 500, err.Error())
			return
		}
		if remoteTunnel == nil {
			jsonError(w, 404, "tunnel not found")
			return
		}
		
		token, err := api.GetTunnelToken(id)
		if err != nil {
			jsonError(w, 500, "failed to get token: "+err.Error())
			return
		}
		
		newTunnel := TunnelConfig{
			ID:       generateID(),
			Name:     remoteTunnel.Name,
			TunnelID: remoteTunnel.ID,
			Token:    token,
			AutoStart: false,
		}
		h.config.UpsertTunnel(newTunnel)
		tunnel = &newTunnel
	}

	if tunnel.Token == "" {
		api, err := h.getAPI(r)
		if err != nil {
			jsonError(w, 500, err.Error())
			return
		}
		if api == nil {
			jsonError(w, 400, "account not configured")
			return
		}

		token, err := api.GetTunnelToken(tunnel.TunnelID)
		if err != nil {
			jsonError(w, 500, err.Error())
			return
		}
		tunnel.Token = token
		h.config.UpdateTunnelToken(tunnel.TunnelID, token)
	}

	if err := h.process.Start(tunnel.ID, tunnel); err != nil {
		jsonError(w, 500, err.Error())
		return
	}

	jsonResponse(w, 200, map[string]string{"status": "started", "localId": tunnel.ID})
}

func (h *Handler) StopTunnel(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	
	tunnel, _ := h.config.GetTunnel(id)
	if tunnel == nil {
		tunnel, _ = h.config.GetTunnelByTunnelID(id)
	}
	
	localId := id
	if tunnel != nil {
		localId = tunnel.ID
	}
	
	if err := h.process.Stop(localId); err != nil {
		jsonError(w, 500, err.Error())
		return
	}
	jsonResponse(w, 200, map[string]string{"status": "stopped"})
}

func (h *Handler) RestartTunnel(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	tunnel, err := h.config.GetTunnel(id)
	if err != nil {
		jsonError(w, 500, err.Error())
		return
	}
	if tunnel == nil {
		jsonError(w, 404, "tunnel not found")
		return
	}

	if err := h.process.Restart(id, tunnel); err != nil {
		jsonError(w, 500, err.Error())
		return
	}
	jsonResponse(w, 200, map[string]string{"status": "restarted"})
}

func (h *Handler) TunnelStatus(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	running, pid := h.process.Status(id)
	jsonResponse(w, 200, map[string]interface{}{
		"running": running,
		"pid":     pid,
	})
}

func (h *Handler) TunnelLogs(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	logs, err := h.process.GetLogs(id, 200)
	if err != nil {
		jsonError(w, 500, err.Error())
		return
	}
	jsonResponse(w, 200, map[string]string{"logs": logs})
}

func (h *Handler) ClearTunnelLogs(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if err := h.process.ClearLogs(id); err != nil {
		jsonError(w, 500, err.Error())
		return
	}
	jsonResponse(w, 200, map[string]string{"status": "cleared"})
}

func (h *Handler) CloudflaredVersion(w http.ResponseWriter, r *http.Request) {
	installed := h.version.IsInstalled()
	if !installed {
		jsonResponse(w, 200, map[string]interface{}{
			"installed": false,
			"version":   "",
		})
		return
	}
	
	info := h.version.loadVersionInfo()
	if info != nil {
		jsonResponse(w, 200, map[string]interface{}{
			"installed": true,
			"version":   info.Version,
			"source":    info.Source,
			"updatedAt": info.UpdatedAt,
		})
		return
	}
	
	jsonResponse(w, 200, map[string]interface{}{
		"installed": true,
		"version":   "已安装",
	})
}

func (h *Handler) CloudflaredLatest(w http.ResponseWriter, r *http.Request) {
	release, err := h.version.GetLatestRelease()
	if err != nil {
		jsonError(w, 500, err.Error())
		return
	}
	jsonResponse(w, 200, map[string]string{
		"version": release.TagName,
	})
}

func (h *Handler) CloudflaredInstall(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	flusher, ok := w.(http.Flusher)
	if !ok {
		jsonError(w, 500, "streaming not supported")
		return
	}

	sendEvent := func(event, data string) {
		fmt.Fprintf(w, "event: %s\ndata: %s\n\n", event, data)
		flusher.Flush()
	}

	progressCb := func(stage, message string, progress int) {
		eventData, _ := json.Marshal(map[string]interface{}{
			"stage":    stage,
			"message":  message,
			"progress": progress,
		})
		sendEvent("progress", string(eventData))
	}

	version, err := h.version.InstallFromGitHubWithProgress(progressCb)
	if err != nil {
		errorData, _ := json.Marshal(map[string]string{"error": err.Error()})
		sendEvent("error", string(errorData))
		return
	}

	resultData, _ := json.Marshal(map[string]string{
		"status":  "installed",
		"version": version,
	})
	sendEvent("complete", string(resultData))
}

func (h *Handler) CloudflaredDownloadURL(w http.ResponseWriter, r *http.Request) {
	url, err := h.version.GetDownloadURL()
	if err != nil {
		jsonError(w, 500, err.Error())
		return
	}
	jsonResponse(w, 200, map[string]string{
		"url": url,
	})
}

func (h *Handler) CloudflaredUpload(w http.ResponseWriter, r *http.Request) {
	r.ParseMultipartForm(100 << 20)

	file, _, err := r.FormFile("file")
	if err != nil {
		jsonError(w, 400, "file upload required")
		return
	}
	defer file.Close()

	version, err := h.version.InstallFromUpload(io.Reader(file))
	if err != nil {
		jsonError(w, 500, err.Error())
		return
	}

	jsonResponse(w, 200, map[string]string{
		"status":  "installed",
		"version": version,
	})
}

func (h *Handler) SystemInfo(w http.ResponseWriter, r *http.Request) {
	jsonResponse(w, 200, map[string]string{
		"os":      runtime.GOOS,
		"arch":    runtime.GOARCH,
		"version": runtime.Version(),
	})
}

func (h *Handler) AuthLogout(w http.ResponseWriter, r *http.Request) {
	http.SetCookie(w, &http.Cookie{
		Name:     "auth_token",
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
	})
	jsonResponse(w, 200, map[string]string{"status": "logged out"})
}

func (h *Handler) GetActiveTunnel(w http.ResponseWriter, r *http.Request) {
	activeID := h.config.GetActiveTunnel()
	if activeID == "" {
		jsonError(w, 404, "no active tunnel")
		return
	}
	tunnel, err := h.config.GetTunnel(activeID)
	if err != nil {
		jsonError(w, 404, "tunnel not found")
		return
	}
	running, pid := h.process.Status(tunnel.ID)
	jsonResponse(w, 200, map[string]interface{}{
		"id":      tunnel.ID,
		"name":    tunnel.Name,
		"tunnelId": tunnel.TunnelID,
		"running": running,
		"pid":     pid,
	})
}

func (h *Handler) ActivateTunnel(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if err := h.config.SetActiveTunnel(id); err != nil {
		jsonError(w, 500, err.Error())
		return
	}
	jsonResponse(w, 200, map[string]string{"status": "activated", "tunnelId": id})
}
