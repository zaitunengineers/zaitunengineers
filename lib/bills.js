// Bill rules: checking what the screen sent, copying party/item details, and working out every figure.
// The server always recomputes; it never trusts totals from the browser.

import { HttpError } from './http.js';
import { GST_RATES_BP } from './masters.js';
import { SETTING_DEFAULTS } from './settings.js';
import { lineMaths, sumLines, CHARGE_KEYS, fyLabel, fyStart, fyEnd } from '../public/assets/js/gst.js';

export const MAX_LINES = 30;
export const FIRM_STATE_FALLBACK = '24';

// "12.5" -> 12500 when dec = 3. Returns {n} or {error}. Accepts a number or text. No negatives.
export function parseScaled(v, dec, max) {
  if (v === undefined || v === null || v === '') return { n: 0, empty: true };
  let s = typeof v === 'number' ? (Number.isFinite(v) ? String(v) : 'x') : String(v);
  s = s.replace(/[\s,]/g, '');
  if (!/^[0-9]+(\.[0-9]+)?$/.test(s)) return { error: 'Enter a number.' };
  const [whole, frac = ''] = s.split('.');
  if (frac.length > dec) return { error: `Use at most ${dec} decimal${dec === 1 ? '' : 's'}.` };
  if (whole.length > 12) return { error: 'That number is too large.' };
  const n = Number(whole) * 10 ** dec + Number((frac + '0'.repeat(dec)).slice(0, dec));
  if (n > max) return { error: 'That number is too large.' };
  return { n };
}

export const isoDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z')) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;

export const txt = (v, max, errors, key, label) => {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'string') {
    errors[key] = 'This must be text.';
    return null;
  }
  const s = v.replace(/\s+/g, ' ').trim();
  if (s.length > max) {
    errors[key] = `${label || 'This'} is too long (${max} characters at most).`;
    return null;
  }
  return s || null;
};

export function fyParam(raw) {
  if (typeof raw === 'number') raw = String(raw);
  if (typeof raw !== 'string' || !/^20[0-9]{2}$/.test(raw)) throw new HttpError(400, 'Choose a financial year.');
  const fy = Number(raw);
  if (fy < 2016 || fy > 2099) throw new HttpError(400, 'Choose a financial year.');
  return fy;
}

// Loads everything a save needs in one round trip.
export async function loadRefs(env, body, ids) {
  const itemIds = [...new Set(ids)];
  const stmts = [
    env.DB.prepare('SELECT * FROM clients WHERE id = ?').bind(Number.isInteger(body.client_id) ? body.client_id : 0),
    env.DB.prepare('SELECT id, name, active FROM transporters WHERE id = ?').bind(Number.isInteger(body.transporter_id) ? body.transporter_id : 1),
    env.DB.prepare('SELECT state_code FROM firm WHERE id = 1'),
    env.DB.prepare('SELECT key, value FROM settings'),
  ];
  if (itemIds.length) {
    stmts.push(env.DB.prepare(`SELECT * FROM items WHERE id IN (${itemIds.map(() => '?').join(',')})`).bind(...itemIds));
  }
  const res = await env.DB.batch(stmts);
  return {
    client: res[0].results[0] || null,
    transporter: res[1].results[0] || null,
    firmState: (res[2].results[0] && res[2].results[0].state_code) || FIRM_STATE_FALLBACK,
    settings: res[3].results,
    items: new Map((res[4] ? res[4].results : []).map((i) => [i.id, i])),
  };
}

