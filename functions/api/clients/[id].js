// GET /api/clients/<id>   PUT /api/clients/<id>   DELETE /api/clients/<id>

import { guard, readJson, getIp, json, err } from '../../../lib/http.js';
import { logStmt } from '../../../lib/log.js';
import { CLIENT_FIELDS, CLIENT_EXTRA, validateClient, nameKey, idParam, isUniqueError, isUsed, fieldsFail } from '../../../lib/masters.js';

const load = (env, id) => env.DB.prepare('SELECT * FROM clients WHERE id = ?').bind(id).first();
const same = (a, b) => (a ?? null) === (b ?? null);

export const onRequestGet = guard(async ({ env, params }) => {
  const row = await load(env, idParam(params.id));
  if (!row) return err('Not found.', 404);
  return json({ client: row });
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

  // Missing fields keep their saved value.
  const merged = {};
  for (const f of [...CLIENT_FIELDS, ...CLIENT_EXTRA]) merged[f] = body[f] !== undefined ? body[f] : old[f];
  const { value, errors } = validateClient(merged);
  if (Object.keys(errors).length) return json(fieldsFail(errors), 400);

  if (value.gstin && value.gstin !== old.gstin) {
    const other = await env.DB.prepare('SELECT id, name FROM clients WHERE gstin = ? AND id <> ?').bind(value.gstin, id).first();
    if (other) {
      return json({ error: `This GSTIN is already saved for ${other.name}.`, existingId: other.id, existingName: other.name, fields: { gstin: `Already saved for ${other.name}.` } }, 409);
    }
  }

  const changed = [...CLIENT_FIELDS, ...CLIENT_EXTRA].filter((f) => !same(old[f], value[f]));
  const statements = [];
  const ip = getIp(request);
  if (changed.length) {
    statements.push(
      env.DB.prepare(
        `UPDATE clients SET name = ?, name_key = ?, address = ?, city = ?, pincode = ?, state_code = ?, gstin = ?, pan = ?,
         phone = ?, mobile = ?, email = ?, notes = ?, alias = ?, reg_type = ?, distance_km = ?, updated_at = ? WHERE id = ?`
      ).bind(value.name, nameKey(value.name), value.address, value.city, value.pincode, value.state_code, value.gstin, value.pan, value.phone, value.mobile, value.email, value.notes, value.alias, value.reg_type, value.distance_km, Date.now(), id),
      logStmt(env, 'client_edit', { name: value.name, fields: changed }, ip)
    );
  }
  if (active !== old.active) {
    statements.push(
      env.DB.prepare('UPDATE clients SET active = ?, updated_at = ? WHERE id = ?').bind(active, Date.now(), id),
      logStmt(env, active ? 'client_show' : 'client_hide', { name: value.name }, ip)
    );
  }
  if (statements.length) {
    try {
      await env.DB.batch(statements);
    } catch (e) {
      if (isUniqueError(e)) return json({ error: 'This GSTIN is already saved for another client.', fields: { gstin: 'Already saved.' } }, 409);
      throw e;
    }
  }
  return json({ client: await load(env, id) });
});

export const onRequestDelete = guard(async ({ request, env, params }) => {
  const id = idParam(params.id);
  const old = await load(env, id);
  if (!old) return err('Not found.', 404);
  if (await isUsed(env, 'client', id)) return err('In use on bills. Hide it instead.', 409);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM clients WHERE id = ?').bind(id),
    logStmt(env, 'client_delete', { name: old.name }, getIp(request)),
  ]);
  return json({ ok: true });
});
