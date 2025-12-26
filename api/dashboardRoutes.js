const express = require('express');
const fs = require('fs');
const { EventEmitter } = require('events');
const gatewayState = require('../engine/gatewayState');
const { startClient } = require('../engine/whatsappClient');
const { LOG_FILE } = require('../utils/logger');

const logEvents = new EventEmitter();
let logWatcherStarted = false;
let lastLogLineCount = 0;

function startLogWatcher() {
  if (logWatcherStarted) return;
  logWatcherStarted = true;

  setInterval(() => {
    fs.readFile(LOG_FILE, 'utf8', (err, data) => {
      if (err) {
        if (err.code === 'ENOENT') {
          lastLogLineCount = 0;
        }
        return;
      }

      const lines = data.split(/\r?\n/).filter(Boolean);
      if (lines.length > lastLogLineCount) {
        const newLines = lines.slice(lastLogLineCount);
        newLines.forEach((line) => logEvents.emit('logline', line));
      }

      lastLogLineCount = lines.length;
    });
  }, 1500);
}

function readLastLogLines(limit) {
  return new Promise((resolve) => {
    fs.readFile(LOG_FILE, 'utf8', (err, data) => {
      if (err) {
        return resolve([]);
      }
      const lines = data.split(/\r?\n/).filter(Boolean);
      resolve(lines.slice(-limit));
    });
  });
}

function statusPayload(state) {
  return {
    status: state.status,
    phoneNumber: state.phoneNumber,
    lastQrAt: state.lastQrAt,
    lastDisconnectReason: state.lastDisconnectReason,
    lastError: state.lastError,
    uptimeSec: state.uptimeSec,
    lastStateChangeAt: state.lastStateChangeAt,
  };
}

function createDashboardRoutes() {
  const router = express.Router();

  router.get('/status', (req, res) => {
    const state = gatewayState.getState();
    res.json(statusPayload(state));
  });

  router.get('/qr', (req, res) => {
    const state = gatewayState.getState();
    if (!state.lastQr) {
      return res.status(404).json({ error: 'NO_QR_AVAILABLE' });
    }
    return res.json({ qr: state.lastQr, generatedAt: state.lastQrAt });
  });

  router.get('/logs', async (req, res) => {
    const rawLimit = Number.parseInt(req.query.limit, 10);
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 1000) : 200;
    const lines = await readLastLogLines(limit);
    res.json({ lines });
  });

  router.post('/reconnect', (req, res) => {
    const state = gatewayState.getState();
    if (state.status === 'ready') {
      return res.json({ ok: true, message: 'ALREADY_READY' });
    }
    startClient();
    return res.json({ ok: true, message: 'RECONNECTING' });
  });

  router.get('/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const sendEvent = (event, data) => {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    const state = gatewayState.getState();
    sendEvent('status', statusPayload(state));
    if (state.lastQr) {
      sendEvent('qr', { qr: state.lastQr, generatedAt: state.lastQrAt });
    }

    startLogWatcher();

    const offStatus = gatewayState.onStatus((payload) => {
      sendEvent('status', statusPayload(payload));
    });
    const offQr = gatewayState.onQr((payload) => {
      sendEvent('qr', payload);
    });
    const offAlert = gatewayState.onAlert((payload) => {
      sendEvent('alert', payload);
    });
    const logHandler = (line) => sendEvent('logline', { line });
    logEvents.on('logline', logHandler);

    const ping = setInterval(() => {
      res.write(': ping\n\n');
    }, 25000);

    req.on('close', () => {
      clearInterval(ping);
      offStatus();
      offQr();
      offAlert();
      logEvents.off('logline', logHandler);
      res.end();
    });
  });

  return router;
}

module.exports = {
  createDashboardRoutes,
};
