// POST /api/challans/<id>/cancel  {reason}  The number stays; every amount becomes zero.

import { guard, readJson, getIp, json, err } from '../../../../lib/http.js';
import { logStmt } from '../../../../lib/log.js';
import { idParam } from '../../../../lib/masters.js';
import { loadChallan, KIND_NAMES } from '../../../../lib/challans.js';

export const onRequestPost = guard(async ({ request, env, params }) => {
  const id = idParam(params.id);
  const body = await readJson(request, 2 * 1024).catch(() => ({}));
  const reason = typeof body.reason === 'string' ? body.reason.replace(/\s+/g, ' ').trim() : '';
  if (reason.length > 200) return err('The reason is too long (200 characters at most).', 400);
  const old = await loadChallan(env, id);
  if (!old) return err('Not found.', 404);
  if (old.status === 'cancelled') return err('This challan is already cancelled.', 409);
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE challans SET status = 'cancelled', cancelled_at = ?, cancel_reason = ?, orig_net_paise = net_paise,
       amount_paise = 0, taxable_paise = 0, cgst_paise = 0, sgst_paise = 0, igst_paise = 0, net_paise = 0, updated_at = ? WHERE id = ?`
    ).bind(now, reason || null, now, id),
    logStmt(env, 'challan_cancel', { kind: old.kind, kind_name: KIND_NAMES[old.kind], no: old.no_text, fy: old.fy, party: old.party_name, reason: reason || null }, getIp(request)),
  ]);
  return json({ challan: await loadChallan(env, id) });
});
