// Delivery challans and proforma invoices: checking what the screen sent, numbering, and working out the figures.
// Kinds: general (plain challan), jw_issue (jobwork goods sent out), jw_receive (jobwork goods back),
// jw_opening (jobwork goods sent in an earlier year and still out), proforma (priced invoice, not a bill).

import { HttpError } from './http.js';
import { GST_RATES_BP } from './masters.js';
import { SETTING_DEFAULTS } from './settings.js';
import { lineMaths, sumLines, fyLabel, fyStart, fyEnd } from '../public/assets/js/gst.js';
import { MAX_LINES, parseScaled, isoDate, txt, loadRefs } from './bills.js';

export const KINDS = ['general', 'jw_issue', 'jw_receive', 'jw_opening', 'proforma'];
export const KIND_NAMES = {
  general: 'Delivery Challan',
  jw_issue: 'Delivery Challan Issue (Jobwork)',
  jw_receive: 'Delivery Challan Receive (Jobwork)',
  jw_opening: 'Opening Delivery Challan Issue (Jobwork)',
  proforma: 'Proforma Invoice',
};
const DEFAULT_NO = { general: '000001', jw_issue: 'DC/1', proforma: '000001' };
export const isJobwork = (k) => k === 'jw_issue' || k === 'jw_receive' || k === 'jw_opening';

export function kindParam(raw) {
  if (!KINDS.includes(raw)) throw new HttpError(400, 'Unknown challan type.');
  return raw;
}

// "DC/017" -> {prefix:'DC/', digits:'017', suffix:''}; null when there is no number in the text.
export function splitNo(text) {
  const m = /^(.*?)(\d+)(\D*)$/.exec(String(text ?? ''));
  return m ? { prefix: m[1], digits: m[2], suffix: m[3] } : null;
}
export const noIntOf = (text) => {
  const p = splitNo(text);
  return p && p.digits.length <= 9 ? Number(p.digits) : null;
};
// The number after the last one, written in the same style: DC/017 -> DC/018, 0000016 -> 0000017, DC/8 -> DC/9.
export function followingNo(text) {
  const p = splitNo(text);
  if (!p || p.digits.length > 9) return null;
  const n = String(Number(p.digits) + 1).padStart(p.digits.length, '0');
  return `${p.prefix}${n}${p.suffix}`;
}
export async function nextNumber(env, fy, kind) {
  if (kind === 'jw_receive' || kind === 'jw_opening') return { next: '', count: 0 };
  const last = await env.DB.prepare('SELECT no_text FROM challans WHERE fy = ? AND kind = ? AND no_int IS NOT NULL ORDER BY no_int DESC, id DESC LIMIT 1').bind(fy, kind).first();
  const cnt = await env.DB.prepare('SELECT COUNT(*) AS c FROM challans WHERE fy = ? AND kind = ?').bind(fy, kind).first();
  return { next: (last && followingNo(last.no_text)) || DEFAULT_NO[kind], count: cnt.c };
}

function remarkLines(v, errors) {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'string') {
    errors.remark = 'This must be text.';
    return null;
  }
  const lines = v.replace(/\r/g, '').split('\n').map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
  if (lines.length > 4) errors.remark = 'Use 4 lines at most.';
  else if (lines.some((s) => s.length > 100)) errors.remark = 'Each line can have 100 characters at most.';
  return lines.length ? lines.join('\n') : null;
}

