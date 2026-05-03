-- 0017_add_request_quotas_table.sql
CREATE TABLE IF NOT EXISTS request_quotas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone_number_hash TEXT NOT NULL UNIQUE,
  max_requests INTEGER NOT NULL DEFAULT 5,
  window_type TEXT NOT NULL DEFAULT 'daily',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_quota_phone ON request_quotas (phone_number_hash);
