// POST /api/print-log  { ids:[1,2], how:'print'|'pdf'|'whatsapp'|'email'|'bulk'|'preview' }
// Writes one line in the Activity Log so "Saved Documents" can list what was printed or shared. No PDF is stored.

import { guard, readJson, getIp, json, err } from '../../lib/http.js';
import { logStmt } from '../../lib/log.js';

const HOW = new Set(['print', 'pdf', 'whatsapp', 'email', 'bulk', 'preview']);

export const onRequestPost = guard(async ({ request, env }) => {
  const body = await readJson(request, 8 * 1024);
  if (!HOW.has(body.how)) return err('Unknown action.', 400);
  const ids = Array.isArray(body.ids) ? [...new Set(body.ids.map(Number))] : [];
  if (!ids.length || ids.length > 100 || ids.some((n) => !Number.isInteger(n) || n < 1)) return err('Pick between 1 and 100 bills.', 400);
  const marks = ids.map(() => '?').join(',');
  if (body.doc === 'challan') {
    const { results: cs } = await env.DB.prepare(`SELECT id, fy, kind, no_text, party_name FROM challans WHERE id IN (${marks}) ORDER BY fy, no_int, id`).bind(...ids).all();
    if (!cs.length) return err('No challans found.', 404);
    await logStmt(env, 'challan_print', {
      how: body.how, doc: 'challan', kind: cs[0].kind, ids: cs.map((r) => r.id), nos: cs.map((r) => r.no_text), fy: cs[0].fy,
      party: cs.length === 1 ? cs[0].party_name : null, count: cs.length,
    }, getIp(request)).run();
    return json({ ok: true });
  }
  const { results } = await env.DB.prepare(`SELECT id, fy, bill_no, party_name FROM bills WHERE id IN (${marks}) ORDER BY fy, bill_no`).bind(...ids).all();
  if (!results.length) return err('No bills found.', 404);
  await logStmt(env, 'bill_print', {
    how: body.how,
    ids: results.map((r) => r.id),
    bill_nos: results.map((r) => r.bill_no),
    fy: results[0].fy,
    party: results.length === 1 ? results[0].party_name : null,
    count: results.length,
  }, getIp(request)).run();
  return json({ ok: true });
});
