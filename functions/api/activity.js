// GET /api/activity?before=<ms>&action=bill_print  The 50 newest entries older than the cursor (optionally only one kind).

import { guard, json } from '../../lib/http.js';

const PAGE = 50;

export const onRequestGet = guard(async ({ request, env }) => {
  const url = new URL(request.url);
  const raw = Number(url.searchParams.get('before'));
  const before = Number.isFinite(raw) && raw > 0 ? raw : Date.now() + 1;
  const action = url.searchParams.get('action');
  if (action !== null && !/^[a-z_]{1,40}(,[a-z_]{1,40}){0,3}$/.test(action)) return json({ error: 'Bad filter.' }, 400);
  const acts = action ? action.split(',') : [];
  const stmt = action
    ? env.DB.prepare(`SELECT id, at, action, details, ip FROM activity_log WHERE at < ? AND action IN (${acts.map(() => '?').join(',')}) ORDER BY at DESC, id DESC LIMIT ?`).bind(before, ...acts, PAGE)
    : env.DB.prepare('SELECT id, at, action, details, ip FROM activity_log WHERE at < ? ORDER BY at DESC, id DESC LIMIT ?').bind(before, PAGE);
  const { results } = await stmt.all();
  return json({
    items: results,
    next: results.length === PAGE ? results[results.length - 1].at : null,
  });
});
