-- Stage 5 (v0.5.0): delivery challans, proforma invoices and jobwork bills.
-- Paste the whole file into the D1 Console and run it once.
-- Safe to run twice: the tables use IF NOT EXISTS. If the last line says "duplicate column name: bill_kind" the file was already run, which is fine.

CREATE TABLE IF NOT EXISTS challans (
  id INTEGER PRIMARY KEY,
  fy INTEGER NOT NULL,
  kind TEXT NOT NULL,
  no_int INTEGER,
  no_text TEXT NOT NULL,
  challan_date TEXT NOT NULL,
  orig_date TEXT,
  inv_type TEXT,
  job_type TEXT,
  client_id INTEGER,
  party_name TEXT NOT NULL,
  party_address TEXT,
  party_city TEXT,
  party_pincode TEXT,
  party_state_code TEXT,
  party_gstin TEXT,
  party_pan TEXT,
  party_phone TEXT,
  party_reg_type TEXT,
  reverse_charge INTEGER NOT NULL DEFAULT 0,
  transporter_id INTEGER,
  transporter_name TEXT,
  lr_no TEXT,
  lr_date TEXT,
  vehicle_no TEXT,
  x1 TEXT, x2 TEXT, x3 TEXT, x4 TEXT,
  po_date TEXT,
  remark TEXT,
  amount_paise INTEGER NOT NULL DEFAULT 0,
  taxable_paise INTEGER NOT NULL DEFAULT 0,
  cgst_paise INTEGER NOT NULL DEFAULT 0,
  sgst_paise INTEGER NOT NULL DEFAULT 0,
  igst_paise INTEGER NOT NULL DEFAULT 0,
  net_paise INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  cancelled_at INTEGER,
  cancel_reason TEXT,
  orig_net_paise INTEGER,
  source TEXT NOT NULL DEFAULT 'app',
  aeon_ref TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_challans_no ON challans(fy, kind, no_text) WHERE kind IN ('general', 'jw_issue', 'proforma');
CREATE INDEX IF NOT EXISTS idx_challans_date ON challans(fy, kind, challan_date);
CREATE INDEX IF NOT EXISTS idx_challans_client ON challans(client_id);
CREATE TABLE IF NOT EXISTS challan_lines (
  id INTEGER PRIMARY KEY,
  challan_id INTEGER NOT NULL,
  line_no INTEGER NOT NULL,
  item_id INTEGER,
  item_name TEXT NOT NULL,
  description TEXT,
  hsn TEXT,
  uom TEXT,
  qty_milli INTEGER NOT NULL,
  rate_milli INTEGER NOT NULL DEFAULT 0,
  amount_paise INTEGER NOT NULL DEFAULT 0,
  disc_bp INTEGER NOT NULL DEFAULT 0,
  disc_paise INTEGER NOT NULL DEFAULT 0,
  taxable_paise INTEGER NOT NULL DEFAULT 0,
  gst_bp INTEGER NOT NULL DEFAULT 0,
  cgst_paise INTEGER NOT NULL DEFAULT 0,
  sgst_paise INTEGER NOT NULL DEFAULT 0,
  igst_paise INTEGER NOT NULL DEFAULT 0,
  net_paise INTEGER NOT NULL DEFAULT 0,
  against_id INTEGER
);
CREATE INDEX IF NOT EXISTS idx_challan_lines_ch ON challan_lines(challan_id);
CREATE INDEX IF NOT EXISTS idx_challan_lines_item ON challan_lines(item_id);
ALTER TABLE bills ADD COLUMN bill_kind TEXT NOT NULL DEFAULT 'sale';
