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
        'connectors.title': '连接器 (Connectors)',
        'connectors.desc': '查看 Cloudflare 网络与您的基础设施之间建立的连接',
        'connectors.id': 'Connector ID',
        'connectors.hostname': 'Hostname',
        'connectors.datacenter': 'Data centers',
        'connectors.originIP': 'Origin IP',
        'connectors.version': 'Version',
        'connectors.platform': 'Platform',
        'connectors.status': 'Status',
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
        'modal.addRoute': 'Add published application',
        'modal.editRoute': 'Edit published application',
        'modal.cancel': 'Cancel',
        'modal.add': 'Add route',
        'modal.save': 'Save',
        'modal.loadingZones': '正在加载域名列表...',
        'toast.tunnelStarted': '隧道已启动',
        'toast.tunnelStopped': '隧道已停止',
        'toast.tunnelDeleted': '隧道已删除',
        'toast.switched': '已切换到隧道',
        'toast.saved': '保存成功',
        'toast.error': '操作失败'
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
        'connectors.desc': 'Review established connections between Cloudflare\'s network and your infrastructure',
        'connectors.id': 'Connector ID',
        'connectors.hostname': 'Hostname',
        'connectors.datacenter': 'Data centers',
        'connectors.originIP': 'Origin IP',
        'connectors.version': 'Version',
        'connectors.platform': 'Platform',
        'connectors.status': 'Status',
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
        'modal.addRoute': 'Add published application',
        'modal.editRoute': 'Edit published application',
        'modal.cancel': 'Cancel',
        'modal.add': 'Add route',
        'modal.save': 'Save',
        'modal.loadingZones': 'Loading domains...',
        'toast.tunnelStarted': 'Tunnel started',
        'toast.tunnelStopped': 'Tunnel stopped',
        'toast.tunnelDeleted': 'Tunnel deleted',
        'toast.switched': 'Switched to tunnel',
        'toast.saved': 'Saved successfully',
        'toast.error': 'Operation failed'
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
            showToast('加载隧道失败: ' + e.message, 'error');
        }
    }
}

async function loadZones() {
    try {
        state.zones = await API.get('/api/zones');
        console.log('Loaded zones:', state.zones.length, state.zones);
    } catch (e) {
        console.error('Failed to load zones:', e);
        showToast('加载域名列表失败: ' + e.message, 'error');
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
        list.innerHTML = '<div class="empty-state">暂无隧道，点击上方按钮创建</div>';
        return;
    }
    
    let statusText = '';
    if (state.tunnels.some(t => t.running)) {
        statusText = `<span class="status-badge status-badge-success" style="margin-left: 8px;">运行中</span>`;
    }
    
    list.innerHTML = `
        <div class="tunnels-table-container">
            <table class="tunnels-table">
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>ID</th>
                        <th>Status</th>
                        <th>Replicas</th>
                        <th>Routes</th>
                        <th>Created</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${state.tunnels.map(t => {
                        let statusLabel = 'Down';
                        let statusClass = 'down';
                        const cfStatus = (t.status || '').toLowerCase();
                        
                        if (t.running) {
                            statusLabel = 'Running';
                            statusClass = 'running';
                        } else if (cfStatus === 'healthy') {
                            statusLabel = 'Healthy';
                            statusClass = 'healthy';
                        } else if (cfStatus === 'degraded') {
                            statusLabel = 'Degraded';
                            statusClass = 'degraded';
                        } else if (cfStatus === 'inactive') {
                            statusLabel = 'Inactive';
                            statusClass = 'inactive';
                        } else if (cfStatus === 'down') {
                            statusLabel = 'Down';
                            statusClass = 'down';
                        }
                        
                        const routesCount = (t.hostnames || []).length;
                        const routesText = routesCount > 0 ? `${routesCount} app${routesCount > 1 ? 's' : ''}` : 'No routes';
                        
                        return `
                        <tr data-id="${t.id || t.tunnelId}" ${t.running ? 'class="row-running"' : ''}>
                            <td>
                                <a href="javascript:void(0)" onclick="showTunnelDetail('${t.id || t.tunnelId}')" style="color: var(--primary); text-decoration: underline; font-weight: 500;">${t.name}</a>
                                ${t.running ? '<span class="active-badge">使用中</span>' : ''}
                            </td>
                            <td><code style="font-size: 12px; background: #f3f4f6; padding: 2px 6px; border-radius: 4px;">${t.tunnelId}</code></td>
                            <td><span class="status-tag ${statusClass}">${statusLabel}</span></td>
                            <td>${t.connections || 0}</td>
                            <td><span style="display: inline-flex; align-items: center; gap: 4px;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>${routesText}</span></td>
                            <td>${t.createdAt ? new Date(t.createdAt).toLocaleDateString() : '-'}</td>
                            <td class="actions-cell">
                                ${!t.running ? `<button class="btn btn-primary btn-sm" onclick="event.stopPropagation(); useTunnel('${t.id || t.tunnelId}')">使用</button>` : `<button class="btn btn-secondary btn-sm" onclick="event.stopPropagation(); stopTunnel('${t.id}')">停止</button>`}
                                <button class="btn btn-secondary btn-sm" onclick="event.stopPropagation(); showTunnelDetail('${t.id || t.tunnelId}')">详情</button>
                                <button class="btn btn-danger btn-sm" onclick="event.stopPropagation(); deleteTunnel('${t.id || t.tunnelId}')">删除</button>
                            </td>
                        </tr>
                    `}).join('')}
                </tbody>
            </table>
            <div style="padding: 8px 16px; font-size: 13px; color: var(--text-light); border-top: 1px solid var(--border);">
                Showing 1-${state.tunnels.length} of ${state.tunnels.length}
            </div>
        </div>
    `;
}

