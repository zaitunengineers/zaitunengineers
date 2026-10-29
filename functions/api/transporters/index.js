// GET /api/transporters?show=active   POST /api/transporters

import { guard, readJson, getIp, json, err } from '../../../lib/http.js';
import { logStmt } from '../../../lib/log.js';
import { validateTransporter, isUniqueError, fieldsFail, TRANSPORTER_EXTRA } from '../../../lib/masters.js';

export const onRequestGet = guard(async ({ request, env }) => {
  const show = new URL(request.url).searchParams.get('show') || 'active';
  if (!['active', 'hidden', 'all'].includes(show)) return err('Bad filter.', 400);
  const where = show === 'active' ? 'WHERE active = 1' : show === 'hidden' ? 'WHERE active = 0' : '';
  const { results } = await env.DB.prepare(`SELECT id, name, active, sort, ${TRANSPORTER_EXTRA.join(', ')} FROM transporters ${where} ORDER BY sort, name_key, id`).all();
  return json({ rows: results });
});

export const onRequestPost = guard(async ({ request, env }) => {
  const body = await readJson(request, 4 * 1024);
  const { value, errors } = validateTransporter(body);
  if (Object.keys(errors).length) return json(fieldsFail(errors), 400);
  const dup = await env.DB.prepare('SELECT id FROM transporters WHERE name_key = ?').bind(value.name_key).first();
  if (dup) return json({ error: 'A transporter with this name exists.', fields: { name: 'A transporter with this name exists.' } }, 409);
  const last = await env.DB.prepare('SELECT COALESCE(MAX(sort), 0) AS m FROM transporters').first();
  let res;
  try {
    res = await env.DB.batch([
      env.DB.prepare(`INSERT INTO transporters (name, name_key, active, sort, created_at, ${TRANSPORTER_EXTRA.join(', ')}) VALUES (?, ?, 1, ?, ?, ${TRANSPORTER_EXTRA.map(() => '?').join(', ')}) RETURNING id, name, active, sort, ${TRANSPORTER_EXTRA.join(', ')}`)
        .bind(value.name, value.name_key, Math.max(100, last.m + 10), Date.now(), ...TRANSPORTER_EXTRA.map((f) => value[f])),
      logStmt(env, 'transporter_add', { name: value.name }, getIp(request)),
    ]);
  } catch (e) {
    if (isUniqueError(e)) return json({ error: 'A transporter with this name exists.', fields: { name: 'A transporter with this name exists.' } }, 409);
    throw e;
  }
  return json({ transporter: res[0].results[0] }, 201);
});
