// GET /api/challans/next?kind=general&fy=2026  The next number, written in the same style as the last one.

import { guard, json } from '../../../lib/http.js';
import { fyParam } from '../../../lib/bills.js';
import { kindParam, nextNumber } from '../../../lib/challans.js';

export const onRequestGet = guard(async ({ request, env }) => {
  const u = new URL(request.url).searchParams;
  return json(await nextNumber(env, fyParam(u.get('fy')), kindParam(u.get('kind'))));
});