// old: the saved bill when editing (lets a hidden client/item/transporter that is already on the bill stay).
export async function prepareBill(env, body, { fy, old = null } = {}) {
  const errors = {};
  const out = {};

  // ---- year and date
  out.fy = fy;
  if (!isoDate(body.bill_date)) errors.bill_date = 'Enter the bill date.';
  else if (body.bill_date < fyStart(fy) || body.bill_date > fyEnd(fy)) errors.bill_date = `Bill date must be inside F.Y. ${fyLabel(fy)}.`;
  out.bill_date = body.bill_date;

  // ---- bill number (null = next free)
  let billNo = null;
  if (body.bill_no !== undefined && body.bill_no !== null && body.bill_no !== '') {
    const n = Number(body.bill_no);
    if (!Number.isInteger(n) || n < 1 || n > 9999999) errors.bill_no = 'Enter a bill number (1 or more).';
    else billNo = n;
  }
  out.bill_no = billNo;

  if (body.inv_type !== 'GST' && body.inv_type !== 'IGST') errors.inv_type = 'Choose the invoice type.';
  out.inv_type = body.inv_type;
  out.memo = 'debit';
  out.bill_kind = body.bill_kind === 'jobwork' ? 'jobwork' : 'sale';
  out.reverse_charge = body.reverse_charge === 1 || body.reverse_charge === true ? 1 : 0;
  if (body.reverse_charge !== undefined && ![0, 1, true, false].includes(body.reverse_charge)) errors.reverse_charge = 'Choose Yes or No.';

  // ---- free text
  out.lr_no = txt(body.lr_no, 30, errors, 'lr_no', 'LR/RR No.');
  out.vehicle_no = txt(body.vehicle_no, 20, errors, 'vehicle_no', 'Vehicle No.');
  for (const k of ['x1', 'x2', 'x3', 'x4']) out[k] = txt(body[k], 60, errors, k);
  for (const k of ['remark1', 'remark2', 'remark3']) out[k] = txt(body[k], 150, errors, k, 'Remark');
  for (const k of ['lr_date', 'po_date']) {
    const v = body[k];
    if (v === undefined || v === null || v === '') out[k] = null;
    else if (!isoDate(v)) {
      errors[k] = 'Enter a valid date.';
      out[k] = null;
    } else out[k] = v;
  }

  // ---- lines
  const rawLines = Array.isArray(body.lines) ? body.lines : [];
  const used = rawLines.filter((l) => l && typeof l === 'object' && (l.item_id || (l.qty !== undefined && l.qty !== '' && l.qty !== null)));
  if (rawLines.length > 60) errors.lines = 'Too many lines.';
  if (used.length === 0) errors.lines = 'Add at least one item.';
  else if (used.length > MAX_LINES) errors.lines = `A bill can have ${MAX_LINES} lines at most.`;

  const refs = await loadRefs(env, body, used.map((l) => (Number.isInteger(l.item_id) ? l.item_id : 0)).filter(Boolean));
  const settings = { ...SETTING_DEFAULTS };
  for (const r of refs.settings) if (r.value !== null) settings[r.key] = r.value;
  const on = (k) => settings[k] === '1';

  // ---- party
  const client = refs.client;
  if (!client) errors.client_id = 'Choose the party.';
  else if (!client.active && !(old && old.client_id === client.id)) errors.client_id = 'This party is hidden. Show it in Account Master first.';
  else {
    out.client_id = client.id;
    out.party_name = client.name;
    out.party_address = client.address || null;
    out.party_city = client.city || null;
    out.party_pincode = client.pincode || null;
    out.party_state_code = client.state_code || null;
    out.party_gstin = client.gstin || null;
    out.party_pan = client.pan || null;
    out.party_phone = client.phone || client.mobile || null;
    out.party_reg_type = client.reg_type || (client.gstin ? 'Register-Regular' : 'Unregister-Enduser');
  }

  // ---- transporter
  const tr = refs.transporter;
  if (!tr) errors.transporter_id = 'Choose the transporter.';
  else if (!tr.active && !(old && old.transporter_id === tr.id)) errors.transporter_id = 'This transporter is hidden.';
  else {
    out.transporter_id = tr.id;
    out.transporter_name = tr.name;
  }

  // ---- lines in detail
  const lines = [];
  const lineErrors = {};
  used.forEach((l, i) => {
    const e = {};
    const item = refs.items.get(Number.isInteger(l.item_id) ? l.item_id : 0);
    if (!item) e.item_id = 'Choose the goods.';
    else if (!item.active && !(old && old.itemIds && old.itemIds.has(item.id))) e.item_id = 'This item is hidden.';
    const dec = item ? item.qty_decimals || 0 : 0;
    const q = parseScaled(l.qty, 3, 999999999);
    if (q.error || q.empty || q.n <= 0) e.qty = q.error || 'Enter the quantity.';
    else if (item && String(l.qty).replace(/[\s,]/g, '').split('.')[1] && String(l.qty).replace(/[\s,]/g, '').split('.')[1].replace(/0+$/, '').length > dec) {
      e.qty = dec ? `This item takes ${dec} decimal${dec === 1 ? '' : 's'}.` : 'This item takes whole numbers.';
    }
    const r = parseScaled(l.rate, 3, 9999999999);
    if (r.error) e.rate = r.error;
    let bp = l.gst_bp === undefined || l.gst_bp === null || l.gst_bp === '' ? (item ? item.gst_bp : 1800) : Number(l.gst_bp);
    if (!Number.isInteger(bp) || !GST_RATES_BP.includes(bp)) e.gst_bp = 'Pick a GST % from the list.';
    let hsn = null;
    if (l.hsn !== undefined && l.hsn !== null && l.hsn !== '') {
      const s = String(l.hsn).replace(/\s+/g, '');
      if (!/^([0-9]{4}|[0-9]{6}|[0-9]{8})$/.test(s)) e.hsn = 'HSN or SAC must be 4, 6 or 8 digits.';
      else if (!on('hsn_edit') && item && s !== item.code) e.hsn = 'The HSN cannot be changed on a bill.';
      else hsn = s;
    } else if (item) hsn = item.code || null;
    const description = txt(l.description, 200, e, 'description', 'Description');

    const raw = { qty_milli: q.n, rate_milli: r.n || 0, disc_bp: 0 };
    if (on('sw_disc') && l.disc_pct !== undefined && l.disc_pct !== '' && l.disc_pct !== null) {
      const d = parseScaled(l.disc_pct, 2, 10000);
      if (d.error) e.disc_pct = d.error;
      else raw.disc_bp = d.n;
    }
    for (const k of CHARGE_KEYS) {
      if (on(`sw_${k}`) && l[k] !== undefined && l[k] !== '' && l[k] !== null) {
        const c = parseScaled(l[k], 2, 99999999999);
        if (c.error) e[k] = c.error;
        else raw[k] = c.n;
      }
    }
    if (Object.keys(e).length) {
      lineErrors[i] = e;
      return;
    }
    const m = lineMaths(raw, out.inv_type, bp);
    lines.push({
      line_no: lines.length + 1,
      item_id: item.id,
      item_name: item.name,
      description,
      hsn,
      uom: item.uom,
      qty_milli: raw.qty_milli,
      rate_milli: raw.rate_milli,
      ...m,
    });
  });
  if (Object.keys(lineErrors).length) errors.lineErrors = lineErrors;

  if (Object.keys(errors).length) {
    const fields = { ...errors };
    throw new HttpError(400, 'Please fix the highlighted fields.', { fields });
  }

  out.lines = lines;
  out.totals = sumLines(lines);
  out.round_off_paise = 0;
  out.firmState = refs.firmState;
  return out;
}

