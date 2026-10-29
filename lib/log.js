// Activity log writer. Never put passwords or keys in `details`.

export function logStmt(env, action, details, ip) {
  return env.DB.prepare(
    'INSERT INTO activity_log (at, action, details, ip) VALUES (?, ?, ?, ?)'
  ).bind(Date.now(), action, details ? JSON.stringify(details) : null, ip || null);
}

export async function logActivity(env, action, details, ip) {
  await logStmt(env, action, details, ip).run();
}
