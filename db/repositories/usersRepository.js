const { initDb, dbRun, dbGet, dbAll } = require('../index');

async function createUser({ mobile, passwordHash }) {
  await initDb();
  const createdAt = new Date().toISOString();
  const result = await dbRun(
    `INSERT INTO users (mobile, password_hash, created_at)
     VALUES (?, ?, ?)`,
    [mobile, passwordHash, createdAt]
  );
  return getUserById(result.lastID);
}

async function getUserByMobile(mobile) {
  await initDb();
  return dbGet(
    `SELECT id, mobile, password_hash as passwordHash, created_at as createdAt
     FROM users WHERE mobile = ?`,
    [mobile]
  );
}

async function getUserById(userId) {
  await initDb();
  return dbGet(
    `SELECT id, mobile, password_hash as passwordHash, created_at as createdAt
     FROM users WHERE id = ?`,
    [userId]
  );
}

async function countUsers() {
  await initDb();
  const row = await dbGet('SELECT COUNT(*) as count FROM users', []);
  return row?.count || 0;
}

module.exports = {
  createUser,
  getUserByMobile,
  getUserById,
  countUsers,
};
