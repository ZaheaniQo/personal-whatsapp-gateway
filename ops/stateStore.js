const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const sqlite3 = require('sqlite3');

const emitter = new EventEmitter();
const startedAt = Date.now();
const memoryLogs = [];
const counters = { total: 0, byType: {} };
let hasRuntimeUpdates = false;

const state = {
  status: 'initializing',
  phone: null,
  lastReadyAt: null,
  lastDisconnectAt: null,
  lastQrAt: null,
  lastErrorAt: null,
  reason: null,
  qr: null,
};

function resolveDbPath() {
  if (process.env.OPS_DB_PATH) {
    return process.env.OPS_DB_PATH;
  }

  const preferred = path.join(path.sep, 'data', 'ops.sqlite');
  try {
    fs.mkdirSync(path.dirname(preferred), { recursive: true });
    fs.accessSync(path.dirname(preferred), fs.constants.W_OK);
    return preferred;
  } catch (err) {
    const fallback = path.join(__dirname, '..', 'data', 'ops.sqlite');
    fs.mkdirSync(path.dirname(fallback), { recursive: true });
    return fallback;
  }
}

const dbPath = resolveDbPath();
let db = null;

function initDb() {
  return new Promise((resolve) => {
    db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('Ops DB init failed:', err.message);
        db = null;
        return resolve(false);
      }

      db.serialize(() => {
        db.run(
          `CREATE TABLE IF NOT EXISTS gateway_state (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            status TEXT,
            phone TEXT,
            last_ready_at TEXT,
            last_disconnect_at TEXT,
            last_qr_at TEXT,
            last_error_at TEXT,
            reason TEXT,
            qr TEXT
          )`
        );
        db.run(
          `CREATE TABLE IF NOT EXISTS send_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ts INTEGER NOT NULL,
            type TEXT NOT NULL,
            to_number TEXT,
            text_preview TEXT,
            has_media INTEGER,
            media_type TEXT,
            size_bytes INTEGER,
            result TEXT,
            error TEXT
          )`
        );
        db.run('CREATE INDEX IF NOT EXISTS idx_send_logs_ts ON send_logs(ts)');
        resolve(true);
      });
    });
  });
}

function dbRun(sql, params) {
  if (!db) return Promise.resolve();
  return new Promise((resolve) => {
    db.run(sql, params, () => resolve());
  });
}

function dbGet(sql, params) {
  if (!db) return Promise.resolve(null);
  return new Promise((resolve) => {
    db.get(sql, params, (err, row) => {
      if (err) return resolve(null);
      return resolve(row || null);
    });
  });
}

function dbAll(sql, params) {
  if (!db) return Promise.resolve([]);
  return new Promise((resolve) => {
    db.all(sql, params, (err, rows) => {
      if (err) return resolve([]);
      return resolve(rows || []);
    });
  });
}

function updateCounters(type, delta) {
  counters.total += delta;
  if (!counters.byType[type]) counters.byType[type] = 0;
  counters.byType[type] += delta;
}

function safePreview(text) {
  if (!text) return null;
  return String(text).slice(0, 80);
}

function emitStatus() {
  emitter.emit('statusChanged', getSnapshot());
}

function setStatus(payload) {
  const previousStatus = state.status;
  hasRuntimeUpdates = true;
  if (Object.prototype.hasOwnProperty.call(payload, 'status')) {
    state.status = payload.status;
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'phone')) {
    state.phone = payload.phone;
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'lastReadyAt')) {
    state.lastReadyAt = payload.lastReadyAt;
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'lastDisconnectAt')) {
    state.lastDisconnectAt = payload.lastDisconnectAt;
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'lastQrAt')) {
    state.lastQrAt = payload.lastQrAt;
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'lastErrorAt')) {
    state.lastErrorAt = payload.lastErrorAt;
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'reason')) {
    state.reason = payload.reason;
  }

  persistState();
  if (state.status !== previousStatus) {
    emitStatus();
  } else {
    emitStatus();
  }
}

function setQr(qrString) {
  hasRuntimeUpdates = true;
  state.qr = qrString || null;
  state.lastQrAt = qrString ? new Date().toISOString() : state.lastQrAt;
  persistState();
  emitter.emit('qrChanged', { qr: state.qr, generatedAt: state.lastQrAt });
  emitStatus();
}

