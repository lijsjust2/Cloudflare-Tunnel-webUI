let authToken = '';
let tunnels = [];
let selectedTunnelId = null;
let editingTunnelId = null;
let editingHostnameId = null;
let cloudflaredInstalled = false;

async function api(method, path, body = null) {
    const opts = {
        method,
        headers: { 'Content-Type': 'application/json' },
    };
    if (authToken) {
        opts.headers['X-Auth-Token'] = authToken;
    }
    if (body) {
        opts.body = JSON.stringify(body);
    }
    const res = await fetch(`/api${path}`, opts);
    const data = await res.json();
    if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
    }
    return data;
}

function toast(msg, type = 'info') {
    const container = document.getElementById('toast-container');
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.textContent = msg;
    container.appendChild(el);
    setTimeout(() => el.remove(), 3000);
}

function showPage(id) {
    document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
    document.getElementById(id).classList.remove('hidden');
}

function openModal(id) {
    document.getElementById(id).classList.remove('hidden');
}

function closeModal(id) {
    document.getElementById(id).classList.add('hidden');
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function init() {
    try {
        const status = await api('GET', '/auth/status');
        if (status.needSetup) {
            showPage('setup-page');
            return;
        }

        const savedToken = localStorage.getItem('authToken');
        if (savedToken) {
            authToken = savedToken;
            try {
                await api('GET', '/tunnels');
                enterApp();
                return;
            } catch (e) {
                authToken = '';
                localStorage.removeItem('authToken');
            }
        }

        showPage('login-page');
    } catch (e) {
        toast('无法连接到服务器', 'error');
    }
}

document.getElementById('setup-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const pw = document.getElementById('setup-password').value;
    const confirm = document.getElementById('setup-confirm').value;
    const errEl = document.getElementById('setup-error');

    if (pw !== confirm) {
        errEl.textContent = '两次输入的密码不一致';
        errEl.classList.remove('hidden');
        return;
    }
    if (pw.length < 6) {
        errEl.textContent = '密码至少需要6位';
        errEl.classList.remove('hidden');
        return;
    }

    try {
        const res = await api('POST', '/auth/setup', { password: pw });
        authToken = res.token;
        localStorage.setItem('authToken', authToken);
        toast('密码设置成功', 'success');
        enterApp();
    } catch (e) {
        errEl.textContent = e.message;
        errEl.classList.remove('hidden');
    }
});

document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const pw = document.getElementById('login-password').value;
    const errEl = document.getElementById('login-error');

    try {
        const res = await api('POST', '/auth/login', { password: pw });
        authToken = res.token;
        localStorage.setItem('authToken', authToken);
        enterApp();
    } catch (e) {
        errEl.textContent = '密码错误';
        errEl.classList.remove('hidden');
    }
});

async function enterApp() {
    showPage('main-page');
    await loadTunnels();
    await checkCloudflaredVersion();

    if (!cloudflaredInstalled) {
        document.getElementById('btn-cloudflared-manage').click();
    }
}

document.getElementById('btn-change-password').addEventListener('click', () => {
    document.getElementById('password-form').reset();
    document.getElementById('password-error').classList.add('hidden');
    openModal('modal-password');
});

document.getElementById('password-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const oldPassword = document.getElementById('old-password').value;
    const newPassword = document.getElementById('new-password').value;
    const confirmPassword = document.getElementById('confirm-password').value;
    const errorEl = document.getElementById('password-error');

    if (newPassword !== confirmPassword) {
        errorEl.textContent = '两次输入的新密码不一致';
        errorEl.classList.remove('hidden');
        return;
    }

    try {
        await api('POST', '/auth/change-password', { oldPassword, newPassword });
        closeModal('modal-password');
        toast('密码修改成功', 'success');
    } catch (e) {
        errorEl.textContent = e.message;
        errorEl.classList.remove('hidden');
    }
});

document.getElementById('btn-logout').addEventListener('click', () => {
    authToken = '';
    localStorage.removeItem('authToken');
    selectedTunnelId = null;
    showPage('login-page');
    toast('已退出登录', 'info');
});

