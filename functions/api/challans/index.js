// GET /api/challans?kind=general&fy=2026&from=&to=&q=&status=all&offset=0     POST /api/challans

import { guard, readJson, getIp, json, err, HttpError } from '../../../lib/http.js';
import { logStmt } from '../../../lib/log.js';
import { likeEscape } from '../../../lib/masters.js';
import { fyParam } from '../../../lib/bills.js';
import { fyStart, fyEnd } from '../../../public/assets/js/gst.js';
import { kindParam, KIND_NAMES, prepareChallan, nextNumber, noIntOf, CH_COLS, chValues, chLineInsert, loadChallan } from '../../../lib/challans.js';

export const PAGE = 300;
const uniqueErr = (e) => /UNIQUE|constraint/i.test((e && e.message) || '');

export const onRequestGet = guard(async ({ request, env }) => {
  const url = new URL(request.url);
  const kind = kindParam(url.searchParams.get('kind'));
  const fy = fyParam(url.searchParams.get('fy'));
  const from = url.searchParams.get('from') || fyStart(fy);
  const to = url.searchParams.get('to') || fyEnd(fy);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) throw new HttpError(400, 'Bad date.');
  const status = url.searchParams.get('status') || 'all';
  if (!['all', 'active', 'cancelled'].includes(status)) throw new HttpError(400, 'Bad filter.');
  const offRaw = url.searchParams.get('offset') || '0';
  if (!/^[0-9]{1,7}$/.test(offRaw)) throw new HttpError(400, 'Bad offset.');
  const q = (url.searchParams.get('q') || '').trim().slice(0, 60);
  const where = ['c.fy = ?', 'c.kind = ?', 'c.challan_date >= ?', 'c.challan_date <= ?'];
  const args = [fy, kind, from, to];
  if (status !== 'all') {
    where.push('c.status = ?');
    args.push(status);
  }
  if (q) {
    const like = `%${likeEscape(q)}%`;
    where.push("(c.party_name LIKE ? ESCAPE '\\' OR c.no_text LIKE ? ESCAPE '\\' OR c.remark LIKE ? ESCAPE '\\')");
    args.push(like, like, like);
  }
  const cond = where.join(' AND ');
  const [rows, tot] = await env.DB.batch([
    env.DB.prepare(
      `SELECT c.id, c.kind, c.no_text, c.no_int, c.challan_date, c.orig_date, c.party_name, c.inv_type, c.net_paise, c.status, c.remark, c.source,
              (SELECT COALESCE(SUM(qty_milli), 0) FROM challan_lines WHERE challan_id = c.id) AS qty_milli
       FROM challans c WHERE ${cond} ORDER BY COALESCE(c.no_int, 0), c.challan_date, c.id LIMIT ? OFFSET ?`
    ).bind(...args, PAGE + 1, Number(offRaw)),
    env.DB.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(net_paise),0) AS net_paise FROM challans c WHERE ${cond}`).bind(...args),
  ]);
  const list = rows.results;
  return json({ rows: list.slice(0, PAGE), more: list.length > PAGE, totals: tot.results[0] });
});

export const onRequestPost = guard(async ({ request, env }) => {
  const body = await readJson(request, 100 * 1024);
  const fy = fyParam(body.fy);
  const kind = kindParam(body.kind);
  const c = await prepareChallan(env, body, { fy, kind });
  let noText = c.no_text;
  const typed = !!noText;
  const now = Date.now();
  const cols = ['fy', 'kind', 'no_int', 'no_text', 'status', 'source', 'created_at', 'updated_at', ...CH_COLS];
  for (let attempt = 0; attempt < 2; attempt++) {
    if (!typed) noText = (await nextNumber(env, fy, kind)).next;
    let id;
    try {
      const r = await env.DB.prepare(`INSERT INTO challans (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`)
        .bind(fy, kind, noIntOf(noText), noText, 'active', 'app', now, now, ...chValues(c)).run();
      id = r.meta.last_row_id;
    } catch (e) {
      if (!uniqueErr(e)) throw e;
      if (typed) return json({ error: 'This number is already used in this year.', fields: { no_text: 'This number is already used in this year.' } }, 409);
      continue;
    }
    try {
      await env.DB.batch([
        ...c.lines.map((ln) => chLineInsert(env, id, ln)),
        logStmt(env, 'challan_add', { kind, kind_name: KIND_NAMES[kind], no: noText, fy, party: c.party_name, net: (c.totals.net_paise / 100).toFixed(2) }, getIp(request)),
      ]);
    } catch (e) {
      await env.DB.prepare('DELETE FROM challans WHERE id = ?').bind(id).run();
      throw e;
    }
    return json({ challan: await loadChallan(env, id) }, 201);
  }
  return err('Another challan was saved at the same moment. Please save again.', 409);
});