function appendLog(entry) {
  const ts = Number.isFinite(entry.ts) ? entry.ts : Date.now();
  const logEntry = {
    ts,
    type: entry.type || 'send',
    to: entry.to || null,
    textPreview: safePreview(entry.textPreview),
    hasMedia: entry.hasMedia ? 1 : 0,
    mediaType: entry.mediaType || null,
    sizeBytes: Number.isFinite(entry.sizeBytes) ? entry.sizeBytes : null,
    result: entry.result || null,
    error: entry.error || null,
  };

  memoryLogs.push(logEntry);
  if (memoryLogs.length > 1000) {
    memoryLogs.shift();
  }
  updateCounters(logEntry.type, 1);
  emitter.emit('logAppended', logEntry);

  dbRun(
    `INSERT INTO send_logs (ts, type, to_number, text_preview, has_media, media_type, size_bytes, result, error)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      logEntry.ts,
      logEntry.type,
      logEntry.to,
      logEntry.textPreview,
      logEntry.hasMedia,
      logEntry.mediaType,
      logEntry.sizeBytes,
      logEntry.result,
      logEntry.error,
    ]
  );
}

function persistState() {
  dbRun(
    `INSERT OR REPLACE INTO gateway_state
     (id, status, phone, last_ready_at, last_disconnect_at, last_qr_at, last_error_at, reason, qr)
     VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      state.status,
      state.phone,
      state.lastReadyAt,
      state.lastDisconnectAt,
      state.lastQrAt,
      state.lastErrorAt,
      state.reason,
      state.qr,
    ]
  );
}

async function loadState() {
  const row = await dbGet('SELECT * FROM gateway_state WHERE id = 1', []);
  if (row && !hasRuntimeUpdates) {
    state.status = row.status || state.status;
    state.phone = row.phone || null;
    state.lastReadyAt = row.last_ready_at || null;
    state.lastDisconnectAt = row.last_disconnect_at || null;
    state.lastQrAt = row.last_qr_at || null;
    state.lastErrorAt = row.last_error_at || null;
    state.reason = row.reason || null;
    state.qr = row.qr || null;
  }

  const rows = await dbAll('SELECT type, COUNT(*) as count FROM send_logs GROUP BY type', []);
  rows.forEach((item) => {
    counters.byType[item.type] = item.count;
    counters.total += item.count;
  });
}

function getSnapshot() {
  return {
    status: state.status,
    phone: state.phone,
    lastReadyAt: state.lastReadyAt,
    lastDisconnectAt: state.lastDisconnectAt,
    lastQrAt: state.lastQrAt,
    lastErrorAt: state.lastErrorAt,
    reason: state.reason,
    qr: state.qr,
    uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
    counters: {
      total: counters.total,
      byType: { ...counters.byType },
    },
  };
}

async function tailLogs({ limit = 200, sinceTs, typeFilter } = {}) {
  const safeLimit = Math.min(Number(limit) || 200, 1000);
  if (!db) {
    let items = memoryLogs.slice(-safeLimit);
    if (sinceTs) {
      items = items.filter((item) => item.ts >= sinceTs);
    }
    if (typeFilter) {
      items = items.filter((item) => item.type === typeFilter);
    }
    return items;
  }

  const where = [];
  const params = [];
  if (sinceTs) {
    where.push('ts >= ?');
    params.push(sinceTs);
  }
  if (typeFilter) {
    where.push('type = ?');
    params.push(typeFilter);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = await dbAll(
    `SELECT ts, type, to_number as to, text_preview as textPreview, has_media as hasMedia,
            media_type as mediaType, size_bytes as sizeBytes, result, error
     FROM send_logs ${clause} ORDER BY ts DESC LIMIT ?`,
    [...params, safeLimit]
  );
  return rows.reverse();
}

initDb()
  .then(loadState)
  .catch((err) => {
    console.error('Ops DB load failed:', err.message);
  });

module.exports = {
  setStatus,
  setQr,
  appendLog,
  getSnapshot,
  tailLogs,
  events: emitter,
};
