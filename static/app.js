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
    cloudflaredInstalled: false
};

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
    
    showView('tunnels-view');
    
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
    } catch (e) {
        console.error('Failed to load zones:', e);
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
    list.innerHTML = state.tunnels.map(t => `
        <div class="tunnel-card" data-id="${t.id || t.tunnelId}">
            <div class="tunnel-card-header">
                <span class="tunnel-name">${t.name}</span>
                <span class="tunnel-status">
                    <span class="status-dot ${t.running ? 'running' : t.status === 'inactive' ? 'inactive' : 'stopped'}"></span>
                    ${t.running ? '运行中' : t.status === 'inactive' ? '未连接' : '已停止'}
                </span>
            </div>
            <div class="tunnel-meta">
                <span>连接数: ${t.connections || 0}</span>
                <span>域名映射: ${(t.hostnames || []).length}</span>
            </div>
            <div class="tunnel-actions" onclick="event.stopPropagation()">
                ${t.running 
                    ? `<button class="btn btn-secondary btn-sm" onclick="stopTunnel('${t.id}')">停止</button>`
                    : `<button class="btn btn-primary btn-sm" onclick="startTunnel('${t.id}')">启动</button>`
                }
                <button class="btn btn-secondary btn-sm" onclick="showTunnelDetail('${t.id}')">详情</button>
                <button class="btn btn-danger btn-sm" onclick="deleteTunnel('${t.id}')">删除</button>
            </div>
        </div>
    `).join('');

    $$('.tunnel-card').forEach(card => {
        card.addEventListener('click', () => showTunnelDetail(card.dataset.id));
    });
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
        const t = await API.get(`/api/tunnels/${id}`);
        state.currentTunnel = t;
        state.hostnames = t.hostnames || [];
        
        $('#tunnel-detail-title').textContent = t.name;
        
        $('#tunnel-detail-content').innerHTML = `
            <div class="tunnel-detail-info">
                <div class="info-grid">
                    <div class="info-item">
                        <label>隧道 ID</label>
                        <span>${t.tunnelId}</span>
                    </div>
                    <div class="info-item">
                        <label>状态</label>
                        <span>${t.running ? '运行中' : t.status || '已停止'}</span>
                    </div>
                    <div class="info-item">
                        <label>连接数</label>
                        <span>${t.connections?.length || 0}</span>
                    </div>
                    <div class="info-item">
                        <label>创建时间</label>
                        <span>${t.createdAt ? new Date(t.createdAt).toLocaleString() : '-'}</span>
                    </div>
                </div>
                <div class="tunnel-actions" style="margin-top: 16px;">
                    ${t.running 
                        ? `<button class="btn btn-secondary" onclick="stopTunnel('${t.id}')">停止隧道</button>`
                        : `<button class="btn btn-primary" onclick="startTunnel('${t.id}')">启动隧道</button>`
                    }
                    <button class="btn btn-secondary" onclick="showLogsModal('${t.id}')">查看日志</button>
                    <button class="btn btn-danger" onclick="deleteTunnel('${t.id}')">删除隧道</button>
                </div>
            </div>
            
            <div class="hostnames-section">
                <div class="section-header">
                    <h3>域名映射</h3>
                    <button class="btn btn-primary btn-sm" onclick="showAddHostnameModal()">添加映射</button>
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
        return '<div class="empty-state">暂无域名映射</div>';
    }
    return `
        <table class="hostnames-table">
            <thead>
                <tr>
                    <th>域名</th>
                    <th>本地服务</th>
                    <th>操作</th>
                </tr>
            </thead>
            <tbody>
                ${state.hostnames.map((h, i) => `
                    <tr>
                        <td>${h.hostname}</td>
                        <td>${h.service}</td>
                        <td class="hostname-actions">
                            <button class="btn btn-secondary btn-sm" onclick="editHostname(${i})">编辑</button>
                            <button class="btn btn-danger btn-sm" onclick="deleteHostname(${i})">删除</button>
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

async function stopTunnel(id) {
    try {
        await API.post(`/api/tunnels/${id}/stop`);
        showToast('隧道已停止', 'success');
        await loadTunnels();
        if (state.currentTunnel?.id === id) {
            await showTunnelDetail(id);
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

function showAddHostnameModal() {
    showModal('添加域名映射', `
        <form id="hostname-form">
            <div class="form-group">
                <label>域名</label>
                <input type="text" id="hostname" placeholder="例如: app.example.com">
            </div>
            <div class="form-group">
                <label>本地服务</label>
                <input type="text" id="service" placeholder="例如: http://localhost:8080">
            </div>
            <div class="form-group">
                <label>
                    <input type="checkbox" id="no-tls-verify"> 禁用 TLS 验证
                </label>
            </div>
        </form>
    `, `
        <button class="btn btn-secondary" onclick="hideModal()">取消</button>
        <button class="btn btn-primary" onclick="addHostname()">添加</button>
    `);
}

async function addHostname() {
    const hostname = $('#hostname').value.trim();
    const service = $('#service').value.trim();
    const noTlsVerify = $('#no-tls-verify').checked;
    
    if (!hostname || !service) {
        showToast('请填写完整信息', 'error');
        return;
    }
    
    state.hostnames.push({ id: Date.now().toString(), hostname, service, noTlsVerify });
    await saveHostnames();
}

function editHostname(index) {
    const h = state.hostnames[index];
    showModal('编辑域名映射', `
        <form id="hostname-form">
            <div class="form-group">
                <label>域名</label>
                <input type="text" id="hostname" value="${h.hostname}">
            </div>
            <div class="form-group">
                <label>本地服务</label>
                <input type="text" id="service" value="${h.service}">
            </div>
            <div class="form-group">
                <label>
                    <input type="checkbox" id="no-tls-verify" ${h.noTlsVerify ? 'checked' : ''}> 禁用 TLS 验证
                </label>
            </div>
        </form>
    `, `
        <button class="btn btn-secondary" onclick="hideModal()">取消</button>
        <button class="btn btn-primary" onclick="saveHostnameEdit(${index})">保存</button>
    `);
}

async function saveHostnameEdit(index) {
    const hostname = $('#hostname').value.trim();
    const service = $('#service').value.trim();
    const noTlsVerify = $('#no-tls-verify').checked;
    
    if (!hostname || !service) {
        showToast('请填写完整信息', 'error');
        return;
    }
    
    state.hostnames[index] = { ...state.hostnames[index], hostname, service, noTlsVerify };
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
    
    $('.modal-overlay').addEventListener('click', hideModal);
    $('.modal-close').addEventListener('click', hideModal);
    
    checkAuth();
});
