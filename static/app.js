const API = {
    async request(method, path, body, timeout = 30000) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        
        const options = {
            method,
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal
        };
        if (body) options.body = JSON.stringify(body);
        
        try {
            const res = await fetch(path, options);
            clearTimeout(timeoutId);
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Request failed');
            return data;
        } catch (e) {
            clearTimeout(timeoutId);
            if (e.name === 'AbortError') {
                throw new Error('请求超时');
            }
            throw e;
        }
    },
    get: (path, timeout) => API.request('GET', path, null, timeout),
    post: (path, body, timeout) => API.request('POST', path, body, timeout),
    put: (path, body, timeout) => API.request('PUT', path, body, timeout),
    del: (path, timeout) => API.request('DELETE', path, null, timeout)
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

let state = {
    tunnels: [],
    zones: [],
    currentTunnel: null,
    hostnames: [],
    accountVerified: false,
    cloudflaredInstalled: false,
    language: localStorage.getItem('language') || 'zh'
};

const i18n = {
    zh: {
        'app.title': 'Cloudflare Tunnel WebUI',
        'app.subtitle': 'WebUI 管理面板',
        'login.password': '密码',
        'login.placeholder': '请输入密码',
        'login.button': '登录',
        'setup.title': '初始设置',
        'setup.subtitle': '请设置管理员密码',
        'setup.password': '设置密码',
        'setup.password.placeholder': '至少6位字符',
        'setup.confirm': '确认密码',
        'setup.confirm.placeholder': '再次输入密码',
        'setup.button': '完成设置',
        'header.settings': '设置',
        'header.logout': '退出',
        'tunnels.title': '隧道列表',
        'tunnels.create': '创建隧道',
        'tunnels.back': '返回',
        'tunnel.detail': '隧道详情',
        'tunnel.use': '使用此隧道',
        'tunnel.stop': '停止隧道',
        'tunnel.delete': '删除隧道',
        'tunnel.id': '隧道 ID',
        'tunnel.status': '状态',
        'tunnel.connections': '连接数',
        'tunnel.created': '创建时间',
        'tunnel.running': '运行中',
        'tunnel.stopped': '已停止',
        'routes.title': '域名映射 (Routes)',
        'routes.add': '添加映射',
        'routes.empty': '暂无域名映射',
        'routes.domain': '域名',
        'routes.service': '本地服务',
        'routes.action': '操作',
        'routes.edit': '编辑',
        'routes.delete': '删除',
        'settings.title': '设置',
        'settings.cf.config': 'Cloudflare 账号配置',
        'settings.cf.guide': '配置说明',
        'settings.cf.desc': '需要 Account ID 和 API Token（需要 Tunnel Edit 和 DNS Edit 权限）',
        'settings.cf.accountId': 'Account ID',
        'settings.cf.accountId.placeholder': '在 Cloudflare 控制台右侧获取',
        'settings.cf.apiToken': 'API Token',
        'settings.cf.apiToken.placeholder': '创建 API Token',
        'settings.cf.verify': '验证',
        'settings.cf.save': '保存',
        'settings.version.title': 'Cloudflared 版本',
        'settings.version.notInstalled': '未安装',
        'settings.version.installed': '已安装',
        'settings.version.install': '自动安装',
        'settings.version.upload': '选择文件',
        'settings.password.change': '修改密码',
        'settings.password.current': '当前密码',
        'settings.password.new': '新密码',
        'settings.password.submit': '修改密码',
        'settings.logout.title': '退出登录',
        'settings.logout.desc': '退出当前账号，需要重新登录才能继续使用',
        'settings.logout.button': '退出登录',
        'settings.language': '语言 / Language',
        'connectors.title': 'Connectors',
        'connectors.desc': '查看 Cloudflare 网络与您的基础设施之间建立的连接',
        'connectors.showing': '显示 {from}-{to} 共 {total}',
        'connectors.id': '连接器 ID',
        'connectors.hostname': '主机名',
        'connectors.datacenter': '数据中心',
        'connectors.originIP': '源 IP',
        'connectors.version': '版本',
        'connectors.platform': '平台',
        'connectors.status': '状态',
        'connectors.connected': '已连接',
        'connectors.reconnecting': '正在重连',
        'connectors.search': '搜索连接器',
        'connectors.addConnector': '添加连接器',
        'service.type': '类型 (必填)',
        'service.url': 'URL (必填)',
        'service.http': 'HTTP',
        'service.https': 'HTTPS',
        'service.unix': 'UNIX',
        'service.tcp': 'TCP',
        'service.ssh': 'SSH',
        'service.rdp': 'RDP',
        'service.unixtls': 'UNIX+TLS',
        'service.smb': 'SMB',
        'service.status': 'HTTP_STATUS',
        'service.placeholder': '路由流量的源服务（例如：https://localhost:8080、tcp://localhost:3306）',
        'service.select': '选择...',
        'modal.addRoute': '添加已发布应用程序',
        'modal.editRoute': '编辑已发布应用程序',
        'modal.routeTitle': '为 {tunnelName} 添加已发布应用程序路由',
        'modal.routeDesc': '通过公共主机名将本地应用程序发布到互联网。DNS 将自动配置。',
        'modal.routeLearnMore': '了解有关路由到隧道的更多信息',
        'modal.hostname': '主机名',
        'modal.subdomain': '子域名',
        'modal.subdomain.optional': '可选',
        'modal.domain': '域',
        'modal.domain.required': '必填',
        'modal.domain.placeholder': '从您的账户中选择一个域',
        'modal.path': '路径',
        'modal.path.optional': '可选',
        'modal.pathMatchingTitle': '路径匹配的工作原理',
        'modal.pathMatchingDesc': '路径字段使用正则表达式模式。常见示例：',
        'modal.pathMatchAll': '匹配所有路径：留空',
        'modal.pathMatchAnywhere': '在路径中的任何位置匹配：',
        'modal.pathMatchPrefix': '匹配路径前缀：',
        'modal.pathMatchExtension': '按扩展名匹配文件：',
        'modal.learnMore': '了解更多',
        'modal.service': '服务',
        'modal.type': '类型',
        'modal.type.required': '必填',
        'modal.url': 'URL',
        'modal.url.required': '必填',
        'modal.cancel': '取消',
        'modal.add': '添加路由',
        'modal.save': '保存',
        'modal.loadingZones': '正在加载域名列表...',
        'tunnels.name': '名称',
        'tunnels.id': 'ID',
        'tunnels.status': '状态',
        'tunnels.replicas': '副本',
        'tunnels.routes': '路由',
        'tunnels.created': '创建时间',
        'tunnels.actions': '操作',
        'tunnels.inUse': '使用中',
        'tunnels.start': '使用',
        'tunnels.stop': '停止',
        'tunnels.detail': '详情',
        'tunnels.delete': '删除',
        'tunnels.showing': '显示 1-{count} 共 {total}',
        'tunnels.noRoutes': '无路由',
        'tunnels.apps': '个应用',
        'tunnels.create.name': '隧道名称',
        'tunnels.create.placeholder': '例如: my-tunnel',
        'tunnels.create.tip': '推荐一台服务器使用独立隧道，方便管理地址映射',
        'tunnels.create.submit': '创建隧道',
        'tunnels.health': '健康',
        'tunnels.degraded': '降级',
        'tunnels.inactive': '未激活',
        'tunnels.down': '已关闭',
        'settings.cf.notConnected': '未连接',
        'settings.cf.connected': '已连接',
        'settings.cf.accountName': 'Account Name',
        'settings.cf.email': 'Email',
        'settings.version.cannotConnect': '无法联网？',
        'settings.version.downloadFrom': '前往',
        'settings.version.officialGitHub': 'Cloudflare 官方 GitHub',
        'settings.version.manualDownload': '手动下载对应架构的文件后上传安装',
        'settings.version.currentSystem': '当前系统',
        'settings.version.detecting': '检测中...',
        'settings.version.detectFailed': '检测失败',
        'settings.version.manualUpload': '手动上传',
        'settings.version.preparing': '准备中...',
        'settings.version.cancelInstall': '取消安装',
        'settings.version.recommended': '推荐',
        'install.progress': '{percent}%',
        'toast.confirmDelete': '确定要删除此隧道吗？此操作无法撤销。',
        'toast.confirmDeleteRoute': '确定要删除此路由吗？',
        'tunnel.type': '隧道类型',
        'tunnel.uptime': '正常运行时间',
        'tunnel.hours': '小时',
        'back.toTunnels': '返回隧道',
        'overview': '概述',
        'cidrRoutes': 'CIDR 路由',
        'hostnameRoutes': '主机名路由',
        'publishedAppRoutes': '已发布应用程序路由',
        'liveLogs': '实时日志',
        'basicInfo': '基本信息',
        'all': '全部',
        'edit': '编辑',
        'healthy': '正常',
        'running': '运行中',
        'stopped': '已停止',
    },
    en: {
        'app.title': 'Cloudflare Tunnel WebUI',
        'app.subtitle': 'Management Panel',
        'login.password': 'Password',
        'login.placeholder': 'Enter password',
        'login.button': 'Login',
        'setup.title': 'Initial Setup',
        'setup.subtitle': 'Set admin password',
        'setup.password': 'Password',
        'setup.password.placeholder': 'At least 6 characters',
        'setup.confirm': 'Confirm Password',
        'setup.confirm.placeholder': 'Re-enter password',
        'setup.button': 'Complete Setup',
        'header.settings': 'Settings',
        'header.logout': 'Logout',
        'tunnels.title': 'Tunnels',
        'tunnels.create': 'Create Tunnel',
        'tunnels.back': 'Back',
        'tunnel.detail': 'Tunnel Detail',
        'tunnel.use': 'Use This Tunnel',
        'tunnel.stop': 'Stop Tunnel',
        'tunnel.delete': 'Delete Tunnel',
        'tunnel.id': 'Tunnel ID',
        'tunnel.status': 'Status',
        'tunnel.connections': 'Connections',
        'tunnel.created': 'Created At',
        'tunnel.running': 'Running',
        'tunnel.stopped': 'Stopped',
        'routes.title': 'Public Hostnames (Routes)',
        'routes.add': 'Add Route',
        'routes.empty': 'No routes configured',
        'routes.domain': 'Hostname',
        'routes.service': 'Service URL',
        'routes.action': 'Actions',
        'routes.edit': 'Edit',
        'routes.delete': 'Delete',
        'settings.title': 'Settings',
        'settings.cf.config': 'Cloudflare Account Config',
        'settings.cf.guide': 'Setup Guide',
        'settings.cf.desc': 'Requires Account ID and API Token (needs Tunnel Edit and DNS Edit permissions)',
        'settings.cf.accountId': 'Account ID',
        'settings.cf.accountId.placeholder': 'Get from Cloudflare Dashboard',
        'settings.cf.apiToken': 'API Token',
        'settings.cf.apiToken.placeholder': 'Create API Token',
        'settings.cf.verify': 'Verify',
        'settings.cf.save': 'Save',
        'settings.version.title': 'Cloudflared Version',
        'settings.version.notInstalled': 'Not Installed',
        'settings.version.installed': 'Installed',
        'settings.version.install': 'Auto Install',
        'settings.version.upload': 'Upload File',
        'settings.password.change': 'Change Password',
        'settings.password.current': 'Current Password',
        'settings.password.new': 'New Password',
        'settings.password.submit': 'Change Password',
        'settings.logout.title': 'Logout',
        'settings.logout.desc': 'Logout from current session, login required to continue',
        'settings.logout.button': 'Logout',
        'settings.language': 'Language / 语言',
        'connectors.title': 'Connectors',
        'connectors.desc': 'Review established connections between Cloudflare\'s network and your infrastructure.',
        'connectors.showing': 'Showing {from}-{to} of {total}',
        'connectors.id': 'Connector ID',
        'connectors.hostname': 'Hostname',
        'connectors.datacenter': 'Data centers',
        'connectors.originIP': 'Origin IP',
        'connectors.version': 'Version',
        'connectors.platform': 'Platform',
        'connectors.status': 'Status',
        'connectors.connected': 'Connected',
        'connectors.reconnecting': 'Reconnecting',
        'connectors.search': 'Search a connector',
        'connectors.addConnector': 'Add a connector',
        'service.type': 'Type (Required)',
        'service.url': 'URL (Required)',
        'service.http': 'HTTP',
        'service.https': 'HTTPS',
        'service.unix': 'UNIX',
        'service.tcp': 'TCP',
        'service.ssh': 'SSH',
        'service.rdp': 'RDP',
        'service.unixtls': 'UNIX+TLS',
        'service.smb': 'SMB',
        'service.status': 'HTTP_STATUS',
        'service.placeholder': 'The origin service to route traffic to (e.g., https://localhost:8080, tcp://localhost:3306)',
        'service.select': 'Select...',
        'modal.addRoute': 'Add a published application',
        'modal.editRoute': 'Edit a published application',
        'modal.routeTitle': 'Add a published application route for {tunnelName}',
        'modal.routeDesc': 'Publish a local application to the Internet via public hostname. DNS will be automatically configured.',
        'modal.routeLearnMore': 'Learn more about routing to tunnels',
        'modal.hostname': 'Hostname',
        'modal.subdomain': 'Subdomain',
        'modal.subdomain.optional': 'Optional',
        'modal.domain': 'Domain',
        'modal.domain.required': 'Required',
        'modal.domain.placeholder': 'Select a zone from your account',
        'modal.path': 'Path',
        'modal.path.optional': 'Optional',
        'modal.pathMatchingTitle': 'How path matching works',
        'modal.pathMatchingDesc': 'The path field uses regex patterns. Common examples:',
        'modal.pathMatchAll': 'Match all paths: leave empty',
        'modal.pathMatchAnywhere': 'Match anywhere in path:',
        'modal.pathMatchPrefix': 'Match path prefix:',
        'modal.pathMatchExtension': 'Match files by extension:',
        'modal.learnMore': 'Learn more',
        'modal.service': 'Service',
        'modal.type': 'Type',
        'modal.type.required': 'Required',
        'modal.url': 'URL',
        'modal.url.required': 'Required',
        'modal.cancel': 'Cancel',
        'modal.add': 'Add route',
        'modal.save': 'Save',
        'modal.loadingZones': 'Loading domains...',
        'tunnels.name': 'Name',
        'tunnels.id': 'ID',
        'tunnels.status': 'Status',
        'tunnels.replicas': 'Replicas',
        'tunnels.routes': 'Routes',
        'tunnels.created': 'Created',
        'tunnels.actions': 'Actions',
        'tunnels.inUse': 'In Use',
        'tunnels.start': 'Use',
        'tunnels.stop': 'Stop',
        'tunnels.detail': 'Detail',
        'tunnels.delete': 'Delete',
        'tunnels.showing': 'Showing 1-{count} of {total}',
        'tunnels.noRoutes': 'No routes',
        'tunnels.apps': 'apps',
        'tunnels.create.name': 'Tunnel Name',
        'tunnels.create.placeholder': 'e.g., my-tunnel',
        'tunnels.create.tip': 'It\'s recommended to use a dedicated tunnel for each server for easier route management',
        'tunnels.create.submit': 'Create Tunnel',
        'tunnels.health': 'Healthy',
        'tunnels.degraded': 'Degraded',
        'tunnels.inactive': 'Inactive',
        'tunnels.down': 'Down',
        'settings.cf.notConnected': 'Not Connected',
        'settings.cf.connected': 'Connected',
        'settings.cf.accountName': 'Account Name',
        'settings.cf.email': 'Email',
        'settings.version.cannotConnect': 'Cannot connect to internet?',
        'settings.version.downloadFrom': 'Go to',
        'settings.version.officialGitHub': 'Cloudflare Official GitHub',
        'settings.version.manualDownload': 'to manually download the file for your architecture and upload it',
        'settings.version.currentSystem': 'Current System',
        'settings.version.detecting': 'Detecting...',
        'settings.version.detectFailed': 'Detection failed',
        'settings.version.manualUpload': 'Manual Upload',
        'settings.version.preparing': 'Preparing...',
        'settings.version.cancelInstall': 'Cancel Installation',
        'settings.version.recommended': 'Recommended',
        'install.progress': '{percent}%',
        'toast.confirmDelete': 'Are you sure you want to delete this tunnel? This action cannot be undone.',
        'toast.confirmDeleteRoute': 'Are you sure you want to delete this route?',
        'tunnel.type': 'Tunnel Type',
        'tunnel.uptime': 'Uptime',
        'tunnel.hours': 'hours',
        'back.toTunnels': 'Back to tunnels',
        'overview': 'Overview',
        'cidrRoutes': 'CIDR routes',
        'hostnameRoutes': 'Hostname routes',
        'publishedAppRoutes': 'Published application routes',
        'liveLogs': 'Live logs',
        'basicInfo': 'Basic Information',
        'all': 'All',
        'edit': 'Edit',
        'healthy': 'Healthy',
        'running': 'Running',
        'stopped': 'Stopped',
    }
};

