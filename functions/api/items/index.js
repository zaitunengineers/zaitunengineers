// GET /api/items?q=&show=active&offset=0   POST /api/items

import { guard, readJson, getIp, json } from '../../../lib/http.js';
import { logStmt } from '../../../lib/log.js';
import {
  PAGE_SIZE, validateItem, nameKey, likeEscape, listParams, showClause, isUniqueError, fieldsFail,
} from '../../../lib/masters.js';

export const onRequestGet = guard(async ({ request, env }) => {
  const { show, offset, q, limit } = listParams(new URL(request.url));
  const where = [showClause(show)];
  const args = [];
  if (q) {
    const key = nameKey(q);
    const parts = ["code LIKE ? ESCAPE '\\'", "item_code LIKE ? ESCAPE '\\'", "alias LIKE ? ESCAPE '\\'"];
    args.push(`%${likeEscape(q)}%`, `%${likeEscape(q)}%`, `%${likeEscape(q)}%`);
    if (key) {
      parts.unshift("name_key LIKE ? ESCAPE '\\'");
      args.unshift(`%${likeEscape(key)}%`);
    }
    where.push(`(${parts.join(' OR ')})`);
  }
  const cond = where.join(' AND ');
  const [rows, count] = await env.DB.batch([
    env.DB.prepare(
      `SELECT id, name, code, kind, uom, rate_paise, gst_bp, active, item_code, alias, brand, uqc, purchase_rate_paise, mrp_paise, qty_decimals, item_group_id, desc_required, description FROM items WHERE ${cond}
       ORDER BY CASE WHEN code = ? THEN 0 ELSE 1 END, name_key, id LIMIT ? OFFSET ?`
    ).bind(...args, q, limit + 1, offset),
    env.DB.prepare(`SELECT COUNT(*) AS n FROM items WHERE ${cond}`).bind(...args),
  ]);
  const list = rows.results;
  return json({ rows: list.slice(0, limit), more: list.length > limit, total: count.results[0].n });
});

export const onRequestPost = guard(async ({ request, env }) => {
  const body = await readJson(request, 16 * 1024);
  const { value, errors } = validateItem(body);
  if (Object.keys(errors).length) return json(fieldsFail(errors), 400);

  const key = nameKey(value.name);
  const other = await env.DB.prepare('SELECT id, name FROM items WHERE name_key = ?').bind(key).first();
  if (other) return json({ error: 'An item with this name exists.', existingId: other.id, existingName: other.name, fields: { name: 'An item with this name exists.' } }, 409);

  const now = Date.now();
  let res;
  try {
    res = await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO items (name, name_key, code, kind, uom, rate_paise, gst_bp, description, notes, item_code, alias, brand, uqc, purchase_rate_paise, mrp_paise, qty_decimals, item_group_id, desc_required, active, source, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'app', ?, ?) RETURNING *`
      ).bind(value.name, key, value.code, value.kind, value.uom, value.rate_paise, value.gst_bp, value.description, value.notes, value.item_code, value.alias, value.brand, value.uqc, value.purchase_rate_paise, value.mrp_paise, value.qty_decimals, value.item_group_id, value.desc_required, now, now),
      logStmt(env, 'item_add', { name: value.name }, getIp(request)),
    ]);
  } catch (e) {
    if (isUniqueError(e)) return json({ error: 'An item with this name exists.', fields: { name: 'An item with this name exists.' } }, 409);
    throw e;
  }
  return json({ item: res[0].results[0] }, 201);
});
