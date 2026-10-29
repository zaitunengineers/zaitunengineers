// GET /api/me  Who is logged in, plus the timers the screen needs.

import { guard, json } from '../../lib/http.js';
import { IDLE_MS } from '../../lib/auth.js';
import { loadSettings } from '../../lib/settings.js';

export const onRequestGet = guard(async ({ env, data }) => {
  const firm = await env.DB.prepare('SELECT name, pan, gstin, mobile, state_code FROM firm WHERE id = 1').first();
  const settings = await loadSettings(env);
  return json({
    username: data.session.username,
    firmName: (firm && firm.name) || '',
    firm: firm || {},
    settings,
    sessionExpiresAt: data.session.expiresAt,
    idleTimeoutMs: IDLE_MS,
  });
});