function t(key) {
    return i18n[state.language]?.[key] || i18n.zh[key] || key;
}

function setLanguage(lang) {
    state.language = lang;
    localStorage.setItem('language', lang);
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    renderApp();
}

function showPage(id) {
    $$('.page').forEach(p => p.classList.add('hidden'));
    $(`#${id}`).classList.remove('hidden');
}

function showView(id) {
    $$('.view').forEach(v => v.classList.add('hidden'));
    $(`#${id}`).classList.remove('hidden');
}

function showToast(msg, type = '') {
    const toast = $('#toast');
    toast.textContent = msg;
    toast.className = 'toast' + (type ? ' ' + type : '');
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 3000);
}

function showModal(title, body, footer = '') {
    $('#modal-title').textContent = title;
    $('#modal-body').innerHTML = body;
    $('#modal-footer').innerHTML = footer;
    $('#modal').classList.remove('hidden');
}

function hideModal() {
    $('#modal').classList.add('hidden');
}

function showCFGuide() {
    $('#cf-guide-modal').classList.remove('hidden');
}

function hideCFGuide() {
    $('#cf-guide-modal').classList.add('hidden');
}

async function checkAuth() {
    try {
        const data = await API.get('/api/auth/status');
        if (data.needSetup) {
            showPage('setup-page');
        } else if (data.isLoggedIn) {
            await initMain(data);
        } else {
            showPage('login-page');
        }
    } catch (e) {
        showPage('login-page');
    }
}

