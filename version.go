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
	"time"
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

type VersionInfo struct {
	Version   string `json:"version"`
	Source    string `json:"source"`
	UpdatedAt string `json:"updated_at"`
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

func (vm *VersionManager) versionInfoPath() string {
	return filepath.Join(vm.dataDir, "cloudflared", "version.json")
}

func (vm *VersionManager) saveVersionInfo(info *VersionInfo) error {
	b, err := json.MarshalIndent(info, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(vm.versionInfoPath(), b, 0644)
}

func (vm *VersionManager) loadVersionInfo() *VersionInfo {
	b, err := os.ReadFile(vm.versionInfoPath())
	if err != nil {
		return nil
	}
	var info VersionInfo
	if err := json.Unmarshal(b, &info); err != nil {
		return nil
	}
	return &info
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
		return "", fmt.Errorf("cloudflared 未安装")
	}

	cmd := exec.Command(cloudflaredPath, "--version")
	out, err := cmd.Output()
	if err != nil {
		return "", fmt.Errorf("获取版本失败: %v", err)
	}

	version := strings.TrimSpace(string(out))
	parts := strings.Fields(version)
	if len(parts) >= 2 {
		return parts[1], nil
	}
	return version, nil
}

func (vm *VersionManager) GetLatestRelease() (*GithubRelease, error) {
	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Get("https://api.github.com/repos/cloudflare/cloudflared/releases/latest")
	if err != nil {
		return nil, fmt.Errorf("从 GitHub 获取信息失败: %v (可能需要翻墙或手动下载)", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("GitHub API 返回状态码 %d", resp.StatusCode)
	}

	var release GithubRelease
	if err := json.NewDecoder(resp.Body).Decode(&release); err != nil {
		return nil, fmt.Errorf("解析响应失败: %v", err)
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

func (vm *VersionManager) GetDownloadURL() (string, error) {
	release, err := vm.GetLatestRelease()
	if err != nil {
		return fmt.Sprintf("https://github.com/cloudflare/cloudflared/releases/latest"), fmt.Errorf("无法获取最新版本: %v", err)
	}

	pattern, _ := assetPattern(release.TagName)

	for _, asset := range release.Assets {
		if strings.Contains(asset.Name, pattern) || asset.Name == pattern {
			return asset.BrowserDownloadURL, nil
		}
	}

	return fmt.Sprintf("https://github.com/cloudflare/cloudflared/releases/tag/%s", release.TagName), nil
}

type ProgressCallback func(stage, message string, progress int)

func (vm *VersionManager) InstallFromGitHubWithProgress(progressCb ProgressCallback) (string, error) {
	if progressCb == nil {
		progressCb = func(stage, message string, progress int) {}
	}

	progressCb("init", "正在获取最新版本信息...", 5)
	
	release, err := vm.GetLatestRelease()
	if err != nil {
		progressCb("error", "获取版本信息失败: "+err.Error(), 0)
		return "", err
	}

	progressCb("version", fmt.Sprintf("找到最新版本: %s", release.TagName), 10)

	pattern, _ := assetPattern(release.TagName)

	var downloadURL string
	for _, asset := range release.Assets {
		if strings.Contains(asset.Name, pattern) || asset.Name == pattern {
			downloadURL = asset.BrowserDownloadURL
			break
		}
	}

	if downloadURL == "" {
		err := fmt.Errorf("未找到适合 %s/%s 的资源 (查找模式: %s)", runtime.GOOS, runtime.GOARCH, pattern)
		progressCb("error", err.Error(), 0)
		return "", err
	}

	progressCb("download", fmt.Sprintf("开始下载: %s", downloadURL), 15)
	log.Printf("Downloading cloudflared from: %s", downloadURL)

	client := &http.Client{Timeout: 5 * time.Minute}
	resp, err := client.Get(downloadURL)
	if err != nil {
		progressCb("error", fmt.Sprintf("下载失败: %v (请手动下载: %s)", err, downloadURL), 0)
		return "", fmt.Errorf("下载失败: %v (请手动下载: %s)", err, downloadURL)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		err := fmt.Errorf("下载返回状态码 %d", resp.StatusCode)
		progressCb("error", err.Error(), 0)
		return "", err
	}

	totalSize := resp.ContentLength
	progressCb("download", fmt.Sprintf("文件大小: %.1f MB", float64(totalSize)/1024/1024), 20)

	tmpFile := filepath.Join(vm.dataDir, "cloudflared_download")
	f, err := os.Create(tmpFile)
	if err != nil {
		progressCb("error", "创建临时文件失败", 0)
		return "", err
	}

	var downloaded int64
	buf := make([]byte, 32*1024)
	lastProgress := 20

	for {
		n, err := resp.Body.Read(buf)
		if n > 0 {
			if _, writeErr := f.Write(buf[:n]); writeErr != nil {
				f.Close()
				progressCb("error", "写入文件失败", 0)
				return "", writeErr
			}
			downloaded += int64(n)
			
			if totalSize > 0 {
				percent := int(float64(downloaded) / float64(totalSize) * 60) + 20
				if percent > 80 {
					percent = 80
				}
				if percent > lastProgress {
					lastProgress = percent
					progressCb("download", fmt.Sprintf("下载中... %.1f%% (%.1f MB / %.1f MB)", 
						float64(downloaded)/float64(totalSize)*100,
						float64(downloaded)/1024/1024,
						float64(totalSize)/1024/1024), percent)
				}
			}
		}
		if err != nil {
			if err == io.EOF {
				break
			}
			f.Close()
			progressCb("error", "下载中断: "+err.Error(), 0)
			return "", fmt.Errorf("下载不完整: %v", err)
		}
	}
	f.Close()

	progressCb("install", "下载完成，正在安装...", 85)

	dst := vm.cloudflaredPath()
	if strings.HasSuffix(downloadURL, ".tgz") || strings.HasSuffix(downloadURL, ".tar.gz") {
		progressCb("install", "正在解压文件...", 90)
		if err := vm.extractFromTarGz(tmpFile, dst); err != nil {
			os.Remove(tmpFile)
			progressCb("error", "解压失败: "+err.Error(), 0)
			return "", err
		}
	} else {
		if err := os.Rename(tmpFile, dst); err != nil {
			os.Remove(tmpFile)
			progressCb("error", "安装失败: "+err.Error(), 0)
			return "", err
		}
	}

	os.Remove(tmpFile)
	os.Chmod(dst, 0755)

	progressCb("done", "安装完成", 95)

	version := release.TagName
	vm.saveVersionInfo(&VersionInfo{
		Version:   version,
		Source:    "github",
		UpdatedAt: time.Now().Format("2006-01-02"),
	})
	
	progressCb("complete", fmt.Sprintf("安装成功: %s", version), 100)
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
				return "", fmt.Errorf("解压 cloudflared 失败")
			}
		}
	}

	os.Remove(tmpFile)
	os.Chmod(dst, 0755)

	fileInfo, _ := os.Stat(dst)
	modTime := fileInfo.ModTime().Format("2006.01")
	version := "手动上传 " + modTime
	
	vm.saveVersionInfo(&VersionInfo{
		Version:   version,
		Source:    "upload",
		UpdatedAt: time.Now().Format("2006-01-02"),
	})
	
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
		return fmt.Errorf("gzip 打开失败: %v", err)
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
			return fmt.Errorf("tar 读取错误: %v", err)
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

	return fmt.Errorf("在 tar.gz 压缩包中未找到 cloudflared 程序")
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

	return fmt.Errorf("在 zip 压缩包中未找到 cloudflared 程序")
}

func (vm *VersionManager) IsInstalled() bool {
	_, err := os.Stat(vm.cloudflaredPath())
	return err == nil
}
