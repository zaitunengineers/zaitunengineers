// Sessions, cookies and the wrong-password lockout.

import { randomBytes, toBase64Url, sha256Hex } from './crypto.js';

export const COOKIE_NAME = '__Host-zb_session';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// The browser logs out after 30 idle minutes (exact). The server keeps a 35 minute
// backstop, because it only notes activity every 5 minutes.
export const IDLE_MS = 30 * MINUTE;
export const SERVER_IDLE_MS = 35 * MINUTE;
export const ABSOLUTE_MS = 12 * HOUR;
const TOUCH_MS = 5 * MINUTE;

export const LOCK_MS = 15 * MINUTE;
export const WINDOW_MS = 15 * MINUTE;
const USER_FAILS = 5;
const IP_FAILS = 20;

export function parseCookie(header, name) {
  if (!header) return null;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

export function sessionCookie(token) {
  return `${COOKIE_NAME}=${token}; Path=/; Secure; HttpOnly; SameSite=Strict`;
}

export function clearCookie() {
  return `${COOKIE_NAME}=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0`;
}

export async function createSession(env, request, ip) {
  const token = toBase64Url(randomBytes(32));
  const tokenHash = await sha256Hex(token);
  const now = Date.now();
  const expiresAt = now + ABSOLUTE_MS;
  await env.DB.prepare(
    'INSERT INTO sessions (token_hash, user_id, created_at, last_seen_at, expires_at, ip, user_agent) VALUES (?, 1, ?, ?, ?, ?, ?)'
  )
    .bind(tokenHash, now, now, expiresAt, ip || null, (request.headers.get('User-Agent') || '').slice(0, 200))
    .run();
  return { token, expiresAt };
}

// Returns { tokenHash, username, expiresAt } or null. Reads the database only if a cookie is present.
export async function getSession(env, request) {
  const token = parseCookie(request.headers.get('Cookie'), COOKIE_NAME);
  if (!token || token.length !== 43) return null;
  const tokenHash = await sha256Hex(token);
  const row = await env.DB.prepare(
    'SELECT s.last_seen_at, s.expires_at, u.username FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?'
  )
    .bind(tokenHash)
    .first();
  if (!row) return null;
  const now = Date.now();
  if (row.expires_at <= now || now - row.last_seen_at > SERVER_IDLE_MS) {
    await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(tokenHash).run();
    return null;
  }
  if (now - row.last_seen_at > TOUCH_MS) {
    await env.DB.prepare('UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?').bind(now, tokenHash).run();
  }
  return { tokenHash, username: row.username, expiresAt: row.expires_at };
}

function remaining(rows, limit, now) {
  if (rows.length < limit) return 0;
  const newest = rows[0].at;
  const oldest = rows[limit - 1].at;
  if (newest - oldest > WINDOW_MS) return 0;
  const until = newest + LOCK_MS;
  return until > now ? until - now : 0;
}

// Is this key (a username, or a special key like "setup") or this IP locked out right now?
export async function lockStatus(env, key, ip, now = Date.now()) {
  const byKey = await env.DB.prepare(
    'SELECT at FROM login_attempts WHERE username = ? AND success = 0 ORDER BY at DESC LIMIT ?'
  )
    .bind(key, USER_FAILS)
    .all();
  const byIp = ip
    ? await env.DB.prepare('SELECT at FROM login_attempts WHERE ip = ? AND success = 0 ORDER BY at DESC LIMIT ?')
        .bind(ip, IP_FAILS)
        .all()
    : { results: [] };
  const ms = Math.max(remaining(byKey.results, USER_FAILS, now), remaining(byIp.results, IP_FAILS, now));
  return { locked: ms > 0, minutes: Math.max(1, Math.ceil(ms / MINUTE)) };
}

export async function recordAttempt(env, key, ip, success) {
  await env.DB.prepare('INSERT INTO login_attempts (username, ip, at, success) VALUES (?, ?, ?, ?)')
    .bind(key, ip || null, Date.now(), success ? 1 : 0)
    .run();
}

export async function clearFailures(env, key) {
  await env.DB.prepare('DELETE FROM login_attempts WHERE username = ? AND success = 0').bind(key).run();
}

export async function housekeeping(env, now = Date.now()) {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessions WHERE expires_at < ? OR last_seen_at < ?').bind(now, now - SERVER_IDLE_MS),
    env.DB.prepare('DELETE FROM login_attempts WHERE at < ?').bind(now - 30 * DAY),
    env.DB.prepare('DELETE FROM activity_log WHERE at < ?').bind(now - 730 * DAY),
  ]);
}
