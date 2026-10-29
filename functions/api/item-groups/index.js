// GET /api/item-groups   POST /api/item-groups

import { guard, readJson, getIp, json } from '../../../lib/http.js';
import { logStmt } from '../../../lib/log.js';
import { nameKey, isUniqueError, groupName } from '../../../lib/masters.js';

export const onRequestGet = guard(async ({ env }) => {
  const { results } = await env.DB.prepare(
    `SELECT g.id, g.name, (SELECT COUNT(*) FROM items i WHERE i.item_group_id = g.id) AS items FROM item_groups g ORDER BY g.name_key, g.id`
  ).all();
  return json({ rows: results });
});

export const onRequestPost = guard(async ({ request, env }) => {
  const r = groupName(await readJson(request, 2 * 1024));
  if (r.error) return json({ error: r.error, fields: { name: r.error } }, 400);
  try {
    const res = await env.DB.batch([
      env.DB.prepare('INSERT INTO item_groups (name, name_key, created_at) VALUES (?, ?, ?) RETURNING id, name').bind(r.name, nameKey(r.name), Date.now()),
      logStmt(env, 'group_add', { name: r.name }, getIp(request)),
    ]);
    return json({ group: { ...res[0].results[0], items: 0 } }, 201);
  } catch (e) {
    if (isUniqueError(e)) return json({ error: 'A group with this name exists.', fields: { name: 'A group with this name exists.' } }, 409);
    throw e;
  }
});
