const express = require('express');
const instanceManager = require('../instances/instanceManager');
const campaignsRepository = require('../db/repositories/campaignsRepository');
const instancesRepository = require('../db/repositories/instancesRepository');
const opsLogsRepository = require('../db/repositories/opsLogsRepository');

function createEventsRoutes() {
  const router = express.Router();

  router.get('/', async (req, res, next) => {
    try {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders?.();

      const sendEvent = (event, data) => {
        res.write(`event: ${event}\n`);
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      };

      const instances = await instancesRepository.listInstancesByUser(req.user.id);
      instances.forEach((instance) => {
        const status = instanceManager.getStatus(instance.id);
        sendEvent('instance_status', {
          id: instance.id,
          ownerUserId: req.user.id,
          label: instance.label,
          status: status?.status || instance.status,
          lastQrAt: status?.lastQrAt || instance.lastQr || null,
          lastReadyAt: status?.lastReadyAt || instance.lastReadyAt || null,
          lastDisconnectAt: status?.lastDisconnectAt || instance.lastDisconnectAt || null,
          lastErrorAt: status?.lastErrorAt || instance.lastErrorAt || null,
          phone: status?.phone || null,
        });
      });

      const campaigns = await campaignsRepository.listCampaignsByUser(req.user.id);
      for (const campaign of campaigns) {
        const stats = await campaignsRepository.getRecipientStats(req.user.id, campaign.id);
        sendEvent('campaign_progress', { campaign, stats });
      }

      const logs = await opsLogsRepository.listLogsForUser(req.user.id, 20);
      logs.forEach((log) => {
        sendEvent('ops_log', log);
      });

      const statusHandler = (payload) => {
        if (payload?.ownerUserId !== req.user.id) return;
        sendEvent('instance_status', payload);
      };
      const qrHandler = (payload) => {
        if (payload?.ownerUserId !== req.user.id) return;
        sendEvent('instance_qr', payload);
      };

      const campaignProgressHandler = async (payload) => {
        if (payload?.ownerUserId !== req.user.id) return;
        const campaign = await campaignsRepository.getCampaignById(req.user.id, payload.campaignId || payload.id);
        if (!campaign) return;
        const stats = await campaignsRepository.getRecipientStats(req.user.id, campaign.id);
        sendEvent('campaign_progress', { campaign, stats });
      };

      instanceManager.events.on('status', statusHandler);
      instanceManager.events.on('qr', qrHandler);
      opsLogsRepository.events.on('log', opsLogHandler);

      const queueEngine = require('../queue/queueEngine');
      queueEngine.on('campaign_progress', campaignProgressHandler);
      const queueJobHandler = (payload) => {
        if (payload?.ownerUserId !== req.user.id) return;
        sendEvent('queue_job_update', payload);
      };
      queueEngine.on('queue_job_update', queueJobHandler);

      const ping = setInterval(() => {
        res.write(': ping\n\n');
      }, 25000);

      req.on('close', () => {
        clearInterval(ping);
        instanceManager.events.off('status', statusHandler);
        instanceManager.events.off('qr', qrHandler);
        opsLogsRepository.events.off('log', opsLogHandler);
        queueEngine.off('campaign_progress', campaignProgressHandler);
        queueEngine.off('queue_job_update', queueJobHandler);
        res.end();
      });
    } catch (err) {
      return next(err);
    }
  });

  return router;
}

module.exports = {
  createEventsRoutes,
};
      const opsLogHandler = (payload) => {
        if (!payload.instanceId && !payload.campaignId) return;
        (async () => {
          if (payload.instanceId) {
            const instance = await instancesRepository.getInstanceById(req.user.id, payload.instanceId);
            if (!instance) return;
          }
          if (payload.campaignId) {
            const campaign = await campaignsRepository.getCampaignById(req.user.id, payload.campaignId);
            if (!campaign) return;
          }
          sendEvent('ops_log', payload);
        })().catch(() => {});
      };
