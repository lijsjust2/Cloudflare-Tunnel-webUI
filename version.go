package main

import (
	"archive/tar"
	"archive/zip"
	"compress/gzip"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
)

type VersionManager struct {
	dataDir string
}

type GithubRelease struct {
	TagName string        `json:"tag_name"`
	Assets  []GithubAsset `json:"assets"`
}

type GithubAsset struct {
	Name               string `json:"name"`
	BrowserDownloadURL string `json:"browser_download_url"`
}

func NewVersionManager(dataDir string) *VersionManager {
	binDir := filepath.Join(dataDir, "cloudflared")
	os.MkdirAll(binDir, 0755)
	return &VersionManager{dataDir: dataDir}
}

func (vm *VersionManager) cloudflaredPath() string {
	name := "cloudflared"
	if runtime.GOOS == "windows" {
		name = "cloudflared.exe"
	}
	return filepath.Join(vm.dataDir, "cloudflared", name)
}

func cloudflaredBinaryName() string {
	if runtime.GOOS == "windows" {
		return "cloudflared.exe"
	}
	return "cloudflared"
}

func (vm *VersionManager) GetCurrentVersion() (string, error) {
	cloudflaredPath := vm.cloudflaredPath()
	if _, err := os.Stat(cloudflaredPath); err != nil {
		return "", fmt.Errorf("cloudflared not installed")
	}

	cmd := exec.Command(cloudflaredPath, "--version")
	out, err := cmd.Output()
	if err != nil {
		return "", fmt.Errorf("failed to get version: %v", err)
	}

	version := strings.TrimSpace(string(out))
	parts := strings.Fields(version)
	if len(parts) >= 2 {
		return parts[1], nil
	}
	return version, nil
}

func (vm *VersionManager) GetLatestRelease() (*GithubRelease, error) {
	resp, err := http.Get("https://api.github.com/repos/cloudflare/cloudflared/releases/latest")
	if err != nil {
		return nil, fmt.Errorf("failed to fetch from GitHub: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("GitHub API returned status %d", resp.StatusCode)
	}

	var release GithubRelease
	if err := json.NewDecoder(resp.Body).Decode(&release); err != nil {
		return nil, fmt.Errorf("failed to parse response: %v", err)
	}

	return &release, nil
}

func assetPattern(version string) (pattern string, isZip bool) {
	osName := runtime.GOOS
	arch := runtime.GOARCH

	if arch == "amd64" {
		arch = "amd64"
	} else if arch == "arm64" {
		arch = "arm64"
	}

	if osName == "windows" {
		return fmt.Sprintf("cloudflared-%s-%s.exe", osName, arch), false
	} else if osName == "darwin" {
		return fmt.Sprintf("cloudflared-%s-%s.tgz", osName, arch), false
	}
	return fmt.Sprintf("cloudflared-linux-%s", arch), false
}

func (vm *VersionManager) InstallFromGitHub() (string, error) {
	release, err := vm.GetLatestRelease()
	if err != nil {
		return "", err
	}

	pattern, _ := assetPattern(release.TagName)

	var downloadURL string
	for _, asset := range release.Assets {
		if strings.Contains(asset.Name, pattern) || asset.Name == pattern {
			downloadURL = asset.BrowserDownloadURL
			break
		}
	}

	if downloadURL == "" {
		return "", fmt.Errorf("no matching asset found for %s/%s (looking for %s)", runtime.GOOS, runtime.GOARCH, pattern)
	}

	log.Printf("Downloading cloudflared from: %s", downloadURL)

	resp, err := http.Get(downloadURL)
	if err != nil {
		return "", fmt.Errorf("download failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return "", fmt.Errorf("download returned status %d", resp.StatusCode)
	}

	tmpFile := filepath.Join(vm.dataDir, "cloudflared_download")
	f, err := os.Create(tmpFile)
	if err != nil {
		return "", err
	}

	if _, err := io.Copy(f, resp.Body); err != nil {
		f.Close()
		return "", err
	}
	f.Close()

	dst := vm.cloudflaredPath()
	if strings.HasSuffix(downloadURL, ".tgz") || strings.HasSuffix(downloadURL, ".tar.gz") {
		if err := vm.extractFromTarGz(tmpFile, dst); err != nil {
			os.Remove(tmpFile)
			return "", err
		}
	} else {
		if err := os.Rename(tmpFile, dst); err != nil {
			os.Remove(tmpFile)
			return "", err
		}
	}

	os.Remove(tmpFile)
	os.Chmod(dst, 0755)

	version, _ := vm.GetCurrentVersion()
	log.Printf("cloudflared installed successfully: %s", version)
	return version, nil
}

func (vm *VersionManager) InstallFromUpload(reader io.Reader) (string, error) {
	tmpFile := filepath.Join(vm.dataDir, "cloudflared_upload")
	f, err := os.Create(tmpFile)
	if err != nil {
		return "", err
	}

	if _, err := io.Copy(f, reader); err != nil {
		f.Close()
		return "", err
	}
	f.Close()

	dst := vm.cloudflaredPath()

	if err := vm.extractFromTarGz(tmpFile, dst); err != nil {
		if err := vm.extractFromZip(tmpFile, dst); err != nil {
			if err := os.Rename(tmpFile, dst); err != nil {
				os.Remove(tmpFile)
				return "", fmt.Errorf("failed to extract cloudflared")
			}
		}
	}

	os.Remove(tmpFile)
	os.Chmod(dst, 0755)

	version, _ := vm.GetCurrentVersion()
	log.Printf("cloudflared installed from upload: %s", version)
	return version, nil
}

func (vm *VersionManager) extractFromTarGz(archivePath, dst string) error {
	f, err := os.Open(archivePath)
	if err != nil {
		return err
	}
	defer f.Close()

	gzr, err := gzip.NewReader(f)
	if err != nil {
		return fmt.Errorf("gzip open failed: %v", err)
	}
	defer gzr.Close()

	tr := tar.NewReader(gzr)
	binName := cloudflaredBinaryName()

	for {
		header, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return fmt.Errorf("tar read error: %v", err)
		}

		name := filepath.Base(header.Name)
		if (name == binName || name == "cloudflared") && header.Typeflag == tar.TypeReg {
			outFile, err := os.OpenFile(dst, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0755)
			if err != nil {
				return err
			}

			if _, err := io.Copy(outFile, tr); err != nil {
				outFile.Close()
				return err
			}
			outFile.Close()

			log.Printf("Extracted cloudflared to %s (from tar.gz)", dst)
			return nil
		}
	}

	return fmt.Errorf("cloudflared binary not found in tar.gz archive")
}

func (vm *VersionManager) extractFromZip(archivePath, dst string) error {
	r, err := zip.OpenReader(archivePath)
	if err != nil {
		return err
	}
	defer r.Close()

	binName := cloudflaredBinaryName()

	for _, f := range r.File {
		name := filepath.Base(f.Name)
		if (name == binName || name == "cloudflared") && !f.FileInfo().IsDir() {
			rc, err := f.Open()
			if err != nil {
				return err
			}
			defer rc.Close()

			outFile, err := os.OpenFile(dst, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0755)
			if err != nil {
				return err
			}

			if _, err := io.Copy(outFile, rc); err != nil {
				outFile.Close()
				return err
			}
			outFile.Close()

			log.Printf("Extracted cloudflared to %s (from zip)", dst)
			return nil
		}
	}

	return fmt.Errorf("cloudflared binary not found in zip archive")
}

func (vm *VersionManager) IsInstalled() bool {
	_, err := os.Stat(vm.cloudflaredPath())
	return err == nil
}
