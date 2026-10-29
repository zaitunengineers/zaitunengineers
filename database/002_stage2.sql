CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL,
  address TEXT,
  city TEXT,
  pincode TEXT,
  state_code TEXT NOT NULL,
  gstin TEXT,
  pan TEXT,
  phone TEXT,
  mobile TEXT,
  email TEXT,
  notes TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  source TEXT NOT NULL DEFAULT 'app',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_clients_gstin ON clients(gstin) WHERE gstin IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_clients_name_key ON clients(name_key);
CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL,
  code TEXT,
  kind TEXT NOT NULL DEFAULT 'goods',
  uom TEXT NOT NULL DEFAULT 'NOS',
  rate_paise INTEGER,
  gst_bp INTEGER NOT NULL DEFAULT 1800,
  description TEXT,
  notes TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  source TEXT NOT NULL DEFAULT 'app',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_items_name_key ON items(name_key);
CREATE INDEX IF NOT EXISTS idx_items_code ON items(code);
CREATE TABLE IF NOT EXISTS transporters (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL UNIQUE,
  active INTEGER NOT NULL DEFAULT 1,
  sort INTEGER NOT NULL DEFAULT 100,
  created_at INTEGER NOT NULL
);
INSERT OR IGNORE INTO transporters (id, name, name_key, active, sort, created_at) VALUES (1, 'SELF DELIVERY', 'self delivery', 1, 0, 0);
