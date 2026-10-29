// Rules shared by clients, items and transporters. The screens repeat the quick checks
// (public/assets/js/rules.js); the server always repeats every check here.

import { STATES, isValidGstin, isValidPan, isValidPincode, isValidEmail, isValidPhone } from './validate.js';
import { HttpError } from './http.js';

export const PAGE_SIZE = 50;
export const IMPORT_CHUNK = 40;

export const UOMS = ['NOS', 'PCS', 'SET', 'KG', 'MTR', 'LTR', 'BOX', 'PAIR', 'JOB', 'HRS', 'LOT'];
// GST % times 100. 0.25% = 25, 3% = 300, 18% = 1800.
export const GST_RATES_BP = [0, 25, 300, 500, 1200, 1800, 2800, 4000];
export const MAX_RATE_PAISE = 9999999 * 100 + 99;

// "Kabra Extrusion Technik Ltd." and "KABRA  EXTRUSION TECHNIK LTD" give the same key.
export function nameKey(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

const collapse = (s) => String(s).replace(/\s+/g, ' ').trim();

// A 6-digit code that starts with 99 is a service (SAC). Anything else is goods (HSN).
export function kindFromCode(code) {
  return code && /^99[0-9]{4}$/.test(code) ? 'service' : 'goods';
}

// "5,361.50" or 5361.5 -> 536150 paise. Returns {paise} or {error}. Empty means no rate.
export function parseRupees(v) {
  if (v === undefined || v === null) return { paise: null };
  let s = typeof v === 'number' ? (Number.isFinite(v) ? String(v) : 'x') : String(v);
  s = s.replace(/[\s,₹]/g, '').replace(/^rs\.?/i, '');
  if (s === '') return { paise: null };
  if (!/^[0-9]+(\.[0-9]{1,2})?$/.test(s)) return { error: 'Enter a rate like 5361 or 5361.50.' };
  const [whole, frac = ''] = s.split('.');
  if (whole.length > 7) return { error: 'That rate is too large.' };
  const paise = Number(whole) * 100 + Number((frac + '00').slice(0, 2));
  if (paise > MAX_RATE_PAISE) return { error: 'That rate is too large.' };
  return { paise };
}

// ---------------------------------------------------------------- clients
export const CLIENT_FIELDS = ['name', 'gstin', 'pan', 'address', 'city', 'pincode', 'state_code', 'phone', 'mobile', 'email', 'notes'];
export const CLIENT_EXTRA = ['alias', 'reg_type', 'distance_km'];
export const REG_TYPES = ['Register-Regular', 'Register-Composition', 'Unregister-Enduser'];

function tenDigits(v) {
  let d = String(v).replace(/[^0-9]/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return /^[6-9][0-9]{9}$/.test(d) || /^[0-9]{10}$/.test(d) ? d : null;
}

// input: an object with any of the client fields (text). Returns {value, errors}.
export function validateClient(input) {
  const value = {};
  const errors = {};
  const get = (k) => {
    const v = input[k];
    if (v === undefined || v === null) return '';
    if (typeof v !== 'string' && typeof v !== 'number') {
      errors[k] = 'This must be text.';
      return '';
    }
    return String(v);
  };

  const name = collapse(get('name'));
  if (name.length < 2 || name.length > 100 || !nameKey(name)) errors.name = "Enter the client's name.";
  value.name = name;

  const gstin = get('gstin').replace(/\s+/g, '').toUpperCase();
  value.gstin = gstin || null;
  if (gstin && !isValidGstin(gstin)) errors.gstin = 'This GSTIN is not valid.';

  let pan = get('pan').replace(/\s+/g, '').toUpperCase();
  if (pan && !isValidPan(pan)) errors.pan = 'PAN looks like ABCDE1234F.';

  let state = get('state_code').trim();
  if (state && !STATES[state]) errors.state_code = 'Pick the state.';
  if (value.gstin && !errors.gstin) {
    const fromGstin = gstin.slice(0, 2);
    if (!state) state = fromGstin;
    else if (!errors.state_code && state !== fromGstin) errors.state_code = 'State must match the GSTIN.';
    const panPart = gstin.slice(2, 12);
    if (!pan) pan = panPart;
    else if (!errors.pan && pan !== panPart) errors.pan = 'PAN does not match the GSTIN.';
  }
  if (!state && !errors.state_code) errors.state_code = 'Pick the state.';
  value.state_code = state;
  value.pan = pan || null;

  const lines = get('address')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(collapse)
    .filter(Boolean);
  const address = lines.join('\n');
  if (lines.length > 4 || address.length > 250) errors.address = 'Address is too long.';
  value.address = address || null;

  const city = collapse(get('city'));
  if (city.length > 40) errors.city = 'City is too long (40 characters at most).';
  value.city = city || null;

  const pincode = get('pincode').replace(/\s+/g, '');
  if (pincode && !isValidPincode(pincode)) errors.pincode = 'Pincode must be 6 digits.';
  value.pincode = pincode || null;

  const phone = collapse(get('phone'));
  if (phone && !isValidPhone(phone)) errors.phone = 'Phone number looks wrong.';
  value.phone = phone || null;

  const mobileRaw = collapse(get('mobile'));
  if (mobileRaw) {
    const m = tenDigits(mobileRaw);
    if (!m) errors.mobile = 'Enter a 10-digit mobile number.';
    value.mobile = m;
  } else value.mobile = null;

  const email = get('email').trim().toLowerCase();
  if (email && !isValidEmail(email)) errors.email = 'Email looks wrong.';
  value.email = email || null;

  const notes = get('notes').replace(/\r\n?/g, '\n').trim();
  if (notes.length > 500) errors.notes = 'Notes are too long (500 characters at most).';
  value.notes = notes || null;

  const alias = collapse(get('alias'));
  if (alias.length > 60) errors.alias = 'Alias is too long (60 characters at most).';
  value.alias = alias || null;

  const reg = collapse(get('reg_type'));
  if (reg && !REG_TYPES.includes(reg)) errors.reg_type = 'Pick a registration type from the list.';
  value.reg_type = reg || null;

  const dist = get('distance_km').trim();
  if (dist === '') value.distance_km = null;
  else if (!/^[0-9]{1,4}$/.test(dist)) {
    errors.distance_km = 'Distance is a whole number of km (0 to 9999).';
    value.distance_km = null;
  } else value.distance_km = Number(dist);

  return { value, errors };
}

// ---------------------------------------------------------------- items
export const ITEM_FIELDS = ['name', 'code', 'kind', 'uom', 'rate', 'gst_bp', 'description', 'notes'];
export const ITEM_EXTRA = ['item_code', 'alias', 'brand', 'uqc', 'purchase_rate', 'mrp', 'qty_decimals', 'item_group_id', 'desc_required'];
export const UQCS = ['NOS', 'PCS', 'SET', 'KGS', 'MTR', 'LTR', 'BOX', 'PRS', 'GMS', 'SQM', 'CTN', 'BAG', 'BTL', 'DOZ', 'TON', 'UNT', 'OTH'];

// input uses `rate` in rupees (text or number) and `gst_bp` as a whole number.
export function validateItem(input) {
  const value = {};
  const errors = {};
  const text = (k) => {
    const v = input[k];
    if (v === undefined || v === null) return '';
    if (typeof v !== 'string' && typeof v !== 'number') {
      errors[k] = 'This must be text.';
      return '';
    }
    return String(v);
  };

  const name = collapse(text('name'));
  if (name.length < 2 || name.length > 120 || !nameKey(name)) errors.name = 'Enter the item name (2 to 120 characters).';
  value.name = name;

  const code = text('code').replace(/\s+/g, '');
  if (code && !/^([0-9]{4}|[0-9]{6}|[0-9]{8})$/.test(code)) errors.code = 'HSN or SAC must be 4, 6 or 8 digits.';
  value.code = code || null;

  const kindIn = text('kind').trim().toLowerCase();
  const KINDS = ['goods', 'service', 'service_goods'];
  if (kindIn && !KINDS.includes(kindIn)) errors.kind = 'Choose Goods, Service or Service with Goods.';
  value.kind = KINDS.includes(kindIn) ? kindIn : kindFromCode(errors.code ? null : value.code);

  const uomIn = collapse(text('uom'));
  if (uomIn && !/^[A-Za-z]{1,10}$/.test(uomIn)) errors.uom = 'Unit can be up to 10 letters.';
  value.uom = uomIn && !errors.uom ? uomIn : 'NOS';

  const r = parseRupees(input.rate);
  if (r.error) errors.rate = r.error;
  value.rate_paise = r.paise ?? null;

  let bp = input.gst_bp;
  if (bp === undefined || bp === null || bp === '') bp = 1800;
  bp = Number(bp);
  if (!Number.isInteger(bp) || !GST_RATES_BP.includes(bp)) errors.gst_bp = 'Pick a GST % from the list.';
  value.gst_bp = bp;

  const description = collapse(text('description'));
  if (description.length > 200) errors.description = 'Description is too long (200 characters at most).';
  value.description = description || null;

  const notes = text('notes').replace(/\r\n?/g, '\n').trim();
  if (notes.length > 500) errors.notes = 'Notes are too long (500 characters at most).';
  value.notes = notes || null;

  const itemCode = text('item_code').replace(/\s+/g, ' ').trim();
  if (itemCode.length > 30) errors.item_code = 'Item code is too long (30 characters at most).';
  value.item_code = itemCode || null;
  const alias = collapse(text('alias'));
  if (alias.length > 60) errors.alias = 'Alias is too long (60 characters at most).';
  value.alias = alias || null;
  const brand = collapse(text('brand'));
  if (brand.length > 60) errors.brand = 'Brand is too long (60 characters at most).';
  value.brand = brand || null;
  const uqc = text('uqc').trim().toUpperCase();
  if (uqc && !UQCS.includes(uqc)) errors.uqc = 'Pick a unit code from the list.';
  value.uqc = uqc || null;
  const pr = parseRupees(input.purchase_rate);
  if (pr.error) errors.purchase_rate = pr.error;
  value.purchase_rate_paise = pr.paise ?? null;
  const mrp = parseRupees(input.mrp);
  if (mrp.error) errors.mrp = mrp.error;
  value.mrp_paise = mrp.paise ?? null;
  const dec = input.qty_decimals === undefined || input.qty_decimals === null || input.qty_decimals === '' ? 0 : Number(input.qty_decimals);
  if (!Number.isInteger(dec) || dec < 0 || dec > 3) errors.qty_decimals = 'Decimals can be 0 to 3.';
  value.qty_decimals = Number.isInteger(dec) && dec >= 0 && dec <= 3 ? dec : 0;
  const gid = input.item_group_id;
  if (gid === undefined || gid === null || gid === '') value.item_group_id = null;
  else if (!Number.isInteger(Number(gid)) || Number(gid) < 1) {
    errors.item_group_id = 'Pick a group from the list.';
    value.item_group_id = null;
  } else value.item_group_id = Number(gid);
  value.desc_required = input.desc_required === 1 || input.desc_required === true || input.desc_required === '1' ? 1 : 0;

  return { value, errors };
}

// ---------------------------------------------------------------- transporters
export const TRANSPORTER_EXTRA = ['address1', 'address2', 'person', 'phone', 'mobile', 'email', 'gstin', 'tr_id'];
const TR_MAX = { address1: 80, address2: 80, person: 60, phone: 20, mobile: 20, email: 120, gstin: 15, tr_id: 20 };

export function validateTransporter(input) {
  const errors = {};
  const name = collapse(typeof input.name === 'string' ? input.name : '').toUpperCase();
  if (name.length < 2 || name.length > 60 || !nameKey(name)) errors.name = 'Enter a name (2 to 60 characters).';
  const value = { name, name_key: nameKey(name) };
  for (const f of TRANSPORTER_EXTRA) {
    const raw = input[f];
    if (raw === undefined || raw === null) { value[f] = null; continue; }
    if (typeof raw !== 'string') { errors[f] = 'This must be text.'; value[f] = null; continue; }
    let v = collapse(raw);
    if (f === 'gstin') v = v.toUpperCase();
    if (v.length > TR_MAX[f]) { errors[f] = `Too long (${TR_MAX[f]} characters at most).`; v = ''; }
    if (f === 'gstin' && v && !isValidGstin(v)) errors.gstin = 'This GSTIN is not valid.';
    if (f === 'email' && v && !isValidEmail(v.toLowerCase())) errors.email = 'Email looks wrong.';
    if ((f === 'phone' || f === 'mobile') && v && !isValidPhone(v)) errors[f] = 'Number looks wrong.';
    value[f] = v || null;
  }
  if (value.email) value.email = value.email.toLowerCase();
  return { value, errors };
}

// ---------------------------------------------------------------- small helpers
// True when any bill uses the record. Used records can only be hidden, never deleted.
export async function isUsed(env, kind, id) {
  let q;
  if (kind === 'client') q = 'SELECT 1 AS x FROM bills WHERE client_id = ? LIMIT 1';
  else if (kind === 'transporter') q = 'SELECT 1 AS x FROM bills WHERE transporter_id = ? LIMIT 1';
  else if (kind === 'item') q = 'SELECT 1 AS x FROM bill_lines WHERE item_id = ? LIMIT 1';
  else if (kind === 'item_group') q = 'SELECT 1 AS x FROM items WHERE item_group_id = ? LIMIT 1';
  else return false;
  return !!(await env.DB.prepare(q).bind(id).first());
}

export function idParam(raw) {
  if (typeof raw !== 'string' || !/^[0-9]{1,12}$/.test(raw)) throw new HttpError(404, 'Not found.');
  return Number(raw);
}

export const isUniqueError = (e) => /UNIQUE|constraint/i.test((e && e.message) || '');

// Safe text for LIKE: % and _ and the escape character are plain characters.
export const likeEscape = (s) => String(s).replace(/[\\%_]/g, (c) => '\\' + c);

export function listParams(url) {
  const show = url.searchParams.get('show') || 'active';
  if (!['active', 'hidden', 'all'].includes(show)) throw new HttpError(400, 'Bad filter.');
  const offRaw = url.searchParams.get('offset');
  let offset = 0;
  if (offRaw !== null && offRaw !== '') {
    if (!/^[0-9]{1,7}$/.test(offRaw)) throw new HttpError(400, 'Bad offset.');
    offset = Number(offRaw);
  }
  let q = (url.searchParams.get('q') || '').trim();
  if (q.length > 60) q = q.slice(0, 60);
  // The Aeon-style master lists ask for a whole page of up to 500 rows.
  const limRaw = url.searchParams.get('limit');
  let limit = PAGE_SIZE;
  if (limRaw !== null && limRaw !== '') {
    if (!/^[0-9]{1,3}$/.test(limRaw) || Number(limRaw) < 1 || Number(limRaw) > 500) throw new HttpError(400, 'Bad limit.');
    limit = Number(limRaw);
  }
  return { show, offset, q, limit };
}

export const showClause = (show) => (show === 'active' ? 'active = 1' : show === 'hidden' ? 'active = 0' : '1 = 1');

export const fieldsFail = (fields) => ({ error: 'Please fix the highlighted fields.', fields });

export function groupName(body) {
  const name = typeof body.name === 'string' ? body.name.replace(/\s+/g, ' ').trim() : '';
  if (name.length < 1 || name.length > 60 || !nameKey(name)) return { error: 'Enter the group name (1 to 60 characters).' };
  return { name };
}
