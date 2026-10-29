// GET /api/bills/<id>   PUT /api/bills/<id>   DELETE /api/bills/<id>

import { guard, readJson, getIp, json, err } from '../../../lib/http.js';
import { logStmt } from '../../../lib/log.js';
import { idParam } from '../../../lib/masters.js';
import { prepareBill, billColumns, BILL_COL_NAMES, lineInsertById, loadBill, rupeesText } from '../../../lib/bills.js';

export const onRequestGet = guard(async ({ env, params }) => {
  const bill = await loadBill(env, idParam(params.id));
  if (!bill) return err('Not found.', 404);
  return json({ bill });
});

const uniqueErr = (e) => /UNIQUE|constraint/i.test((e && e.message) || '');

export const onRequestPut = guard(async ({ request, env, params }) => {
  const id = idParam(params.id);
  const body = await readJson(request, 100 * 1024);
  const old = await loadBill(env, id);
  if (!old) return err('Not found.', 404);
  if (old.status === 'cancelled') return err('A cancelled bill cannot be edited.', 409);

  const b = await prepareBill(env, { ...body, fy: old.fy }, { fy: old.fy, old: { client_id: old.client_id, transporter_id: old.transporter_id, itemIds: new Set(old.lines.map((l) => l.item_id)) } });
  const billNo = b.bill_no === null ? old.bill_no : b.bill_no;

  const changed = [];
  const oldCols = { ...old, amount_paise: old.amount_paise };
  const newVals = Object.fromEntries(BILL_COL_NAMES.map((c, i) => [c, billColumns(b)[i]]));
  for (const c of BILL_COL_NAMES) if ((oldCols[c] ?? null) !== (newVals[c] ?? null)) changed.push(c);
  if (billNo !== old.bill_no) changed.push('bill_no');
  const linesNow = JSON.stringify(b.lines.map((l) => [l.item_id, l.qty_milli, l.rate_milli, l.gst_bp, l.disc_bp, l.hsn, l.description, l.a1_paise, l.a2_paise, l.a3_paise, l.a4_paise, l.a5_paise, l.a6_paise, l.l2_paise]));
  const linesBefore = JSON.stringify(old.lines.map((l) => [l.item_id, l.qty_milli, l.rate_milli, l.gst_bp, l.disc_bp, l.hsn, l.description, l.a1_paise, l.a2_paise, l.a3_paise, l.a4_paise, l.a5_paise, l.a6_paise, l.l2_paise]));
  if (linesNow !== linesBefore) changed.push('lines');

  const sets = [...BILL_COL_NAMES, 'bill_no', 'updated_at'].map((c) => `${c} = ?`).join(', ');
  try {
    await env.DB.batch([
      env.DB.prepare(`UPDATE bills SET ${sets} WHERE id = ?`).bind(...billColumns(b), billNo, Date.now(), id),
      env.DB.prepare('DELETE FROM bill_lines WHERE bill_id = ?').bind(id),
      ...b.lines.map((ln) => lineInsertById(env, id, ln)),
      logStmt(env, 'bill_edit', { bill_no: billNo, fy: old.fy, party: b.party_name, fields: changed, old_net: rupeesText(old.net_paise), new_net: rupeesText(b.totals.net_paise) }, getIp(request)),
    ]);
  } catch (e) {
    if (uniqueErr(e)) return json({ error: `Bill no. ${billNo} is already used in ${old.fy}-${old.fy + 1}.`, fields: { bill_no: `Bill no. ${billNo} is already used.` } }, 409);
    throw e;
  }
  return json({ bill: await loadBill(env, id) });
});

// Delete works on any bill, as in Aeon, and leaves the number as a gap.
// The whole bill is copied into the Activity Log first so it can always be looked up.
export const onRequestDelete = guard(async ({ request, env, params }) => {
  const id = idParam(params.id);
  const old = await loadBill(env, id);
  if (!old) return err('Not found.', 404);
  const copy = {
    bill_no: old.bill_no, fy: old.fy, party: old.party_name, net: rupeesText(old.net_paise), status: old.status,
    bill: { ...old, lines: undefined }, lines: old.lines,
  };
  await env.DB.batch([
    logStmt(env, 'bill_delete', copy, getIp(request)),
    env.DB.prepare('DELETE FROM bill_lines WHERE bill_id = ?').bind(id),
    env.DB.prepare('DELETE FROM bills WHERE id = ?').bind(id),
  ]);
  return json({ ok: true });
});
