// POST /api/login  { username, password }

import { guard, readJson, getIp, HttpError, json } from '../../lib/http.js';
import { verifyPassword, fakeVerify } from '../../lib/crypto.js';
import {
  lockStatus, recordAttempt, clearFailures, createSession, sessionCookie, housekeeping,
} from '../../lib/auth.js';
import { logActivity } from '../../lib/log.js';

const tooMany = (m) => `Too many attempts. Try again in ${m} minute${m === 1 ? '' : 's'}.`;

export const onRequestPost = guard(async ({ request, env }) => {
  const ip = getIp(request);
  const body = await readJson(request, 10_000);
  const username = typeof body.username === 'string' ? body.username.trim().slice(0, 64) : '';
  const password = typeof body.password === 'string' ? body.password.slice(0, 200) : '';
  if (!username || !password) throw new HttpError(400, 'Enter your username and password.');

  const lock = await lockStatus(env, username, ip);
  if (lock.locked) throw new HttpError(429, tooMany(lock.minutes));

  const user = await env.DB.prepare(
    'SELECT id, username, pass_hash, pass_salt, pass_iter FROM users WHERE id = 1 AND username = ?'
  )
    .bind(username)
    .first();

  let ok = false;
  if (user) ok = await verifyPassword(password, user);
  else await fakeVerify(password);

  if (!ok) {
    await recordAttempt(env, username, ip, false);
    // Only log the username if it is the real one, so a password typed by mistake is never stored.
    await logActivity(env, 'login_fail', { username: user ? user.username : '(unknown)' }, ip);
    const after = await lockStatus(env, username, ip);
    if (after.locked) {
      await logActivity(env, 'lockout', { username: user ? user.username : '(unknown)' }, ip);
      throw new HttpError(429, tooMany(after.minutes));
    }
    throw new HttpError(401, 'Wrong username or password.');
  }

  const now = Date.now();
  const { token } = await createSession(env, request, ip);
  await env.DB.prepare('UPDATE users SET last_login_at = ? WHERE id = 1').bind(now).run();
  await clearFailures(env, username);
  await logActivity(env, 'login_ok', null, ip);
  await housekeeping(env, now);

  return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie(token) });
});
