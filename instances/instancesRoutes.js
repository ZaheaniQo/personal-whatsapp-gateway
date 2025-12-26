const express = require('express');
const instanceManager = require('./instanceManager');
const instancesRepository = require('../db/repositories/instancesRepository');

function createInstancesRoutes() {
  const router = express.Router();

  router.post('/', async (req, res, next) => {
    try {
      const label = req.body.label ? String(req.body.label) : null;
      const instance = await instanceManager.createInstance(req.user.id, label);
      return res.json({
        id: instance.id,
        label: instance.label,
        status: instance.status,
      });
    } catch (err) {
      return next(err);
    }
  });

  router.get('/', async (req, res, next) => {
    try {
      const instances = await instancesRepository.listInstancesByUser(req.user.id);
      const enriched = instances.map((item) => {
        const status = instanceManager.getStatus(item.id);
        return {
          id: item.id,
          label: item.label,
          status: status?.status || item.status,
          phone: status?.phone || item.phone || null,
          lastQrAt: status?.lastQrAt || item.lastQr || null,
          lastReadyAt: status?.lastReadyAt || item.lastReadyAt || null,
          lastDisconnectAt: status?.lastDisconnectAt || item.lastDisconnectAt || null,
          lastErrorAt: status?.lastErrorAt || item.lastErrorAt || null,
        };
      });
      return res.json(enriched);
    } catch (err) {
      return next(err);
    }
  });

  router.get('/:id/qr', async (req, res, next) => {
    try {
      const instanceId = Number.parseInt(req.params.id, 10);
      const instance = await instancesRepository.getInstanceById(req.user.id, instanceId);
      if (!instance) {
        return res.status(404).json({ error: 'INSTANCE_NOT_FOUND' });
      }
      const qr = instanceManager.getQr(instanceId);
      if (!qr) {
        return res.status(404).json({ error: 'NO_QR_AVAILABLE' });
      }
      return res.json({ qr });
    } catch (err) {
      return next(err);
    }
  });

  router.get('/:id/status', async (req, res, next) => {
    try {
      const instanceId = Number.parseInt(req.params.id, 10);
      const instance = await instancesRepository.getInstanceById(req.user.id, instanceId);
      if (!instance) {
        return res.status(404).json({ error: 'INSTANCE_NOT_FOUND' });
      }
      const status = instanceManager.getStatus(instanceId) || instance;
      return res.json({
        id: instance.id,
        label: instance.label,
        status: status.status || instance.status,
        phone: status.phone || instance.phone || null,
        lastQrAt: status.lastQrAt || instance.lastQr || null,
        lastReadyAt: status.lastReadyAt || instance.lastReadyAt || null,
        lastDisconnectAt: status.lastDisconnectAt || instance.lastDisconnectAt || null,
        lastErrorAt: status.lastErrorAt || instance.lastErrorAt || null,
      });
    } catch (err) {
      return next(err);
    }
  });

  router.post('/:id/start', async (req, res, next) => {
    try {
      const instanceId = Number.parseInt(req.params.id, 10);
      const instance = await instanceManager.startInstanceById(req.user.id, instanceId);
      if (!instance) {
        return res.status(404).json({ error: 'INSTANCE_NOT_FOUND' });
      }
      return res.json({ ok: true });
    } catch (err) {
      return next(err);
    }
  });

  router.post('/:id/stop', async (req, res, next) => {
    try {
      const instanceId = Number.parseInt(req.params.id, 10);
      const instance = await instanceManager.stopInstance(req.user.id, instanceId);
      if (!instance) {
        return res.status(404).json({ error: 'INSTANCE_NOT_FOUND' });
      }
      return res.json({ ok: true });
    } catch (err) {
      return next(err);
    }
  });

  return router;
}

module.exports = {
  createInstancesRoutes,
};
