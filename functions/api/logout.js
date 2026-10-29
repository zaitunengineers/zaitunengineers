// POST /api/logout

import { guard, getIp, json } from '../../lib/http.js';
import { clearCookie } from '../../lib/auth.js';
import { logStmt } from '../../lib/log.js';

export const onRequestPost = guard(async ({ request, env, data }) => {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(data.session.tokenHash),
    logStmt(env, 'logout', null, getIp(request)),
  ]);
  return json({ ok: true }, 200, { 'Set-Cookie': clearCookie() });
});
