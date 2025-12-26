const API_KEY = '';
const API_BASE = '/dashboard';

const statusText = document.getElementById('statusText');
const statusDot = document.getElementById('statusDot');
const statusLabel = document.getElementById('statusLabel');
const phoneNumber = document.getElementById('phoneNumber');
const lastStateChange = document.getElementById('lastStateChange');
const uptime = document.getElementById('uptime');
const qrCanvas = document.getElementById('qrCanvas');
const qrState = document.getElementById('qrState');
const qrMeta = document.getElementById('qrMeta');
const alertBanner = document.getElementById('alertBanner');
const alertMessage = document.getElementById('alertMessage');
const reconnectBtn = document.getElementById('reconnectBtn');
const refreshBtn = document.getElementById('refreshBtn');
const logSearch = document.getElementById('logSearch');
const logsList = document.getElementById('logsList');
const logCount = document.getElementById('logCount');
const envBadge = document.getElementById('envBadge');
const toastContainer = document.getElementById('toastContainer');

let currentState = null;
let currentQr = null;
let logLines = [];
let uptimeTimer = null;
let uptimeValue = 0;

function authHeaders() {
  const headers = {};
  if (API_KEY) {
    headers['x-api-key'] = API_KEY;
  }
  return headers;
}

function setEnvBadge() {
  const host = window.location.hostname;
  const env = host === 'localhost' || host === '127.0.0.1' ? 'LOCAL' : 'PROD';
  envBadge.textContent = env;
}

function formatTimestamp(value) {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--';
  return date.toLocaleString();
}

function formatDuration(totalSeconds) {
  const seconds = Math.max(0, totalSeconds);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h}h ${m}m ${s}s`;
}

function updateUptime(seconds) {
  uptimeValue = seconds;
  uptime.textContent = formatDuration(uptimeValue);
  if (uptimeTimer) {
    clearInterval(uptimeTimer);
  }
  uptimeTimer = setInterval(() => {
    uptimeValue += 1;
    uptime.textContent = formatDuration(uptimeValue);
  }, 1000);
}

function setStatusState(state) {
  currentState = state;
  statusText.textContent = state.status;
  statusLabel.textContent = state.status;
  lastStateChange.textContent = formatTimestamp(state.lastStateChangeAt);
  updateUptime(state.uptimeSec || 0);

  if (state.phoneNumber) {
    phoneNumber.textContent = state.phoneNumber;
    phoneNumber.classList.remove('muted');
  } else {
    phoneNumber.textContent = 'Not connected';
    phoneNumber.classList.add('muted');
  }

  const colorMap = {
    ready: '#24d2b5',
    authenticated: '#24d2b5',
    qr: '#f6c253',
    disconnected: '#f18f4c',
    error: '#ef6a6a',
  };
  statusDot.style.background = colorMap[state.status] || '#5f6c80';

  if (state.status === 'ready') {
    alertBanner.classList.add('hidden');
  } else {
    alertBanner.classList.remove('hidden');
    const reason = state.lastError || state.lastDisconnectReason || 'Waiting for WhatsApp readiness.';
    alertMessage.textContent = reason;
  }

  reconnectBtn.disabled = state.status === 'ready';
  updateQrPanel();
}

function updateQrPanel() {
  const showQr = currentState && (currentState.status === 'qr' || currentState.status === 'disconnected');
  if (showQr && currentQr) {
    qrState.textContent = 'Scan QR to re-authenticate.';
    qrCanvas.style.display = 'block';
    renderQr(currentQr);
    qrMeta.textContent = currentState.lastQrAt ? `Generated at ${formatTimestamp(currentState.lastQrAt)}` : '';
  } else if (showQr && !currentQr) {
    qrCanvas.style.display = 'none';
    qrState.textContent = 'Waiting for QR code...';
    qrMeta.textContent = '';
  } else {
    qrCanvas.style.display = 'none';
    qrState.textContent = 'No QR required.';
    qrMeta.textContent = '';
  }
}

function renderQr(text) {
  if (!window.qrcode) {
    qrState.textContent = 'QR renderer unavailable.';
    return;
  }
  const qr = window.qrcode(0, 'M');
  qr.addData(text);
  qr.make();

  const cells = qr.getModuleCount();
  const cellSize = 6;
  const margin = 2;
  const size = (cells + margin * 2) * cellSize;
  qrCanvas.width = size;
  qrCanvas.height = size;

  const ctx = qrCanvas.getContext('2d');
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
}

function showToast(level, message) {
  const toast = document.createElement('div');
  toast.className = `toast ${level}`;
  toast.textContent = message;
  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 5000);
}

function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function renderLogs() {
  const query = logSearch.value.trim().toLowerCase();
  const filtered = query
    ? logLines.filter((line) => line.toLowerCase().includes(query))
    : logLines;
  logsList.innerHTML = filtered
    .map((line) => `<div class=\"log-line\">${escapeHtml(line)}</div>`)
    .join('');
  logCount.textContent = `${filtered.length} lines`;
}

