const { initDb, dbRun, dbGet, dbAll } = require('../index');

async function createInstance({ ownerUserId, label, status, sessionPath }) {
  await initDb();
  const now = new Date().toISOString();
  const result = await dbRun(
    `INSERT INTO instances (owner_user_id, label, status, session_path, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [ownerUserId, label || null, status, sessionPath || null, now, now]
  );
  return getInstanceById(ownerUserId, result.lastID);
}

async function getInstanceById(ownerUserId, instanceId) {
  await initDb();
  return dbGet(
    `SELECT id, owner_user_id as ownerUserId, label, status, session_path as sessionPath,
            phone, last_qr as lastQr, last_ready_at as lastReadyAt,
            last_disconnect_at as lastDisconnectAt, last_error_at as lastErrorAt,
            created_at as createdAt, updated_at as updatedAt
     FROM instances WHERE id = ? AND owner_user_id = ?`,
    [instanceId, ownerUserId]
  );
}

async function listInstancesByUser(ownerUserId) {
  await initDb();
  return dbAll(
    `SELECT id, owner_user_id as ownerUserId, label, status, session_path as sessionPath,
            phone, last_qr as lastQr, last_ready_at as lastReadyAt,
            last_disconnect_at as lastDisconnectAt, last_error_at as lastErrorAt,
            created_at as createdAt, updated_at as updatedAt
     FROM instances WHERE owner_user_id = ? ORDER BY id DESC`,
    [ownerUserId]
  );
}

async function listAllInstances() {
  await initDb();
  return dbAll(
    `SELECT id, owner_user_id as ownerUserId, label, status, session_path as sessionPath,
            phone, last_qr as lastQr, last_ready_at as lastReadyAt,
            last_disconnect_at as lastDisconnectAt, last_error_at as lastErrorAt,
            created_at as createdAt, updated_at as updatedAt
     FROM instances ORDER BY id ASC`,
    []
  );
}

async function updateInstanceSessionPath(ownerUserId, instanceId, sessionPath) {
  await initDb();
  return dbRun(
    `UPDATE instances SET session_path = ?, updated_at = ? WHERE id = ? AND owner_user_id = ?`,
    [sessionPath, new Date().toISOString(), instanceId, ownerUserId]
  );
}

async function updateInstanceStatus(ownerUserId, instanceId, status, updates = {}) {
  await initDb();
  const payload = {
    phone: updates.phone || null,
    lastQr: updates.lastQr || null,
    lastReadyAt: updates.lastReadyAt || null,
    lastDisconnectAt: updates.lastDisconnectAt || null,
    lastErrorAt: updates.lastErrorAt || null,
  };
  return dbRun(
    `UPDATE instances
     SET status = ?, phone = COALESCE(?, phone), last_qr = COALESCE(?, last_qr),
         last_ready_at = COALESCE(?, last_ready_at), last_disconnect_at = COALESCE(?, last_disconnect_at),
         last_error_at = COALESCE(?, last_error_at), updated_at = ?
     WHERE id = ? AND owner_user_id = ?`,
    [
      status,
      payload.phone,
      payload.lastQr,
      payload.lastReadyAt,
      payload.lastDisconnectAt,
      payload.lastErrorAt,
      new Date().toISOString(),
      instanceId,
      ownerUserId,
    ]
  );
}

module.exports = {
  createInstance,
  getInstanceById,
  listInstancesByUser,
  listAllInstances,
  updateInstanceSessionPath,
  updateInstanceStatus,
};
