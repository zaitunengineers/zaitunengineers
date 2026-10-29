// GSTIN checks for instant feedback on screen. The server repeats the same checks (lib/validate.js).

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function gstinFormatOk(g) {
  return GSTIN_RE.test(g);
}

export function gstinChecksumOk(g) {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const value = CHARS.indexOf(g[i]);
    const product = value * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return CHARS[(36 - (sum % 36)) % 36] === g[14];
}

export function isValidGstin(g) {
  return typeof g === 'string' && GSTIN_RE.test(g) && gstinChecksumOk(g);
}

export const stateCodeFromGstin = (g) => g.slice(0, 2);
export const panFromGstin = (g) => g.slice(2, 12);

export const isValidPan = (v) => /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(v);
export const isValidPincode = (v) => /^[1-9][0-9]{5}$/.test(v);
export const isValidIfsc = (v) => /^[A-Z]{4}0[A-Z0-9]{6}$/.test(v);
export const isValidEmail = (v) => v.length <= 120 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
export const isValidPhone = (v) => /^[0-9 +\-]{5,20}$/.test(v);
export const isValidBankAccount = (v) => /^[0-9]{6,24}$/.test(v);