export async function prepareChallan(env, body, { fy, kind, old = null }) {
  const errors = {};
  const out = { fy, kind };
  const jw = isJobwork(kind);

  // ---- date
  if (kind === 'jw_opening') {
    out.challan_date = fyStart(fy);
    if (!isoDate(body.orig_date)) errors.orig_date = 'Enter the date of the original challan.';
    else if (body.orig_date >= fyStart(fy)) errors.orig_date = 'This must be before the start of this year.';
    out.orig_date = isoDate(body.orig_date) ? body.orig_date : null;
  } else {
    if (!isoDate(body.challan_date)) errors.challan_date = 'Enter the date.';
    else if (body.challan_date < fyStart(fy) || body.challan_date > fyEnd(fy)) errors.challan_date = `The date must be inside F.Y. ${fyLabel(fy)}.`;
    out.challan_date = body.challan_date;
    out.orig_date = null;
  }

  // ---- number (empty = next free, for kinds that number themselves)
  let noText = txt(body.no_text, 20, errors, 'no_text', 'The number');
  if (!noText && (kind === 'jw_receive' || kind === 'jw_opening')) errors.no_text = kind === 'jw_receive' ? "Enter the party's challan no." : 'Enter the original challan no.';
  out.no_text = noText;

  // ---- tax type
  if (kind === 'general') out.inv_type = null;
  else if (body.inv_type !== 'GST' && body.inv_type !== 'IGST') errors.inv_type = 'Choose the invoice type.';
  else out.inv_type = body.inv_type;
  out.job_type = jw ? 'Non-SEZ' : null;
  out.reverse_charge = kind === 'proforma' && (body.reverse_charge === 1 || body.reverse_charge === true) ? 1 : 0;

  // ---- free text
  out.lr_no = txt(body.lr_no, 30, errors, 'lr_no', 'LR/RR No.');
  out.vehicle_no = txt(body.vehicle_no, 20, errors, 'vehicle_no', 'Vehicle No.');
  for (const k of ['x1', 'x2', 'x3', 'x4']) out[k] = kind === 'proforma' ? txt(body[k], 60, errors, k) : null;
  for (const k of ['lr_date', 'po_date']) {
    const v = body[k];
    if (v === undefined || v === null || v === '' || (k === 'po_date' && kind !== 'proforma')) out[k] = null;
    else if (!isoDate(v)) {
      errors[k] = 'Enter a valid date.';
      out[k] = null;
    } else out[k] = v;
  }
  out.remark = remarkLines(body.remark, errors);

  // ---- lines
  const rawLines = Array.isArray(body.lines) ? body.lines : [];
  const used = rawLines.filter((l) => l && typeof l === 'object' && (l.item_id || (l.qty !== undefined && l.qty !== '' && l.qty !== null)));
  if (rawLines.length > 60) errors.lines = 'Too many lines.';
  if (used.length === 0) errors.lines = 'Add at least one item.';
  else if (used.length > MAX_LINES) errors.lines = `A challan can have ${MAX_LINES} lines at most.`;

  const refs = await loadRefs(env, body, used.map((l) => (Number.isInteger(l.item_id) ? l.item_id : 0)).filter(Boolean));
  const settings = { ...SETTING_DEFAULTS };
  for (const r of refs.settings) if (r.value !== null) settings[r.key] = r.value;

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

  // the transporter is optional on a challan
  if (body.transporter_id === null || body.transporter_id === undefined || body.transporter_id === '' || body.transporter_id === 0) {
    out.transporter_id = null;
    out.transporter_name = null;
  } else {
    const tr = refs.transporter;
    if (!tr || tr.id !== body.transporter_id) errors.transporter_id = 'Choose the transporter.';
    else if (!tr.active && !(old && old.transporter_id === tr.id)) errors.transporter_id = 'This transporter is hidden.';
    else {
      out.transporter_id = tr.id;
      out.transporter_name = tr.name;
    }
  }

  const lines = [];
  const lineErrors = {};
  used.forEach((l, i) => {
    const e = {};
    const item = refs.items.get(Number.isInteger(l.item_id) ? l.item_id : 0);
    if (!item) e.item_id = 'Choose the goods.';
    else if (!item.active && !(old && old.itemIds && old.itemIds.has(item.id))) e.item_id = 'This item is hidden.';
    const dec = item ? item.qty_decimals || 0 : 0;
    const q = parseScaled(l.qty, 3, 999999999);
    const qtxt = String(l.qty ?? '').replace(/[\s,]/g, '');
    if (q.error || q.empty || q.n <= 0) e.qty = q.error || 'Enter the quantity.';
    else if (item && qtxt.split('.')[1] && qtxt.split('.')[1].replace(/0+$/, '').length > dec) e.qty = dec ? `This item takes ${dec} decimal${dec === 1 ? '' : 's'}.` : 'This item takes whole numbers.';
    const r = parseScaled(l.rate, 3, 9999999999);
    if (r.error) e.rate = r.error;
    let bp = 0;
    if (kind !== 'general') {
      bp = l.gst_bp === undefined || l.gst_bp === null || l.gst_bp === '' ? (item ? item.gst_bp : 1800) : Number(l.gst_bp);
      if (!Number.isInteger(bp) || !GST_RATES_BP.includes(bp)) e.gst_bp = 'Pick a GST % from the list.';
    }
    let hsn = item ? item.code || null : null;
    if (l.hsn !== undefined && l.hsn !== null && l.hsn !== '') {
      const s = String(l.hsn).replace(/\s+/g, '');
      if (!/^([0-9]{4}|[0-9]{6}|[0-9]{8})$/.test(s)) e.hsn = 'HSN or SAC must be 4, 6 or 8 digits.';
      else if (settings.hsn_edit !== '1' && item && s !== item.code) e.hsn = 'The HSN cannot be changed here.';
      else hsn = s;
    }
    const description = txt(l.description, 200, e, 'description', 'Description');
    let against = null;
    if (kind === 'jw_receive' && l.against_id !== undefined && l.against_id !== null && l.against_id !== '') {
      if (!Number.isInteger(l.against_id) || l.against_id < 1) e.against_id = 'Pick the challan again.';
      else against = l.against_id;
    }
    if (Object.keys(e).length) {
      lineErrors[i] = e;
      return;
    }
    const raw = { qty_milli: q.n, rate_milli: r.n || 0, disc_bp: 0 };
    const m = lineMaths(raw, kind === 'general' ? 'IGST' : out.inv_type, bp);
    lines.push({ line_no: lines.length + 1, item_id: item.id, item_name: item.name, description, hsn, uom: item.uom, qty_milli: raw.qty_milli, rate_milli: raw.rate_milli, against_id: against, ...m });
  });
  if (Object.keys(lineErrors).length) errors.lineErrors = lineErrors;

  if (Object.keys(errors).length) throw new HttpError(400, 'Please fix the highlighted fields.', { fields: { ...errors } });
  out.lines = lines;
  out.totals = sumLines(lines);
  return out;
}

