// GET /api/bills?fy=2026&from=&to=&q=&status=all|active|cancelled&offset=0   POST /api/bills

import { guard, readJson, getIp, json, err, HttpError } from '../../../lib/http.js';
import { logStmt } from '../../../lib/log.js';
import { likeEscape } from '../../../lib/masters.js';
import { prepareBill, fyParam, billColumns, BILL_COL_NAMES, lineInsertByNumber, loadBill, rupeesText } from '../../../lib/bills.js';
import { fyStart, fyEnd } from '../../../public/assets/js/gst.js';

export const PAGE = 300;

export const onRequestGet = guard(async ({ request, env }) => {
  const url = new URL(request.url);
  const fy = fyParam(url.searchParams.get('fy'));
  const from = url.searchParams.get('from') || fyStart(fy);
  const to = url.searchParams.get('to') || fyEnd(fy);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) throw new HttpError(400, 'Bad date.');
  const status = url.searchParams.get('status') || 'all';
  if (!['all', 'active', 'cancelled'].includes(status)) throw new HttpError(400, 'Bad filter.');
  const offRaw = url.searchParams.get('offset') || '0';
  if (!/^[0-9]{1,7}$/.test(offRaw)) throw new HttpError(400, 'Bad offset.');
  let q = (url.searchParams.get('q') || '').trim().slice(0, 60);
  const kind = url.searchParams.get('kind') || 'all';
  if (!['all', 'sale', 'jobwork'].includes(kind)) throw new HttpError(400, 'Bad filter.');

  const where = ['fy = ?', 'bill_date >= ?', 'bill_date <= ?'];
  const args = [fy, from, to];
  if (status !== 'all') {
    where.push('status = ?');
    args.push(status);
  }
  if (kind !== 'all') {
    where.push('bill_kind = ?');
    args.push(kind);
  }
  if (q) {
    const like = `%${likeEscape(q)}%`;
    const parts = ["party_name LIKE ? ESCAPE '\\'", "party_gstin LIKE ? ESCAPE '\\'"];
    args.push(like, `%${likeEscape(q.toUpperCase())}%`);
    if (/^[0-9]{1,7}$/.test(q)) {
      parts.push('bill_no = ?');
      args.push(Number(q));
    }
    where.push(`(${parts.join(' OR ')})`);
  }
  const cond = where.join(' AND ');
  const [rows, tot] = await env.DB.batch([
    env.DB.prepare(
      `SELECT id, memo, inv_type, bill_no, bill_date, party_name, amount_paise, taxable_paise, cgst_paise, sgst_paise, igst_paise, net_paise, status, source, bill_kind
       FROM bills WHERE ${cond} ORDER BY bill_no LIMIT ? OFFSET ?`
    ).bind(...args, PAGE + 1, Number(offRaw)),
    env.DB.prepare(
      `SELECT COUNT(*) AS n, COALESCE(SUM(amount_paise),0) AS amount_paise, COALESCE(SUM(taxable_paise),0) AS taxable_paise,
       COALESCE(SUM(cgst_paise),0) AS cgst_paise, COALESCE(SUM(sgst_paise),0) AS sgst_paise, COALESCE(SUM(igst_paise),0) AS igst_paise,
       COALESCE(SUM(net_paise),0) AS net_paise FROM bills WHERE ${cond}`
    ).bind(...args),
  ]);
  const list = rows.results;
  return json({ rows: list.slice(0, PAGE), more: list.length > PAGE, totals: tot.results[0] });
});

async function insertOnce(env, fy, billNo, b, request) {
  const now = Date.now();
  const cols = ['fy', 'bill_no', 'book', 'status', 'source', 'created_at', 'updated_at', ...BILL_COL_NAMES];
  const stmts = [
    env.DB.prepare(`INSERT INTO bills (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`)
      .bind(fy, billNo, 'SALE', 'active', 'app', now, now, ...billColumns(b)),
    ...b.lines.map((ln) => lineInsertByNumber(env, fy, billNo, ln)),
    logStmt(env, 'bill_add', { bill_no: billNo, fy, party: b.party_name, net: rupeesText(b.totals.net_paise) }, getIp(request)),
  ];
  await env.DB.batch(stmts);
}

const uniqueErr = (e) => /UNIQUE|constraint/i.test((e && e.message) || '');

export const onRequestPost = guard(async ({ request, env }) => {
  const body = await readJson(request, 100 * 1024);
  const fy = fyParam(body.fy);
  const b = await prepareBill(env, body, { fy });
  const typed = b.bill_no !== null;
  let billNo = b.bill_no;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (!typed) {
      const row = await env.DB.prepare('SELECT COALESCE(MAX(bill_no), 0) + 1 AS n FROM bills WHERE fy = ?').bind(fy).first();
      billNo = row.n;
    }
    try {
      await insertOnce(env, fy, billNo, b, request);
      const bill = await env.DB.prepare('SELECT id FROM bills WHERE fy = ? AND bill_no = ?').bind(fy, billNo).first();
      return json({ bill: await loadBill(env, bill.id) }, 201);
    } catch (e) {
      if (!uniqueErr(e)) throw e;
      if (typed) return json({ error: `Bill no. ${billNo} is already used in ${fy}-${fy + 1}.`, fields: { bill_no: `Bill no. ${billNo} is already used.` } }, 409);
    }
  }
  return err('Another bill was saved at the same moment. Please save again.', 409);
});
