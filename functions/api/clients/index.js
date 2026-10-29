// GET /api/clients?q=&show=active&offset=0   POST /api/clients

import { guard, readJson, getIp, json } from '../../../lib/http.js';
import { logStmt } from '../../../lib/log.js';
import {
  PAGE_SIZE, validateClient, nameKey, likeEscape, listParams, showClause, isUniqueError, fieldsFail,
} from '../../../lib/masters.js';

export const onRequestGet = guard(async ({ request, env }) => {
  const { show, offset, q, limit } = listParams(new URL(request.url));
  const where = [showClause(show)];
  const args = [];
  if (q) {
    const key = nameKey(q);
    const raw = `%${likeEscape(q)}%`;
    const parts = ["gstin LIKE ? ESCAPE '\\'", "phone LIKE ? ESCAPE '\\'", "mobile LIKE ? ESCAPE '\\'", "city LIKE ? ESCAPE '\\'", "alias LIKE ? ESCAPE '\\'"];
    args.push(`%${likeEscape(q.toUpperCase())}%`, raw, raw, raw, raw);
    if (key) {
      parts.unshift("name_key LIKE ? ESCAPE '\\'");
      args.unshift(`%${likeEscape(key)}%`);
    }
    where.push(`(${parts.join(' OR ')})`);
  }
  const cond = where.join(' AND ');
  const [rows, count] = await env.DB.batch([
    env.DB.prepare(
      `SELECT id, name, alias, reg_type, address, city, pincode, pan, state_code, gstin, phone, mobile, email, active FROM clients WHERE ${cond}
       ORDER BY CASE WHEN gstin = ? THEN 0 ELSE 1 END, name_key, id LIMIT ? OFFSET ?`
    ).bind(...args, q.toUpperCase(), limit + 1, offset),
    env.DB.prepare(`SELECT COUNT(*) AS n FROM clients WHERE ${cond}`).bind(...args),
  ]);
  const list = rows.results;
  return json({ rows: list.slice(0, limit), more: list.length > limit, total: count.results[0].n });
});

export const onRequestPost = guard(async ({ request, env }) => {
  const body = await readJson(request, 16 * 1024);
  const { value, errors } = validateClient(body);
  if (Object.keys(errors).length) return json(fieldsFail(errors), 400);

  if (value.gstin) {
    const other = await env.DB.prepare('SELECT id, name FROM clients WHERE gstin = ?').bind(value.gstin).first();
    if (other) {
      return json({ error: `This GSTIN is already saved for ${other.name}.`, existingId: other.id, existingName: other.name, fields: { gstin: `Already saved for ${other.name}.` } }, 409);
    }
  }
  const now = Date.now();
  let res;
  try {
    res = await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO clients (name, name_key, address, city, pincode, state_code, gstin, pan, phone, mobile, email, notes, alias, reg_type, distance_km, active, source, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'app', ?, ?) RETURNING *`
      ).bind(value.name, nameKey(value.name), value.address, value.city, value.pincode, value.state_code, value.gstin, value.pan, value.phone, value.mobile, value.email, value.notes, value.alias, value.reg_type, value.distance_km, now, now),
      logStmt(env, 'client_add', { name: value.name }, getIp(request)),
    ]);
  } catch (e) {
    if (isUniqueError(e)) return json({ error: 'This GSTIN is already saved for another client.', fields: { gstin: 'Already saved.' } }, 409);
    throw e;
  }
  return json({ client: res[0].results[0] }, 201);
});
