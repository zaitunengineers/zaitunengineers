// POST /api/items/import   {mode: "skip" | "update", rows: [ ...up to 40 item rows ]}

import { guard, readJson, getIp, json, err } from '../../../lib/http.js';
import { logStmt } from '../../../lib/log.js';
import { IMPORT_CHUNK, validateItem, nameKey, isUniqueError } from '../../../lib/masters.js';

const INSERT = `INSERT INTO items (name, name_key, code, kind, uom, rate_paise, gst_bp, description, notes, active, source, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'aeon', ?, ?) RETURNING id`;
const UPDATE = `UPDATE items SET code = ?, kind = ?, uom = ?, rate_paise = ?, gst_bp = ?, description = ?, updated_at = ? WHERE id = ?`;

export const onRequestPost = guard(async ({ request, env }) => {
  const body = await readJson(request, 64 * 1024);
  if (body.mode !== 'skip' && body.mode !== 'update') return err('Bad mode.', 400);
  if (!Array.isArray(body.rows) || body.rows.length === 0 || body.rows.length > IMPORT_CHUNK) {
    return err(`Send 1 to ${IMPORT_CHUNK} rows at a time.`, 400);
  }
  const now = Date.now();
  const results = body.rows.map(() => null);
  const clean = [];
  const seen = new Set();

  body.rows.forEach((raw, i) => {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
      results[i] = { row: i, status: 'error', message: 'This row is not valid.' };
      return;
    }
    const { value, errors } = validateItem(raw);
    if (Object.keys(errors).length) {
      results[i] = { row: i, status: 'error', message: Object.values(errors)[0] };
      return;
    }
    const key = nameKey(value.name);
    if (seen.has(key)) {
      results[i] = { row: i, status: 'error', message: 'Appears twice in this file.' };
      return;
    }
    seen.add(key);
    clean.push({ i, value, key, given: raw });
  });

  let existing = [];
  if (clean.length) {
    const keys = clean.map((c) => c.key);
    ({ results: existing } = await env.DB.prepare(`SELECT * FROM items WHERE name_key IN (${keys.map(() => '?').join(',')})`).bind(...keys).all());
  }
  const byKey = new Map(existing.map((e) => [e.name_key, e]));

  const plan = [];
  for (const c of clean) {
    const v = c.value;
    const match = byKey.get(c.key);
    if (!match) {
      plan.push({ i: c.i, status: 'added', stmt: env.DB.prepare(INSERT).bind(v.name, c.key, v.code, v.kind, v.uom, v.rate_paise, v.gst_bp, v.description, v.notes, now, now) });
    } else if (body.mode === 'skip') {
      results[c.i] = { row: c.i, status: 'skipped', id: match.id, message: 'Already saved.' };
    } else {
      // Only the details the file really gives are changed; the saved name stays.
      const sets = [];
      const old = match;
      const g = c.given;
      const has = (k) => g[k] !== undefined && g[k] !== null && String(g[k]).trim() !== '';
      const code = has('code') ? v.code : old.code;
      const kind = has('kind') || has('code') ? v.kind : old.kind;
      const uom = has('uom') ? v.uom : old.uom;
      const rate = has('rate') ? v.rate_paise : old.rate_paise;
      const bp = has('gst_bp') ? v.gst_bp : old.gst_bp;
      const description = has('description') ? v.description : old.description;
      sets.push(code, kind, uom, rate, bp, description);
      plan.push({ i: c.i, status: 'updated', id: match.id, stmt: env.DB.prepare(UPDATE).bind(...sets, now, match.id) });
    }
  }

  if (body.dryRun === true) {
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
      for (const p of plan) {
        try {
          done(p, await p.stmt.run());
        } catch (e2) {
          if (!isUniqueError(e2)) throw e2;
          results[p.i] = { row: p.i, status: 'error', message: 'An item with this name exists.' };
        }
      }
    }
  }

  const count = (s) => results.filter((r) => r.status === s).length;
  await logStmt(env, 'import_items', { added: count('added'), updated: count('updated'), skipped: count('skipped'), errors: count('error') }, getIp(request)).run();
  return json({ results });
});