export const CH_COLS = [
  'challan_date', 'orig_date', 'inv_type', 'job_type', 'client_id', 'party_name', 'party_address', 'party_city', 'party_pincode',
  'party_state_code', 'party_gstin', 'party_pan', 'party_phone', 'party_reg_type', 'reverse_charge', 'transporter_id', 'transporter_name',
  'lr_no', 'lr_date', 'vehicle_no', 'x1', 'x2', 'x3', 'x4', 'po_date', 'remark',
  'amount_paise', 'taxable_paise', 'cgst_paise', 'sgst_paise', 'igst_paise', 'net_paise',
];
export function chValues(c) {
  return [
    c.challan_date, c.orig_date, c.inv_type, c.job_type, c.client_id, c.party_name, c.party_address, c.party_city, c.party_pincode,
    c.party_state_code, c.party_gstin, c.party_pan, c.party_phone, c.party_reg_type, c.reverse_charge, c.transporter_id, c.transporter_name,
    c.lr_no, c.lr_date, c.vehicle_no, c.x1, c.x2, c.x3, c.x4, c.po_date, c.remark,
    c.totals.amount_paise, c.totals.taxable_paise, c.totals.cgst_paise, c.totals.sgst_paise, c.totals.igst_paise, c.totals.net_paise,
  ];
}
const LINE_COLS = ['line_no', 'item_id', 'item_name', 'description', 'hsn', 'uom', 'qty_milli', 'rate_milli', 'amount_paise', 'disc_bp', 'disc_paise', 'taxable_paise', 'gst_bp', 'cgst_paise', 'sgst_paise', 'igst_paise', 'net_paise', 'against_id'];
export function chLineInsert(env, id, ln) {
  return env.DB.prepare(`INSERT INTO challan_lines (challan_id, ${LINE_COLS.join(', ')}) VALUES (?, ${LINE_COLS.map(() => '?').join(', ')})`).bind(id, ...LINE_COLS.map((c) => ln[c] ?? null));
}
export async function loadChallan(env, id) {
  const [h, l] = await env.DB.batch([
    env.DB.prepare('SELECT * FROM challans WHERE id = ?').bind(id),
    env.DB.prepare('SELECT * FROM challan_lines WHERE challan_id = ? ORDER BY line_no, id').bind(id),
  ]);
  const c = h.results[0];
  return c ? { ...c, lines: l.results } : null;
}

