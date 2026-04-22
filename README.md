# Cloudflare Tunnel WebUI

一个基于 Web 的 Cloudflare Tunnel 管理面板，支持可视化创建、管理和监控 Cloudflare 隧道。

![Docker](https://img.shields.io/badge/Docker-支持-blue)
![Go](https://img.shields.io/badge/Go-1.22+-00ADD8)
![License](https://img.shields.io/badge/License-MIT-green)

## 功能特性

- 🌐 **Web 管理界面** - 直观的可视化操作界面
- 🔐 **安全认证** - 登录密码保护，会话管理
- 🚇 **隧道管理** - 创建、启动、停止、删除隧道
- 🌍 **域名映射** - 管理隧道内的域名到服务的映射
- ☁️ **Cloudflare API 集成** - 通过官方 API 操作隧道
- 📦 **多架构支持** - 支持 AMD64 和 ARM64 架构
- 🐳 **Docker 部署** - 一键部署，scratch 基础镜像
- 📊 **实时状态** - 查看连接数、运行状态等信息
- ⬆️ **自动安装** - 自动下载并安装 cloudflared

## 快速开始

### Docker 部署（推荐）

#### AMD64 (x86_64) 架构

```bash
# 下载镜像（从 GitHub Releases）
wget https://github.com/lijsjust2/Cloudflare-Tunnel-webUI/releases/latest/download/cloudflare-tunnel-webui-amd64-latest.tar
docker load -i cloudflare-tunnel-webui-amd64-latest.tar

# 运行容器
docker run -d \
  --name cloudflare-tunnel-webui \
  --network host \
  -v ./data:/app/data \
  -e WEB_PORT=7388 \
  -e TZ=Asia/Shanghai \
  --restart unless-stopped \
  cloudflare-tunnel-webui:amd64-latest
```

#### ARM64 (aarch64) 架构

```bash
# 下载镜像（从 GitHub Releases）
wget https://github.com/lijsjust2/Cloudflare-Tunnel-webUI/releases/latest/download/cloudflare-tunnel-webui-arm64-latest.tar
docker load -i cloudflare-tunnel-webui-arm64-latest.tar

# 运行容器
docker run -d \
  --name cloudflare-tunnel-webui \
  --network host \
  -v ./data:/app/data \
  -e WEB_PORT=7388 \
  -e TZ=Asia/Shanghai \
  --restart unless-stopped \
  cloudflare-tunnel-webui:arm64-latest
```

#### 使用 Docker Compose

```yaml
version: '3.8'
services:
  cloudflare-tunnel:
    image: cloudflare-tunnel-webui:latest
    container_name: cloudflare-tunnel-webui
    network_mode: host
    volumes:
      - ./data:/app/data
    environment:
      - WEB_PORT=7388
      - TZ=Asia/Shanghai
      - DATA_DIR=/app/data
    restart: unless-stopped
```

### 本地开发

```bash
# 克隆仓库
git clone https://github.com/lijsjust2/Cloudflare-Tunnel-webUI.git
cd Cloudflare-Tunnel-webUI

# 运行
go run .
```

访问 `http://localhost:7388` 打开管理面板。

## 配置说明

### 环境变量

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `WEB_PORT` | `7388` | Web 服务端口 |
| `DATA_DIR` | `/app/data` | 数据存储目录 |

### Cloudflare 账号配置

首次登录后，需要在设置页面配置 Cloudflare 凭证：

1. **获取 API Token**
   - 访问 [Cloudflare 控制台](https://dash.cloudflare.com/profile/api-tokens)
   - 创建新的 API Token，包含以下权限：
     - 账户: Cloudflare Tunnel **[编辑]**
     - 账户: Cloudflare Tunnel **[读取]**
     - 区域: DNS **[编辑]**
     - 区域: DNS **[读取]**

2. **获取 Account ID**
   - 在 Cloudflare 控制台任意页面右侧栏可找到 Account ID
   - 或访问 [账户概览](https://dash.cloudflare.com/) 页面查看

3. **在设置页填写并验证**

## 使用指南

### 创建隧道

1. 确保 Cloudflare 账号已正确配置并通过验证
2. 点击「创建隧道」按钮
3. 输入隧道名称（推荐：一台服务器使用独立隧道，方便管理地址映射）
4. 点击创建，系统会自动通过 Cloudflare API 创建隧道

### 添加域名映射

1. 进入隧道详情页
2. 点击「添加映射」
3. 填写：
   - **域名**: 例如 `app.example.com`
   - **本地服务**: 例如 `http://localhost:8080`
4. 可选：勾选「禁用 TLS 验证」（用于自签名证书）
5. 保存即可

### 启动/停止隧道

- 在隧道列表或详情页点击「启动」或「停止」按钮
- 启动后，cloudflared 会建立与 Cloudflare 的连接

### 安装 Cloudflared

系统支持两种方式安装 cloudflared：

**方式一：自动安装**

点击设置页的「自动安装」按钮，系统会：
1. 从 GitHub Releases 下载对应架构的最新版本
2. 显示实时下载进度和日志
3. 自动解压并安装到系统中

**方式二：手动上传**

如果服务器无法联网，可以：
1. 前往 [Cloudflare 官方 GitHub](https://github.com/cloudflare/cloudflared/releases)
2. 下载对应架构的文件
3. 在设置页点击「选择文件」上传

支持的文件格式：
- Windows: `.exe`
- macOS: `.tgz`
- Linux: 无扩展名的二进制文件

## 项目结构

```
cloudflaretunnel/
├── main.go              # 主程序入口
├── handlers.go          # HTTP 请求处理
├── api.go               # Cloudflare API 封装
├── auth.go              # 认证与会话管理
├── config.go            # 配置文件管理
├── process.go           # cloudflared 进程管理
├── version.go           # 版本检测与管理
├── Dockerfile           # Docker 构建文件
├── go.mod               # Go 模块依赖
├── .gitignore           # Git 忽略规则
└── static/              # 前端静态资源
    ├── index.html       # 主页面
    ├── app.js           # 应用逻辑
    └── style.css        # 样式表
```

## 技术栈

- **后端**: Go 1.22+（静态资源内嵌，零外部依赖）
- **前端**: 原生 HTML/CSS/JS（无框架依赖）
- **基础镜像**: scratch（极简 Docker 镜像）
- **CI/CD**: GitHub Actions 多架构构建

## 安全提示

- 请妥善保管 API Token，避免泄露
- 建议为本应用单独创建最小权限的 Token
- 生产环境建议修改默认管理员密码
- 数据目录包含敏感信息，请确保适当的权限控制

## 常见问题

### Q: 创建隧道时提示"请验证 Cloudflare 账号"？

A: 需要先在设置页面填写正确的 Account ID 和 API Token，然后点击「验证」按钮。

### Q: cloudflared 自动安装失败？

A: 可能是网络问题。可以手动从 [GitHub](https://github.com/cloudflare/cloudflared/releases) 下载后上传。

### Q: 隧道启动后无法访问？

A: 确保：
1. 隧道状态为"运行中"
2. 已添加域名映射
3. DNS 记录指向该隧道（通常由系统自动创建）

### Q: 如何更新版本？

A: 重新拉取最新镜像并重启容器即可。

## 许可证

MIT License

## 致谢

- [Cloudflare](https://www.cloudflare.com/) - 提供隧道服务
- [cloudflared](https://github.com/cloudflare/cloudflared) - Cloudflare 官方客户端
