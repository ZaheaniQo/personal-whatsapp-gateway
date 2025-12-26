const { initDb, dbRun, dbGet, dbAll, dbExec } = require('../index');

async function createCampaign({ ownerUserId, instanceId, name, message, mediaRef, status }) {
  await initDb();
  const now = new Date().toISOString();
  const result = await dbRun(
    `INSERT INTO campaigns (owner_user_id, name, instance_id, message, media_ref, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [ownerUserId, name, instanceId, message, mediaRef || null, status, now, now]
  );
  return getCampaignById(ownerUserId, result.lastID);
}

async function getCampaignById(ownerUserId, campaignId) {
  await initDb();
  return dbGet(
    `SELECT id, owner_user_id as ownerUserId, name, instance_id as instanceId, message,
            media_ref as mediaRef, status, created_at as createdAt, updated_at as updatedAt
     FROM campaigns WHERE id = ? AND owner_user_id = ?`,
    [campaignId, ownerUserId]
  );
}

async function listCampaignsByUser(ownerUserId) {
  await initDb();
  return dbAll(
    `SELECT id, owner_user_id as ownerUserId, name, instance_id as instanceId, message,
            media_ref as mediaRef, status, created_at as createdAt, updated_at as updatedAt
     FROM campaigns WHERE owner_user_id = ? ORDER BY id DESC`,
    [ownerUserId]
  );
}

async function updateCampaignStatus(ownerUserId, campaignId, status) {
  await initDb();
  return dbRun(
    `UPDATE campaigns SET status = ?, updated_at = ? WHERE id = ? AND owner_user_id = ?`,
    [status, new Date().toISOString(), campaignId, ownerUserId]
  );
}

async function addRecipients(campaignId, recipients) {
  await initDb();
  const now = new Date().toISOString();
  await dbExec('BEGIN');
  try {
    for (const number of recipients) {
      await dbRun(
        `INSERT INTO campaign_recipients (campaign_id, number, status, last_error, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [campaignId, number, 'pending', null, now, now]
      );
    }
    await dbExec('COMMIT');
  } catch (err) {
    await dbExec('ROLLBACK');
    throw err;
  }
}

async function getRecipientStats(ownerUserId, campaignId) {
  await initDb();
  const rows = await dbAll(
    `SELECT status, COUNT(*) as count
     FROM campaign_recipients
     WHERE campaign_id = ? AND campaign_id IN (
       SELECT id FROM campaigns WHERE id = ? AND owner_user_id = ?
     )
     GROUP BY status`,
    [campaignId, campaignId, ownerUserId]
  );
  const counts = { pending: 0, sent: 0, failed: 0, retry: 0, canceled: 0 };
  rows.forEach((row) => {
    counts[row.status] = row.count;
  });
  return counts;
}

async function updateRecipientStatus(recipientId, status, error) {
  await initDb();
  return dbRun(
    `UPDATE campaign_recipients SET status = ?, last_error = ?, updated_at = ? WHERE id = ?`,
    [status, error || null, new Date().toISOString(), recipientId]
  );
}

async function listRecipientsByCampaign(campaignId) {
  await initDb();
  return dbAll(
    `SELECT id, campaign_id as campaignId, number, status, last_error as lastError,
            created_at as createdAt, updated_at as updatedAt
     FROM campaign_recipients WHERE campaign_id = ? ORDER BY id ASC`,
    [campaignId]
  );
}

module.exports = {
  createCampaign,
  getCampaignById,
  listCampaignsByUser,
  updateCampaignStatus,
  addRecipients,
  getRecipientStats,
  updateRecipientStatus,
  listRecipientsByCampaign,
};