// ---- Pending / Over / All register ----
// Goods issued (jw_issue + jw_opening) against goods received back (jw_receive), per party and item.
// A receive that names a challan reduces that challan first; the rest reduce the oldest challans first.
export function buildRegister(issues, receives) {
  const keyOf = (r) => `${r.client_id}|${r.item_id ?? `n:${String(r.item_name).toLowerCase()}`}`;
  const groups = new Map();
  const g = (k) => {
    if (!groups.has(k)) groups.set(k, { issues: [], recv: [] });
    return groups.get(k);
  };
  for (const r of issues) g(keyOf(r)).issues.push({ ...r, received: 0 });
  for (const r of receives) g(keyOf(r)).recv.push({ ...r });
  const rows = [];
  for (const grp of groups.values()) {
    grp.issues.sort((a, b) => (a.challan_date < b.challan_date ? -1 : a.challan_date > b.challan_date ? 1 : a.challan_id - b.challan_id));
    const left = [];
    for (const rc of grp.recv) {
      let q = rc.qty_milli;
      if (rc.against_id) {
        for (const is of grp.issues) {
          if (is.challan_id !== rc.against_id || q <= 0) continue;
          const take = Math.min(q, is.qty_milli - is.received);
          is.received += take;
          q -= take;
        }
      }
      if (q > 0) left.push({ ...rc, qty_milli: q });
    }
    left.sort((a, b) => (a.challan_date < b.challan_date ? -1 : a.challan_date > b.challan_date ? 1 : 0));
    for (const rc of left) {
      let q = rc.qty_milli;
      for (const is of grp.issues) {
        if (q <= 0) break;
        const take = Math.min(q, is.qty_milli - is.received);
        if (take > 0) {
          is.received += take;
          q -= take;
        }
      }
      if (q > 0) rows.push({ over: true, challan_id: rc.challan_id, dc_no: rc.no_text, dc_date: rc.challan_date, client_id: rc.client_id, party_name: rc.party_name, item_id: rc.item_id, item_name: rc.item_name, uom: rc.uom, issued: 0, received: q, balance: -q });
    }
    for (const is of grp.issues) {
      rows.push({ over: false, challan_id: is.challan_id, dc_no: is.no_text, dc_date: is.challan_date, client_id: is.client_id, party_name: is.party_name, item_id: is.item_id, item_name: is.item_name, uom: is.uom, issued: is.qty_milli, received: is.received, balance: is.qty_milli - is.received });
    }
  }
  rows.sort((a, b) => (a.party_name < b.party_name ? -1 : a.party_name > b.party_name ? 1 : a.dc_date < b.dc_date ? -1 : a.dc_date > b.dc_date ? 1 : 0));
  return rows;
}
