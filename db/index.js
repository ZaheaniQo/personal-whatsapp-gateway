const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3');

let db = null;
let initPromise = null;

function resolveDbPath() {
  if (process.env.APP_DB_PATH) {
    return process.env.APP_DB_PATH;
  }

  const preferred = path.join(path.sep, 'data', 'campaigns.sqlite');
  try {
    fs.mkdirSync(path.dirname(preferred), { recursive: true });
    fs.accessSync(path.dirname(preferred), fs.constants.W_OK);
    return preferred;
  } catch (err) {
    const fallback = path.join(__dirname, '..', 'data', 'campaigns.sqlite');
    fs.mkdirSync(path.dirname(fallback), { recursive: true });
    return fallback;
  }
}

function openDb() {
  if (db) return db;
  const dbPath = resolveDbPath();
  db = new sqlite3.Database(dbPath);
  return db;
}

function dbExec(sql) {
  if (!db) return Promise.resolve();
  return new Promise((resolve, reject) => {
    db.exec(sql, (err) => {
      if (err) return reject(err);
      return resolve();
    });
  });
}

function dbRun(sql, params = []) {
  if (!db) return Promise.resolve({ lastID: null, changes: 0 });
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) return reject(err);
      return resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function dbGet(sql, params = []) {
  if (!db) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      return resolve(row || null);
    });
  });
}

function dbAll(sql, params = []) {
  if (!db) return Promise.resolve([]);
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      return resolve(rows || []);
    });
  });
}

async function runMigrations() {
  const migrationsDir = path.join(__dirname, 'migrations');
  const files = fs.existsSync(migrationsDir)
    ? fs.readdirSync(migrationsDir).filter((file) => file.endsWith('.sql')).sort()
    : [];

  await dbExec(
    `CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE,
      applied_at TEXT
    )`
  );

  const applied = await dbAll('SELECT name FROM migrations', []);
  const appliedSet = new Set(applied.map((row) => row.name));

  for (const file of files) {
    if (appliedSet.has(file)) continue;
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    await dbExec(sql);
    await dbRun('INSERT INTO migrations (name, applied_at) VALUES (?, ?)', [
      file,
      new Date().toISOString(),
    ]);
  }
}

async function tableExists(tableName) {
  const row = await dbGet(
    `SELECT name FROM sqlite_master WHERE type='table' AND name = ?`,
    [tableName]
  );
  return Boolean(row);
}

async function getTableColumns(tableName) {
  const rows = await dbAll(`PRAGMA table_info(${tableName})`, []);
  return rows.map((row) => row.name);
}

async function ensureColumn(tableName, columnName, definition) {
  const columns = await getTableColumns(tableName);
  if (columns.includes(columnName)) return;
  await dbExec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
}

async function ensureSchemaUpgrades() {
  await dbExec(
    `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      mobile TEXT UNIQUE,
      password_hash TEXT,
      created_at TEXT
    )`
  );
  await dbExec(
    `CREATE TABLE IF NOT EXISTS instances (
      id INTEGER PRIMARY KEY,
      owner_user_id INTEGER,
      label TEXT,
      status TEXT,
      session_path TEXT,
      phone TEXT,
      last_qr TEXT,
      last_ready_at TEXT,
      last_disconnect_at TEXT,
      last_error_at TEXT,
      created_at TEXT,
      updated_at TEXT
    )`
  );
  await dbExec(
    `CREATE TABLE IF NOT EXISTS campaigns (
      id INTEGER PRIMARY KEY,
      owner_user_id INTEGER,
      name TEXT,
      instance_id INTEGER,
      message TEXT,
      media_ref TEXT,
      status TEXT,
      created_at TEXT,
      updated_at TEXT
    )`
  );
  await dbExec(
    `CREATE TABLE IF NOT EXISTS campaign_recipients (
      id INTEGER PRIMARY KEY,
      campaign_id INTEGER,
      number TEXT,
      status TEXT,
      last_error TEXT,
      created_at TEXT,
      updated_at TEXT
    )`
  );

  await ensureColumn('users', 'mobile', 'TEXT');
  await ensureColumn('users', 'created_at', 'TEXT');
  await ensureColumn('instances', 'owner_user_id', 'INTEGER');
  await ensureColumn('instances', 'label', 'TEXT');
  await ensureColumn('instances', 'status', 'TEXT');
  await ensureColumn('instances', 'session_path', 'TEXT');
  await ensureColumn('instances', 'phone', 'TEXT');
  await ensureColumn('instances', 'last_qr', 'TEXT');
  await ensureColumn('instances', 'last_ready_at', 'TEXT');
  await ensureColumn('instances', 'last_disconnect_at', 'TEXT');
  await ensureColumn('instances', 'last_error_at', 'TEXT');
  await ensureColumn('instances', 'created_at', 'TEXT');
  await ensureColumn('instances', 'updated_at', 'TEXT');
  await ensureColumn('campaigns', 'owner_user_id', 'INTEGER');
  await ensureColumn('campaigns', 'name', 'TEXT');
  await ensureColumn('campaigns', 'instance_id', 'INTEGER');
  await ensureColumn('campaigns', 'message', 'TEXT');
  await ensureColumn('campaigns', 'media_ref', 'TEXT');
  await ensureColumn('campaigns', 'status', 'TEXT');
  await ensureColumn('campaigns', 'created_at', 'TEXT');
  await ensureColumn('campaigns', 'updated_at', 'TEXT');
  await ensureColumn('campaign_recipients', 'number', 'TEXT');
  await ensureColumn('campaign_recipients', 'status', 'TEXT');
  await ensureColumn('campaign_recipients', 'last_error', 'TEXT');
  await ensureColumn('campaign_recipients', 'created_at', 'TEXT');
  await ensureColumn('campaign_recipients', 'updated_at', 'TEXT');

  await dbExec(
    `CREATE TABLE IF NOT EXISTS queue_jobs (
      id INTEGER PRIMARY KEY,
      owner_user_id INTEGER,
      instance_id INTEGER,
      campaign_id INTEGER,
      job_type TEXT,
      payload_json TEXT,
      status TEXT,
      attempts INTEGER,
      next_run_at TEXT,
      last_error TEXT,
      created_at TEXT,
      updated_at TEXT
    )`
  );
  await dbExec(
    `CREATE TABLE IF NOT EXISTS ops_logs (
      id INTEGER PRIMARY KEY,
      level TEXT,
      type TEXT,
      instance_id INTEGER,
      campaign_id INTEGER,
      message TEXT,
      meta_json TEXT,
      created_at TEXT
    )`
  );

  await dbExec('CREATE INDEX IF NOT EXISTS idx_instances_owner_user_id ON instances(owner_user_id)');
  await dbExec('CREATE INDEX IF NOT EXISTS idx_instances_status ON instances(status)');
  await dbExec('CREATE INDEX IF NOT EXISTS idx_campaigns_owner_user_id ON campaigns(owner_user_id)');
  await dbExec('CREATE INDEX IF NOT EXISTS idx_campaigns_instance_id ON campaigns(instance_id)');
  await dbExec('CREATE INDEX IF NOT EXISTS idx_recipients_campaign_id ON campaign_recipients(campaign_id)');
  await dbExec('CREATE INDEX IF NOT EXISTS idx_queue_jobs_owner_user_id ON queue_jobs(owner_user_id)');
  await dbExec('CREATE INDEX IF NOT EXISTS idx_queue_jobs_instance_id ON queue_jobs(instance_id)');
  await dbExec('CREATE INDEX IF NOT EXISTS idx_queue_jobs_status ON queue_jobs(status)');
  await dbExec('CREATE INDEX IF NOT EXISTS idx_queue_jobs_next_run_at ON queue_jobs(next_run_at)');
}

