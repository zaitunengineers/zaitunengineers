// GET /api/challans/pending-for?client_id=  Open jobwork issue challans (goods still out) for one party, for the Receive screen.

import { guard, json, HttpError } from '../../../lib/http.js';
import { buildRegister } from '../../../lib/challans.js';

export const onRequestGet = guard(async ({ request, env }) => {
  const cid = new URL(request.url).searchParams.get('client_id');
  if (!cid || !/^[0-9]{1,9}$/.test(cid)) throw new HttpError(400, 'Choose the party.');
  const { results } = await env.DB.prepare(
    `SELECT c.id AS challan_id, c.kind, c.no_text, c.challan_date, c.client_id, c.party_name, l.item_id, l.item_name, l.uom, l.qty_milli, l.against_id
     FROM challans c JOIN challan_lines l ON l.challan_id = c.id
     WHERE c.status = 'active' AND c.client_id = ? AND c.kind IN ('jw_issue','jw_opening','jw_receive') ORDER BY c.challan_date, c.id`
  ).bind(Number(cid)).all();
  const rows = buildRegister(results.filter((r) => r.kind !== 'jw_receive'), results.filter((r) => r.kind === 'jw_receive')).filter((r) => !r.over && r.balance > 0);
  const byChallan = new Map();
  for (const r of rows) {
    const c = byChallan.get(r.challan_id) || { id: r.challan_id, no_text: r.dc_no, challan_date: r.dc_date, lines: [] };
    c.lines.push({ item_id: r.item_id, item_name: r.item_name, uom: r.uom, balance_milli: r.balance });
    byChallan.set(r.challan_id, c);
  }
  return json({ challans: [...byChallan.values()] });
});
