// GET /api/settings   PUT /api/settings  (send only the keys you change)

import { guard, readJson, getIp, json, err } from '../../lib/http.js';
import { logStmt } from '../../lib/log.js';
import { validateSetting, loadSettings } from '../../lib/settings.js';

export const onRequestGet = guard(async ({ env }) => json({ settings: await loadSettings(env) }));

export const onRequestPut = guard(async ({ request, env }) => {
  const body = await readJson(request, 8 * 1024);
  const keys = Object.keys(body);
  if (!keys.length) return err('Nothing to change.', 400);
  const fields = {};
  const clean = {};
  for (const k of keys) {
    const r = validateSetting(k, body[k]);
    if (r.error) fields[k] = r.error;
    else clean[k] = r.value;
  }
  if (Object.keys(fields).length) return json({ error: 'Please fix the highlighted fields.', fields }, 400);
  const old = await loadSettings(env);
  const changed = Object.keys(clean).filter((k) => clean[k] !== old[k]);
  if (changed.length) {
    const now = Date.now();
    await env.DB.batch([
      ...changed.map((k) => env.DB.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(k, clean[k])),
      logStmt(env, 'settings_edit', { fields: changed, at: now }, getIp(request)),
    ]);
  }
  return json({ settings: { ...old, ...clean } });
});

