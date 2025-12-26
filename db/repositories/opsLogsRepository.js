const { EventEmitter } = require('events');
const { initDb, dbRun, dbAll } = require('../index');

const events = new EventEmitter();

async function appendLog({ level, type, instanceId, campaignId, message, meta }) {
  await initDb();
  const createdAt = new Date().toISOString();
  await dbRun(
    `INSERT INTO ops_logs (level, type, instance_id, campaign_id, message, meta_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      level || 'info',
      type || 'system',
      instanceId || null,
      campaignId || null,
      message || '',
      meta ? JSON.stringify(meta) : null,
      createdAt,
    ]
  );
  events.emit('log', {
    level: level || 'info',
    type: type || 'system',
    instanceId: instanceId || null,
    campaignId: campaignId || null,
    message: message || '',
    metaJson: meta ? JSON.stringify(meta) : null,
    createdAt,
  });
}

async function listLogsForUser(ownerUserId, limit = 50) {
  await initDb();
  return dbAll(
    `SELECT ops_logs.id, ops_logs.level, ops_logs.type, ops_logs.instance_id as instanceId,
            ops_logs.campaign_id as campaignId, ops_logs.message, ops_logs.meta_json as metaJson,
            ops_logs.created_at as createdAt
     FROM ops_logs
     LEFT JOIN instances ON instances.id = ops_logs.instance_id
     LEFT JOIN campaigns ON campaigns.id = ops_logs.campaign_id
     WHERE instances.owner_user_id = ? OR campaigns.owner_user_id = ?
     ORDER BY ops_logs.created_at DESC LIMIT ?`,
    [ownerUserId, ownerUserId, limit]
  );
}

module.exports = {
  appendLog,
  listLogsForUser,
  events,
};
