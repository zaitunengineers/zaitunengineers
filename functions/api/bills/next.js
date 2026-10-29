// GET /api/bills/next?fy=2026  The next free bill number for the year.

import { guard, json } from '../../../lib/http.js';
import { fyParam } from '../../../lib/bills.js';

export const onRequestGet = guard(async ({ request, env }) => {
  const fy = fyParam(new URL(request.url).searchParams.get('fy'));
  const row = await env.DB.prepare('SELECT COALESCE(MAX(bill_no), 0) + 1 AS n, COUNT(*) AS c FROM bills WHERE fy = ?').bind(fy).first();
  return json({ next: row.n, count: row.c });
});
