const { EventEmitter } = require('events');
const { MessageMedia } = require('whatsapp-web.js');
const queueJobsRepository = require('../db/repositories/queueJobsRepository');
const campaignsRepository = require('../db/repositories/campaignsRepository');
const instancesRepository = require('../db/repositories/instancesRepository');
const opsLogsRepository = require('../db/repositories/opsLogsRepository');
const instanceManager = require('../instances/instanceManager');

const SEND_DELAY_MS = Number.parseInt(process.env.SEND_DELAY_MS, 10) || 1200;
const MAX_ATTEMPTS = 3;
const POLL_INTERVAL_MS = 1000;

class QueueEngine extends EventEmitter {
  constructor() {
    super();
    this.running = false;
    this.lastSentAt = new Map();
    this.timer = null;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.timer = setInterval(() => {
      this.tick().catch(() => {});
    }, POLL_INTERVAL_MS);
  }

  stop() {
    if (!this.running) return;
    clearInterval(this.timer);
    this.running = false;
  }

  async tick() {
    const jobs = await queueJobsRepository.listDueJobs(5);
    for (const job of jobs) {
      await this.processJob(job);
    }
  }

  async processJob(job) {
    const payload = job.payloadJson ? JSON.parse(job.payloadJson) : {};
    const now = Date.now();
    const lastSent = this.lastSentAt.get(job.instanceId) || 0;
    if (now - lastSent < SEND_DELAY_MS) {
      const nextRunAt = new Date(lastSent + SEND_DELAY_MS).toISOString();
      await queueJobsRepository.updateJobStatus(job.id, 'pending', {
        attempts: job.attempts,
        nextRunAt,
        lastError: null,
      });
      return;
    }

    const instanceStatus = instanceManager.getStatus(job.instanceId);
    if (!instanceStatus || instanceStatus.status !== 'ready') {
      await queueJobsRepository.updateJobStatus(job.id, 'pending', {
        attempts: job.attempts,
        nextRunAt: new Date(Date.now() + SEND_DELAY_MS).toISOString(),
        lastError: 'INSTANCE_NOT_READY',
      });
      return;
    }

    try {
      await this.handleJob(job, payload);
      this.lastSentAt.set(job.instanceId, Date.now());
      await queueJobsRepository.updateJobStatus(job.id, 'completed', {
        attempts: job.attempts + 1,
        nextRunAt: job.nextRunAt,
        lastError: null,
      });
      await opsLogsRepository.appendLog({
        level: 'info',
        type: 'queue_job',
        instanceId: job.instanceId,
        campaignId: job.campaignId,
        message: 'Queue job completed',
        meta: { jobId: job.id },
      });
      this.emit('queue_job_update', {
        jobId: job.id,
        status: 'completed',
        instanceId: job.instanceId,
        ownerUserId: job.ownerUserId,
      });
      if (job.campaignId) {
        await this.checkCampaignCompletion(job.ownerUserId, job.campaignId);
      }
    } catch (err) {
      const attempts = job.attempts + 1;
      const shouldRetry = attempts < MAX_ATTEMPTS;
      const nextRunAt = new Date(Date.now() + attempts * SEND_DELAY_MS).toISOString();
      const status = shouldRetry ? 'pending' : 'failed';
      if (payload.recipientId) {
        await campaignsRepository.updateRecipientStatus(
          payload.recipientId,
          shouldRetry ? 'retry' : 'failed',
          err?.message || 'SEND_FAILED'
        );
      }
      await queueJobsRepository.updateJobStatus(job.id, status, {
        attempts,
        nextRunAt,
        lastError: err?.message || 'SEND_FAILED',
      });
      await opsLogsRepository.appendLog({
        level: 'error',
        type: 'queue_job_error',
        instanceId: job.instanceId,
        campaignId: job.campaignId,
        message: err?.message || 'SEND_FAILED',
        meta: { jobId: job.id, attempts },
      });
      this.emit('queue_job_update', {
        jobId: job.id,
        status,
        instanceId: job.instanceId,
        ownerUserId: job.ownerUserId,
      });
      if (!shouldRetry && job.campaignId) {
        await campaignsRepository.updateCampaignStatus(job.ownerUserId, job.campaignId, 'paused');
        await queueJobsRepository.pauseJobsByCampaign(job.campaignId);
        await this.checkCampaignCompletion(job.ownerUserId, job.campaignId);
      }
    }
  }

