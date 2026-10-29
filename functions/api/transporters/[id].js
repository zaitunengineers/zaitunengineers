// PUT /api/transporters/<id>   DELETE /api/transporters/<id>   (SELF DELIVERY, id 1, is fixed)

import { guard, readJson, getIp, json, err } from '../../../lib/http.js';
import { logStmt } from '../../../lib/log.js';
import { validateTransporter, idParam, isUniqueError, isUsed, fieldsFail, TRANSPORTER_EXTRA } from '../../../lib/masters.js';

const load = (env, id) => env.DB.prepare('SELECT * FROM transporters WHERE id = ?').bind(id).first();
const pub = (r) => ({ id: r.id, name: r.name, active: r.active, sort: r.sort, ...Object.fromEntries(TRANSPORTER_EXTRA.map((f) => [f, r[f] ?? null])) });
const EXTRA_SET = TRANSPORTER_EXTRA.map((f) => `${f} = ?`).join(', ');

export const onRequestPut = guard(async ({ request, env, params }) => {
  const id = idParam(params.id);
  const body = await readJson(request, 4 * 1024);
  const old = await load(env, id);
  if (!old) return err('Not found.', 404);
  if (id === 1) return err('SELF DELIVERY is fixed and cannot be changed.', 403);

  let { name, name_key: key, active, sort } = old;
  const changed = [];
  const extraSent = TRANSPORTER_EXTRA.some((f) => body[f] !== undefined);
  const extra = {};
  for (const f of TRANSPORTER_EXTRA) extra[f] = body[f] !== undefined ? body[f] : old[f];
  if (extraSent) {
    const chk = validateTransporter({ name: old.name, ...extra });
    if (Object.keys(chk.errors).length) return json(fieldsFail(chk.errors), 400);
    for (const f of TRANSPORTER_EXTRA) {
      extra[f] = chk.value[f];
      if ((old[f] ?? null) !== (extra[f] ?? null)) changed.push(f);
    }
  }
  if (body.name !== undefined) {
    const { value, errors } = validateTransporter(body);
    if (Object.keys(errors).length) return json(fieldsFail(errors), 400);
    if (value.name !== old.name) {
      const dup = await env.DB.prepare('SELECT id FROM transporters WHERE name_key = ? AND id <> ?').bind(value.name_key, id).first();
      if (dup) return json({ error: 'A transporter with this name exists.', fields: { name: 'A transporter with this name exists.' } }, 409);
      name = value.name;
      key = value.name_key;
      changed.push('name');
    }
  }
  if (body.active !== undefined) {
    if (body.active !== 0 && body.active !== 1) return err('Bad value.', 400);
    if (body.active !== active) {
      active = body.active;
      changed.push('active');
    }
  }
  if (body.sort !== undefined) {
    if (!Number.isInteger(body.sort) || body.sort < 1 || body.sort > 100000) return err('Bad order.', 400);
    if (body.sort !== sort) {
      sort = body.sort;
      changed.push('sort');
    }
  }
  if (changed.length) {
    try {
      await env.DB.batch([
        env.DB.prepare(`UPDATE transporters SET name = ?, name_key = ?, active = ?, sort = ?, ${EXTRA_SET} WHERE id = ?`).bind(name, key, active, sort, ...TRANSPORTER_EXTRA.map((f) => extra[f] ?? null), id),
        logStmt(env, 'transporter_edit', { name, fields: changed }, getIp(request)),
      ]);
    } catch (e) {
      if (isUniqueError(e)) return json({ error: 'A transporter with this name exists.', fields: { name: 'A transporter with this name exists.' } }, 409);
      throw e;
    }
  }
  return json({ transporter: pub({ id, name, active, sort, ...extra }) });
});

export const onRequestDelete = guard(async ({ request, env, params }) => {
  const id = idParam(params.id);
  const old = await load(env, id);
  if (!old) return err('Not found.', 404);
  if (id === 1) return err('SELF DELIVERY is fixed and cannot be deleted.', 403);
  if (await isUsed(env, 'transporter', id)) return err('In use on bills. Hide it instead.', 409);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM transporters WHERE id = ?').bind(id),
    logStmt(env, 'transporter_delete', { name: old.name }, getIp(request)),
  ]);
  return json({ ok: true });
});
