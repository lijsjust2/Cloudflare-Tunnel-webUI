package main

import (
	"encoding/json"
	"io"
	"net/http"
	"runtime"
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

func (h *Handler) AuthStatus(w http.ResponseWriter, r *http.Request) {
	jsonResponse(w, 200, map[string]interface{}{
		"needSetup":         !h.auth.IsSetup(),
		"cloudflaredInstalled": h.version.IsInstalled(),
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
	jsonResponse(w, 200, map[string]bool{"valid": true})
}

func (h *Handler) ListTunnels(w http.ResponseWriter, r *http.Request) {
	tunnels, err := h.config.LoadTunnels()
	if err != nil {
		jsonError(w, 500, err.Error())
		return
	}

	type TunnelWithStatus struct {
		TunnelConfig
		Running bool `json:"running"`
		PID     int  `json:"pid"`
	}

	result := make([]TunnelWithStatus, len(tunnels))
	for i, t := range tunnels {
		running, pid := h.process.Status(t.ID)
		result[i] = TunnelWithStatus{TunnelConfig: t, Running: running, PID: pid}
	}

	jsonResponse(w, 200, result)
}

func (h *Handler) CreateTunnel(w http.ResponseWriter, r *http.Request) {
	var cfg TunnelConfig
	if err := json.NewDecoder(r.Body).Decode(&cfg); err != nil {
		jsonError(w, 400, "invalid request body")
		return
	}

	if cfg.Name == "" || cfg.TunnelID == "" {
		jsonError(w, 400, "name and tunnelId are required")
		return
	}

	if err := h.config.CreateTunnel(cfg); err != nil {
		jsonError(w, 500, err.Error())
		return
	}

	jsonResponse(w, 201, map[string]string{"status": "created"})
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

func (h *Handler) DeleteTunnel(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")

	h.process.Stop(id)

	if err := h.config.DeleteTunnel(id); err != nil {
		jsonError(w, 500, err.Error())
		return
	}

	jsonResponse(w, 200, map[string]string{"status": "deleted"})
}

func (h *Handler) ListHostnames(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	tunnel, err := h.config.GetTunnel(id)
	if err != nil {
		jsonError(w, 404, err.Error())
		return
	}
	jsonResponse(w, 200, tunnel.Hostnames)
}

func (h *Handler) CreateHostname(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	var hostname HostnameConfig
	if err := json.NewDecoder(r.Body).Decode(&hostname); err != nil {
		jsonError(w, 400, "invalid request body")
		return
	}

	if hostname.Domain == "" || hostname.ServiceURL == "" {
		jsonError(w, 400, "domain and serviceUrl are required")
		return
	}

	if hostname.ServiceType == "" {
		hostname.ServiceType = "http"
	}

	if err := h.config.AddHostname(id, hostname); err != nil {
		jsonError(w, 500, err.Error())
		return
	}

	jsonResponse(w, 201, map[string]string{"status": "created"})
}

func (h *Handler) UpdateHostname(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	hid := r.PathValue("hid")

	var hostname HostnameConfig
	if err := json.NewDecoder(r.Body).Decode(&hostname); err != nil {
		jsonError(w, 400, "invalid request body")
		return
	}

	if err := h.config.UpdateHostname(id, hid, hostname); err != nil {
		jsonError(w, 500, err.Error())
		return
	}

	jsonResponse(w, 200, map[string]string{"status": "updated"})
}

func (h *Handler) DeleteHostname(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	hid := r.PathValue("hid")

	if err := h.config.DeleteHostname(id, hid); err != nil {
		jsonError(w, 500, err.Error())
		return
	}

	jsonResponse(w, 200, map[string]string{"status": "deleted"})
}

func (h *Handler) StartTunnel(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	tunnel, err := h.config.GetTunnel(id)
	if err != nil {
		jsonError(w, 404, err.Error())
		return
	}

	if err := h.process.Start(id, tunnel); err != nil {
		jsonError(w, 500, err.Error())
		return
	}

	jsonResponse(w, 200, map[string]string{"status": "started"})
}

func (h *Handler) StopTunnel(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if err := h.process.Stop(id); err != nil {
		jsonError(w, 500, err.Error())
		return
	}
	jsonResponse(w, 200, map[string]string{"status": "stopped"})
}

func (h *Handler) RestartTunnel(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	tunnel, err := h.config.GetTunnel(id)
	if err != nil {
		jsonError(w, 404, err.Error())
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
	version, err := h.version.GetCurrentVersion()
	installed := h.version.IsInstalled()
	if err != nil {
		jsonResponse(w, 200, map[string]interface{}{
			"installed": installed,
			"version":   "",
		})
		return
	}
	jsonResponse(w, 200, map[string]interface{}{
		"installed": installed,
		"version":   version,
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
	version, err := h.version.InstallFromGitHub()
	if err != nil {
		jsonError(w, 500, err.Error())
		return
	}
	jsonResponse(w, 200, map[string]string{
		"status":  "installed",
		"version": version,
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
