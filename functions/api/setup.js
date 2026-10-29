// POST /api/setup  Creates the owner account, or resets its username and password.
// Needs the SETUP_KEY secret. If that secret is not set, this endpoint does not exist.

import { guard, readJson, getIp, HttpError, json } from '../../lib/http.js';
import { safeStringEqual, hashPassword } from '../../lib/crypto.js';
import { lockStatus, recordAttempt, clearFailures } from '../../lib/auth.js';
import { validateUsername, validatePassword } from '../../lib/validate.js';
import { logStmt, logActivity } from '../../lib/log.js';

const KEY = 'setup';

export const onRequestPost = guard(async ({ request, env }) => {
  const configured = typeof env.SETUP_KEY === 'string' && env.SETUP_KEY.length >= 20;
  if (!configured) throw new HttpError(404, 'Not found.');

  const ip = getIp(request);
  const body = await readJson(request, 10_000);

  const lock = await lockStatus(env, KEY, ip);
  if (lock.locked) {
    throw new HttpError(429, `Too many attempts. Try again in ${lock.minutes} minute${lock.minutes === 1 ? '' : 's'}.`);
  }

  const setupKey = typeof body.setupKey === 'string' ? body.setupKey : '';
  if (!(await safeStringEqual(setupKey, env.SETUP_KEY))) {
    await recordAttempt(env, KEY, ip, false);
    await logActivity(env, 'login_fail', { where: 'setup' }, ip);
    const after = await lockStatus(env, KEY, ip);
    if (after.locked) {
      await logActivity(env, 'lockout', { where: 'setup' }, ip);
      throw new HttpError(429, `Too many attempts. Try again in ${after.minutes} minutes.`);
    }
    throw new HttpError(403, 'That setup key is not correct.');
  }

  const username = typeof body.username === 'string' ? body.username.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const problem = validateUsername(username) || validatePassword(password, username);
  if (problem) throw new HttpError(400, problem);

  const existing = await env.DB.prepare('SELECT id FROM users WHERE id = 1').first();
  const { hash, salt, iter } = await hashPassword(password);
  const now = Date.now();

  if (!existing) {
    await env.DB.batch([
      env.DB.prepare(
        'INSERT INTO users (id, username, pass_hash, pass_salt, pass_iter, created_at, updated_at) VALUES (1, ?, ?, ?, ?, ?, ?)'
      ).bind(username, hash, salt, iter, now, now),
      logStmt(env, 'setup', null, ip),
    ]);
  } else {
    await env.DB.batch([
      env.DB.prepare('UPDATE users SET username = ?, pass_hash = ?, pass_salt = ?, pass_iter = ?, updated_at = ? WHERE id = 1').bind(
        username, hash, salt, iter, now
      ),
      env.DB.prepare('DELETE FROM sessions'),
      logStmt(env, 'reset', null, ip),
    ]);
  }
  await clearFailures(env, KEY);
  await clearFailures(env, username);

  return json({ ok: true, mode: existing ? 'reset' : 'created' });
});
