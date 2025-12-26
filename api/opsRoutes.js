const express = require('express');
const stateStore = require('../ops/stateStore');

function createOpsRoutes() {
  const router = express.Router();

  router.get('/status', (req, res) => {
    res.json(stateStore.getSnapshot());
  });

  router.get('/instances', (req, res) => {
    const snapshot = stateStore.getSnapshot();
    res.json([{ id: 'default', status: snapshot.status, phone: snapshot.phone }]);
  });

  router.get('/logs', async (req, res) => {
    const limit = Number.parseInt(req.query.limit, 10);
    const sinceTs = req.query.sinceTs ? Number.parseInt(req.query.sinceTs, 10) : null;
    const typeFilter = req.query.type || null;
    const lines = await stateStore.tailLogs({
      limit: Number.isFinite(limit) ? limit : 200,
      sinceTs: Number.isFinite(sinceTs) ? sinceTs : null,
      typeFilter: typeFilter || null,
    });
    res.json(lines);
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

    const snapshot = stateStore.getSnapshot();
    sendEvent('status', snapshot);
    if (snapshot.qr) {
      sendEvent('qr', { qr: snapshot.qr, generatedAt: snapshot.lastQrAt });
    }

    const statusHandler = (payload) => sendEvent('status', payload);
    const qrHandler = (payload) => sendEvent('qr', payload);
    const logHandler = (payload) => sendEvent('log', payload);

    stateStore.events.on('statusChanged', statusHandler);
    stateStore.events.on('qrChanged', qrHandler);
    stateStore.events.on('logAppended', logHandler);

    const ping = setInterval(() => {
      res.write(': ping\n\n');
    }, 25000);

    req.on('close', () => {
      clearInterval(ping);
      stateStore.events.off('statusChanged', statusHandler);
      stateStore.events.off('qrChanged', qrHandler);
      stateStore.events.off('logAppended', logHandler);
      res.end();
    });
  });

  return router;
}

module.exports = {
  createOpsRoutes,
};