async function login(password) {
    await API.post('/api/auth/login', { password });
    await initMain();
}

async function setup(password) {
    await API.post('/api/auth/setup', { password });
    await initMain();
}

async function initMain(authData) {
    showPage('main-page');
    
    state.accountVerified = authData && authData.hasAccount;
    state.cloudflaredInstalled = authData && authData.cloudflaredInstalled;
    
    $$('#main-page .view').forEach(v => v.classList.add('hidden'));
    $('#tunnels-view').classList.remove('hidden');
    
    const list = $('#tunnels-list');
    if (list) {
        list.innerHTML = `
            <div class="loading-state" style="padding: 80px 40px;">
                <div class="loading-spinner"></div>
                <p style="margin-top: 16px; font-size: 14px;">正在加载隧道列表...</p>
            </div>
        `;
    }
    
    await Promise.all([loadTunnels(), loadAccount(), loadCloudflaredVersion()]);
}

async function loadTunnels() {
    try {
        state.tunnels = await API.get('/api/tunnels');
        renderTunnels();
    } catch (e) {
        if (e.message.includes('Failed to fetch') || e.message.includes('NetworkError')) {
            state.tunnels = [];
            renderTunnels();
        } else {
            showToast((state.language === 'zh' ? '加载隧道失败: ' : 'Failed to load tunnels: ') + e.message, 'error');
        }
    }
}

async function loadZones() {
    try {
        state.zones = await API.get('/api/zones');
        console.log('Loaded zones:', state.zones.length, state.zones);
    } catch (e) {
        console.error('Failed to load zones:', e);
        showToast((state.language === 'zh' ? '加载域名列表失败: ' : 'Failed to load domains: ') + e.message, 'error');
    }
}

async function loadAccount() {
    try {
        const data = await API.get('/api/account');
        $('#account-id').value = data.accountId || '';
        $('#api-token').value = data.apiToken || '';
    } catch (e) {}
}

async function loadCloudflaredVersion() {
    try {
        const data = await API.get('/api/cloudflared/version');
        const badge = $('#cloudflared-status-badge');
        const versionText = $('#cloudflared-version-text');
        
        if (data.installed) {
            badge.className = 'status-badge status-badge-success';
            badge.textContent = '已安装';
            versionText.textContent = data.version;
        } else {
            badge.className = 'status-badge status-badge-error';
            badge.textContent = '未安装';
            versionText.textContent = '';
        }
    } catch (e) {
        const badge = $('#cloudflared-status-badge');
        const versionText = $('#cloudflared-version-text');
        badge.className = 'status-badge status-badge-error';
        badge.textContent = '未安装';
        versionText.textContent = '';
    }
    
    try {
        const sys = await API.get('/api/system/info');
        const archText = sys.os + '/' + sys.arch;
        let recommendFile = '';
        if (sys.os === 'windows') {
            recommendFile = `cloudflared-windows-${sys.arch}.exe`;
        } else if (sys.os === 'darwin') {
            recommendFile = `cloudflared-darwin-${sys.arch}.tgz`;
        } else {
            recommendFile = `cloudflared-linux-${sys.arch}`;
        }
        $('#system-arch').textContent = `${archText} (推荐: ${recommendFile})`;
    } catch (e) {
        $('#system-arch').textContent = '检测失败';
    }
}

function renderTunnels() {
    const list = $('#tunnels-list');
    if (!state.tunnels.length) {
        list.innerHTML = '<div class="empty-state">' + (state.language === 'zh' ? '暂无隧道，点击上方按钮创建' : 'No tunnels yet, click the button above to create one') + '</div>';
        return;
    }
    
    let statusText = '';
    if (state.tunnels.some(t => t.running)) {
        statusText = `<span class="status-badge status-badge-success" style="margin-left: 8px;">${t('tunnels.inUse')}</span>`;
    }
    
    list.innerHTML = `
        <div class="tunnels-table-container">
            <table class="tunnels-table">
                <thead>
                    <tr>
                        <th>${t('tunnels.name')}</th>
                        <th>${t('tunnels.id')}</th>
                        <th>${t('tunnels.status')}</th>
                        <th>${t('tunnels.routes')}</th>
                        <th>${t('tunnels.created')}</th>
                        <th>${t('tunnels.actions')}</th>
                    </tr>
                </thead>
                <tbody>
                    ${state.tunnels.map(tunnel => {
                        let statusLabel = t('tunnels.down');
                        let statusClass = 'down';
                        const cfStatus = (tunnel.status || '').toLowerCase();
                        
                        if (tunnel.running) {
                            statusLabel = t('running');
                            statusClass = 'running';
                        } else if (cfStatus === 'healthy') {
                            statusLabel = t('healthy');
                            statusClass = 'healthy';
                        } else if (cfStatus === 'degraded') {
                            statusLabel = t('tunnels.degraded');
                            statusClass = 'degraded';
                        } else if (cfStatus === 'inactive') {
                            statusLabel = t('tunnels.inactive');
                            statusClass = 'inactive';
                        } else if (cfStatus === 'down') {
                            statusLabel = t('tunnels.down');
                            statusClass = 'down';
                        }
                        
                        const routesCount = (tunnel.hostnames || []).length;
                        const routesText = routesCount > 0 ? `${routesCount} ${t('tunnels.apps')}` : t('tunnels.noRoutes');
                        
                        return `
                        <tr data-id="${tunnel.id || tunnel.tunnelId}" ${tunnel.running ? 'class="row-running"' : ''}>
                            <td>
                                <a href="javascript:void(0)" onclick="showTunnelDetail('${tunnel.id || tunnel.tunnelId}')" style="color: var(--primary); text-decoration: underline; font-weight: 500;">${tunnel.name}</a>
                                ${tunnel.running ? '<span class="active-badge">' + t('tunnels.inUse') + '</span>' : ''}
                            </td>
                            <td><code style="font-size: 12px; background: #f3f4f6; padding: 2px 6px; border-radius: 4px;">${tunnel.tunnelId}</code></td>
                            <td><span class="status-tag ${statusClass}">${statusLabel}</span></td>
                            <td><span style="display: inline-flex; align-items: center; gap: 4px;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>${routesText}</span></td>
                            <td>${tunnel.createdAt ? new Date(tunnel.createdAt).toLocaleDateString() : '-'}</td>
                            <td class="actions-cell">
                                ${!tunnel.running ? `<button class="btn btn-primary btn-sm" onclick="event.stopPropagation(); useTunnel('${tunnel.id || tunnel.tunnelId}')">${t('tunnels.start')}</button>` : `<button class="btn btn-secondary btn-sm" onclick="event.stopPropagation(); stopTunnel('${tunnel.id}')">${t('tunnels.stop')}</button>`}
                                <button class="btn btn-secondary btn-sm" onclick="event.stopPropagation(); showTunnelDetail('${tunnel.id || tunnel.tunnelId}')">${t('tunnels.detail')}</button>
                                <button class="btn btn-danger btn-sm" onclick="event.stopPropagation(); deleteTunnel('${tunnel.id || tunnel.tunnelId}')">${t('tunnels.delete')}</button>
                            </td>
                        </tr>
                    `}).join('')}
                </tbody>
            </table>
            <div style="padding: 8px 16px; font-size: 13px; color: var(--text-light); border-top: 1px solid var(--border);">
                ${t('tunnels.showing').replace('{count}', state.tunnels.length).replace('{total}', state.tunnels.length)}
            </div>
        </div>
    `;
}

async function showCreateTunnelModal() {
    if (!state.accountVerified) {
        showToast(state.language === 'zh' ? '请验证 Cloudflare 账号' : 'Please verify Cloudflare account', 'error');
        showView('settings-view');
        return;
    }
    
    showModal(t('tunnels.create'), `
        <form id="create-tunnel-form">
            <div class="form-group">
                <label>${t('tunnels.create.name')}</label>
                <input type="text" id="tunnel-name" placeholder="${t('tunnels.create.placeholder')}" required>
            </div>
            <div style="padding: 12px; background: #f0f9ff; border-radius: 8px; border: 1px solid #bae6fd; margin-top: 8px;">
                <div style="display: flex; align-items: flex-start; gap: 8px;">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0284c7" stroke-width="2" style="flex-shrink: 0; margin-top: 2px;">
                        <circle cx="12" cy="12" r="10"/>
                        <line x1="12" y1="16" x2="12" y2="12"/>
                        <line x1="12" y1="8" x2="12.01" y2="8"/>
                    </svg>
                    <span style="font-size: 13px; color: #0369a1;">${t('tunnels.create.tip')}</span>
                </div>
            </div>
        </form>
    `, `
        <button class="btn btn-secondary" onclick="hideModal()">${t('modal.cancel')}</button>
        <button class="btn btn-primary" onclick="createTunnel()">${t('tunnels.create.submit')}</button>
    `);
}

