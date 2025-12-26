const { EventEmitter } = require('events');
const { Client, LocalAuth } = require('whatsapp-web.js');
const path = require('path');
const fs = require('fs');
const instancesRepository = require('../db/repositories/instancesRepository');
const opsLogsRepository = require('../db/repositories/opsLogsRepository');

const emitter = new EventEmitter();
const clients = new Map();
const statusCache = new Map();
const starting = new Set();

function resolveBaseSessionDir() {
  if (process.env.SESSIONS_DIR) {
    return process.env.SESSIONS_DIR;
  }
  const preferred = path.join(path.sep, 'data', '.wwebjs_auth');
  try {
    fs.mkdirSync(preferred, { recursive: true });
    fs.accessSync(preferred, fs.constants.W_OK);
    return preferred;
  } catch (err) {
    const fallback = path.join(__dirname, '..', 'data', '.wwebjs_auth');
    fs.mkdirSync(fallback, { recursive: true });
    return fallback;
  }
}

function buildSessionPath(userId, instanceId) {
  return path.join(resolveBaseSessionDir(), 'app', `user_${userId}`, `instance_${instanceId}`);
}

function cacheStatus(instanceId, payload) {
  const existing = statusCache.get(instanceId) || {};
  statusCache.set(instanceId, { ...existing, ...payload });
}

function getStatus(instanceId) {
  return statusCache.get(instanceId) || null;
}

async function updateStatus(instance, status, extras = {}) {
  cacheStatus(instance.id, {
    id: instance.id,
    ownerUserId: instance.ownerUserId,
    status,
    updatedAt: new Date().toISOString(),
    ...extras,
  });
  await instancesRepository.updateInstanceStatus(instance.ownerUserId, instance.id, status, {
    phone: extras.phone,
    lastQr: extras.lastQr,
    lastReadyAt: extras.lastReadyAt,
    lastDisconnectAt: extras.lastDisconnectAt,
    lastErrorAt: extras.lastErrorAt,
  });
  emitter.emit('status', getStatus(instance.id));
}

function configureClient(instance) {
  if (clients.has(instance.id)) {
    return clients.get(instance.id);
  }

  const client = new Client({
    authStrategy: new LocalAuth({ dataPath: instance.sessionPath }),
    puppeteer: {
      executablePath: '/usr/bin/google-chrome',
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-zygote',
        '--disable-software-rasterizer',
        '--disable-accelerated-2d-canvas',
      ],
    },
    takeoverOnConflict: true,
    takeoverTimeoutMs: 60000,
  });

  client.on('qr', async (qr) => {
    const generatedAt = new Date().toISOString();
    cacheStatus(instance.id, {
      id: instance.id,
      ownerUserId: instance.ownerUserId,
      status: 'qr',
      qr,
      lastQrAt: generatedAt,
    });
    await instancesRepository.updateInstanceStatus(instance.ownerUserId, instance.id, 'qr', { lastQr: qr });
    await opsLogsRepository.appendLog({
      level: 'info',
      type: 'instance_qr',
      instanceId: instance.id,
      message: 'QR generated',
    });
    emitter.emit('qr', {
      id: instance.id,
      ownerUserId: instance.ownerUserId,
      qr,
      generatedAt,
    });
    emitter.emit('status', getStatus(instance.id));
  });

  client.on('authenticated', async () => {
    await updateStatus(instance, 'authenticated');
  });

  client.on('ready', async () => {
    const phone = client?.info?.wid?.user || null;
    await updateStatus(instance, 'ready', { phone, lastReadyAt: new Date().toISOString() });
    await opsLogsRepository.appendLog({
      level: 'info',
      type: 'instance_ready',
      instanceId: instance.id,
      message: 'Instance is ready',
      meta: { phone },
    });
  });

  client.on('disconnected', async (reason) => {
    await updateStatus(instance, 'disconnected', { lastDisconnectAt: new Date().toISOString() });
    await opsLogsRepository.appendLog({
      level: 'warning',
      type: 'instance_disconnected',
      instanceId: instance.id,
      message: 'Instance disconnected',
      meta: { reason: String(reason || 'UNKNOWN') },
    });
  });

  client.on('auth_failure', async () => {
    await updateStatus(instance, 'error', { lastErrorAt: new Date().toISOString() });
    await opsLogsRepository.appendLog({
      level: 'error',
      type: 'instance_auth_failure',
      instanceId: instance.id,
      message: 'Authentication failure',
    });
  });

  client.on('error', async (err) => {
    await updateStatus(instance, 'error', { lastErrorAt: new Date().toISOString() });
    await opsLogsRepository.appendLog({
      level: 'error',
      type: 'instance_error',
      instanceId: instance.id,
      message: err?.message || 'UNKNOWN',
    });
  });

  clients.set(instance.id, client);
  return client;
}

async function startInstance(instance) {
  if (!instance || starting.has(instance.id)) return;
  starting.add(instance.id);
  try {
    if (instance.sessionPath) {
      fs.mkdirSync(instance.sessionPath, { recursive: true });
    }
    const client = configureClient(instance);
    await updateStatus(instance, instance.status || 'initializing');
    try {
      await client.initialize();
    } catch (err) {
      await updateStatus(instance, 'error', { reason: err?.message || 'INIT_FAILED' });
    }
  } finally {
    starting.delete(instance.id);
  }
}

async function createInstance(userId, label) {
  const created = await instancesRepository.createInstance({
    ownerUserId: userId,
    label,
    status: 'stopped',
    sessionPath: null,
  });
  const sessionPath = buildSessionPath(userId, created.id);
  await instancesRepository.updateInstanceSessionPath(userId, created.id, sessionPath);
  const instance = await instancesRepository.getInstanceById(userId, created.id);
  return instance;
}

async function startInstanceById(userId, instanceId) {
  const instance = await instancesRepository.getInstanceById(userId, instanceId);
  if (!instance) return null;
  const existing = clients.get(instance.id);
  if (existing) {
    try {
      await existing.destroy();
    } catch (err) {
      // Best-effort cleanup
    }
    clients.delete(instance.id);
  }
  await startInstance(instance);
  return instance;
}

async function stopInstance(userId, instanceId) {
  const instance = await instancesRepository.getInstanceById(userId, instanceId);
  if (!instance) return null;
  const existing = clients.get(instance.id);
  if (existing) {
    try {
      await existing.destroy();
    } catch (err) {
      // Best-effort cleanup
    }
    clients.delete(instance.id);
  }
  await updateStatus(instance, 'stopped');
  return instance;
}

async function initializeExistingInstances() {
  const all = await instancesRepository.listAllInstances();
  for (const instance of all) {
    if (!instance.sessionPath) {
      const sessionPath = buildSessionPath(instance.ownerUserId, instance.id);
      await instancesRepository.updateInstanceSessionPath(instance.ownerUserId, instance.id, sessionPath);
      instance.sessionPath = sessionPath;
    }
    cacheStatus(instance.id, {
      id: instance.id,
      ownerUserId: instance.ownerUserId,
      status: instance.status,
      updatedAt: instance.updatedAt,
    });
    if (['ready', 'qr', 'authenticated', 'disconnected', 'error', 'initializing'].includes(instance.status)) {
      await startInstance(instance);
    }
  }
}

function getClient(instanceId) {
  return clients.get(instanceId) || null;
}

function getQr(instanceId) {
  return statusCache.get(instanceId)?.qr || null;
}

module.exports = {
  events: emitter,
  createInstance,
  startInstanceById,
  stopInstance,
  initializeExistingInstances,
  getClient,
  getStatus,
  getQr,
};
