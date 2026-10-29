// GET /api/items/<id>   PUT /api/items/<id>   DELETE /api/items/<id>

import { guard, readJson, getIp, json, err } from '../../../lib/http.js';
import { logStmt } from '../../../lib/log.js';
import { ITEM_FIELDS, ITEM_EXTRA, validateItem, nameKey, idParam, isUniqueError, isUsed, fieldsFail } from '../../../lib/masters.js';

const load = (env, id) => env.DB.prepare('SELECT * FROM items WHERE id = ?').bind(id).first();
const same = (a, b) => (a ?? null) === (b ?? null);
const COLS = ['name', 'code', 'kind', 'uom', 'rate_paise', 'gst_bp', 'description', 'notes', 'item_code', 'alias', 'brand', 'uqc', 'purchase_rate_paise', 'mrp_paise', 'qty_decimals', 'item_group_id', 'desc_required'];
const money = (p) => (p === null || p === undefined ? null : (p / 100).toFixed(2));

export const onRequestGet = guard(async ({ env, params }) => {
  const row = await load(env, idParam(params.id));
  if (!row) return err('Not found.', 404);
  return json({ item: row });
});

export const onRequestPut = guard(async ({ request, env, params }) => {
  const id = idParam(params.id);
  const body = await readJson(request, 16 * 1024);
  const old = await load(env, id);
  if (!old) return err('Not found.', 404);

  let active = old.active;
  if (body.active !== undefined) {
    if (body.active !== 0 && body.active !== 1) return err('Bad value.', 400);
    active = body.active;
  }

  const merged = {};
  for (const f of ITEM_FIELDS) {
    if (body[f] !== undefined) merged[f] = body[f];
    else if (f === 'rate') merged.rate = old.rate_paise === null ? null : (old.rate_paise / 100).toFixed(2);
    else merged[f] = old[f];
  }
  for (const f of ITEM_EXTRA) {
    if (body[f] !== undefined) merged[f] = body[f];
    else if (f === 'purchase_rate') merged.purchase_rate = money(old.purchase_rate_paise);
    else if (f === 'mrp') merged.mrp = money(old.mrp_paise);
    else merged[f] = old[f];
  }
  const { value, errors } = validateItem(merged);
  if (Object.keys(errors).length) return json(fieldsFail(errors), 400);

  const key = nameKey(value.name);
  if (key !== old.name_key) {
    const other = await env.DB.prepare('SELECT id, name FROM items WHERE name_key = ? AND id <> ?').bind(key, id).first();
    if (other) return json({ error: 'An item with this name exists.', existingId: other.id, existingName: other.name, fields: { name: 'An item with this name exists.' } }, 409);
  }

  const changed = COLS.filter((f) => !same(old[f], value[f])).map((f) => (f === 'rate_paise' ? 'rate' : f));
  const statements = [];
  const ip = getIp(request);
  if (changed.length) {
    statements.push(
      env.DB.prepare(
        `UPDATE items SET name = ?, name_key = ?, code = ?, kind = ?, uom = ?, rate_paise = ?, gst_bp = ?, description = ?, notes = ?,
         item_code = ?, alias = ?, brand = ?, uqc = ?, purchase_rate_paise = ?, mrp_paise = ?, qty_decimals = ?, item_group_id = ?, desc_required = ?, updated_at = ? WHERE id = ?`
      ).bind(value.name, key, value.code, value.kind, value.uom, value.rate_paise, value.gst_bp, value.description, value.notes,
        value.item_code, value.alias, value.brand, value.uqc, value.purchase_rate_paise, value.mrp_paise, value.qty_decimals, value.item_group_id, value.desc_required, Date.now(), id),
      logStmt(env, 'item_edit', { name: value.name, fields: changed }, ip)
    );
  }
  if (active !== old.active) {
    statements.push(
      env.DB.prepare('UPDATE items SET active = ?, updated_at = ? WHERE id = ?').bind(active, Date.now(), id),
      logStmt(env, active ? 'item_show' : 'item_hide', { name: value.name }, ip)
    );
  }
  if (statements.length) {
    try {
      await env.DB.batch(statements);
    } catch (e) {
      if (isUniqueError(e)) return json({ error: 'An item with this name exists.', fields: { name: 'An item with this name exists.' } }, 409);
      throw e;
    }
  }
  return json({ item: await load(env, id) });
});

export const onRequestDelete = guard(async ({ request, env, params }) => {
  const id = idParam(params.id);
  const old = await load(env, id);
  if (!old) return err('Not found.', 404);
  if (await isUsed(env, 'item', id)) return err('In use on bills. Hide it instead.', 409);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM items WHERE id = ?').bind(id),
    logStmt(env, 'item_delete', { name: old.name }, getIp(request)),
  ]);
  return json({ ok: true });
});
