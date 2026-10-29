// Password hashing and random tokens. Uses only the Web Crypto API built into Cloudflare.

const enc = new TextEncoder();

// PBKDF2 rounds for NEW passwords. Cloudflare's free plan allows about 10 ms of
// processing per request, which limits how high this can go. The number used is
// stored next to each password (pass_iter), so it can be raised later by
// changing the password. Allowed range: 20,000 to 100,000.
export const PBKDF2_ITERATIONS = 25000;

const DUMMY_SALT = new Uint8Array(16);

export function randomBytes(n) {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return b;
}

export function toBase64(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

export function fromBase64(str) {
  const s = atob(str);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export function toBase64Url(bytes) {
  return toBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function sha256Bytes(text) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(text)));
}

export async function sha256Hex(text) {
  const bytes = await sha256Bytes(text);
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

// Compares two byte arrays without stopping at the first difference.
export function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

// Compares two strings in constant time (by comparing their SHA-256 hashes).
export async function safeStringEqual(a, b) {
  const [ha, hb] = await Promise.all([sha256Bytes(String(a)), sha256Bytes(String(b))]);
  return timingSafeEqual(ha, hb);
}

async function derive(password, salt, iterations) {
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(String(password).normalize('NFKC')),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    key,
    256
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = await derive(password, salt, PBKDF2_ITERATIONS);
  return { hash: toBase64(hash), salt: toBase64(salt), iter: PBKDF2_ITERATIONS };
}

// rec = { pass_hash, pass_salt, pass_iter } as stored in the users table.
export async function verifyPassword(password, rec) {
  const hash = await derive(password, fromBase64(rec.pass_salt), rec.pass_iter);
  return timingSafeEqual(hash, fromBase64(rec.pass_hash));
}

// Does the same amount of work as a real check, so a wrong username
// takes as long to answer as a wrong password.
export async function fakeVerify(password) {
  await derive(password, DUMMY_SALT, PBKDF2_ITERATIONS);
}
