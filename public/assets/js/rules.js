// Quick checks for the client, item and transporter screens. The server repeats every one (lib/masters.js).

import { STATES } from '/assets/js/states.js';

export const UOMS = ['NOS', 'PCS', 'SET', 'KG', 'MTR', 'LTR', 'BOX', 'PAIR', 'JOB', 'HRS', 'LOT'];
// GST % times 100. 0.25% = 25, 3% = 300, 18% = 1800.
export const GST_RATES_BP = [0, 25, 300, 500, 1200, 1800, 2800, 4000];
export const MAIN_GST_BP = [0, 500, 1200, 1800, 2800, 4000];
export const MORE_GST_BP = [25, 300];

export function nameKey(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export const kindFromCode = (code) => (code && /^99[0-9]{4}$/.test(code) ? 'service' : 'goods');

// "5,361.50" or 5361.5 -> {paise: 536150}; {error} when it is not a rate; {paise: null} when empty.
export function parseRupees(v) {
  if (v === undefined || v === null) return { paise: null };
  let s = typeof v === 'number' ? (Number.isFinite(v) ? String(v) : 'x') : String(v);
  s = s.replace(/[\s,₹]/g, '').replace(/^rs\.?/i, '');
  if (s === '') return { paise: null };
  if (!/^[0-9]+(\.[0-9]{1,2})?$/.test(s)) return { error: 'Enter a rate like 5361 or 5361.50.' };
  const [whole, frac = ''] = s.split('.');
  if (whole.length > 7) return { error: 'That rate is too large.' };
  return { paise: Number(whole) * 100 + Number((frac + '00').slice(0, 2)) };
}

// paise -> text for an input box: 536100 -> "5361", 536150 -> "5361.50"
export const rupeesForInput = (paise) => (paise === null || paise === undefined ? '' : paise % 100 === 0 ? String(paise / 100) : (paise / 100).toFixed(2));

// paise -> "₹5,361.50"
export const rupeesForList = (paise) => (paise === null || paise === undefined ? 'No rate' : new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(paise / 100));

// 1800 -> "18%", 25 -> "0.25%"
export const gstLabel = (bp) => `${bp / 100}%`;

// ---- states: accept 24, "24-GUJARAT", "Gujarat", "daman & diu" ----
const norm = (s) => String(s).toLowerCase().replace(/\(old\)/g, '').replace(/&/g, 'and').replace(/[^a-z]/g, '');
const STATE_BY_NAME = new Map();
for (const [code, name] of STATES) {
  const k = norm(name);
  if (!STATE_BY_NAME.has(k) || /old/i.test(name) === false) STATE_BY_NAME.set(k, code);
}
STATE_BY_NAME.set('damananddiu', '25');
STATE_BY_NAME.set('orissa', '21');
STATE_BY_NAME.set('pondicherry', '34');
STATE_BY_NAME.set('delhi', '07');
STATE_BY_NAME.set('newdelhi', '07');
STATE_BY_NAME.set('jammuandkashmir', '01');
STATE_BY_NAME.set('andhrapradesh', '37');

export function parseState(v) {
  const s = String(v ?? '').trim();
  if (!s) return '';
  const m = /^([0-9]{1,2})(?:\s*[-:.)]|\s|$)/.exec(s);
  if (m) {
    const code = m[1].padStart(2, '0');
    if (STATES.some(([c]) => c === code)) return code;
  }
  const letters = s.replace(/^[0-9]+\s*[-:.)]?\s*/, '');
  return STATE_BY_NAME.get(norm(letters)) || '';
}

// Ten digits from "+91 98249 09008", "09824909008" and so on. Returns '' when it is not a mobile number.
export function tenDigits(v) {
  let d = String(v ?? '').replace(/[^0-9]/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return /^[0-9]{10}$/.test(d) ? d : '';
}
