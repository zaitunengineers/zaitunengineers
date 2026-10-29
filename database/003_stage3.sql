CREATE TABLE IF NOT EXISTS item_groups (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS bills (
  id INTEGER PRIMARY KEY,
  fy INTEGER NOT NULL,
  bill_no INTEGER NOT NULL,
  bill_date TEXT NOT NULL,
  memo TEXT NOT NULL DEFAULT 'debit',
  inv_type TEXT NOT NULL,
  book TEXT NOT NULL DEFAULT 'SALE',
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
  remark1 TEXT, remark2 TEXT, remark3 TEXT,
  amount_paise INTEGER NOT NULL DEFAULT 0,
  taxable_paise INTEGER NOT NULL DEFAULT 0,
  cgst_paise INTEGER NOT NULL DEFAULT 0,
  sgst_paise INTEGER NOT NULL DEFAULT 0,
  igst_paise INTEGER NOT NULL DEFAULT 0,
  net_paise INTEGER NOT NULL DEFAULT 0,
  round_off_paise INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  cancelled_at INTEGER,
  cancel_reason TEXT,
  orig_net_paise INTEGER,
  source TEXT NOT NULL DEFAULT 'app',
  aeon_ref TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (fy, bill_no)
);
CREATE INDEX IF NOT EXISTS idx_bills_date ON bills(fy, bill_date);
CREATE INDEX IF NOT EXISTS idx_bills_client ON bills(client_id);
CREATE TABLE IF NOT EXISTS bill_lines (
  id INTEGER PRIMARY KEY,
  bill_id INTEGER NOT NULL,
  line_no INTEGER NOT NULL,
  item_id INTEGER,
  item_name TEXT NOT NULL,
  description TEXT,
  hsn TEXT,
  uom TEXT,
  qty_milli INTEGER NOT NULL,
  rate_milli INTEGER NOT NULL,
  amount_paise INTEGER NOT NULL,
  disc_bp INTEGER NOT NULL DEFAULT 0,
  disc_paise INTEGER NOT NULL DEFAULT 0,
  a1_paise INTEGER NOT NULL DEFAULT 0,
  a2_paise INTEGER NOT NULL DEFAULT 0,
  a3_paise INTEGER NOT NULL DEFAULT 0,
  a4_paise INTEGER NOT NULL DEFAULT 0,
  a5_paise INTEGER NOT NULL DEFAULT 0,
  a6_paise INTEGER NOT NULL DEFAULT 0,
  l2_paise INTEGER NOT NULL DEFAULT 0,
  taxable_paise INTEGER NOT NULL,
  gst_bp INTEGER NOT NULL DEFAULT 0,
  cgst_paise INTEGER NOT NULL DEFAULT 0,
  sgst_paise INTEGER NOT NULL DEFAULT 0,
  igst_paise INTEGER NOT NULL DEFAULT 0,
  net_paise INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_bill_lines_bill ON bill_lines(bill_id);
CREATE INDEX IF NOT EXISTS idx_bill_lines_item ON bill_lines(item_id);
ALTER TABLE clients ADD COLUMN alias TEXT;
ALTER TABLE clients ADD COLUMN reg_type TEXT;
ALTER TABLE clients ADD COLUMN distance_km INTEGER;
ALTER TABLE items ADD COLUMN item_code TEXT;
ALTER TABLE items ADD COLUMN alias TEXT;
ALTER TABLE items ADD COLUMN brand TEXT;
ALTER TABLE items ADD COLUMN uqc TEXT;
ALTER TABLE items ADD COLUMN purchase_rate_paise INTEGER;
ALTER TABLE items ADD COLUMN mrp_paise INTEGER;
ALTER TABLE items ADD COLUMN qty_decimals INTEGER NOT NULL DEFAULT 0;
ALTER TABLE items ADD COLUMN item_group_id INTEGER;
ALTER TABLE items ADD COLUMN desc_required INTEGER NOT NULL DEFAULT 0;
ALTER TABLE transporters ADD COLUMN address1 TEXT;
ALTER TABLE transporters ADD COLUMN address2 TEXT;
ALTER TABLE transporters ADD COLUMN person TEXT;
ALTER TABLE transporters ADD COLUMN phone TEXT;
ALTER TABLE transporters ADD COLUMN mobile TEXT;
ALTER TABLE transporters ADD COLUMN email TEXT;
ALTER TABLE transporters ADD COLUMN gstin TEXT;
ALTER TABLE transporters ADD COLUMN tr_id TEXT;
ALTER TABLE firm ADD COLUMN signatory_name TEXT;
ALTER TABLE firm ADD COLUMN signatory_desig TEXT;
ALTER TABLE firm ADD COLUMN bill_title TEXT DEFAULT 'TAX INVOICE';
