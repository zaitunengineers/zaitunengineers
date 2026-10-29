// POST /api/password  { currentPassword, newPassword }

import { guard, readJson, getIp, HttpError, json } from '../../lib/http.js';
import { verifyPassword, hashPassword } from '../../lib/crypto.js';
import { lockStatus, recordAttempt, clearFailures } from '../../lib/auth.js';
import { validatePassword } from '../../lib/validate.js';
import { logStmt, logActivity } from '../../lib/log.js';

const KEY = '__password__';

export const onRequestPost = guard(async ({ request, env, data }) => {
  const ip = getIp(request);
  const body = await readJson(request, 10_000);
  const current = typeof body.currentPassword === 'string' ? body.currentPassword.slice(0, 200) : '';
  const next = typeof body.newPassword === 'string' ? body.newPassword : '';
  if (!current || !next) throw new HttpError(400, 'Fill in both passwords.');

  const lock = await lockStatus(env, KEY, ip);
  if (lock.locked) {
    throw new HttpError(429, `Too many attempts. Try again in ${lock.minutes} minute${lock.minutes === 1 ? '' : 's'}.`);
  }

  const user = await env.DB.prepare('SELECT username, pass_hash, pass_salt, pass_iter FROM users WHERE id = 1').first();
  if (!user || !(await verifyPassword(current, user))) {
    await recordAttempt(env, KEY, ip, false);
    // 403, not 401: the screen sends you to the login page on 401.
    throw new HttpError(403, 'Your current password is not correct.');
  }

  const problem = validatePassword(next, user.username);
  if (problem) throw new HttpError(400, problem);
  if (next === current) throw new HttpError(400, 'Choose a password different from the current one.');

  const { hash, salt, iter } = await hashPassword(next);
  await env.DB.batch([
    env.DB.prepare('UPDATE users SET pass_hash = ?, pass_salt = ?, pass_iter = ?, updated_at = ? WHERE id = 1').bind(
      hash, salt, iter, Date.now()
    ),
    env.DB.prepare('DELETE FROM sessions WHERE token_hash != ?').bind(data.session.tokenHash),
    logStmt(env, 'password_change', null, ip),
  ]);
  await clearFailures(env, KEY);
  return json({ ok: true });
});