  async handleJob(job, payload) {
    if (job.jobType !== 'send_message') {
      throw new Error('UNSUPPORTED_JOB');
    }

    const campaign = job.campaignId
      ? await campaignsRepository.getCampaignById(job.ownerUserId, job.campaignId)
      : null;
    const recipientId = payload.recipientId;
    const number = payload.number;
    const message = payload.message || campaign?.message;
    const mediaRef = payload.mediaRef || campaign?.mediaRef;

    if (!number) {
      throw new Error('MISSING_NUMBER');
    }

    const client = instanceManager.getClient(job.instanceId);
    if (!client) {
      throw new Error('INSTANCE_NOT_CONNECTED');
    }

    const chatId = number.endsWith('@c.us') ? number : number.replace(/\D/g, '') + '@c.us';
    if (mediaRef) {
      const media = MessageMedia.fromFilePath(mediaRef);
      await client.sendMessage(chatId, media, { caption: message || '' });
    } else if (message) {
      await client.sendMessage(chatId, message);
    } else {
      throw new Error('EMPTY_MESSAGE');
    }

    if (recipientId) {
      await campaignsRepository.updateRecipientStatus(recipientId, 'sent', null);
    }
  }

  async checkCampaignCompletion(ownerUserId, campaignId) {
    const stats = await campaignsRepository.getRecipientStats(ownerUserId, campaignId);
    const pending = (stats.pending || 0) + (stats.retry || 0);
    if (pending > 0) {
      this.emit('campaign_progress', { campaignId, ownerUserId });
      return;
    }
    await campaignsRepository.updateCampaignStatus(ownerUserId, campaignId, 'completed');
    this.emit('campaign_progress', { campaignId, ownerUserId });
  }

  async enqueueCampaignJobs(ownerUserId, campaignId, recipients) {
    const campaign = await campaignsRepository.getCampaignById(ownerUserId, campaignId);
    if (!campaign) return;
    for (const recipient of recipients) {
      await queueJobsRepository.createJob({
        ownerUserId,
        instanceId: campaign.instanceId,
        campaignId: campaign.id,
        jobType: 'send_message',
        payload: {
          recipientId: recipient.id,
          number: recipient.number,
          message: campaign.message,
          mediaRef: campaign.mediaRef,
        },
        status: 'paused',
        nextRunAt: new Date().toISOString(),
      });
    }
  }

  async startCampaign(ownerUserId, campaignId) {
    await queueJobsRepository.resumeJobsByCampaign(campaignId);
    await campaignsRepository.updateCampaignStatus(ownerUserId, campaignId, 'running');
    this.emit('campaign_progress', { campaignId, ownerUserId });
  }

  async pauseCampaign(ownerUserId, campaignId) {
    await queueJobsRepository.pauseJobsByCampaign(campaignId);
    await campaignsRepository.updateCampaignStatus(ownerUserId, campaignId, 'paused');
    this.emit('campaign_progress', { campaignId, ownerUserId });
  }

  async cancelCampaign(ownerUserId, campaignId) {
    await queueJobsRepository.cancelJobsByCampaign(campaignId);
    await campaignsRepository.updateCampaignStatus(ownerUserId, campaignId, 'canceled');
    const recipients = await campaignsRepository.listRecipientsByCampaign(campaignId);
    await Promise.all(
      recipients.map((recipient) =>
        campaignsRepository.updateRecipientStatus(recipient.id, 'canceled', 'Campaign canceled')
      )
    );
    this.emit('campaign_progress', { campaignId, ownerUserId });
  }
}

module.exports = new QueueEngine();
