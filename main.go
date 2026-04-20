package main

import (
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

	mux.Handle("POST /api/auth/change-password", authMgr.Middleware(http.HandlerFunc(handler.AuthChangePassword)))

	mux.Handle("GET /api/account", authMgr.Middleware(http.HandlerFunc(handler.GetAccount)))
	mux.Handle("POST /api/account", authMgr.Middleware(http.HandlerFunc(handler.SaveAccount)))
	mux.Handle("POST /api/account/verify", authMgr.Middleware(http.HandlerFunc(handler.VerifyAccount)))

	mux.Handle("GET /api/tunnels", authMgr.Middleware(http.HandlerFunc(handler.ListTunnels)))
	mux.Handle("POST /api/tunnels", authMgr.Middleware(http.HandlerFunc(handler.CreateTunnel)))
	mux.Handle("PUT /api/tunnels/{id}", authMgr.Middleware(http.HandlerFunc(handler.UpdateTunnel)))
	mux.Handle("DELETE /api/tunnels/{id}", authMgr.Middleware(http.HandlerFunc(handler.DeleteTunnel)))

	mux.Handle("GET /api/tunnels/{id}/hostnames", authMgr.Middleware(http.HandlerFunc(handler.ListHostnames)))
	mux.Handle("POST /api/tunnels/{id}/hostnames", authMgr.Middleware(http.HandlerFunc(handler.CreateHostname)))
	mux.Handle("PUT /api/tunnels/{id}/hostnames/{hid}", authMgr.Middleware(http.HandlerFunc(handler.UpdateHostname)))
	mux.Handle("DELETE /api/tunnels/{id}/hostnames/{hid}", authMgr.Middleware(http.HandlerFunc(handler.DeleteHostname)))

	mux.Handle("POST /api/tunnels/{id}/start", authMgr.Middleware(http.HandlerFunc(handler.StartTunnel)))
	mux.Handle("POST /api/tunnels/{id}/stop", authMgr.Middleware(http.HandlerFunc(handler.StopTunnel)))
	mux.Handle("POST /api/tunnels/{id}/restart", authMgr.Middleware(http.HandlerFunc(handler.RestartTunnel)))
	mux.Handle("GET /api/tunnels/{id}/status", authMgr.Middleware(http.HandlerFunc(handler.TunnelStatus)))
	mux.Handle("GET /api/tunnels/{id}/logs", authMgr.Middleware(http.HandlerFunc(handler.TunnelLogs)))
	mux.Handle("DELETE /api/tunnels/{id}/logs", authMgr.Middleware(http.HandlerFunc(handler.ClearTunnelLogs)))

	mux.Handle("GET /api/cloudflared/version", authMgr.Middleware(http.HandlerFunc(handler.CloudflaredVersion)))
	mux.Handle("GET /api/cloudflared/latest", authMgr.Middleware(http.HandlerFunc(handler.CloudflaredLatest)))
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
			if tunnel.AutoStart == nil || *tunnel.AutoStart {
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