document.getElementById('btn-account').addEventListener('click', async () => {
    try {
        const account = await api('GET', '/account');
        document.getElementById('acc-id').value = account.accountId || '';
        document.getElementById('acc-token').value = account.apiToken || '';
        openModal('modal-account');
    } catch (e) {
        toast('获取账号信息失败', 'error');
    }
});

document.getElementById('account-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = {
        accountId: document.getElementById('acc-id').value,
        apiToken: document.getElementById('acc-token').value,
    };

    try {
        await api('POST', '/account', data);
        closeModal('modal-account');
        toast('账号配置已保存', 'success');
    } catch (e) {
        toast(e.message, 'error');
    }
});

async function loadTunnels() {
    try {
        tunnels = await api('GET', '/tunnels');
        renderTunnelList();
    } catch (e) {
        toast('加载隧道列表失败: ' + e.message, 'error');
    }
}

function renderTunnelList() {
    const list = document.getElementById('tunnel-list');

    if (tunnels.length === 0) {
        list.innerHTML = '<div class="empty-state"><p>暂无隧道</p><p class="text-muted">点击 + 添加第一个</p></div>';
        return;
    }

    list.innerHTML = tunnels.map(t => `
        <div class="server-item ${t.id === selectedTunnelId ? 'active' : ''}" data-id="${t.id}" onclick="selectTunnel('${t.id}')">
            <span class="status-indicator ${t.running ? 'running' : 'stopped'}"></span>
            <div>
                <div class="server-name">${escapeHtml(t.name)}</div>
                <div class="server-addr">${escapeHtml(t.tunnelId ? t.tunnelId.substring(0, 8) + '...' : '未配置')}</div>
            </div>
        </div>
    `).join('');
}

function selectTunnel(id) {
    selectedTunnelId = id;
    renderTunnelList();
    renderTunnelDetail();
}

function renderTunnelDetail() {
    const tunnel = tunnels.find(t => t.id === selectedTunnelId);
    if (!tunnel) {
        document.getElementById('no-selection').classList.remove('hidden');
        document.getElementById('tunnel-detail').classList.add('hidden');
        return;
    }

    document.getElementById('no-selection').classList.add('hidden');
    document.getElementById('tunnel-detail').classList.remove('hidden');

    document.getElementById('tunnel-detail-name').textContent = tunnel.name;

    const dot = document.getElementById('tunnel-running-dot');
    const toggleText = document.getElementById('btn-toggle-text');
    const toggleBtn = document.getElementById('btn-toggle-tunnel');

    if (tunnel.running) {
        dot.className = 'status-indicator running';
        toggleText.textContent = '停止';
        toggleBtn.classList.add('btn-danger');
    } else {
        dot.className = 'status-indicator stopped';
        toggleText.textContent = '启动';
        toggleBtn.classList.remove('btn-danger');
    }

    const grid = document.getElementById('tunnel-config-grid');
    grid.innerHTML = `
        <div class="config-item">
            <div class="label">隧道名称</div>
            <div class="value">${escapeHtml(tunnel.name)}</div>
        </div>
        <div class="config-item">
            <div class="label">Tunnel ID</div>
            <div class="value" style="font-size: 12px;">${escapeHtml(tunnel.tunnelId || '-')}</div>
        </div>
        <div class="config-item">
            <div class="label">协议</div>
            <div class="value">${escapeHtml(tunnel.protocol || 'auto')}</div>
        </div>
        <div class="config-item">
            <div class="label">日志级别</div>
            <div class="value">${escapeHtml(tunnel.logLevel || 'info')}</div>
        </div>
    `;

    renderHostnameTable(tunnel.hostnames || []);
    refreshLogs();
}