async function migrateLegacyData() {
  const hasLegacyInstances = await tableExists('whatsapp_instances');
  const hasLegacyCampaigns = await tableExists('campaigns');
  if (!hasLegacyInstances && !hasLegacyCampaigns) return;

  const instanceRows = await dbAll('SELECT COUNT(*) as count FROM instances', []);
  const campaignRows = await dbAll('SELECT COUNT(*) as count FROM campaigns', []);
  const recipientRows = await dbAll('SELECT COUNT(*) as count FROM campaign_recipients', []);
  const hasInstances = instanceRows[0]?.count > 0;
  const hasCampaigns = campaignRows[0]?.count > 0;
  const hasRecipients = recipientRows[0]?.count > 0;

  const usersTableHasPhone = await tableExists('users')
    ? (await getTableColumns('users')).includes('phone')
    : false;
  if (usersTableHasPhone) {
    await dbExec(`UPDATE users SET mobile = COALESCE(mobile, phone)`);
  }

  if (hasLegacyInstances && !hasInstances) {
    const legacy = await dbAll(
      `SELECT id, user_id as owner_user_id, label, status, session_path, last_seen
       FROM whatsapp_instances`,
      []
    );
    for (const row of legacy) {
      await dbRun(
        `INSERT INTO instances (id, owner_user_id, label, status, session_path, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          row.id,
          row.owner_user_id,
          row.label,
          row.status,
          row.session_path,
          row.last_seen || new Date().toISOString(),
          row.last_seen || new Date().toISOString(),
        ]
      );
    }
  }

  if (hasLegacyCampaigns && !hasCampaigns) {
    const legacyCampaigns = await dbAll(
      `SELECT id, user_id as owner_user_id, instance_id, name, message, media_path, status, created_at
       FROM campaigns`,
      []
    );
    for (const row of legacyCampaigns) {
      await dbRun(
        `INSERT INTO campaigns (id, owner_user_id, name, instance_id, message, media_ref, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          row.id,
          row.owner_user_id,
          row.name,
          row.instance_id,
          row.message,
          row.media_path,
          row.status,
          row.created_at || new Date().toISOString(),
          row.created_at || new Date().toISOString(),
        ]
      );
    }

    if (!hasRecipients) {
      const legacyRecipients = await dbAll(
        `SELECT campaign_id, phone, status, error, created_at
         FROM campaign_recipients`,
        []
      );
      for (const row of legacyRecipients) {
        await dbRun(
          `INSERT INTO campaign_recipients (campaign_id, number, status, last_error, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            row.campaign_id,
            row.phone,
            row.status,
            row.error,
            row.created_at || new Date().toISOString(),
            row.created_at || new Date().toISOString(),
          ]
        );
      }
    }
  }
}

function initDb() {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    openDb();
    await dbExec('PRAGMA foreign_keys = ON');
    await runMigrations();
    await ensureSchemaUpgrades();
    await migrateLegacyData();
    return db;
  })();
  return initPromise;
}

module.exports = {
  initDb,
  dbExec,
  dbRun,
  dbGet,
  dbAll,
};
