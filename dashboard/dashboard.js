const TOKEN_KEY = 'wa_token';
const API_KEY_KEY = 'wa_api_key';

const state = {
  user: null,
  instances: new Map(),
  campaigns: new Map(),
  selectedInstanceId: null,
};

function getToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

function setToken(value) {
  localStorage.setItem(TOKEN_KEY, value);
}

function getApiKey() {
  return localStorage.getItem(API_KEY_KEY) || '';
}

function setApiKey(value) {
  if (value) {
    localStorage.setItem(API_KEY_KEY, value);
  } else {
    localStorage.removeItem(API_KEY_KEY);
  }
}

function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
}

function authHeaders() {
  const headers = {};
  const apiKey = getApiKey();
  const token = getToken();
  if (apiKey) headers['x-api-key'] = apiKey;
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

function showToast(level, message) {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${level}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 5000);
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function apiFetch(path, options = {}) {
  const headers = {
    ...(options.headers || {}),
    ...authHeaders(),
  };
  const response = await fetch(path, { ...options, headers });
  if (response.status === 401 && document.body.dataset.page !== 'login') {
    clearAuth();
    window.location.href = '/login';
    return null;
  }
  return response;
}

async function loadUser() {
  const response = await apiFetch('/auth/me');
  if (!response || !response.ok) return;
  const data = await response.json();
  state.user = data.user;
}

async function loadInstances() {
  const response = await apiFetch('/app/instances');
  if (!response || !response.ok) return;
  const data = await response.json();
  data.forEach((item) => {
    state.instances.set(item.id, { ...item });
  });
}

async function loadCampaigns() {
  const response = await apiFetch('/app/campaigns');
  if (!response || !response.ok) return;
  const data = await response.json();
  data.forEach((item) => {
    state.campaigns.set(item.id, { campaign: item, stats: null });
  });
}

function statusClass(status) {
  if (!status) return 'status-pending';
  if (status === 'ready') return 'status-ready';
  if (status === 'qr') return 'status-qr';
  if (status === 'error') return 'status-error';
  if (status === 'authenticated') return 'status-authenticated';
  if (status === 'stopped') return 'status-pending';
  return 'status-pending';
}

function renderDashboard() {
  const phoneEl = document.getElementById('userPhone');
  const roleEl = document.getElementById('userRole');
  const instanceCountEl = document.getElementById('instanceCount');
  const campaignCountEl = document.getElementById('campaignCount');
  const userPill = document.getElementById('userPill');
  if (state.user) {
    if (phoneEl) phoneEl.textContent = state.user.mobile || '--';
    if (roleEl) roleEl.textContent = state.user.role || 'User';
    if (userPill) userPill.textContent = state.user.mobile || 'User';
  }
  if (instanceCountEl) instanceCountEl.textContent = state.instances.size;
  if (campaignCountEl) campaignCountEl.textContent = state.campaigns.size;

  const instanceList = document.getElementById('instanceList');
  if (instanceList) {
    instanceList.innerHTML = '';
    Array.from(state.instances.values()).forEach((instance) => {
      const item = document.createElement('div');
      item.className = 'list-item';
      item.innerHTML = `
        <div class="list-main">
          <div>${escapeHtml(instance.label || `Instance #${instance.id}`)}</div>
          <div class="muted">${escapeHtml(instance.phone || 'No phone')}</div>
        </div>
        <span class="status-pill ${statusClass(instance.status)}">${escapeHtml(instance.status || 'unknown')}</span>
      `;
      instanceList.appendChild(item);
    });
  }

  const campaignList = document.getElementById('campaignList');
  if (campaignList) {
    campaignList.innerHTML = '';
    Array.from(state.campaigns.values()).forEach((entry) => {
      const campaign = entry.campaign;
      const stats = entry.stats || { sent: 0, failed: 0, pending: 0, retry: 0 };
      const total = stats.sent + stats.failed + stats.pending + stats.retry;
      const percent = total ? Math.round((stats.sent / total) * 100) : 0;
      const item = document.createElement('div');
      item.className = 'list-item';
      item.innerHTML = `
        <div class="list-main">
          <div>${escapeHtml(campaign.name)}</div>
          <div class="muted">${escapeHtml(campaign.status || 'draft')}</div>
          <div class="progress"><div class="progress-fill" style="width:${percent}%"></div></div>
          <div class="muted">Sent ${stats.sent} / Failed ${stats.failed}</div>
        </div>
      `;
      campaignList.appendChild(item);
    });
  }

  renderQrPanel('qrCanvas', 'qrState', 'qrMeta', findQrInstance());
}

function findQrInstance() {
  const instances = Array.from(state.instances.values());
  return instances.find((item) => item.status === 'qr' && item.qr) || null;
}

function renderQrPanel(canvasId, stateId, metaId, instance) {
  const canvas = document.getElementById(canvasId);
  const stateLabel = document.getElementById(stateId);
  const metaLabel = document.getElementById(metaId);
  if (!canvas || !stateLabel || !metaLabel) return;
  if (!instance || !instance.qr) {
    canvas.style.display = 'none';
    if (instance && instance.status === 'qr') {
      stateLabel.textContent = 'Waiting for QR...';
    } else {
      stateLabel.textContent = 'No QR pending.';
    }
    metaLabel.textContent = '';
    return;
  }
  stateLabel.textContent = `Scan QR for ${instance.label || `Instance #${instance.id}`}.`;
  renderQr(canvas, instance.qr);
  metaLabel.textContent = instance.lastQrAt ? `Generated at ${new Date(instance.lastQrAt).toLocaleString()}` : '';
}

function renderInstancesPage() {
  const userPill = document.getElementById('userPill');
  if (state.user && userPill) userPill.textContent = state.user.mobile || 'User';

  const list = document.getElementById('instancesList');
  if (!list) return;
  list.innerHTML = '';
  Array.from(state.instances.values()).forEach((instance) => {
    const item = document.createElement('div');
    item.className = 'list-item';
    item.innerHTML = `
      <div class="list-main">
        <div>${escapeHtml(instance.label || `Instance #${instance.id}`)}</div>
        <div class="muted">${escapeHtml(instance.phone || 'No phone')}</div>
      </div>
      <div class="stack">
        <span class="status-pill ${statusClass(instance.status)}">${escapeHtml(instance.status || 'unknown')}</span>
        <button class="ghost" data-action="start">Start</button>
        <button class="ghost" data-action="stop">Stop</button>
      </div>
    `;
    item.addEventListener('click', () => {
      state.selectedInstanceId = instance.id;
      renderInstanceQr();
    });
    item.querySelectorAll('button').forEach((button) => {
      button.addEventListener('click', async (event) => {
        event.stopPropagation();
        const action = button.getAttribute('data-action');
        const response = await apiFetch(`/app/instances/${instance.id}/${action}`, { method: 'POST' });
        if (response && response.ok) {
          showToast('warning', `${action} requested.`);
        } else {
          showToast('error', `Failed to ${action} instance.`);
        }
      });
    });
    list.appendChild(item);
  });
  renderInstanceQr();
}

async function renderInstanceQr() {
  const selected = state.selectedInstanceId
    ? state.instances.get(state.selectedInstanceId)
    : Array.from(state.instances.values())[0];
  const canvasId = 'instanceQrCanvas';
  const stateId = 'instanceQrState';
  const metaId = 'instanceQrMeta';
  if (!selected) {
    renderQrPanel(canvasId, stateId, metaId, null);
    return;
  }

  if (!selected.qr) {
    const response = await apiFetch(`/app/instances/${selected.id}/qr`);
    if (response && response.ok) {
      const data = await response.json();
      selected.qr = data.qr;
      selected.lastQrAt = new Date().toISOString();
    }
  }
  renderQrPanel(canvasId, stateId, metaId, selected);
}

function renderCampaignsPage() {
  const userPill = document.getElementById('userPill');
  if (state.user && userPill) userPill.textContent = state.user.mobile || 'User';

  const instancesSelect = document.getElementById('campaignInstance');
  if (instancesSelect) {
    instancesSelect.innerHTML = '';
    Array.from(state.instances.values()).forEach((instance) => {
      const option = document.createElement('option');
      option.value = instance.id;
      option.textContent = instance.label || `Instance #${instance.id}`;
      instancesSelect.appendChild(option);
    });
  }

  const list = document.getElementById('campaignsList');
  if (!list) return;
  list.innerHTML = '';
  Array.from(state.campaigns.values()).forEach((entry) => {
    const campaign = entry.campaign;
    const stats = entry.stats || { sent: 0, failed: 0, pending: 0, retry: 0 };
    const total = stats.sent + stats.failed + stats.pending + stats.retry;
    const percent = total ? Math.round((stats.sent / total) * 100) : 0;
    const item = document.createElement('div');
    item.className = 'list-item';
    const statusLabel = escapeHtml(campaign.status || 'draft');
    item.innerHTML = `
      <div class="list-main">
        <div>${escapeHtml(campaign.name)}</div>
        <div class="muted">${statusLabel}</div>
        <div class="progress"><div class="progress-fill" style="width:${percent}%"></div></div>
        <div class="muted">Sent ${stats.sent} / Failed ${stats.failed}</div>
      </div>
      <div class="stack">
        <button class="ghost" data-action="start">Start</button>
        <button class="ghost" data-action="pause">Pause</button>
        <button class="ghost" data-action="cancel">Cancel</button>
      </div>
    `;
    item.querySelectorAll('button').forEach((button) => {
      button.addEventListener('click', async () => {
        const action = button.getAttribute('data-action');
        const path = action === 'start' ? 'start' : action === 'pause' ? 'pause' : 'cancel';
        const response = await apiFetch(`/app/campaigns/${campaign.id}/${path}`, { method: 'POST' });
        if (response && response.ok) {
          showToast('warning', `${campaign.name} ${path}ed.`);
        } else {
          showToast('error', `Failed to ${path} campaign.`);
        }
      });
    });
    list.appendChild(item);
  });
}

function renderQr(canvas, text) {
  if (!window.qrcode) return;
  const qr = window.qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const cells = qr.getModuleCount();
  const cellSize = 6;
  const margin = 2;
  const size = (cells + margin * 2) * cellSize;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#111111';
  for (let row = 0; row < cells; row += 1) {
    for (let col = 0; col < cells; col += 1) {
      if (qr.isDark(row, col)) {
        ctx.fillRect((col + margin) * cellSize, (row + margin) * cellSize, cellSize, cellSize);
      }
    }
  }
  canvas.style.display = 'block';
}

function handleEvent(event, payload) {
  if (event === 'instance_status' && payload?.id) {
    const existing = state.instances.get(payload.id) || {};
    state.instances.set(payload.id, { ...existing, ...payload });
    if (document.body.dataset.page === 'dashboard') renderDashboard();
    if (document.body.dataset.page === 'instances') renderInstancesPage();
    if (payload.status === 'disconnected' || payload.status === 'error') {
      showToast('warning', `Instance ${payload.id} ${payload.status}.`);
    }
  }
  if (event === 'instance_qr' && payload?.id) {
    const existing = state.instances.get(payload.id) || {};
    state.instances.set(payload.id, { ...existing, qr: payload.qr, lastQrAt: payload.generatedAt });
    if (document.body.dataset.page === 'dashboard') renderDashboard();
    if (document.body.dataset.page === 'instances') renderInstancesPage();
  }
  if (event === 'campaign_progress' && payload?.campaign) {
    state.campaigns.set(payload.campaign.id, payload);
    if (document.body.dataset.page === 'dashboard') renderDashboard();
    if (document.body.dataset.page === 'campaigns') renderCampaignsPage();
  }
}

async function connectEvents() {
  try {
    const response = await apiFetch('/app/events', {});
    if (!response || !response.ok || !response.body) {
      throw new Error('events failed');
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n\n');
      buffer = parts.pop();
      parts.forEach((part) => {
        const lines = part.split('\n');
        let event = 'message';
        const data = [];
        lines.forEach((line) => {
          if (line.startsWith(':')) return;
          if (line.startsWith('event:')) {
            event = line.slice(6).trim();
          } else if (line.startsWith('data:')) {
            data.push(line.slice(5).trim());
          }
        });
        if (!data.length) return;
        try {
          const payload = JSON.parse(data.join('\n'));
          handleEvent(event, payload);
        } catch (err) {
          showToast('error', 'Failed to parse live event.');
        }
      });
    }
  } catch (err) {
    setTimeout(connectEvents, 2000);
  }
}

function setupLogout() {
  const logoutBtn = document.getElementById('logoutBtn');
  if (!logoutBtn) return;
  logoutBtn.addEventListener('click', async () => {
    await apiFetch('/auth/logout', { method: 'POST' });
    clearAuth();
    window.location.href = '/login';
  });
}

function setupLoginPage() {
  const loginForm = document.getElementById('loginForm');
  const authMessage = document.getElementById('authMessage');
  const savedApiKey = getApiKey();
  const loginApiKey = document.getElementById('loginApiKey');
  if (savedApiKey) {
    if (loginApiKey) loginApiKey.value = savedApiKey;
  }

  loginForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const mobile = document.getElementById('loginMobile').value;
    const password = document.getElementById('loginPassword').value;
    const apiKey = document.getElementById('loginApiKey').value;
    setApiKey(apiKey);
    const response = await apiFetch('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mobile, password }),
    });
    if (response && response.ok) {
      const data = await response.json();
      setToken(data.token);
      window.location.href = '/dashboard';
    } else if (authMessage) {
      authMessage.textContent = 'Login failed.';
    }
  });
}

