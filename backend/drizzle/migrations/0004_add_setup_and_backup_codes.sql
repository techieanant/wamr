-- Add setup_status table
CREATE TABLE setup_status (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  is_completed BOOLEAN NOT NULL DEFAULT 0,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Add backup_codes table
CREATE TABLE backup_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_user_id INTEGER NOT NULL,
  code_hash TEXT NOT NULL,
  is_used BOOLEAN NOT NULL DEFAULT 0,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (admin_user_id) REFERENCES admin_users(id) ON DELETE CASCADE
);

CREATE INDEX idx_backup_codes_user ON backup_codes(admin_user_id);
CREATE INDEX idx_backup_codes_used ON backup_codes(is_used);

-- If admin users already exist, mark setup as complete
INSERT INTO setup_status (is_completed, completed_at)
SELECT 1, datetime('now')
FROM admin_users
LIMIT 1;
