CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  mobile TEXT UNIQUE,
  password_hash TEXT,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS instances (
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
  updated_at TEXT,
  FOREIGN KEY (owner_user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS campaigns (
  id INTEGER PRIMARY KEY,
  owner_user_id INTEGER,
  name TEXT,
  instance_id INTEGER,
  message TEXT,
  media_ref TEXT,
  status TEXT,
  created_at TEXT,
  updated_at TEXT,
  FOREIGN KEY (owner_user_id) REFERENCES users(id),
  FOREIGN KEY (instance_id) REFERENCES instances(id)
);

CREATE TABLE IF NOT EXISTS campaign_recipients (
  id INTEGER PRIMARY KEY,
  campaign_id INTEGER,
  number TEXT,
  status TEXT,
  last_error TEXT,
  created_at TEXT,
  updated_at TEXT,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id)
);

CREATE TABLE IF NOT EXISTS queue_jobs (
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
  updated_at TEXT,
  FOREIGN KEY (owner_user_id) REFERENCES users(id),
  FOREIGN KEY (instance_id) REFERENCES instances(id),
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id)
);

CREATE TABLE IF NOT EXISTS ops_logs (
  id INTEGER PRIMARY KEY,
  level TEXT,
  type TEXT,
  instance_id INTEGER,
  campaign_id INTEGER,
  message TEXT,
  meta_json TEXT,
  created_at TEXT,
  FOREIGN KEY (instance_id) REFERENCES instances(id),
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id)
);

CREATE INDEX IF NOT EXISTS idx_instances_owner_user_id ON instances(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_instances_status ON instances(status);
CREATE INDEX IF NOT EXISTS idx_campaigns_owner_user_id ON campaigns(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_instance_id ON campaigns(instance_id);
CREATE INDEX IF NOT EXISTS idx_recipients_campaign_id ON campaign_recipients(campaign_id);
CREATE INDEX IF NOT EXISTS idx_queue_jobs_owner_user_id ON queue_jobs(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_queue_jobs_instance_id ON queue_jobs(instance_id);
CREATE INDEX IF NOT EXISTS idx_queue_jobs_status ON queue_jobs(status);
CREATE INDEX IF NOT EXISTS idx_queue_jobs_next_run_at ON queue_jobs(next_run_at);
