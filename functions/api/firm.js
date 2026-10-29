// GET /api/firm  and  PUT /api/firm

import { guard, readJson, getIp, json } from '../../lib/http.js';
import { validateFirm, FIRM_FIELDS } from '../../lib/validate.js';
import { logStmt } from '../../lib/log.js';

const sameValue = (a, b) => (a ?? null) === (b ?? null);

export const onRequestGet = guard(async ({ env }) => {
  const firm = await env.DB.prepare('SELECT * FROM firm WHERE id = 1').first();
  return json(firm || {});
});

export const onRequestPut = guard(async ({ request, env }) => {
  const body = await readJson(request, 1_000_000);
  const old = (await env.DB.prepare('SELECT * FROM firm WHERE id = 1').first()) || {};
  const { value, errors } = validateFirm(body, old);
  if (Object.keys(errors).length) {
    return json({ error: 'Please fix the highlighted fields.', fields: errors }, 400);
  }

  const changed = FIRM_FIELDS.filter((f) => !sameValue(old[f], value[f]));
  if (changed.length) {
    const now = Date.now();
    // Column names come from a fixed list in our own code, never from the browser.
    const sets = FIRM_FIELDS.map((f) => `${f} = ?`).join(', ');
    await env.DB.batch([
      env.DB.prepare(`UPDATE firm SET ${sets}, updated_at = ? WHERE id = 1`).bind(
        ...FIRM_FIELDS.map((f) => value[f]),
        now
      ),
      logStmt(env, 'firm_update', { fields: changed }, getIp(request)),
    ]);
    value.updated_at = now;
  } else {
    value.updated_at = old.updated_at ?? null;
  }
  return json({ ok: true, firm: value });
});