async function showCreateTunnelModal() {
    if (!state.accountVerified) {
        showToast('请验证 Cloudflare 账号', 'error');
        showView('settings-view');
        return;
    }
    
    showModal('创建隧道', `
        <form id="create-tunnel-form">
            <div class="form-group">
                <label>隧道名称</label>
                <input type="text" id="tunnel-name" placeholder="例如: my-tunnel" required>
            </div>
            <div style="padding: 12px; background: #f0f9ff; border-radius: 8px; border: 1px solid #bae6fd; margin-top: 8px;">
                <div style="display: flex; align-items: flex-start; gap: 8px;">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0284c7" stroke-width="2" style="flex-shrink: 0; margin-top: 2px;">
                        <circle cx="12" cy="12" r="10"/>
                        <line x1="12" y1="16" x2="12" y2="12"/>
                        <line x1="12" y1="8" x2="12.01" y2="8"/>
                    </svg>
                    <span style="font-size: 13px; color: #0369a1;">推荐一台服务器使用独立隧道，方便管理地址映射</span>
                </div>
            </div>
        </form>
    `, `
        <button class="btn btn-secondary" onclick="hideModal()">取消</button>
        <button class="btn btn-primary" onclick="createTunnel()">创建</button>
    `);
}

async function createTunnel() {
    const name = $('#tunnel-name').value.trim();
    
    if (!name) {
        showToast('请输入隧道名称', 'error');
        return;
    }
    
    const existingTunnel = state.tunnels.find(t => t.name === name);
    if (existingTunnel) {
        showToast('已存在同名隧道，请使用其他名称', 'error');
        return;
    }
    
    try {
        await API.post('/api/tunnels', { name });
        hideModal();
        showToast('隧道创建成功', 'success');
        await loadTunnels();
    } catch (e) {
        let msg = e.message;
        if (msg.includes('already have a tunnel with this name')) {
            msg = 'Cloudflare 上已存在同名隧道，请使用其他名称';
        }
        showToast('创建失败: ' + msg, 'error');
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
                    <div class="connectors-section" style="margin-top: 20px; background: white; border-radius: 12px; border: 1px solid var(--border); overflow: hidden;">
                        <div class="section-header" style="padding: 16px 20px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center;">
                            <h3 style="margin: 0; font-size: 16px;">${t('connectors.title')}</h3>
                            <span style="font-size: 13px; color: var(--text-light);">Showing ${connectors.length} of ${connectors.length}</span>
                        </div>
                        <div style="padding: 12px 16px; font-size: 13px; color: var(--text-secondary); background: #f8fafc; border-bottom: 1px solid var(--border);">
                            ${t('connectors.desc')}
                        </div>
                        <div style="overflow-x: auto;">
                            <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                                <thead>
                                    <tr style="background: #f8fafc; border-bottom: 2px solid var(--border);">
                                        <th style="padding: 10px 12px; text-align: left; font-weight: 600; color: var(--text-secondary);">${t('connectors.id')}</th>
                                        <th style="padding: 10px 12px; text-align: left; font-weight: 600; color: var(--text-secondary);">${t('connectors.hostname')}</th>
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
                                            <td style="padding: 10px 12px;">${c.clientID || '-'}</td>
                                            <td style="padding: 10px 12px;">${c.coloName || '-'}</td>
                                            <td style="padding: 10px 12px;"><code>${c.originIP || '-'}</code></td>
                                            <td style="padding: 10px 12px;">${c.version || '-'}</td>
                                            <td style="padding: 10px 12px;">${c.platform || '-'}</td>
                                            <td style="padding: 10px 12px;">
                                                <span class="status-tag ${c.isPending ? 'degraded' : 'running'}">${c.isPending ? 'Reconnecting' : 'Connected'}</span>
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
            <div class="tunnel-detail-info">
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
                        <label>${t('tunnel.connections')}</label>
                        <span>${tunnel.connections?.length || 0}</span>
                    </div>
                    <div class="info-item">
                        <label>${t('tunnel.created')}</label>
                        <span>${tunnel.createdAt ? new Date(tunnel.createdAt).toLocaleString() : '-'}</span>
                    </div>
                </div>
                <div class="tunnel-actions" style="margin-top: 16px;">
                    ${!tunnel.running 
                        ? `<button class="btn btn-primary" onclick="event.stopPropagation(); useTunnel('${tunnel.id || tunnel.tunnelId}')">${t('tunnel.use')}</button>`
                        : `<button class="btn btn-secondary" onclick="event.stopPropagation(); stopTunnel('${tunnel.id || tunnel.tunnelId}')">${t('tunnel.stop')}</button>`
                    }
                    <button class="btn btn-danger" onclick="event.stopPropagation(); deleteTunnel('${tunnel.id || tunnel.tunnelId}')">${t('tunnel.delete')}</button>
                </div>
            </div>
            
            ${connectorsHTML}
            
            <div class="hostnames-section">
                <div class="section-header">
                    <h3>${t('routes.title')}</h3>
                    <button class="btn btn-primary btn-sm" onclick="showAddHostnameModal()">${t('routes.add')}</button>
                </div>
                ${renderHostnames()}
            </div>
        `;
        
        showView('tunnel-detail-view');
    } catch (e) {
        showToast('加载详情失败: ' + e.message, 'error');
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
        showToast('隧道已启动', 'success');
        await loadTunnels();
        if (state.currentTunnel?.id === id) {
            await showTunnelDetail(id);
        }
    } catch (e) {
        showToast('启动失败: ' + e.message, 'error');
    }
}

async function useTunnel(id) {
    if (!confirm('确定要使用此隧道吗？这将停止当前运行的隧道并切换到该隧道。')) return;
    
    try {
        const runningTunnel = state.tunnels.find(t => t.running && t.id !== id);
        if (runningTunnel) {
            await API.post(`/api/tunnels/${runningTunnel.id}/stop`);
        }
        
        await API.post(`/api/tunnels/${id}/start`);
        showToast(`已切换到隧道: ${state.tunnels.find(t => t.id === id || t.tunnelId === id)?.name || id}`, 'success');
        await loadTunnels();
        if (state.currentTunnel?.id === id || state.currentTunnel?.tunnelId === id) {
            await showTunnelDetail(id);
        }
    } catch (e) {
        showToast('切换失败: ' + e.message, 'error');
    }
}

async function stopTunnel(id) {
    try {
        await API.post(`/api/tunnels/${id}/stop`);
        showToast('隧道已停止', 'success');
        await loadTunnels();
        if (state.currentTunnel?.id === id || state.currentTunnel?.tunnelId === id) {
            await showTunnelDetail(state.currentTunnel?.id || state.currentTunnel?.tunnelId);
        }
    } catch (e) {
        showToast('停止失败: ' + e.message, 'error');
    }
}

async function deleteTunnel(id) {
    if (!confirm('确定要删除这个隧道吗？')) return;
    try {
        await API.del(`/api/tunnels/${id}`);
        showToast('隧道已删除', 'success');
        await loadTunnels();
        showView('tunnels-view');
    } catch (e) {
        showToast('删除失败: ' + e.message, 'error');
    }
}

async function showLogsModal(id) {
    try {
        const data = await API.get(`/api/tunnels/${id}/logs`);
        showModal('隧道日志', `
            <div class="logs-container">
                <pre class="logs-content">${data.logs || '暂无日志'}</pre>
            </div>
        `, `
            <button class="btn btn-secondary" onclick="clearLogs('${id}')">清空日志</button>
            <button class="btn btn-primary" onclick="hideModal()">关闭</button>
        `);
    } catch (e) {
        showToast('加载日志失败: ' + e.message, 'error');
    }
}

async function clearLogs(id) {
    try {
        await API.del(`/api/tunnels/${id}/logs`);
        showToast('日志已清空', 'success');
        await showLogsModal(id);
    } catch (e) {
        showToast('清空失败: ' + e.message, 'error');
    }
}

async function showAddHostnameModal() {
    showModal('Add published application', `
        <div style="text-align: center; padding: 40px 20px;">
            <div class="loading-spinner"></div>
            <p style="margin-top: 12px; color: var(--text-light);">正在加载域名列表...</p>
        </div>
    `, '');
    
    try {
        await loadZones();
    } catch (e) {
        hideModal();
        return;
    }
    
    const zoneOptions = state.zones.map(z => `<option value="${z.id}" data-name="${z.name}">${z.name}</option>`).join('');
    
    $('#modal-title').textContent = 'Add published application';
    $('#modal-body').innerHTML = `
        <p style="font-size: 13px; color: var(--text-light); margin-bottom: 16px;">Publish a local application to the Internet via public hostname. DNS will be automatically configured. <a href="https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/routing-to-tunnel/" target="_blank" style="color: var(--primary);">Learn more about routing to tunnels ↗</a></p>
        <form id="hostname-form">
            <div class="form-group">
                <label>Hostname</label>
                <div class="form-row">
                    <div style="flex: 1;">
                        <input type="text" id="subdomain" placeholder="e.g., www, blog, api" value="">
                        <div class="form-hint">Subdomain (optional)</div>
                    </div>
                    <div style="flex: 1.5;">
                        <select id="zone-select" onchange="updateFullHostname()" required>
                            <option value="">Select a zone from your account</option>
                            ${zoneOptions}
                        </select>
                        <div class="form-hint">Domain *</div>
                    </div>
                </div>
            </div>
            <div id="full-hostname-preview" class="full-hostname-preview hidden">
                <label>Full hostname:</label>
                <span id="full-hostname-value"></span>
            </div>
            <div class="form-group">
                <label>Path (optional)</label>
                <input type="text" id="path-pattern" placeholder="^/blog" oninput="updatePathHint()">
                <div class="form-hint"></div>
            </div>
            <div id="path-matching-info" class="path-matching-info hidden" style="padding: 12px; background: #eff6ff; border-radius: 6px; margin-bottom: 12px;">
                <div style="font-size: 13px; font-weight: 500; color: #1e40af; margin-bottom: 8px;">How path matching works</div>
                <div style="font-size: 12px; color: #3b82f6; line-height: 1.8;">
                    The path field uses regex patterns. Common examples:
                    <ul style="margin: 4px 0 0 16px; padding: 0;">
                        <li>Match all paths: leave empty</li>
                        <li>Match anywhere in path: <code>blog</code> (matches /blog, /archive/blog/post, etc.)</li>
                        <li>Match path prefix: <code>^/api</code></li>
                        <li>Match files by extension: <code>\\.(jpg|png|css|js)$</code></li>
                    </ul>
                </div>
                <a href="#" onclick="return false;" style="color: #2563eb; font-size: 12px; margin-top: 4px; display: inline-block;">Learn more →</a>
            </div>
            <div class="form-group">
                <label>Service *</label>
                <div class="form-row" style="margin-top: 8px;">
                    <div style="flex: 1;">
                        <select id="service-type" onchange="updateServicePlaceholder()" style="width: 100%; padding: 10px 12px; border: 1px solid var(--border); border-radius: 8px; font-size: 14px; background: white;">
                            <option value="">Select...</option>
                            <option value="http://">HTTP</option>
                            <option value="https://">HTTPS</option>
                            <option value="unix://">UNIX</option>
                            <option value="tcp://">TCP</option>
                            <option value="ssh://">SSH</option>
                            <option value="rdp://">RDP</option>
                            <option value="unix+tls://">UNIX+TLS</option>
                            <option value="smb://">SMB</option>
                            <option value="http_status:404">HTTP_STATUS</option>
                        </select>
                        <div class="form-hint">Type (Required)</div>
                    </div>
                    <div style="flex: 2; display: flex; align-items: flex-start; gap: 4px; position: relative;">
                        <span style="position: absolute; left: 12px; top: 38px; color: var(--text-light); font-weight: 500; pointer-events: none;" id="service-prefix">//</span>
                        <input type="text" id="service" placeholder="localhost:8080" required style="flex: 1; padding-left: 24px;">
                        <div class="form-hint">URL (Required)</div>
                    </div>
                </div>
                <div id="service-hint" style="font-size: 12px; color: var(--text-light); margin-top: 4px;">
                    Route traffic to (e.g., https://localhost:8080, tcp://localhost:3306)
                </div>
            </div>
        </form>
    `;
    $('#modal-footer').innerHTML = `
        <button class="btn btn-secondary" onclick="hideModal()">Cancel</button>
        <button class="btn btn-primary" onclick="addHostname()">Add route</button>
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
        '': { placeholder: 'localhost:8080', prefix: '//', hint: 'Route traffic to (e.g., https://localhost:8080, tcp://localhost:3306)' },
        'http://': { placeholder: 'localhost:8080', prefix: 'http://', hint: 'HTTP service URL' },
        'https://': { placeholder: 'localhost:8443', prefix: 'https://', hint: 'HTTPS service URL' },
        'unix://': { placeholder: '/var/run/app.sock', prefix: 'unix://', hint: 'Unix socket path' },
        'tcp://': { placeholder: 'localhost:3306', prefix: 'tcp://', hint: 'TCP service address (for databases, etc.)' },
        'ssh://': { placeholder: 'localhost:22', prefix: 'ssh://', hint: 'SSH service address' },
        'rdp://': { placeholder: 'localhost:3389', prefix: 'rdp://', hint: 'RDP (Remote Desktop Protocol) address' },
        'unix+tls://': { placeholder: '/var/run/app.sock', prefix: 'unix+tls://', hint: 'Unix socket with TLS encryption' },
        'smb://': { placeholder: '\\\\server\\share', prefix: 'smb://', hint: 'SMB/CIFS share path' },
        'http_status:404': { placeholder: '', prefix: 'http_status:', hint: 'Return HTTP status code (e.g., 404, 503)' }
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
        showToast('请填写完整信息', 'error');
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
    
    showModal('Edit published application', `
        <div style="text-align: center; padding: 40px 20px;">
            <div class="loading-spinner"></div>
            <p style="margin-top: 12px; color: var(--text-light);">正在加载域名列表...</p>
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
    
    $('#modal-title').textContent = 'Edit published application';
    $('#modal-body').innerHTML = `
        <form id="hostname-form">
            <div class="form-group">
                <label>Hostname</label>
                <div class="form-row">
                    <div style="flex: 1;">
                        <input type="text" id="subdomain" placeholder="e.g., www, blog, api" value="${subdomain}">
                        <div class="form-hint">Subdomain (optional)</div>
                    </div>
                    <div style="flex: 1.5;">
                        <select id="zone-select" onchange="updateFullHostname()">
                            ${zoneOptions}
                        </select>
                        <div class="form-hint">Domain *</div>
                    </div>
                </div>
            </div>
            <div id="full-hostname-preview" class="full-hostname-preview" style="display: block;">
                <label>Full hostname:</label>
                <span id="full-hostname-value">${h.hostname}</span>
            </div>
            <div class="form-group">
                <label>Path (optional)</label>
                <input type="text" id="path-pattern" placeholder="^/blog" value="${h.path || ''}" oninput="updatePathHint()">
            </div>
            <div class="form-group">
                <label>Service URL *</label>
                <input type="text" id="service" placeholder="https://localhost:8080" value="${h.service}" required>
                <div class="form-hint">The origin service to route traffic to (e.g., https://localhost:8080, tcp://localhost:3306)</div>
            </div>
        </form>
    `;
    $('#modal-footer').innerHTML = `
        <button class="btn btn-secondary" onclick="hideModal()">Cancel</button>
        <button class="btn btn-primary" onclick="saveHostnameEdit(${index})">Save</button>
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
        showToast('请填写完整信息', 'error');
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
    if (!confirm('确定要删除这个映射吗？')) return;
    state.hostnames.splice(index, 1);
    await saveHostnames();
}

async function saveHostnames() {
    try {
        await API.put(`/api/tunnels/${state.currentTunnel.id}/hostnames`, { hostnames: state.hostnames });
        hideModal();
        showToast('保存成功', 'success');
        await showTunnelDetail(state.currentTunnel.id);
    } catch (e) {
        showToast('保存失败: ' + e.message, 'error');
    }
}

async function saveAccount() {
    const accountId = $('#account-id').value.trim();
    const apiToken = $('#api-token').value.trim();
    
    try {
        await API.post('/api/account', { accountId, apiToken });
        showToast('账号配置已保存', 'success');
    } catch (e) {
        showToast('保存失败: ' + e.message, 'error');
    }
}

async function verifyAccount() {
    const accountId = $('#account-id').value.trim();
    const apiToken = $('#api-token').value.trim();
    
    if (!accountId || !apiToken) {
        showToast('请先填写 Account ID 和 API Token', 'error');
        return;
    }
    
    try {
        await API.post('/api/account', { accountId, apiToken });
        const data = await API.post('/api/account/verify');
        if (data.valid) {
            state.accountVerified = true;
            showToast('验证成功', 'success');
        } else {
            state.accountVerified = false;
            showToast('验证失败: ' + (data.error || '无效的凭证'), 'error');
        }
    } catch (e) {
        state.accountVerified = false;
        showToast('验证失败: ' + e.message, 'error');
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
    btn.textContent = '安装中...';
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
            addLog('用户取消安装', 'error');
            updateProgress(0, '已取消');
            setTimeout(() => {
                progressDiv.classList.add('hidden');
                btn.disabled = false;
                btn.textContent = '自动安装';
            }, 1500);
        }
    };
    
    try {
        addLog('开始连接服务器...');
        updateProgress(5, '正在连接...');
        
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
                            updateProgress(0, '安装失败');
                            setTimeout(() => {
                                progressDiv.classList.add('hidden');
                                btn.disabled = false;
                                btn.textContent = '自动安装';
                            }, 2000);
                            return;
                        }
                        
                        if (event.stage === 'complete') {
                            addLog(event.message || '安装完成', 'success');
                            updateProgress(100, '安装成功');
                            showToast(`安装成功: ${event.version}`, 'success');
                            await loadCloudflaredVersion();
                            setTimeout(() => {
                                progressDiv.classList.add('hidden');
                                btn.disabled = false;
                                btn.textContent = '自动安装';
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
            addLog('安装已取消', 'error');
        } else {
            addLog('安装失败: ' + e.message, 'error');
            showToast('自动安装失败: ' + e.message, 'error');
        }
        updateProgress(0, '安装失败');
        setTimeout(() => {
            progressDiv.classList.add('hidden');
            btn.disabled = false;
            btn.textContent = '自动安装';
        }, 2000);
    }
}

async function uploadCloudflared() {
    const fileInput = $('#cloudflared-upload');
    const file = fileInput.files[0];
    if (!file) {
        showToast('请选择文件', 'error');
        return;
    }
    
    try {
        showToast('正在上传...', '');
        const formData = new FormData();
        formData.append('file', file);
        
        const response = await fetch('/api/cloudflared/upload', {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || '上传失败');
        }
        
        showToast('上传成功: ' + data.version, 'success');
        await loadCloudflaredVersion();
    } catch (e) {
        showToast('上传失败: ' + e.message, 'error');
    }
}

async function changePassword() {
    const oldPassword = $('#old-password').value;
    const newPassword = $('#new-password').value;
    
    try {
        await API.post('/api/auth/change-password', { oldPassword, newPassword });
        showToast('密码已修改', 'success');
        $('#old-password').value = '';
        $('#new-password').value = '';
    } catch (e) {
        showToast('修改失败: ' + e.message, 'error');
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
    
    const loginSubtitle = document.querySelector('#login-page p');
    if (loginSubtitle) loginSubtitle.textContent = t('app.subtitle');
    
    const setupSubtitle = document.querySelector('#setup-page p');
    if (setupSubtitle) setupSubtitle.textContent = t('setup.subtitle');
    
    $('#settings-language-title').textContent = t('settings.language');
    
    if (state.currentTunnel) {
        showTunnelDetail(state.currentTunnel.id || state.currentTunnel.tunnelId);
    } else {
        loadTunnels();
    }
}
