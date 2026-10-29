// GET /api/bills/last-rate?item_id=&client_id=  The last rate sold: to this party, else to anyone.

import { guard, json, HttpError } from '../../../lib/http.js';

export const onRequestGet = guard(async ({ request, env }) => {
  const u = new URL(request.url);
  const item = u.searchParams.get('item_id') || '';
  const client = u.searchParams.get('client_id') || '';
  if (!/^[0-9]{1,12}$/.test(item) || (client && !/^[0-9]{1,12}$/.test(client))) throw new HttpError(400, 'Bad request.');
  const base = `SELECT l.rate_milli, b.bill_date, b.bill_no, b.fy FROM bill_lines l JOIN bills b ON b.id = l.bill_id
    WHERE l.item_id = ? AND b.status = 'active'`;
  let row = null;
  let scope = 'party';
  if (client) row = await env.DB.prepare(`${base} AND b.client_id = ? ORDER BY b.bill_date DESC, b.bill_no DESC LIMIT 1`).bind(Number(item), Number(client)).first();
  if (!row) {
    scope = 'any';
    row = await env.DB.prepare(`${base} ORDER BY b.bill_date DESC, b.bill_no DESC LIMIT 1`).bind(Number(item)).first();
  }
  return json({ last: row ? { ...row, scope } : null });
});
