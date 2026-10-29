// POST /api/bills/<id>/cancel  {reason}  The number stays; every amount becomes zero.
// The original figures are kept in the Activity Log and in orig_net_paise.

import { guard, readJson, getIp, json, err } from '../../../../lib/http.js';
import { logStmt } from '../../../../lib/log.js';
import { idParam } from '../../../../lib/masters.js';
import { loadBill, rupeesText } from '../../../../lib/bills.js';

export const onRequestPost = guard(async ({ request, env, params }) => {
  const id = idParam(params.id);
  const body = await readJson(request, 2 * 1024).catch(() => ({}));
  let reason = typeof body.reason === 'string' ? body.reason.replace(/\s+/g, ' ').trim() : '';
  if (reason.length > 200) return err('The reason is too long (200 characters at most).', 400);
  const old = await loadBill(env, id);
  if (!old) return err('Not found.', 404);
  if (old.status === 'cancelled') return err('This bill is already cancelled.', 409);
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE bills SET status = 'cancelled', cancelled_at = ?, cancel_reason = ?, orig_net_paise = net_paise,
       amount_paise = 0, taxable_paise = 0, cgst_paise = 0, sgst_paise = 0, igst_paise = 0, net_paise = 0, updated_at = ? WHERE id = ?`
    ).bind(now, reason || null, now, id),
    logStmt(env, 'bill_cancel', { bill_no: old.bill_no, fy: old.fy, party: old.party_name, net: rupeesText(old.net_paise), reason: reason || null }, getIp(request)),
  ]);
  return json({ bill: await loadBill(env, id) });
});
