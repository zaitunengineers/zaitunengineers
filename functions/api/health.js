// GET /api/health  Checks that the database is connected. Shows no details.

import { json } from '../../lib/http.js';

export async function onRequestGet({ env }) {
  try {
    await env.DB.prepare('SELECT 1').first();
    return json({ ok: true });
  } catch {
    return json({ ok: false }, 500);
  }
}
