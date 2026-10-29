// GET /api/bills/print?ids=1,2,3         (up to 100 bills)
// GET /api/bills/print?fy=2026&from=&to=&status=active|all   (up to 100 bills)
// Everything needed to print: the firm, the settings, and each bill with its lines and the client's contact details.

import { guard, json, err, HttpError } from '../../../lib/http.js';
import { fyParam } from '../../../lib/bills.js';
import { loadSettings } from '../../../lib/settings.js';
import { fyStart, fyEnd } from '../../../public/assets/js/gst.js';

export const MAX_BILLS = 100;
const CHUNK = 90; // D1 allows 100 bound values in one query

function chunks(list) {
  const out = [];
  for (let i = 0; i < list.length; i += CHUNK) out.push(list.slice(i, i + CHUNK));
  return out;
}

export const onRequestGet = guard(async ({ request, env }) => {
  const url = new URL(request.url);
  let ids = [];
  const raw = url.searchParams.get('ids');
  if (raw) {
    const parts = [...new Set(raw.split(',').map((s) => s.trim()).filter(Boolean))];
    if (!parts.length || parts.length > MAX_BILLS || parts.some((s) => !/^[0-9]{1,9}$/.test(s))) throw new HttpError(400, `Pick between 1 and ${MAX_BILLS} bills.`);
    ids = parts.map(Number);
  } else {
    const fy = fyParam(url.searchParams.get('fy'));
    const from = url.searchParams.get('from') || fyStart(fy);
    const to = url.searchParams.get('to') || fyEnd(fy);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) throw new HttpError(400, 'Bad date.');
    const status = url.searchParams.get('status') || 'all';
    if (!['all', 'active', 'cancelled'].includes(status)) throw new HttpError(400, 'Bad filter.');
    const cond = status === 'all' ? '' : ' AND status = ?';
    const stmt = env.DB.prepare(`SELECT id FROM bills WHERE fy = ? AND bill_date >= ? AND bill_date <= ?${cond} ORDER BY bill_no LIMIT ?`);
    const { results } = await (status === 'all' ? stmt.bind(fy, from, to, MAX_BILLS + 1) : stmt.bind(fy, from, to, status, MAX_BILLS + 1)).all();
    if (results.length > MAX_BILLS) throw new HttpError(400, `That is more than ${MAX_BILLS} bills. Pick a shorter date range.`);
    ids = results.map((r) => r.id);
  }
  if (!ids.length) return err('No bills found.', 404);

  const billStmts = chunks(ids).map((c) => env.DB.prepare(`SELECT * FROM bills WHERE id IN (${c.map(() => '?').join(',')})`).bind(...c));
  const lineStmts = chunks(ids).map((c) => env.DB.prepare(`SELECT * FROM bill_lines WHERE bill_id IN (${c.map(() => '?').join(',')}) ORDER BY bill_id, line_no, id`).bind(...c));
  const res = await env.DB.batch([...billStmts, ...lineStmts]);
  const bills = res.slice(0, billStmts.length).flatMap((r) => r.results);
  const lines = res.slice(billStmts.length).flatMap((r) => r.results);
  if (!bills.length) return err('No bills found.', 404);

  const clientIds = [...new Set(bills.map((b) => b.client_id).filter((v) => v !== null && v !== undefined))];
  const contacts = new Map();
  if (clientIds.length) {
    const cres = await env.DB.batch(chunks(clientIds).map((c) => env.DB.prepare(`SELECT id, mobile, email FROM clients WHERE id IN (${c.map(() => '?').join(',')})`).bind(...c)));
    for (const r of cres.flatMap((x) => x.results)) contacts.set(r.id, r);
  }
  const byBill = new Map();
  for (const l of lines) {
    if (!byBill.has(l.bill_id)) byBill.set(l.bill_id, []);
    byBill.get(l.bill_id).push(l);
  }
  const order = new Map(ids.map((id, i) => [id, i]));
  bills.sort((a, b) => (raw ? order.get(a.id) - order.get(b.id) : a.bill_no - b.bill_no));
  const out = bills.map((b) => {
    const c = contacts.get(b.client_id) || {};
    return { ...b, lines: byBill.get(b.id) || [], client_mobile: c.mobile || null, client_email: c.email || null };
  });

  const [firm, settings] = await Promise.all([env.DB.prepare('SELECT * FROM firm WHERE id = 1').first(), loadSettings(env)]);
  return json({ firm: firm || {}, settings, bills: out });
});