async function createTunnel() {
    const name = $('#tunnel-name').value.trim();
    
    if (!name) {
        showToast(state.language === 'zh' ? '请输入隧道名称' : 'Please enter tunnel name', 'error');
        return;
    }
    
    const existingTunnel = state.tunnels.find(t => t.name === name);
    if (existingTunnel) {
        showToast(state.language === 'zh' ? '已存在同名隧道，请使用其他名称' : 'A tunnel with this name already exists, please use another name', 'error');
        return;
    }
    
    try {
        await API.post('/api/tunnels', { name });
        hideModal();
        showToast(state.language === 'zh' ? '隧道创建成功' : 'Tunnel created successfully', 'success');
        await loadTunnels();
    } catch (e) {
        let msg = e.message;
        if (msg.includes('already have a tunnel with this name')) {
            msg = state.language === 'zh' ? 'Cloudflare 上已存在同名隧道，请使用其他名称' : 'A tunnel with this name already exists on Cloudflare, please use another name';
        }
        showToast((state.language === 'zh' ? '创建失败: ' : 'Creation failed: ') + msg, 'error');
    }
}

async function showTunnelDetail(id) {
    try {
        const tunnel = await API.get(`/api/tunnels/${id}`);
        state.currentTunnel = tunnel;
        state.hostnames = tunnel.hostnames || [];
        
        $('#tunnel-detail-title').textContent = tunnel.name;
        
        let connectorsHTML = '';
        try {
            const connData = await API.get(`/api/tunnels/${id}/connectors`);
            const connectors = connData.connectors || [];
            if (connectors.length > 0) {
                connectorsHTML = `
                    <div class="connectors-section" style="margin-top: 24px; margin-bottom: 32px; background: white; border-radius: 12px; border: 1px solid var(--border); overflow: hidden;">
                        <div class="section-header" style="padding: 16px 20px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center;">
                            <h3 style="margin: 0; font-size: 16px;">${t('connectors.title')}</h3>
                            <span style="font-size: 13px; color: var(--text-light);">${t('connectors.showing').replace('{from}', '1').replace('{to}', connectors.length).replace('{total}', connectors.length)}</span>
                        </div>
                        <div style="padding: 12px 16px; font-size: 13px; color: var(--text-secondary); background: #f8fafc; border-bottom: 1px solid var(--border);">
                            ${t('connectors.desc')}
                        </div>
                        <div style="overflow-x: auto;">
                            <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                                <thead>
                                    <tr style="background: #f8fafc; border-bottom: 2px solid var(--border);">
                                        <th style="padding: 10px 12px; text-align: left; font-weight: 600; color: var(--text-secondary);">${t('connectors.id')}</th>
                                        <th style="padding: 10px 12px; text-align: left; font-weight: 600; color: var(--text-secondary);">${t('connectors.datacenter')}</th>
                                        <th style="padding: 10px 12px; text-align: left; font-weight: 600; color: var(--text-secondary);">${t('connectors.originIP')}</th>
                                        <th style="padding: 10px 12px; text-align: left; font-weight: 600; color: var(--text-secondary);">${t('connectors.version')}</th>
                                        <th style="padding: 10px 12px; text-align: left; font-weight: 600; color: var(--text-secondary);">${t('connectors.platform')}</th>
                                        <th style="padding: 10px 12px; text-align: left; font-weight: 600; color: var(--text-secondary);">${t('connectors.status')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${connectors.map(c => `
                                        <tr style="border-bottom: 1px solid var(--border);">
                                            <td style="padding: 10px 12px;">
                                                <code style="font-size: 11px; background: #f3f4f6; padding: 2px 6px; border-radius: 4px; word-break: break-all;">${c.id}</code>
                                            </td>
                                            <td style="padding: 10px 12px;">${c.coloName || '-'}</td>
                                            <td style="padding: 10px 12px;"><code>${c.originIP || '-'}</code></td>
                                            <td style="padding: 10px 12px;">${c.version || '-'}</td>
                                            <td style="padding: 10px 12px;">${c.platform || '-'}</td>
                                            <td style="padding: 10px 12px;">
                                                <span class="status-tag ${c.isPending ? 'degraded' : 'running'}">${c.isPending ? t('connectors.reconnecting') : t('connectors.connected')}</span>
                                            </td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                `;
            }
        } catch (e) {
            console.log('Failed to load connectors:', e);
        }
        
        $('#tunnel-detail-content').innerHTML = `
            <div class="tunnel-detail-info" style="margin-bottom: 24px;">
                <div class="info-grid">
                    <div class="info-item">
                        <label>${t('tunnel.id')}</label>
                        <span>${tunnel.tunnelId}</span>
                    </div>
                    <div class="info-item">
                        <label>${t('tunnel.status')}</label>
                        <span>${tunnel.running ? t('tunnel.running') : tunnel.status || t('tunnel.stopped')}</span>
                    </div>
                    <div class="info-item">
                        <label>${t('tunnel.created')}</label>
                        <span>${tunnel.createdAt ? new Date(tunnel.createdAt).toLocaleString() : '-'}</span>
                    </div>
                </div>
                <div class="tunnel-actions" style="margin-top: 20px;">
                    ${!tunnel.running 
                        ? `<button class="btn btn-primary" onclick="event.stopPropagation(); useTunnel('${tunnel.id || tunnel.tunnelId}')">${t('tunnel.use')}</button>`
                        : `<button class="btn btn-secondary" onclick="event.stopPropagation(); stopTunnel('${tunnel.id || tunnel.tunnelId}')">${t('tunnel.stop')}</button>`
                    }
                    <button class="btn btn-danger" onclick="event.stopPropagation(); deleteTunnel('${tunnel.id || tunnel.tunnelId}')">${t('tunnel.delete')}</button>
                </div>
            </div>
            
            ${connectorsHTML}
            
            <div class="hostnames-section" style="margin-top: 24px;">
                <div class="section-header">
                    <h3>${t('routes.title')}</h3>
                    <button class="btn btn-primary btn-sm" onclick="showAddHostnameModal()">${t('routes.add')}</button>
                </div>
                ${renderHostnames()}
            </div>
        `;
        
        showView('tunnel-detail-view');
    } catch (e) {
        showToast((state.language === 'zh' ? '加载详情失败: ' : 'Failed to load details: ') + e.message, 'error');
    }
}

function renderHostnames() {
    if (!state.hostnames.length) {
        return `<div class="empty-state">${t('routes.empty')}</div>`;
    }
    return `
        <table class="hostnames-table">
            <thead>
                <tr>
                    <th>${t('routes.domain')}</th>
                    <th>${t('routes.service')}</th>
                    <th>${t('routes.action')}</th>
                </tr>
            </thead>
            <tbody>
                ${state.hostnames.map((h, i) => `
                    <tr>
                        <td>${h.hostname}</td>
                        <td>${h.service}</td>
                        <td class="hostname-actions">
                            <button class="btn btn-secondary btn-sm" onclick="editHostname(${i})">${t('routes.edit')}</button>
                            <button class="btn btn-danger btn-sm" onclick="deleteHostname(${i})">${t('routes.delete')}</button>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

async function startTunnel(id) {
    try {
        await API.post(`/api/tunnels/${id}/start`);
        showToast(state.language === 'zh' ? '隧道已启动' : 'Tunnel started', 'success');
        await loadTunnels();
        if (state.currentTunnel?.id === id) {
            await showTunnelDetail(id);
        }
    } catch (e) {
        showToast((state.language === 'zh' ? '启动失败: ' : 'Start failed: ') + e.message, 'error');
    }
}

async function useTunnel(id) {
    if (!confirm(state.language === 'zh' ? '确定要使用此隧道吗？这将停止当前运行的隧道并切换到该隧道。' : 'Are you sure you want to use this tunnel? This will stop the currently running tunnel and switch to it.')) return;
    
    try {
        const runningTunnel = state.tunnels.find(t => t.running && t.id !== id);
        if (runningTunnel) {
            await API.post(`/api/tunnels/${runningTunnel.id}/stop`);
        }
        
        await API.post(`/api/tunnels/${id}/start`);
        showToast(`${state.language === 'zh' ? '已切换到隧道: ' : 'Switched to tunnel: '} ${state.tunnels.find(t => t.id === id || t.tunnelId === id)?.name || id}`, 'success');
        await loadTunnels();
        if (state.currentTunnel?.id === id || state.currentTunnel?.tunnelId === id) {
            await showTunnelDetail(id);
        }
    } catch (e) {
        showToast((state.language === 'zh' ? '切换失败: ' : 'Switch failed: ') + e.message, 'error');
    }
}

async function stopTunnel(id) {
    try {
        await API.post(`/api/tunnels/${id}/stop`);
        showToast(state.language === 'zh' ? '隧道已停止' : 'Tunnel stopped', 'success');
        await loadTunnels();
        if (state.currentTunnel?.id === id || state.currentTunnel?.tunnelId === id) {
            await showTunnelDetail(state.currentTunnel?.id || state.currentTunnel?.tunnelId);
        }
    } catch (e) {
        showToast((state.language === 'zh' ? '停止失败: ' : 'Stop failed: ') + e.message, 'error');
    }
}

async function deleteTunnel(id) {
    if (!confirm(t('toast.confirmDelete'))) return;
    try {
        await API.del(`/api/tunnels/${id}`);
        showToast(state.language === 'zh' ? '隧道已删除' : 'Tunnel deleted', 'success');
        await loadTunnels();
        showView('tunnels-view');
    } catch (e) {
        showToast((state.language === 'zh' ? '删除失败: ' : 'Delete failed: ') + e.message, 'error');
    }
}

async function showLogsModal(id) {
    try {
        const data = await API.get(`/api/tunnels/${id}/logs`);
        showModal(state.language === 'zh' ? '隧道日志' : 'Tunnel Logs', `
            <div class="logs-container">
                <pre class="logs-content">${data.logs || (state.language === 'zh' ? '暂无日志' : 'No logs')}</pre>
            </div>
        `, `
            <button class="btn btn-secondary" onclick="clearLogs('${id}')">${state.language === 'zh' ? '清空日志' : 'Clear Logs'}</button>
            <button class="btn btn-primary" onclick="hideModal()">${t('modal.cancel')}</button>
        `);
    } catch (e) {
        showToast((state.language === 'zh' ? '加载日志失败: ' : 'Failed to load logs: ') + e.message, 'error');
    }
}

async function clearLogs(id) {
    try {
        await API.del(`/api/tunnels/${id}/logs`);
        showToast(state.language === 'zh' ? '日志已清空' : 'Logs cleared', 'success');
        await showLogsModal(id);
    } catch (e) {
        showToast((state.language === 'zh' ? '清空失败: ' : 'Clear failed: ') + e.message, 'error');
    }
}

async function showAddHostnameModal() {
    showModal(t('modal.addRoute'), `
        <div style="text-align: center; padding: 40px 20px;">
            <div class="loading-spinner"></div>
            <p style="margin-top: 12px; color: var(--text-light);">${t('modal.loadingZones')}</p>
        </div>
    `, '');
    
    try {
        await loadZones();
    } catch (e) {
        hideModal();
        return;
    }
    
    const zoneOptions = state.zones.map(z => `<option value="${z.id}" data-name="${z.name}">${z.name}</option>`).join('');
    
    $('#modal-title').textContent = t('modal.addRoute');
    $('#modal-body').innerHTML = `
        <div class="space-y-5">
            <!-- Description -->
            <p class="text-sm text-gray-600">${t('modal.routeDesc')} <a href="https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/routing-to-tunnel/" target="_blank" class="text-primary hover:text-primary-dark">${t('modal.routeLearnMore')} ↗</a></p>
            
            <form id="hostname-form" class="space-y-5">
                <!-- Hostname Section -->
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-2">${t('modal.hostname')}</label>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <input type="text" id="subdomain" placeholder="e.g., www, blog, api" value=""
                                class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent transition-all duration-200 outline-none">
                            <div class="mt-1.5 text-xs text-gray-500">${t('modal.subdomain')} (${t('modal.subdomain.optional')})</div>
                        </div>
                        <div>
                            <select id="zone-select" onchange="updateFullHostname()" required
                                class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent transition-all duration-200 outline-none bg-white">
                                <option value="">${t('modal.domain.placeholder')}</option>
                                ${zoneOptions}
                            </select>
                            <div class="mt-1.5 text-xs text-gray-500">${t('modal.domain')} *</div>
                        </div>
                    </div>
                </div>
                
                <!-- Full Hostname Preview -->
                <div id="full-hostname-preview" class="hidden p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <div class="flex items-center gap-2">
                        <span class="text-sm font-medium text-gray-700">Full hostname:</span>
                        <span id="full-hostname-value" class="text-sm font-mono text-primary"></span>
                    </div>
                </div>
                
                <!-- Path Section -->
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-2">${t('modal.path')} (${t('modal.path.optional')})</label>
                    <input type="text" id="path-pattern" placeholder="^/blog" oninput="updatePathHint()"
                        class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent transition-all duration-200 outline-none">
                </div>
                
                <!-- Path Matching Info -->
                <div id="path-matching-info" class="hidden p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <div class="text-sm font-semibold text-blue-900 mb-2">${t('modal.pathMatchingTitle')}</div>
                    <div class="text-xs text-blue-800 space-y-1">
                        <div>${t('modal.pathMatchingDesc')}</div>
                        <ul class="ml-4 mt-2 space-y-1">
                            <li><code class="px-1.5 py-0.5 bg-blue-100 rounded text-blue-900">(empty)</code> - ${t('modal.pathMatchAll')}</li>
                            <li><code class="px-1.5 py-0.5 bg-blue-100 rounded text-blue-900">blog</code> - ${t('modal.pathMatchAnywhere')}</li>
                            <li><code class="px-1.5 py-0.5 bg-blue-100 rounded text-blue-900">^/api</code> - ${t('modal.pathMatchPrefix')}</li>
                            <li><code class="px-1.5 py-0.5 bg-blue-100 rounded text-blue-900">\\.(jpg|png|css|js)$</code> - ${t('modal.pathMatchExtension')}</li>
                        </ul>
                    </div>
                    <a href="#" onclick="return false;" class="inline-block mt-2 text-xs text-blue-600 hover:text-blue-800">${t('modal.learnMore')} →</a>
                </div>
                
                <!-- Service Section -->
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-2">${t('modal.service')} *</label>
                    <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div class="sm:col-span-1">
                            <select id="service-type" onchange="updateServicePlaceholder()"
                                class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent transition-all duration-200 outline-none bg-white">
                                <option value="">${t('service.select')}</option>
                                <option value="http://">${t('service.http')}</option>
                                <option value="https://">${t('service.https')}</option>
                                <option value="unix://">${t('service.unix')}</option>
                                <option value="tcp://">${t('service.tcp')}</option>
                                <option value="ssh://">${t('service.ssh')}</option>
                                <option value="rdp://">${t('service.rdp')}</option>
                                <option value="unix+tls://">${t('service.unixtls')}</option>
                                <option value="smb://">${t('service.smb')}</option>
                                <option value="http_status:404">${t('service.status')}</option>
                            </select>
                            <div class="mt-1.5 text-xs text-gray-500">${t('modal.type')} (${t('modal.type.required')})</div>
                        </div>
                        <div class="sm:col-span-2 relative">
                            <div class="relative">
                                <span id="service-prefix" class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-medium pointer-events-none select-none">//</span>
                                <input type="text" id="service" placeholder="localhost:8080" required
                                    class="w-full pl-12 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent transition-all duration-200 outline-none">
                            </div>
                            <div class="mt-1.5 text-xs text-gray-500">${t('modal.url')} (${t('modal.url.required')})</div>
                        </div>
                    </div>
                    <div id="service-hint" class="mt-2 text-xs text-gray-500">
                        ${state.language === 'zh' ? '路由流量的源服务（例如：https://localhost:8080、tcp://localhost:3306）' : 'The origin service to route traffic to (e.g., https://localhost:8080, tcp://localhost:3306)'}
                    </div>
                </div>
            </form>
        </div>
    `;
    $('#modal-footer').innerHTML = `
        <button class="btn btn-secondary" onclick="hideModal()">${t('modal.cancel')}</button>
        <button class="btn btn-primary" onclick="addHostname()">${t('modal.add')}</button>
    `;
    
    setTimeout(() => {
        const subInput = $('#subdomain');
        const zoneSelect = $('#zone-select');
        if (subInput) subInput.addEventListener('input', updateFullHostname);
        if (zoneSelect) zoneSelect.addEventListener('change', updateFullHostname);
    }, 100);
}

function updateServicePlaceholder() {
    const typeSelect = $('#service-type');
    const serviceInput = $('#service');
    const prefixSpan = $('#service-prefix');
    const hintDiv = $('#service-hint');
    
    if (!typeSelect || !serviceInput) return;
    
    const selectedType = typeSelect.value;
    
    const placeholders = {
        '': { placeholder: 'localhost:8080', prefix: '//', hint: state.language === 'zh' ? '路由流量的源服务（例如：https://localhost:8080、tcp://localhost:3306）' : 'The origin service to route traffic to (e.g., https://localhost:8080, tcp://localhost:3306)' },
        'http://': { placeholder: 'localhost:8080', prefix: 'http://', hint: state.language === 'zh' ? 'HTTP 服务 URL' : 'HTTP service URL' },
        'https://': { placeholder: 'localhost:8443', prefix: 'https://', hint: state.language === 'zh' ? 'HTTPS 服务 URL' : 'HTTPS service URL' },
        'unix://': { placeholder: '/var/run/app.sock', prefix: 'unix://', hint: state.language === 'zh' ? 'Unix socket 路径' : 'Unix socket path' },
        'tcp://': { placeholder: 'localhost:3306', prefix: 'tcp://', hint: state.language === 'zh' ? 'TCP 服务地址（用于数据库等）' : 'TCP service address (for databases, etc.)' },
        'ssh://': { placeholder: 'localhost:22', prefix: 'ssh://', hint: state.language === 'zh' ? 'SSH 服务地址' : 'SSH service address' },
        'rdp://': { placeholder: 'localhost:3389', prefix: 'rdp://', hint: state.language === 'zh' ? 'RDP（远程桌面协议）地址' : 'RDP (Remote Desktop Protocol) address' },
        'unix+tls://': { placeholder: '/var/run/app.sock', prefix: 'unix+tls://', hint: state.language === 'zh' ? '带 TLS 加密的 Unix socket' : 'Unix socket with TLS encryption' },
        'smb://': { placeholder: '\\\\server\\share', prefix: 'smb://', hint: state.language === 'zh' ? 'SMB/CIFS 共享路径' : 'SMB/CIFS share path' },
        'http_status:404': { placeholder: '', prefix: 'http_status:', hint: state.language === 'zh' ? '返回 HTTP 状态码（例如：404, 503）' : 'Return HTTP status code (e.g., 404, 503)' }
    };
    
    const config = placeholders[selectedType] || placeholders[''];
    serviceInput.placeholder = config.placeholder;
    prefixSpan.textContent = config.prefix;
    hintDiv.textContent = config.hint;
}

function updateFullHostname() {
    const subdomain = ($('#subdomain')?.value || '').trim();
    const zoneSelect = $('#zone-select');
    const preview = $('#full-hostname-preview');
    const valueEl = $('#full-hostname-value');
    
    if (!preview || !valueEl) return;
    
    if (zoneSelect && zoneSelect.value) {
        const option = zoneSelect.selectedOptions[0];
        const domain = option ? option.dataset.name || option.text : '';
        const fullHostname = subdomain ? `${subdomain}.${domain}` : domain;
        preview.classList.remove('hidden');
        valueEl.textContent = fullHostname;
    } else {
        preview.classList.add('hidden');
    }
}

function updatePathHint() {
    const pathInput = $('#path-pattern');
    const infoBox = $('#path-matching-info');
    if (!pathInput || !infoBox) return;
    
    if (pathInput.value.trim()) {
        infoBox.classList.remove('hidden');
    } else {
        infoBox.classList.add('hidden');
    }
}

async function addHostname() {
    const subdomain = ($('#subdomain')?.value || '').trim();
    const zoneSelect = $('#zone-select');
    const serviceType = $('#service-type')?.value || '';
    const service = $('#service')?.value?.trim();
    const pathPattern = $('#path-pattern')?.value?.trim();
    
    let hostname = '';
    if (zoneSelect && zoneSelect.value) {
        const option = zoneSelect.selectedOptions[0];
        const domain = option ? option.dataset.name || option.text : '';
        hostname = subdomain ? `${subdomain}.${domain}` : domain;
    }
    
    let serviceUrl = '';
    if (serviceType === 'http_status:404') {
        serviceUrl = 'http_status:404';
    } else if (serviceType && service) {
        serviceUrl = `${serviceType}${service}`;
    } else if (service) {
        serviceUrl = service;
    }
    
    if (!hostname || !serviceUrl) {
        showToast(state.language === 'zh' ? '请填写完整信息' : 'Please fill in all required fields', 'error');
        return;
    }
    
    if (pathPattern) {
        serviceUrl = `${serviceUrl}${pathPattern}`;
    }
    
    state.hostnames.push({ id: Date.now().toString(), hostname, service: serviceUrl, path: pathPattern });
    await saveHostnames();
}

async function editHostname(index) {
    const h = state.hostnames[index];
    
    showModal(t('modal.editRoute'), `
        <div style="text-align: center; padding: 40px 20px;">
            <div class="loading-spinner"></div>
            <p style="margin-top: 12px; color: var(--text-light);">${t('modal.loadingZones')}</p>
        </div>
    `, '');
    
    try {
        await loadZones();
    } catch (e) {
        hideModal();
        return;
    }
    
    const parts = h.hostname.split('.');
    const subdomain = parts.length > 2 ? parts.slice(0, -2).join('.') : '';
    const domain = parts.length > 2 ? parts.slice(-2).join('.') : h.hostname;
    
    const zoneOptions = state.zones.map(z => `<option value="${z.id}" data-name="${z.name}" ${z.name === domain ? 'selected' : ''}>${z.name}</option>`).join('');
    
    $('#modal-title').textContent = t('modal.editRoute');
    $('#modal-body').innerHTML = `
        <form id="hostname-form">
            <div class="form-group">
                <label>${t('modal.hostname')}</label>
                <div class="form-row">
                    <div style="flex: 1;">
                        <input type="text" id="subdomain" placeholder="e.g., www, blog, api" value="${subdomain}">
                        <div class="form-hint">${t('modal.subdomain')} (${t('modal.subdomain.optional')})</div>
                    </div>
                    <div style="flex: 1.5;">
                        <select id="zone-select" onchange="updateFullHostname()">
                            ${zoneOptions}
                        </select>
                        <div class="form-hint">${t('modal.domain')} *</div>
                    </div>
                </div>
            </div>
            <div id="full-hostname-preview" class="full-hostname-preview" style="display: block;">
                <label>Full hostname:</label>
                <span id="full-hostname-value">${h.hostname}</span>
            </div>
            <div class="form-group">
                <label>${t('modal.path')} (${t('modal.path.optional')})</label>
                <input type="text" id="path-pattern" placeholder="^/blog" value="${h.path || ''}" oninput="updatePathHint()">
            </div>
            <div class="form-group">
                <label>${t('modal.service')} URL *</label>
                <input type="text" id="service" placeholder="https://localhost:8080" value="${h.service}" required>
                <div class="form-hint">${state.language === 'zh' ? '路由流量的源服务（例如：https://localhost:8080、tcp://localhost:3306）' : 'The origin service to route traffic to (e.g., https://localhost:8080, tcp://localhost:3306)'}</div>
            </div>
        </form>
    `;
    $('#modal-footer').innerHTML = `
        <button class="btn btn-secondary" onclick="hideModal()">${t('modal.cancel')}</button>
        <button class="btn btn-primary" onclick="saveHostnameEdit(${index})">${t('modal.save')}</button>
    `;
    
    setTimeout(() => {
        const subInput = $('#subdomain');
        const zoneSelect = $('#zone-select');
        if (subInput) subInput.addEventListener('input', updateFullHostname);
        if (zoneSelect) zoneSelect.addEventListener('change', updateFullHostname);
    }, 100);
}

async function saveHostnameEdit(index) {
    const subdomain = ($('#subdomain')?.value || '').trim();
    const zoneSelect = $('#zone-select');
    const service = $('#service')?.value?.trim();
    const pathPattern = $('#path-pattern')?.value?.trim();
    
    let hostname = '';
    if (zoneSelect && zoneSelect.value) {
        const option = zoneSelect.selectedOptions[0];
        const domain = option ? option.dataset.name || option.text : '';
        hostname = subdomain ? `${subdomain}.${domain}` : domain;
    }
    
    if (!hostname || !service) {
        showToast(state.language === 'zh' ? '请填写完整信息' : 'Please fill in all required fields', 'error');
        return;
    }
    
    let serviceUrl = service;
    if (pathPattern) {
        serviceUrl = `${service}${pathPattern}`;
    }
    
    state.hostnames[index] = { ...state.hostnames[index], hostname, service: serviceUrl, path: pathPattern };
    await saveHostnames();
}

async function deleteHostname(index) {
    if (!confirm(t('toast.confirmDeleteRoute'))) return;
    state.hostnames.splice(index, 1);
    await saveHostnames();
}

async function saveHostnames() {
    try {
        await API.put(`/api/tunnels/${state.currentTunnel.id}/hostnames`, { hostnames: state.hostnames });
        hideModal();
        showToast(state.language === 'zh' ? '保存成功' : 'Saved successfully', 'success');
        await showTunnelDetail(state.currentTunnel.id);
    } catch (e) {
        showToast((state.language === 'zh' ? '保存失败: ' : 'Save failed: ') + e.message, 'error');
    }
}

async function saveAccount() {
    const accountId = $('#account-id').value.trim();
    const apiToken = $('#api-token').value.trim();
    
    try {
        await API.post('/api/account', { accountId, apiToken });
        showToast(state.language === 'zh' ? '账号配置已保存' : 'Account configuration saved', 'success');
    } catch (e) {
        showToast((state.language === 'zh' ? '保存失败: ' : 'Save failed: ') + e.message, 'error');
    }
}

async function verifyAccount() {
    const accountId = $('#account-id').value.trim();
    const apiToken = $('#api-token').value.trim();
    
    if (!accountId || !apiToken) {
        showToast(state.language === 'zh' ? '请先填写 Account ID 和 API Token' : 'Please fill in Account ID and API Token first', 'error');
        return;
    }
    
    try {
        await API.post('/api/account', { accountId, apiToken });
        const data = await API.post('/api/account/verify');
        if (data.valid) {
            state.accountVerified = true;
            showToast(state.language === 'zh' ? '验证成功' : 'Verification successful', 'success');
        } else {
            state.accountVerified = false;
            showToast((state.language === 'zh' ? '验证失败: ' : 'Verification failed: ') + (data.error || (state.language === 'zh' ? '无效的凭证' : 'Invalid credentials')), 'error');
        }
    } catch (e) {
        state.accountVerified = false;
        showToast((state.language === 'zh' ? '验证失败: ' : 'Verification failed: ') + e.message, 'error');
    }
}

let installController = null;

async function installCloudflared() {
    const btn = $('#btn-install-cloudflared');
    const progressDiv = $('#install-progress');
    const statusBar = $('#install-status');
    const percentSpan = $('#install-percent');
    const progressBar = $('#install-progress-bar');
    const logDiv = $('#install-log');
    const cancelBtn = $('#btn-cancel-install');
    
    btn.disabled = true;
    btn.textContent = state.language === 'zh' ? '安装中...' : 'Installing...';
    progressDiv.classList.remove('hidden');
    logDiv.innerHTML = '';
    
    installController = new AbortController();
    
    const addLog = (msg, type = 'info') => {
        const time = new Date().toLocaleTimeString();
        const color = type === 'error' ? '#ef4444' : type === 'success' ? '#22c55e' : '#64748b';
        logDiv.innerHTML += `<div style="color: ${color};">[${time}] ${msg}</div>`;
        logDiv.scrollTop = logDiv.scrollHeight;
    };
    
    const updateProgress = (progress, status) => {
        progressBar.style.width = progress + '%';
        percentSpan.textContent = progress + '%';
        if (status) statusBar.textContent = status;
    };
    
    cancelBtn.onclick = () => {
        if (installController) {
            installController.abort();
            addLog(state.language === 'zh' ? '用户取消安装' : 'User cancelled installation', 'error');
            updateProgress(0, state.language === 'zh' ? '已取消' : 'Cancelled');
            setTimeout(() => {
                progressDiv.classList.add('hidden');
                btn.disabled = false;
                btn.textContent = t('settings.version.install');
            }, 1500);
        }
    };
    
    try {
        addLog(state.language === 'zh' ? '开始连接服务器...' : 'Connecting to server...');
        updateProgress(5, state.language === 'zh' ? '正在连接...' : 'Connecting...');
        
        const response = await fetch('/api/cloudflared/install', {
            method: 'POST',
            signal: installController.signal
        });
        
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const text = decoder.decode(value);
            const lines = text.split('\n');
            
            for (const line of lines) {
                if (line.startsWith('event:')) continue;
                if (line.startsWith('data:')) {
                    const data = line.substring(5).trim();
                    if (!data) continue;
                    
                    try {
                        const event = JSON.parse(data);
                        
                        if (event.stage === 'error' || event.error) {
                            addLog(event.message || event.error, 'error');
                            updateProgress(0, state.language === 'zh' ? '安装失败' : 'Installation failed');
                            setTimeout(() => {
                                progressDiv.classList.add('hidden');
                                btn.disabled = false;
                                btn.textContent = t('settings.version.install');
                            }, 2000);
                            return;
                        }
                        
                        if (event.stage === 'complete') {
                            addLog(event.message || (state.language === 'zh' ? '安装完成' : 'Installation complete'), 'success');
                            updateProgress(100, state.language === 'zh' ? '安装成功' : 'Installation successful');
                            showToast(`${state.language === 'zh' ? '安装成功: ' : 'Installation successful: '}${event.version}`, 'success');
                            await loadCloudflaredVersion();
                            setTimeout(() => {
                                progressDiv.classList.add('hidden');
                                btn.disabled = false;
                                btn.textContent = t('settings.version.install');
                            }, 1500);
                            return;
                        }
                        
                        addLog(event.message);
                        updateProgress(event.progress, event.message);
                        
                    } catch (e) {
                        console.log('Parse error:', e, data);
                    }
                }
            }
        }
        
    } catch (e) {
        if (e.name === 'AbortError') {
            addLog(state.language === 'zh' ? '安装已取消' : 'Installation cancelled', 'error');
        } else {
            addLog((state.language === 'zh' ? '安装失败: ' : 'Installation failed: ') + e.message, 'error');
            showToast((state.language === 'zh' ? '自动安装失败: ' : 'Auto installation failed: ') + e.message, 'error');
        }
        updateProgress(0, state.language === 'zh' ? '安装失败' : 'Installation failed');
        setTimeout(() => {
            progressDiv.classList.add('hidden');
            btn.disabled = false;
            btn.textContent = t('settings.version.install');
        }, 2000);
    }
}

async function uploadCloudflared() {
    const fileInput = $('#cloudflared-upload');
    const file = fileInput.files[0];
    if (!file) {
        showToast(state.language === 'zh' ? '请选择文件' : 'Please select a file', 'error');
        return;
    }
    
    try {
        showToast(state.language === 'zh' ? '正在上传...' : 'Uploading...', '');
        const formData = new FormData();
        formData.append('file', file);
        
        const response = await fetch('/api/cloudflared/upload', {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || (state.language === 'zh' ? '上传失败' : 'Upload failed'));
        }
        
        showToast(`${state.language === 'zh' ? '上传成功: ' : 'Upload successful: '}${data.version}`, 'success');
        await loadCloudflaredVersion();
    } catch (e) {
        showToast((state.language === 'zh' ? '上传失败: ' : 'Upload failed: ') + e.message, 'error');
    }
}

async function changePassword() {
    const oldPassword = $('#old-password').value;
    const newPassword = $('#new-password').value;
    
    try {
        await API.post('/api/auth/change-password', { oldPassword, newPassword });
        showToast(state.language === 'zh' ? '密码已修改' : 'Password changed', 'success');
        $('#old-password').value = '';
        $('#new-password').value = '';
    } catch (e) {
        showToast((state.language === 'zh' ? '修改失败: ' : 'Change failed: ') + e.message, 'error');
    }
}

async function logout() {
    try {
        await API.post('/api/auth/logout');
    } catch (e) {
        console.log('Logout API error:', e);
    }
    location.reload();
}

document.addEventListener('DOMContentLoaded', () => {
    $('#login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        await login($('#login-password').value);
    });
    
    $('#setup-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const pwd = $('#setup-password').value;
        const confirm = $('#setup-password-confirm').value;
        if (pwd !== confirm) {
            showToast('两次密码不一致', 'error');
            return;
        }
        await setup(pwd);
    });
    
    $('#btn-settings').addEventListener('click', () => showView('settings-view'));
    $('#btn-logout').addEventListener('click', logout);
    $('#btn-logout-settings').addEventListener('click', logout);
    
    $('#btn-create-tunnel').addEventListener('click', showCreateTunnelModal);
    $('#btn-back-tunnels').addEventListener('click', () => showView('tunnels-view'));
    $('#btn-back-main').addEventListener('click', () => showView('tunnels-view'));
    
    $('#account-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        await saveAccount();
    });
    
    $('#btn-verify-account').addEventListener('click', verifyAccount);
    $('#btn-toggle-token').addEventListener('click', () => {
        const input = $('#api-token');
        const icon = $('#toggle-token-icon');
        if (input.type === 'password') {
            input.type = 'text';
            icon.textContent = '🔒';
        } else {
            input.type = 'password';
            icon.textContent = '👁';
        }
    });
    $('#btn-install-cloudflared').addEventListener('click', installCloudflared);
    $('#btn-upload-cloudflared').addEventListener('click', () => $('#cloudflared-upload').click());
    $('#cloudflared-upload').addEventListener('change', uploadCloudflared);
    
    $('#change-password-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        await changePassword();
    });
    
    $('#btn-show-cf-guide').addEventListener('click', showCFGuide);
    
    $('#language-select').addEventListener('change', (e) => {
        setLanguage(e.target.value);
    });
    $('#language-select').value = state.language;
    
    $('.modal-overlay').addEventListener('click', hideModal);
    $('.modal-close').addEventListener('click', hideModal);
    
    checkAuth();
});

function renderApp() {
    document.title = t('app.title');
    document.querySelector('html').lang = state.language === 'zh' ? 'zh-CN' : 'en';
    
    // Login page
    const loginPage = document.querySelector('#login-page');
    if (loginPage) {
        const h1 = loginPage.querySelector('h1');
        if (h1) h1.textContent = 'Cloudflare Tunnel';
        const p = loginPage.querySelector('p');
        if (p) p.textContent = t('app.subtitle');
        const label = loginPage.querySelector('label');
        if (label) label.textContent = t('login.password');
        const input = loginPage.querySelector('#login-password');
        if (input) input.placeholder = t('login.placeholder');
        const btn = loginPage.querySelector('button[type="submit"]');
        if (btn) btn.textContent = t('login.button');
    }
    
    // Setup page
    const setupPage = document.querySelector('#setup-page');
    if (setupPage) {
        const h1 = setupPage.querySelector('h1');
        if (h1) h1.textContent = t('setup.title');
        const p = setupPage.querySelector('p');
        if (p) p.textContent = t('setup.subtitle');
        const labels = setupPage.querySelectorAll('label');
        if (labels[0]) labels[0].textContent = t('setup.password');
        if (labels[1]) labels[1].textContent = t('setup.confirm');
        const inputs = setupPage.querySelectorAll('input');
        if (inputs[0]) inputs[0].placeholder = t('setup.password.placeholder');
        if (inputs[1]) inputs[1].placeholder = t('setup.confirm.placeholder');
        const btn = setupPage.querySelector('button[type="submit"]');
        if (btn) btn.textContent = t('setup.button');
    }
    
    // Header buttons
    const btnSettings = document.querySelector('#btn-settings');
    if (btnSettings) btnSettings.title = t('header.settings');
    const btnLogout = document.querySelector('#btn-logout');
    if (btnLogout) btnLogout.title = t('header.logout');
    
    // Tunnels view
    const tunnelsView = document.querySelector('#tunnels-view');
    if (tunnelsView) {
        const h2 = tunnelsView.querySelector('h2');
        if (h2) h2.textContent = t('tunnels.title');
        const createBtn = tunnelsView.querySelector('#btn-create-tunnel');
        if (createBtn) {
            createBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
            </svg> ${t('tunnels.create')}`;
        }
    }
    
    // Tunnel detail view
    const tunnelDetailView = document.querySelector('#tunnel-detail-view');
    if (tunnelDetailView) {
        const backBtn = tunnelDetailView.querySelector('#btn-back-tunnels');
        if (backBtn) backBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="15 18 9 12 15 6"/>
        </svg> ${t('tunnels.back')}`;
        const h2 = tunnelDetailView.querySelector('#tunnel-detail-title');
        if (h2 && !state.currentTunnel) h2.textContent = t('tunnel.detail');
    }
    
    // Settings view
    const settingsView = document.querySelector('#settings-view');
    if (settingsView) {
        const backBtn = settingsView.querySelector('#btn-back-main');
        if (backBtn) backBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="15 18 9 12 15 6"/>
        </svg> ${t('tunnels.back')}`;
        const h2 = settingsView.querySelector('h2');
        if (h2) h2.textContent = t('settings.title');
        
        // Cloudflare config section
        const cfSection = settingsView.querySelectorAll('.settings-section')[0];
        if (cfSection) {
            const h3 = cfSection.querySelector('h3');
            if (h3) h3.textContent = t('settings.cf.config');
            const guideBtn = cfSection.querySelector('#btn-show-cf-guide');
            if (guideBtn) {
                guideBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: -2px; margin-right: 4px;">
                    <circle cx="12" cy="12" r="10"/>
                    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
                    <line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg> ${t('settings.cf.guide')}`;
            }
            const desc = cfSection.querySelector('.settings-desc');
            if (desc) desc.textContent = t('settings.cf.desc');
            const labels = cfSection.querySelectorAll('label');
            if (labels[0]) labels[0].textContent = t('settings.cf.accountId');
            if (labels[1]) labels[1].textContent = t('settings.cf.apiToken');
            const accountIdInput = cfSection.querySelector('#account-id');
            if (accountIdInput) accountIdInput.placeholder = state.language === 'zh' ? '在 Cloudflare 控制台右侧获取' : 'Get from Cloudflare Dashboard';
            const apiTokenInput = cfSection.querySelector('#api-token');
            if (apiTokenInput) apiTokenInput.placeholder = t('settings.cf.apiToken.placeholder');
            const verifyBtn = cfSection.querySelector('#btn-verify-account');
            if (verifyBtn) verifyBtn.textContent = t('settings.cf.verify');
            const saveBtn = cfSection.querySelector('#account-form button[type="submit"]');
            if (saveBtn) saveBtn.textContent = t('settings.cf.save');
        }
        
        // Version section
        const versionSection = settingsView.querySelectorAll('.settings-section')[1];
        if (versionSection) {
            const h3 = versionSection.querySelector('h3');
            if (h3) h3.textContent = t('settings.version.title');
            const installBtn = versionSection.querySelector('#btn-install-cloudflared');
            if (installBtn) installBtn.textContent = t('settings.version.install');
            const uploadSpan = versionSection.querySelectorAll('.version-info')[1];
            if (uploadSpan) {
                const span = uploadSpan.querySelector('span');
                if (span) span.textContent = t('settings.version.manualUpload') + ':';
            }
            const uploadBtn = versionSection.querySelector('#btn-upload-cloudflared');
            if (uploadBtn) uploadBtn.textContent = t('settings.version.upload');
            
            // Status badge
            const statusBadge = versionSection.querySelector('#cloudflared-status-badge');
            if (statusBadge) {
                const isInstalled = !statusBadge.classList.contains('status-badge-error');
                statusBadge.textContent = isInstalled ? t('settings.version.installed') : t('settings.version.notInstalled');
            }
            
            // Install progress section
            const installStatus = versionSection.querySelector('#install-status');
            if (installStatus) installStatus.textContent = t('settings.version.preparing');
            const cancelBtn = versionSection.querySelector('#btn-cancel-install');
            if (cancelBtn) cancelBtn.textContent = t('settings.version.cancelInstall');
            
            // Help text
            const helpDiv = versionSection.querySelector('div[style*="background: #f5f5f5"]');
            if (helpDiv) {
                const strong = helpDiv.querySelector('strong');
                if (strong) strong.textContent = state.language === 'zh' ? '无法联网？' : 'Cannot connect to internet?';
                const link = helpDiv.querySelector('a');
                if (link) link.textContent = state.language === 'zh' ? 'Cloudflare 官方 GitHub' : 'Cloudflare Official GitHub';
                const helpText = helpDiv.querySelector('div[style*="color: #666"]');
                if (helpText) {
                    const systemLabel = helpText.childNodes[0];
                    if (systemLabel) systemLabel.textContent = state.language === 'zh' ? '当前系统: ' : 'Current System: ';
                }
                const systemArch = versionSection.querySelector('#system-arch');
                if (systemArch && systemArch.textContent.includes('检测')) {
                    systemArch.textContent = state.language === 'zh' ? '检测中...' : 'Detecting...';
                }
            }
        }
        
        // Language section
        const languageSection = settingsView.querySelectorAll('.settings-section')[2];
        if (languageSection) {
            const h3 = languageSection.querySelector('h3');
            if (h3) h3.textContent = t('settings.language');
        }
        
        // Password section
        const passwordSection = settingsView.querySelectorAll('.settings-section')[3];
        if (passwordSection) {
            const h3 = passwordSection.querySelector('h3');
            if (h3) h3.textContent = t('settings.password.change');
            const labels = passwordSection.querySelectorAll('label');
            if (labels[0]) labels[0].textContent = t('settings.password.current');
            if (labels[1]) labels[1].textContent = t('settings.password.new');
            const submitBtn = passwordSection.querySelector('button[type="submit"]');
            if (submitBtn) submitBtn.textContent = t('settings.password.submit');
        }
        
        // Logout section
        const logoutSection = settingsView.querySelectorAll('.settings-section')[4];
        if (logoutSection) {
            const h3 = logoutSection.querySelector('h3');
            if (h3) h3.textContent = t('settings.logout.title');
            const p = logoutSection.querySelector('p');
            if (p) p.textContent = t('settings.logout.desc');
            const logoutBtn = logoutSection.querySelector('#btn-logout-settings');
            if (logoutBtn) {
                logoutBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                    <polyline points="16 17 21 12 16 7"/>
                    <line x1="21" y1="12" x2="9" y2="12"/>
                </svg> ${t('settings.logout.button')}`;
            }
        }
    }
    
    $('#settings-language-title').textContent = t('settings.language');
    
    if (state.currentTunnel) {
        showTunnelDetail(state.currentTunnel.id || state.currentTunnel.tunnelId);
    } else {
        loadTunnels();
    }
}
