// GET /api/challans/<id>   PUT /api/challans/<id>   DELETE /api/challans/<id>

import { guard, readJson, getIp, json, err } from '../../../lib/http.js';
import { logStmt } from '../../../lib/log.js';
import { idParam } from '../../../lib/masters.js';
import { prepareChallan, noIntOf, CH_COLS, chValues, chLineInsert, loadChallan, KIND_NAMES } from '../../../lib/challans.js';

const uniqueErr = (e) => /UNIQUE|constraint/i.test((e && e.message) || '');

export const onRequestGet = guard(async ({ env, params }) => {
  const c = await loadChallan(env, idParam(params.id));
  if (!c) return err('Not found.', 404);
  return json({ challan: c });
});

export const onRequestPut = guard(async ({ request, env, params }) => {
  const id = idParam(params.id);
  const body = await readJson(request, 100 * 1024);
  const old = await loadChallan(env, id);
  if (!old) return err('Not found.', 404);
  if (old.status === 'cancelled') return err('A cancelled challan cannot be edited.', 409);
  const c = await prepareChallan(env, { ...body, fy: old.fy }, { fy: old.fy, kind: old.kind, old: { client_id: old.client_id, transporter_id: old.transporter_id, itemIds: new Set(old.lines.map((l) => l.item_id)) } });
  const noText = c.no_text || old.no_text;
  const changed = [];
  const vals = chValues(c);
  CH_COLS.forEach((col, i) => { if ((old[col] ?? null) !== (vals[i] ?? null)) changed.push(col); });
  if (noText !== old.no_text) changed.push('no_text');
  const sig = (ls) => JSON.stringify(ls.map((l) => [l.item_id, l.qty_milli, l.rate_milli, l.gst_bp, l.hsn, l.description, l.against_id ?? null]));
  if (sig(c.lines) !== sig(old.lines)) changed.push('lines');
  const sets = [...CH_COLS, 'no_text', 'no_int', 'updated_at'].map((x) => `${x} = ?`).join(', ');
  try {
    await env.DB.batch([
      env.DB.prepare(`UPDATE challans SET ${sets} WHERE id = ?`).bind(...vals, noText, noIntOf(noText), Date.now(), id),
      env.DB.prepare('DELETE FROM challan_lines WHERE challan_id = ?').bind(id),
      ...c.lines.map((ln) => chLineInsert(env, id, ln)),
      logStmt(env, 'challan_edit', { kind: old.kind, kind_name: KIND_NAMES[old.kind], no: noText, fy: old.fy, party: c.party_name, fields: changed }, getIp(request)),
    ]);
  } catch (e) {
    if (uniqueErr(e)) return json({ error: 'This number is already used in this year.', fields: { no_text: 'This number is already used in this year.' } }, 409);
    throw e;
  }
  return json({ challan: await loadChallan(env, id) });
});

// Delete works on any challan and leaves the number as a gap; the whole challan is copied into the Activity Log first.
export const onRequestDelete = guard(async ({ request, env, params }) => {
  const id = idParam(params.id);
  const old = await loadChallan(env, id);
  if (!old) return err('Not found.', 404);
  await env.DB.batch([
    logStmt(env, 'challan_delete', { kind: old.kind, kind_name: KIND_NAMES[old.kind], no: old.no_text, fy: old.fy, party: old.party_name, net: (old.net_paise / 100).toFixed(2), challan: { ...old, lines: undefined }, lines: old.lines }, getIp(request)),
    env.DB.prepare('DELETE FROM challan_lines WHERE challan_id = ?').bind(id),
    env.DB.prepare('DELETE FROM challans WHERE id = ?').bind(id),
  ]);
  return json({ ok: true });
});
