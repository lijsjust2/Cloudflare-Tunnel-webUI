package main

import (
	"crypto/rand"
	"embed"
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"os"
)

//go:embed static/*
var staticFiles embed.FS

func main() {
	port := os.Getenv("WEB_PORT")
	if port == "" {
		port = "7388"
	}

	dataDir := os.Getenv("DATA_DIR")
	if dataDir == "" {
		dataDir = "/app/data"
	}

	if err := os.MkdirAll(dataDir, 0755); err != nil {
		log.Fatalf("Failed to create data directory: %v", err)
	}

	configMgr := NewConfigManager(dataDir)
	processMgr := NewProcessManager(dataDir)
	versionMgr := NewVersionManager(dataDir)
	authMgr := NewAuthManager(dataDir)

	handler := NewHandler(configMgr, processMgr, versionMgr, authMgr)

	mux := http.NewServeMux()

	mux.HandleFunc("GET /api/auth/status", handler.AuthStatus)
	mux.HandleFunc("POST /api/auth/setup", handler.AuthSetup)
	mux.HandleFunc("POST /api/auth/login", handler.AuthLogin)
	mux.HandleFunc("POST /api/auth/logout", handler.AuthLogout)

	mux.Handle("POST /api/auth/change-password", authMgr.Middleware(http.HandlerFunc(handler.AuthChangePassword)))

	mux.Handle("GET /api/account", authMgr.Middleware(http.HandlerFunc(handler.GetAccount)))
	mux.Handle("POST /api/account", authMgr.Middleware(http.HandlerFunc(handler.SaveAccount)))
	mux.Handle("POST /api/account/verify", authMgr.Middleware(http.HandlerFunc(handler.VerifyAccount)))

	mux.Handle("GET /api/zones", authMgr.Middleware(http.HandlerFunc(handler.ListZones)))

	mux.Handle("GET /api/tunnels", authMgr.Middleware(http.HandlerFunc(handler.ListTunnels)))
	mux.Handle("POST /api/tunnels", authMgr.Middleware(http.HandlerFunc(handler.CreateTunnel)))
	mux.Handle("GET /api/tunnels/{id}", authMgr.Middleware(http.HandlerFunc(handler.GetTunnel)))
	mux.Handle("PUT /api/tunnels/{id}", authMgr.Middleware(http.HandlerFunc(handler.UpdateTunnel)))
	mux.Handle("DELETE /api/tunnels/{id}", authMgr.Middleware(http.HandlerFunc(handler.DeleteTunnel)))

	mux.Handle("PUT /api/tunnels/{id}/hostnames", authMgr.Middleware(http.HandlerFunc(handler.UpdateHostnames)))

	mux.Handle("POST /api/tunnels/{id}/start", authMgr.Middleware(http.HandlerFunc(handler.StartTunnel)))
	mux.Handle("POST /api/tunnels/{id}/stop", authMgr.Middleware(http.HandlerFunc(handler.StopTunnel)))
	mux.Handle("POST /api/tunnels/{id}/restart", authMgr.Middleware(http.HandlerFunc(handler.RestartTunnel)))
	mux.Handle("GET /api/tunnels/{id}/status", authMgr.Middleware(http.HandlerFunc(handler.TunnelStatus)))
	mux.Handle("GET /api/tunnels/{id}/logs", authMgr.Middleware(http.HandlerFunc(handler.TunnelLogs)))
	mux.Handle("DELETE /api/tunnels/{id}/logs", authMgr.Middleware(http.HandlerFunc(handler.ClearTunnelLogs)))
	
	mux.Handle("GET /api/tunnels/active", authMgr.Middleware(http.HandlerFunc(handler.GetActiveTunnel)))
	mux.Handle("POST /api/tunnels/{id}/activate", authMgr.Middleware(http.HandlerFunc(handler.ActivateTunnel)))

	mux.Handle("GET /api/cloudflared/version", authMgr.Middleware(http.HandlerFunc(handler.CloudflaredVersion)))
	mux.Handle("GET /api/cloudflared/latest", authMgr.Middleware(http.HandlerFunc(handler.CloudflaredLatest)))
	mux.Handle("GET /api/cloudflared/download-url", authMgr.Middleware(http.HandlerFunc(handler.CloudflaredDownloadURL)))
	mux.Handle("POST /api/cloudflared/install", authMgr.Middleware(http.HandlerFunc(handler.CloudflaredInstall)))
	mux.Handle("POST /api/cloudflared/upload", authMgr.Middleware(http.HandlerFunc(handler.CloudflaredUpload)))

	mux.Handle("GET /api/system/info", authMgr.Middleware(http.HandlerFunc(handler.SystemInfo)))

	staticSub, err := fs.Sub(staticFiles, "static")
	if err != nil {
		log.Fatalf("Failed to load embedded static files: %v", err)
	}
	mux.Handle("/", http.FileServer(http.FS(staticSub)))

	tunnels, err := configMgr.LoadTunnels()
	if err != nil {
		log.Printf("Failed to load tunnels for auto-start: %v", err)
	} else {
		for _, tunnel := range tunnels {
			if tunnel.AutoStart && tunnel.Token != "" {
				log.Printf("Auto-starting tunnel: %s", tunnel.Name)
				if err := processMgr.Start(tunnel.ID, &tunnel); err != nil {
					log.Printf("Failed to auto-start tunnel %s: %v", tunnel.Name, err)
				}
			}
		}
	}

	log.Printf("cloudflare-tunnel-webui starting on port %s", port)
	log.Printf("Data directory: %s", dataDir)
	if err := http.ListenAndServe(fmt.Sprintf(":%s", port), mux); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}

func generateID() string {
	b := make([]byte, 8)
	rand.Read(b)
	return fmt.Sprintf("%x", b)
}