export function billColumns(b) {
  return [
    b.bill_date, b.memo, b.inv_type, b.client_id, b.party_name, b.party_address, b.party_city, b.party_pincode,
    b.party_state_code, b.party_gstin, b.party_pan, b.party_phone, b.party_reg_type, b.reverse_charge, b.transporter_id,
    b.transporter_name, b.lr_no, b.lr_date, b.vehicle_no, b.x1, b.x2, b.x3, b.x4, b.po_date, b.remark1, b.remark2, b.remark3,
    b.totals.amount_paise, b.totals.taxable_paise, b.totals.cgst_paise, b.totals.sgst_paise, b.totals.igst_paise, b.totals.net_paise, b.bill_kind,
  ];
}

export const BILL_COL_NAMES = [
  'bill_date', 'memo', 'inv_type', 'client_id', 'party_name', 'party_address', 'party_city', 'party_pincode',
  'party_state_code', 'party_gstin', 'party_pan', 'party_phone', 'party_reg_type', 'reverse_charge', 'transporter_id',
  'transporter_name', 'lr_no', 'lr_date', 'vehicle_no', 'x1', 'x2', 'x3', 'x4', 'po_date', 'remark1', 'remark2', 'remark3',
  'amount_paise', 'taxable_paise', 'cgst_paise', 'sgst_paise', 'igst_paise', 'net_paise', 'bill_kind',
];

const LINE_COLS = [
  'line_no', 'item_id', 'item_name', 'description', 'hsn', 'uom', 'qty_milli', 'rate_milli', 'amount_paise', 'disc_bp', 'disc_paise',
  'a1_paise', 'a2_paise', 'a3_paise', 'a4_paise', 'a5_paise', 'a6_paise', 'l2_paise', 'taxable_paise', 'gst_bp', 'cgst_paise', 'sgst_paise', 'igst_paise', 'net_paise',
];

// Statement that inserts one line for the bill with this (fy, bill_no).
export function lineInsertByNumber(env, fy, billNo, ln) {
  return env.DB.prepare(
    `INSERT INTO bill_lines (bill_id, ${LINE_COLS.join(', ')})
     SELECT id, ${LINE_COLS.map(() => '?').join(', ')} FROM bills WHERE fy = ? AND bill_no = ?`
  ).bind(...LINE_COLS.map((c) => ln[c] ?? null), fy, billNo);
}

export function lineInsertById(env, billId, ln) {
  return env.DB.prepare(`INSERT INTO bill_lines (bill_id, ${LINE_COLS.join(', ')}) VALUES (?, ${LINE_COLS.map(() => '?').join(', ')})`)
    .bind(billId, ...LINE_COLS.map((c) => ln[c] ?? null));
}

// What the screen needs to show one bill (header + lines).
export async function loadBill(env, id) {
  const [b, l] = await env.DB.batch([
    env.DB.prepare('SELECT * FROM bills WHERE id = ?').bind(id),
    env.DB.prepare('SELECT * FROM bill_lines WHERE bill_id = ? ORDER BY line_no, id').bind(id),
  ]);
  const bill = b.results[0];
  if (!bill) return null;
  return { ...bill, lines: l.results };
}

export const rupeesText = (paise) => (paise / 100).toFixed(2);
