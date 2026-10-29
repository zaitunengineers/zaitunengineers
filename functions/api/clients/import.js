// POST /api/clients/import   {mode: "skip" | "update", rows: [ ...up to 40 client rows ]}

import { guard, readJson, getIp, json, err } from '../../../lib/http.js';
import { logStmt } from '../../../lib/log.js';
import { CLIENT_FIELDS, IMPORT_CHUNK, validateClient, nameKey, isUniqueError } from '../../../lib/masters.js';

const INSERT = `INSERT INTO clients (name, name_key, address, city, pincode, state_code, gstin, pan, phone, mobile, email, notes, active, source, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'aeon', ?, ?) RETURNING id`;
const UPDATE = `UPDATE clients SET name = ?, name_key = ?, address = ?, city = ?, pincode = ?, state_code = ?, gstin = ?, pan = ?,
  phone = ?, mobile = ?, email = ?, notes = ?, updated_at = ? WHERE id = ?`;

const firstError = (errors) => Object.values(errors)[0];

export const onRequestPost = guard(async ({ request, env }) => {
  const body = await readJson(request, 64 * 1024);
  if (body.mode !== 'skip' && body.mode !== 'update') return err('Bad mode.', 400);
  if (!Array.isArray(body.rows) || body.rows.length === 0 || body.rows.length > IMPORT_CHUNK) {
    return err(`Send 1 to ${IMPORT_CHUNK} rows at a time.`, 400);
  }
  const now = Date.now();
  const results = body.rows.map(() => null);
  const clean = []; // rows that passed the checks: {i, value, key}
  const seen = new Set();

  body.rows.forEach((raw, i) => {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
      results[i] = { row: i, status: 'error', message: 'This row is not valid.' };
      return;
    }
    const { value, errors } = validateClient(raw);
    if (Object.keys(errors).length) {
      results[i] = { row: i, status: 'error', message: firstError(errors) };
      return;
    }
    const key = value.gstin ? `g:${value.gstin}` : `n:${nameKey(value.name)}`;
    if (seen.has(key)) {
      results[i] = { row: i, status: 'error', message: 'Appears twice in this file.' };
      return;
    }
    seen.add(key);
    clean.push({ i, value, nk: nameKey(value.name) });
  });

  let existing = [];
  if (clean.length) {
    const gstins = clean.map((c) => c.value.gstin).filter(Boolean);
    const keys = [...new Set(clean.map((c) => c.nk))];
    const marks = (n) => Array(n).fill('?').join(',');
    const conds = [`name_key IN (${marks(keys.length)})`];
    const args = [...keys];
    if (gstins.length) {
      conds.push(`gstin IN (${marks(gstins.length)})`);
      args.push(...gstins);
    }
    ({ results: existing } = await env.DB.prepare(`SELECT * FROM clients WHERE ${conds.join(' OR ')}`).bind(...args).all());
  }
  const byGstin = new Map(existing.filter((e) => e.gstin).map((e) => [e.gstin, e]));
  const byKey = new Map();
  for (const e of existing) if (!byKey.has(e.name_key)) byKey.set(e.name_key, e);

  const plan = []; // {i, status, stmt}
  for (const c of clean) {
    const match = c.value.gstin ? byGstin.get(c.value.gstin) : byKey.get(c.nk);
    if (!match) {
      const v = c.value;
      plan.push({ i: c.i, status: 'added', stmt: env.DB.prepare(INSERT).bind(v.name, c.nk, v.address, v.city, v.pincode, v.state_code, v.gstin, v.pan, v.phone, v.mobile, v.email, v.notes, now, now) });
    } else if (body.mode === 'skip') {
      results[c.i] = { row: c.i, status: 'skipped', id: match.id, message: 'Already saved.' };
    } else {
      // Update only with what the file actually has; blanks in the file never erase saved details.
      const merged = {};
      for (const f of CLIENT_FIELDS) {
        const given = c.value[f];
        merged[f] = given !== null && given !== undefined && given !== '' ? given : match[f];
      }
      const { value: v, errors } = validateClient(merged);
      if (Object.keys(errors).length) {
        results[c.i] = { row: c.i, status: 'error', message: firstError(errors) };
        continue;
      }
      plan.push({ i: c.i, status: 'updated', id: match.id, stmt: env.DB.prepare(UPDATE).bind(v.name, nameKey(v.name), v.address, v.city, v.pincode, v.state_code, v.gstin, v.pan, v.phone, v.mobile, v.email, v.notes, now, match.id) });
    }
  }

  if (body.dryRun === true) {
    // Preview only: say what would happen, write nothing.
    for (const p of plan) results[p.i] = { row: p.i, status: p.status, id: p.id };
    return json({ results, dryRun: true });
  }

  const done = (p, res) => {
    const id = p.id ?? (res && res.results && res.results[0] ? res.results[0].id : undefined);
    results[p.i] = { row: p.i, status: p.status, id };
  };
  if (plan.length) {
    try {
      const res = await env.DB.batch(plan.map((p) => p.stmt));
      plan.forEach((p, k) => done(p, res[k]));
    } catch (e) {
      if (!isUniqueError(e)) throw e;
      // One row clashed with a saved record: do the rows one by one so only that row is refused.
      for (const p of plan) {
        try {
          done(p, await p.stmt.run());
        } catch (e2) {
          if (!isUniqueError(e2)) throw e2;
          results[p.i] = { row: p.i, status: 'error', message: 'GSTIN is already saved for another client.' };
        }
      }
    }
  }

  const count = (s) => results.filter((r) => r.status === s).length;
  await logStmt(env, 'import_clients', { added: count('added'), updated: count('updated'), skipped: count('skipped'), errors: count('error') }, getIp(request)).run();
  return json({ results });
});
