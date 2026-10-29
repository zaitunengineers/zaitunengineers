// GET /api/challans/print?ids=1,2,3        (up to 100 challans)
// GET /api/challans/print?kind=general&fy=2026&from=&to=&status=active|all   (up to 100)
// Everything needed to print: the firm, the settings, and each challan with its lines and the client's contact details.

import { guard, json, err, HttpError } from '../../../lib/http.js';
import { fyParam } from '../../../lib/bills.js';
import { kindParam } from '../../../lib/challans.js';
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
    if (!parts.length || parts.length > MAX_BILLS || parts.some((s) => !/^[0-9]{1,9}$/.test(s))) throw new HttpError(400, `Pick between 1 and ${MAX_BILLS} challans.`);
    ids = parts.map(Number);
  } else {
    const kind = kindParam(url.searchParams.get('kind'));
    const fy = fyParam(url.searchParams.get('fy'));
    const from = url.searchParams.get('from') || fyStart(fy);
    const to = url.searchParams.get('to') || fyEnd(fy);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) throw new HttpError(400, 'Bad date.');
    const status = url.searchParams.get('status') || 'all';
    if (!['all', 'active', 'cancelled'].includes(status)) throw new HttpError(400, 'Bad filter.');
    const cond = status === 'all' ? '' : ' AND status = ?';
    const stmt = env.DB.prepare(`SELECT id FROM challans WHERE fy = ? AND kind = ? AND challan_date >= ? AND challan_date <= ?${cond} ORDER BY COALESCE(no_int, 0), id LIMIT ?`);
    const { results } = await (status === 'all' ? stmt.bind(fy, kind, from, to, MAX_BILLS + 1) : stmt.bind(fy, kind, from, to, status, MAX_BILLS + 1)).all();
    if (results.length > MAX_BILLS) throw new HttpError(400, `That is more than ${MAX_BILLS} challans. Pick a shorter date range.`);
    ids = results.map((r) => r.id);
  }
  if (!ids.length) return err('No challans found.', 404);

  const billStmts = chunks(ids).map((c) => env.DB.prepare(`SELECT * FROM challans WHERE id IN (${c.map(() => '?').join(',')})`).bind(...c));
  const lineStmts = chunks(ids).map((c) => env.DB.prepare(`SELECT * FROM challan_lines WHERE challan_id IN (${c.map(() => '?').join(',')}) ORDER BY challan_id, line_no, id`).bind(...c));
  const res = await env.DB.batch([...billStmts, ...lineStmts]);
  const chs = res.slice(0, billStmts.length).flatMap((r) => r.results);
  const lines = res.slice(billStmts.length).flatMap((r) => r.results);
  if (!chs.length) return err('No challans found.', 404);

  const clientIds = [...new Set(chs.map((b) => b.client_id).filter((v) => v !== null && v !== undefined))];
  const contacts = new Map();
  if (clientIds.length) {
    const cres = await env.DB.batch(chunks(clientIds).map((c) => env.DB.prepare(`SELECT id, mobile, email FROM clients WHERE id IN (${c.map(() => '?').join(',')})`).bind(...c)));
    for (const r of cres.flatMap((x) => x.results)) contacts.set(r.id, r);
  }
  const byBill = new Map();
  for (const l of lines) {
    if (!byBill.has(l.challan_id)) byBill.set(l.challan_id, []);
    byBill.get(l.challan_id).push(l);
  }
  const order = new Map(ids.map((id, i) => [id, i]));
  chs.sort((a, b) => (raw ? order.get(a.id) - order.get(b.id) : (a.no_int || 0) - (b.no_int || 0) || a.id - b.id));
  const out = chs.map((b) => {
    const c = contacts.get(b.client_id) || {};
    return { ...b, lines: byBill.get(b.id) || [], client_mobile: c.mobile || null, client_email: c.email || null };
  });

  const [firm, settings] = await Promise.all([env.DB.prepare('SELECT * FROM firm WHERE id = 1').first(), loadSettings(env)]);
  return json({ firm: firm || {}, settings, challans: out });
});