function renderHostnameTable(hostnames) {
    const tbody = document.getElementById('hostname-table-body');
    const emptyEl = document.getElementById('hostname-empty');
    const tableEl = document.getElementById('hostname-table');

    if (!hostnames || hostnames.length === 0) {
        tableEl.classList.add('hidden');
        emptyEl.classList.remove('hidden');
        return;
    }

    tableEl.classList.remove('hidden');
    emptyEl.classList.add('hidden');

    tbody.innerHTML = hostnames.map(h => {
        const hostname = (h.subdomain ? h.subdomain + '.' : '') + h.domain;
        return `
            <tr>
                <td>${escapeHtml(hostname)}</td>
                <td><span class="type-badge type-${h.serviceType}">${h.serviceType}</span></td>
                <td>${escapeHtml(h.serviceUrl)}</td>
                <td>
                    <button class="btn btn-sm btn-ghost" onclick="editHostname('${h.id}')" title="编辑">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                    <button class="btn btn-sm btn-ghost btn-danger" onclick="deleteHostname('${h.id}')" title="删除">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

document.getElementById('btn-add-tunnel').addEventListener('click', () => {
    editingTunnelId = null;
    document.getElementById('modal-tunnel-title').textContent = '添加隧道';
    document.getElementById('tunnel-form').reset();
    openModal('modal-tunnel');
});

document.getElementById('btn-edit-tunnel').addEventListener('click', () => {
    const tunnel = tunnels.find(t => t.id === selectedTunnelId);
    if (!tunnel) return;

    editingTunnelId = tunnel.id;
    document.getElementById('modal-tunnel-title').textContent = '编辑隧道';
    document.getElementById('tf-name').value = tunnel.name;
    document.getElementById('tf-tunnel-id').value = tunnel.tunnelId || '';
    document.getElementById('tf-tunnel-token').value = tunnel.tunnelToken || '';
    document.getElementById('tf-protocol').value = tunnel.protocol || 'auto';
    document.getElementById('tf-log-level').value = tunnel.logLevel || 'info';
    document.getElementById('tf-no-autoupdate').checked = tunnel.noAutoUpdate || false;
    openModal('modal-tunnel');
});

document.getElementById('tunnel-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = {
        name: document.getElementById('tf-name').value,
        tunnelId: document.getElementById('tf-tunnel-id').value,
        tunnelToken: document.getElementById('tf-tunnel-token').value,
        protocol: document.getElementById('tf-protocol').value,
        logLevel: document.getElementById('tf-log-level').value,
        noAutoUpdate: document.getElementById('tf-no-autoupdate').checked,
    };

    try {
        if (editingTunnelId) {
            await api('PUT', `/tunnels/${editingTunnelId}`, data);
            toast('隧道已更新', 'success');
        } else {
            await api('POST', '/tunnels', data);
            toast('隧道已添加', 'success');
        }
        closeModal('modal-tunnel');
        await loadTunnels();
        if (editingTunnelId) {
            selectTunnel(editingTunnelId);
        }
    } catch (e) {
        toast(e.message, 'error');
    }
});

document.getElementById('btn-delete-tunnel').addEventListener('click', async () => {
    if (!selectedTunnelId) return;
    const tunnel = tunnels.find(t => t.id === selectedTunnelId);
    if (!confirm(`确定删除隧道 "${tunnel.name}" 吗？`)) return;

    try {
        await api('DELETE', `/tunnels/${selectedTunnelId}`);
        toast('隧道已删除', 'success');
        selectedTunnelId = null;
        await loadTunnels();
        document.getElementById('no-selection').classList.remove('hidden');
        document.getElementById('tunnel-detail').classList.add('hidden');
    } catch (e) {
        toast(e.message, 'error');
    }
});

document.getElementById('btn-toggle-tunnel').addEventListener('click', async () => {
    const tunnel = tunnels.find(t => t.id === selectedTunnelId);
    if (!tunnel) return;

    try {
        if (tunnel.running) {
            await api('POST', `/tunnels/${selectedTunnelId}/stop`);
            toast('已停止', 'success');
        } else {
            await api('POST', `/tunnels/${selectedTunnelId}/start`);
            toast('已启动', 'success');
        }
        await loadTunnels();
        renderTunnelDetail();
    } catch (e) {
        toast(e.message, 'error');
    }
});

document.getElementById('btn-restart-tunnel').addEventListener('click', async () => {
    const tunnel = tunnels.find(t => t.id === selectedTunnelId);
    if (!tunnel || !tunnel.running) {
        toast('隧道未运行，无法重启', 'error');
        return;
    }

    try {
        document.getElementById('btn-restart-tunnel').disabled = true;
        toast('正在重启...', 'info');
        await api('POST', `/tunnels/${selectedTunnelId}/restart`);
        toast('已重启', 'success');
        await loadTunnels();
        renderTunnelDetail();
    } catch (e) {
        toast(e.message, 'error');
    } finally {
        document.getElementById('btn-restart-tunnel').disabled = false;
    }
});

document.getElementById('btn-add-hostname').addEventListener('click', () => {
    editingHostnameId = null;
    document.getElementById('modal-hostname-title').textContent = '添加域名映射';
    document.getElementById('hostname-form').reset();
    openModal('modal-hostname');
});

function editHostname(hostnameId) {
    const tunnel = tunnels.find(t => t.id === selectedTunnelId);
    if (!tunnel) return;
    const hostname = tunnel.hostnames.find(h => h.id === hostnameId);
    if (!hostname) return;

    editingHostnameId = hostnameId;
    document.getElementById('modal-hostname-title').textContent = '编辑域名映射';
    document.getElementById('hf-subdomain').value = hostname.subdomain || '';
    document.getElementById('hf-domain').value = hostname.domain || '';
    document.getElementById('hf-service-type').value = hostname.serviceType || 'http';
    document.getElementById('hf-service-url').value = hostname.serviceUrl || '';
    document.getElementById('hf-no-tls-verify').checked = hostname.noTlsVerify || false;
    openModal('modal-hostname');
}

async function deleteHostname(hostnameId) {
    if (!confirm('确定删除此域名映射吗？')) return;
    try {
        await api('DELETE', `/tunnels/${selectedTunnelId}/hostnames/${hostnameId}`);
        toast('域名映射已删除', 'success');
        await loadTunnels();
        renderTunnelDetail();
    } catch (e) {
        toast(e.message, 'error');
    }
}

document.getElementById('hostname-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = {
        subdomain: document.getElementById('hf-subdomain').value,
        domain: document.getElementById('hf-domain').value,
        serviceType: document.getElementById('hf-service-type').value,
        serviceUrl: document.getElementById('hf-service-url').value,
        noTlsVerify: document.getElementById('hf-no-tls-verify').checked,
    };

    try {
        if (editingHostnameId) {
            await api('PUT', `/tunnels/${selectedTunnelId}/hostnames/${editingHostnameId}`, data);
            toast('域名映射已更新', 'success');
        } else {
            await api('POST', `/tunnels/${selectedTunnelId}/hostnames`, data);
            toast('域名映射已添加', 'success');
        }
        closeModal('modal-hostname');
        await loadTunnels();
        renderTunnelDetail();
    } catch (e) {
        toast(e.message, 'error');
    }
});

document.getElementById('btn-refresh-logs').addEventListener('click', refreshLogs);

async function refreshLogs() {
    if (!selectedTunnelId) return;
    try {
        const data = await api('GET', `/tunnels/${selectedTunnelId}/logs`);
        const viewer = document.getElementById('log-viewer');
        viewer.textContent = data.logs || '暂无日志';
        viewer.scrollTop = viewer.scrollHeight;
    } catch (e) {}
}

document.getElementById('btn-clear-logs').addEventListener('click', async () => {
    if (!confirm('确定要清空所有日志吗？')) return;
    try {
        await api('DELETE', `/tunnels/${selectedTunnelId}/logs`);
        document.getElementById('log-viewer').textContent = '暂无日志';
        toast('日志已清空', 'success');
    } catch (e) {
        toast('清空失败: ' + e.message, 'error');
    }
});

async function checkCloudflaredVersion() {
    try {
        const data = await api('GET', '/cloudflared/version');
        cloudflaredInstalled = data.installed;

        const badge = document.getElementById('cloudflared-version-badge');
        const text = document.getElementById('cloudflared-version-text');
        const dot = badge.querySelector('.dot');

        if (data.installed) {
            text.textContent = data.version || '已安装';
            dot.className = 'dot dot-green';
            document.getElementById('cloudflared-tooltip').classList.add('hidden');
        } else {
            text.textContent = '未安装';
            dot.className = 'dot dot-gray';
            document.getElementById('cloudflared-tooltip').classList.remove('hidden');
        }
    } catch (e) {
        document.getElementById('cloudflared-version-text').textContent = '检测失败';
    }
}

document.getElementById('btn-cloudflared-manage').addEventListener('click', async () => {
    openModal('modal-version');

    try {
        const current = await api('GET', '/cloudflared/version');
        document.getElementById('ver-current').textContent = current.version || '未安装';
    } catch (e) {
        document.getElementById('ver-current').textContent = '未安装';
    }

    try {
        const latest = await api('GET', '/cloudflared/latest');
        document.getElementById('ver-latest').textContent = latest.version;
    } catch (e) {
        document.getElementById('ver-latest').textContent = '获取失败';
    }
});

document.getElementById('btn-check-latest').addEventListener('click', async () => {
    try {
        const latest = await api('GET', '/cloudflared/latest');
        document.getElementById('ver-latest').textContent = latest.version;
        toast('已获取最新版本', 'success');
    } catch (e) {
        toast('获取失败: ' + e.message, 'error');
    }
});

document.getElementById('btn-install-online').addEventListener('click', async () => {
    const btn = document.getElementById('btn-install-online');
    btn.disabled = true;
    btn.innerHTML = '<span class="dot dot-gray" style="animation: pulse 1s infinite;"></span> 安装中...';

    try {
        const result = await api('POST', '/cloudflared/install');
        document.getElementById('ver-current').textContent = result.version;
        toast('安装成功: ' + result.version, 'success');
        await checkCloudflaredVersion();
    } catch (e) {
        toast('安装失败: ' + e.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg> 在线安装 / 更新';
    }
});

const uploadArea = document.getElementById('upload-area');
const uploadFile = document.getElementById('upload-file');

uploadArea.addEventListener('click', () => uploadFile.click());
uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.style.borderColor = 'var(--accent)';
});
uploadArea.addEventListener('dragleave', () => {
    uploadArea.style.borderColor = 'var(--border)';
});
uploadArea.addEventListener('drop', async (e) => {
    e.preventDefault();
    uploadArea.style.borderColor = 'var(--border)';
    const file = e.dataTransfer.files[0];
    if (file) await uploadCloudflared(file);
});

uploadFile.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (file) await uploadCloudflared(file);
});

async function uploadCloudflared(file) {
    const formData = new FormData();
    formData.append('file', file);

    try {
        const res = await fetch('/api/cloudflared/upload', {
            method: 'POST',
            headers: { 'X-Auth-Token': authToken },
            body: formData,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        document.getElementById('ver-current').textContent = data.version;
        toast('上传安装成功: ' + data.version, 'success');
        await checkCloudflaredVersion();
    } catch (e) {
        toast('上传失败: ' + e.message, 'error');
    }
}

document.getElementById('btn-theme-toggle').addEventListener('click', () => {
    const html = document.documentElement;
    const isLight = html.getAttribute('data-theme') === 'light';
    html.setAttribute('data-theme', isLight ? 'dark' : 'light');
    localStorage.setItem('theme', isLight ? 'dark' : 'light');

    const icon = document.getElementById('theme-icon');
    icon.innerHTML = isLight
        ? '<path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>'
        : '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>';
});

(function() {
    const saved = localStorage.getItem('theme');
    if (saved) {
        document.documentElement.setAttribute('data-theme', saved);
    }
})();

init();
