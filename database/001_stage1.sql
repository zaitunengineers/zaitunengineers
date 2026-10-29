CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY CHECK (id = 1),
  username      TEXT NOT NULL COLLATE NOCASE,
  pass_hash     TEXT NOT NULL,
  pass_salt     TEXT NOT NULL,
  pass_iter     INTEGER NOT NULL,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  last_login_at INTEGER
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash   TEXT PRIMARY KEY,
  user_id      INTEGER NOT NULL,
  created_at   INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL,
  ip           TEXT,
  user_agent   TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS login_attempts (
  id       INTEGER PRIMARY KEY,
  username TEXT COLLATE NOCASE,
  ip       TEXT,
  at       INTEGER NOT NULL,
  success  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_attempts_user ON login_attempts(username, at);
CREATE INDEX IF NOT EXISTS idx_attempts_ip   ON login_attempts(ip, at);
CREATE TABLE IF NOT EXISTS firm (
  id            INTEGER PRIMARY KEY CHECK (id = 1),
  name          TEXT NOT NULL DEFAULT '',
  address1      TEXT, address2 TEXT, city TEXT, pincode TEXT,
  state_code    TEXT,
  gstin         TEXT, pan TEXT,
  phone         TEXT, mobile TEXT, email TEXT,
  bank_name     TEXT, bank_account TEXT, bank_ifsc TEXT, bank_branch TEXT,
  terms         TEXT,
  logo_png      TEXT,
  signature_png TEXT,
  updated_at    INTEGER
);
INSERT OR IGNORE INTO firm (id, name) VALUES (1, '');
CREATE TABLE IF NOT EXISTS activity_log (
  id      INTEGER PRIMARY KEY,
  at      INTEGER NOT NULL,
  action  TEXT NOT NULL,
  details TEXT,
  ip      TEXT
);
CREATE INDEX IF NOT EXISTS idx_activity_at ON activity_log(at);
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);
