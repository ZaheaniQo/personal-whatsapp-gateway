const express = require('express');
const multer = require('multer');
const campaignsRepository = require('../db/repositories/campaignsRepository');
const instancesRepository = require('../db/repositories/instancesRepository');
const queueEngine = require('../queue/queueEngine');

const upload = multer({ storage: multer.memoryStorage() });

function normalizeNumber(value) {
  return String(value || '').replace(/\D/g, '');
}

function parseRecipients(list) {
  if (!list) return [];
  if (Array.isArray(list)) {
    return list.map(normalizeNumber).filter(Boolean);
  }
  return [normalizeNumber(list)].filter(Boolean);
}

function parseCsv(buffer) {
  if (!buffer) return [];
  const text = buffer.toString('utf8');
  return text
    .split(/\r?\n/)
    .map((line) => line.split(',')[0])
    .map(normalizeNumber)
    .filter(Boolean);
}

function createCampaignRoutes() {
  const router = express.Router();

  router.get('/', async (req, res, next) => {
    try {
      const campaigns = await campaignsRepository.listCampaignsByUser(req.user.id);
      return res.json(campaigns);
    } catch (err) {
      return next(err);
    }
  });

  router.post('/', upload.single('recipients_csv'), async (req, res, next) => {
    try {
      const instanceId = Number.parseInt(req.body.instance_id, 10);
      const name = String(req.body.name || '');
      const message = req.body.message ? String(req.body.message) : '';
      const mediaRef = req.body.media_ref ? String(req.body.media_ref) : null;

      if (!instanceId || !name) {
        return res.status(400).json({ error: 'INSTANCE_AND_NAME_REQUIRED' });
      }
      if (!message && !mediaRef) {
        return res.status(400).json({ error: 'MESSAGE_OR_MEDIA_REQUIRED' });
      }

      const instance = await instancesRepository.getInstanceById(req.user.id, instanceId);
      if (!instance) {
        return res.status(404).json({ error: 'INSTANCE_NOT_FOUND' });
      }

      const recipients = [
        ...parseRecipients(req.body.recipients),
        ...parseCsv(req.file?.buffer),
      ];

      if (!recipients.length) {
        return res.status(400).json({ error: 'RECIPIENTS_REQUIRED' });
      }

      const campaign = await campaignsRepository.createCampaign({
        ownerUserId: req.user.id,
        instanceId,
        name,
        message,
        mediaRef,
        status: 'draft',
      });

      await campaignsRepository.addRecipients(campaign.id, recipients);
      const storedRecipients = await campaignsRepository.listRecipientsByCampaign(campaign.id);
      await queueEngine.enqueueCampaignJobs(req.user.id, campaign.id, storedRecipients);

      return res.json(campaign);
    } catch (err) {
      return next(err);
    }
  });

  router.post('/:id/start', async (req, res, next) => {
    try {
      const campaignId = Number.parseInt(req.params.id, 10);
      const campaign = await campaignsRepository.getCampaignById(req.user.id, campaignId);
      if (!campaign) {
        return res.status(404).json({ error: 'CAMPAIGN_NOT_FOUND' });
      }
      await queueEngine.startCampaign(req.user.id, campaignId);
      return res.json({ status: 'running' });
    } catch (err) {
      return next(err);
    }
  });

  router.post('/:id/pause', async (req, res, next) => {
    try {
      const campaignId = Number.parseInt(req.params.id, 10);
      const campaign = await campaignsRepository.getCampaignById(req.user.id, campaignId);
      if (!campaign) {
        return res.status(404).json({ error: 'CAMPAIGN_NOT_FOUND' });
      }
      await queueEngine.pauseCampaign(req.user.id, campaignId);
      return res.json({ status: 'paused' });
    } catch (err) {
      return next(err);
    }
  });

  router.post('/:id/cancel', async (req, res, next) => {
    try {
      const campaignId = Number.parseInt(req.params.id, 10);
      const campaign = await campaignsRepository.getCampaignById(req.user.id, campaignId);
      if (!campaign) {
        return res.status(404).json({ error: 'CAMPAIGN_NOT_FOUND' });
      }
      await queueEngine.cancelCampaign(req.user.id, campaignId);
      return res.json({ status: 'canceled' });
    } catch (err) {
      return next(err);
    }
  });

  router.get('/:id/progress', async (req, res, next) => {
    try {
      const campaignId = Number.parseInt(req.params.id, 10);
      const campaign = await campaignsRepository.getCampaignById(req.user.id, campaignId);
      if (!campaign) {
        return res.status(404).json({ error: 'CAMPAIGN_NOT_FOUND' });
      }
      const stats = await campaignsRepository.getRecipientStats(req.user.id, campaignId);
      return res.json({ campaign, stats });
    } catch (err) {
      return next(err);
    }
  });

  return router;
}

module.exports = {
  createCampaignRoutes,
};
