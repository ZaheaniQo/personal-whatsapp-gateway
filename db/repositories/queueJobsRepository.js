const { initDb, dbRun, dbGet, dbAll } = require('../index');

async function createJob({ ownerUserId, instanceId, campaignId, jobType, payload, status, nextRunAt }) {
  await initDb();
  const now = new Date().toISOString();
  const result = await dbRun(
    `INSERT INTO queue_jobs
     (owner_user_id, instance_id, campaign_id, job_type, payload_json, status, attempts, next_run_at, last_error, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      ownerUserId,
      instanceId,
      campaignId || null,
      jobType,
      JSON.stringify(payload || {}),
      status,
      0,
      nextRunAt || now,
      null,
      now,
      now,
    ]
  );
  return getJobById(result.lastID);
}

async function getJobById(jobId) {
  await initDb();
  return dbGet(
    `SELECT id, owner_user_id as ownerUserId, instance_id as instanceId, campaign_id as campaignId,
            job_type as jobType, payload_json as payloadJson, status, attempts, next_run_at as nextRunAt,
            last_error as lastError, created_at as createdAt, updated_at as updatedAt
     FROM queue_jobs WHERE id = ?`,
    [jobId]
  );
}

async function listDueJobs(limit = 10) {
  await initDb();
  return dbAll(
    `SELECT id, owner_user_id as ownerUserId, instance_id as instanceId, campaign_id as campaignId,
            job_type as jobType, payload_json as payloadJson, status, attempts, next_run_at as nextRunAt,
            last_error as lastError, created_at as createdAt, updated_at as updatedAt
     FROM queue_jobs
     WHERE status = 'pending' AND next_run_at <= ?
     ORDER BY next_run_at ASC LIMIT ?`,
    [new Date().toISOString(), limit]
  );
}

async function updateJobStatus(jobId, status, updates = {}) {
  await initDb();
  return dbRun(
    `UPDATE queue_jobs
     SET status = ?, attempts = ?, next_run_at = ?, last_error = ?, updated_at = ?
     WHERE id = ?`,
    [
      status,
      updates.attempts,
      updates.nextRunAt,
      updates.lastError || null,
      new Date().toISOString(),
      jobId,
    ]
  );
}

async function pauseJobsByCampaign(campaignId, status = 'paused') {
  await initDb();
  return dbRun(
    `UPDATE queue_jobs SET status = ?, updated_at = ? WHERE campaign_id = ? AND status = 'pending'`,
    [status, new Date().toISOString(), campaignId]
  );
}

async function resumeJobsByCampaign(campaignId) {
  await initDb();
  return dbRun(
    `UPDATE queue_jobs SET status = 'pending', updated_at = ? WHERE campaign_id = ? AND status = 'paused'`,
    [new Date().toISOString(), campaignId]
  );
}

async function cancelJobsByCampaign(campaignId) {
  await initDb();
  return dbRun(
    `UPDATE queue_jobs SET status = 'canceled', updated_at = ? WHERE campaign_id = ?`,
    [new Date().toISOString(), campaignId]
  );
}

module.exports = {
  createJob,
  getJobById,
  listDueJobs,
  updateJobStatus,
  pauseJobsByCampaign,
  resumeJobsByCampaign,
  cancelJobsByCampaign,
};
