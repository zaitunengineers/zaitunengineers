// PUT /api/item-groups/<id>   DELETE /api/item-groups/<id>

import { guard, readJson, getIp, json, err } from '../../../lib/http.js';
import { logStmt } from '../../../lib/log.js';
import { nameKey, idParam, isUniqueError, isUsed, groupName } from '../../../lib/masters.js';

export const onRequestPut = guard(async ({ request, env, params }) => {
  const id = idParam(params.id);
  const old = await env.DB.prepare('SELECT id, name FROM item_groups WHERE id = ?').bind(id).first();
  if (!old) return err('Not found.', 404);
  const r = groupName(await readJson(request, 2 * 1024));
  if (r.error) return json({ error: r.error, fields: { name: r.error } }, 400);
  try {
    await env.DB.batch([
      env.DB.prepare('UPDATE item_groups SET name = ?, name_key = ? WHERE id = ?').bind(r.name, nameKey(r.name), id),
      logStmt(env, 'group_edit', { name: r.name, was: old.name }, getIp(request)),
    ]);
  } catch (e) {
    if (isUniqueError(e)) return json({ error: 'A group with this name exists.', fields: { name: 'A group with this name exists.' } }, 409);
    throw e;
  }
  return json({ group: { id, name: r.name } });
});

export const onRequestDelete = guard(async ({ request, env, params }) => {
  const id = idParam(params.id);
  const old = await env.DB.prepare('SELECT id, name FROM item_groups WHERE id = ?').bind(id).first();
  if (!old) return err('Not found.', 404);
  if (await isUsed(env, 'item_group', id)) return err('Items use this group. Move them first.', 409);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM item_groups WHERE id = ?').bind(id),
    logStmt(env, 'group_delete', { name: old.name }, getIp(request)),
  ]);
  return json({ ok: true });
});
