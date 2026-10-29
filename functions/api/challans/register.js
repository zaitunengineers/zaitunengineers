// GET /api/challans/register?mode=pending|over|all&from=&to=&client_id=&item_id=
// Jobwork goods sent out against goods that came back, per party and item. Quantities are in thousandths.

import { guard, json, HttpError } from '../../../lib/http.js';
import { buildRegister } from '../../../lib/challans.js';

const todayIST = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
const dayNo = (iso) => Math.floor(Date.parse(iso + 'T00:00:00Z') / 86400000);

export const onRequestGet = guard(async ({ request, env }) => {
  const u = new URL(request.url).searchParams;
  const mode = u.get('mode') || 'pending';
  if (!['pending', 'over', 'all'].includes(mode)) throw new HttpError(400, 'Bad filter.');
  const from = u.get('from') || '0000-01-01';
  const to = u.get('to') || todayIST();
  if (!/^(\d{4})-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) throw new HttpError(400, 'Bad date.');
  const cid = u.get('client_id');
  const iid = u.get('item_id');
  if ((cid && !/^[0-9]{1,9}$/.test(cid)) || (iid && !/^[0-9]{1,9}$/.test(iid))) throw new HttpError(400, 'Bad filter.');
  const where = ["c.status = 'active'", "c.kind IN ('jw_issue','jw_opening','jw_receive')", 'c.challan_date <= ?'];
  const args = [to];
  if (cid) { where.push('c.client_id = ?'); args.push(Number(cid)); }
  if (iid) { where.push('l.item_id = ?'); args.push(Number(iid)); }
  const { results } = await env.DB.prepare(
    `SELECT c.id AS challan_id, c.kind, c.no_text, c.challan_date, c.client_id, c.party_name, l.item_id, l.item_name, l.uom, l.qty_milli, l.against_id
     FROM challans c JOIN challan_lines l ON l.challan_id = c.id WHERE ${where.join(' AND ')} ORDER BY c.challan_date, c.id`
  ).bind(...args).all();
  const issues = results.filter((r) => r.kind !== 'jw_receive');
  const receives = results.filter((r) => r.kind === 'jw_receive');
  const today = dayNo(to);
  let rows = buildRegister(issues, receives);
  rows = rows.filter((r) => r.dc_date >= from);
  if (mode === 'pending') rows = rows.filter((r) => !r.over && r.balance > 0);
  else if (mode === 'over') rows = rows.filter((r) => r.balance < 0);
  rows = rows.map((r) => ({ ...r, days_out: r.balance > 0 ? Math.max(0, today - dayNo(r.dc_date)) : 0 }));
  const sum = new Map();
  for (const r of rows) {
    const k = `${r.client_id}|${r.item_id ?? r.item_name}`;
    const s = sum.get(k) || { party_name: r.party_name, item_name: r.item_name, uom: r.uom, issued: 0, received: 0, balance: 0 };
    s.issued += r.issued; s.received += r.received; s.balance += r.balance;
    sum.set(k, s);
  }
  return json({ rows, summary: [...sum.values()], to });
});