function appendLogLine(line) {
  logLines.push(line);
  if (logLines.length > 200) {
    logLines = logLines.slice(-200);
  }
  renderLogs();
}

async function fetchStatus() {
  const response = await fetch(`${API_BASE}/status`, {
    headers: authHeaders(),
  });
  if (!response.ok) {
    throw new Error('Failed to load status');
  }
  const data = await response.json();
  setStatusState(data);
  return data;
}

async function fetchQr() {
  const response = await fetch(`${API_BASE}/qr`, {
    headers: authHeaders(),
  });
  if (response.status === 404) {
    currentQr = null;
    updateQrPanel();
    return;
  }
  if (!response.ok) {
    throw new Error('Failed to load QR');
  }
  const data = await response.json();
  currentQr = data.qr;
  updateQrPanel();
}

async function fetchLogs() {
  const response = await fetch(`${API_BASE}/logs?limit=200`, {
    headers: authHeaders(),
  });
  if (!response.ok) {
    throw new Error('Failed to load logs');
  }
  const data = await response.json();
  logLines = data.lines || [];
  renderLogs();
}

async function reconnect() {
  const response = await fetch(`${API_BASE}/reconnect`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
    },
  });
  if (!response.ok) {
    throw new Error('Failed to reconnect');
  }
  return response.json();
}

function handleEvent(event, payload) {
  if (event === 'status') {
    setStatusState(payload);
    if (payload.status === 'qr' || payload.status === 'disconnected') {
      fetchQr().catch(() => {});
    }
  }
  if (event === 'qr') {
    currentQr = payload.qr;
    if (currentState) {
      currentState.lastQrAt = payload.generatedAt;
    }
    updateQrPanel();
  }
  if (event === 'alert') {
    const level = payload.level || 'warning';
    const message = payload.message || 'Status changed.';
    showToast(level, message);
  }
  if (event === 'logline') {
    if (payload.line) {
      appendLogLine(payload.line);
    }
  }
}

async function connectEvents() {
  try {
    const response = await fetch(`${API_BASE}/events`, {
      headers: authHeaders(),
    });
    if (!response.ok || !response.body) {
      throw new Error('Failed to connect to events');
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

refreshBtn.addEventListener('click', () => {
  fetchStatus()
    .then((state) => {
      if (state.status === 'qr' || state.status === 'disconnected') {
        return fetchQr();
      }
      return null;
    })
    .catch(() => {});
  fetchLogs().catch(() => {});
});

reconnectBtn.addEventListener('click', () => {
  reconnect()
    .then((result) => {
      showToast('warning', result.message || 'Reconnect requested.');
    })
    .catch(() => showToast('error', 'Reconnect failed.'));
});

logSearch.addEventListener('input', renderLogs);

setEnvBadge();

if (!API_KEY) {
  showToast('warning', 'Set API_KEY in dashboard.js to enable API calls.');
}

fetchStatus()
  .then((state) => {
    if (state.status === 'qr' || state.status === 'disconnected') {
      return fetchQr();
    }
    return null;
  })
  .catch(() => {});
fetchLogs().catch(() => {});
connectEvents();