function setupInstanceForm() {
  const form = document.getElementById('instanceForm');
  const labelInput = document.getElementById('instanceLabel');
  const reconnectBtn = document.getElementById('reconnectInstanceBtn');
  if (form) {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const label = labelInput.value;
      const response = await apiFetch('/app/instances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label }),
      });
      if (response && response.ok) {
        const instance = await response.json();
        state.instances.set(instance.id, instance);
        labelInput.value = '';
        renderInstancesPage();
      } else {
        showToast('error', 'Failed to create instance.');
      }
    });
  }

  reconnectBtn?.addEventListener('click', async () => {
    if (!state.selectedInstanceId) return;
    const response = await apiFetch(`/app/instances/${state.selectedInstanceId}/start`, { method: 'POST' });
    if (response && response.ok) {
      showToast('warning', 'Start requested.');
    } else {
      showToast('error', 'Start failed.');
    }
  });
}

function setupCampaignForm() {
  const form = document.getElementById('campaignForm');
  if (form) {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const instanceId = document.getElementById('campaignInstance').value;
      const name = document.getElementById('campaignName').value;
      const message = document.getElementById('campaignMessage').value;
      const mediaRef = document.getElementById('campaignMedia').value;
      const recipientsRaw = document.getElementById('campaignRecipients').value;
      const recipients = recipientsRaw
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
      const csvFile = document.getElementById('campaignCsv').files[0];

      const formData = new FormData();
      formData.append('instance_id', Number(instanceId));
      formData.append('name', name);
      formData.append('message', message);
      formData.append('media_ref', mediaRef || '');
      if (recipients.length) {
        recipients.forEach((recipient) => formData.append('recipients', recipient));
      }
      if (csvFile) {
        formData.append('recipients_csv', csvFile);
      }

      const response = await apiFetch('/app/campaigns', {
        method: 'POST',
        body: formData,
      });
      if (response && response.ok) {
        const campaign = await response.json();
        state.campaigns.set(campaign.id, { campaign, stats: null });
        form.reset();
        renderCampaignsPage();
      } else {
        showToast('error', 'Failed to create campaign.');
      }
    });
  }
}

async function bootstrap() {
  const page = document.body.dataset.page;
  if (page === 'login') {
    setupLoginPage();
    return;
  }

  if (!getToken()) {
    window.location.href = '/login';
    return;
  }

  await Promise.all([loadUser(), loadInstances(), loadCampaigns()]);
  setupLogout();
  if (!getApiKey()) {
    showToast('warning', 'API key missing. Add it on the login screen.');
  }

  if (page === 'dashboard') renderDashboard();
  if (page === 'instances') {
    setupInstanceForm();
    renderInstancesPage();
  }
  if (page === 'campaigns') {
    setupCampaignForm();
    renderCampaignsPage();
  }

  connectEvents();
}

bootstrap();
