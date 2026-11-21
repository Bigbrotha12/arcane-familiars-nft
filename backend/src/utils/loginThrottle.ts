/**
 * Per-email login throttle. After MAX_LOGIN_FAILURES wrong passwords within
 * LOGIN_WINDOW_MS, further attempts for that email are refused (429) until the
 * window expires. A successful login clears the counter.
 *
 * Failures are recorded for unknown emails too, so the throttle does not reveal
 * which emails have accounts. The window is short on purpose: it caps guessing
 * without letting someone lock a real player out for long.
 */
export const MAX_LOGIN_FAILURES = 10;
export const LOGIN_WINDOW_MS = 15 * 60_000;

/** Seconds until the email may try again, or 0 when it is not throttled. */
export async function loginRetryAfterSeconds(db: D1Database, email: string, now = Date.now()): Promise<number> {
  const row = await db
    .prepare('SELECT window_start, count FROM login_failures WHERE email = ?')
    .bind(email)
    .first<{ window_start: number; count: number }>();
  if (!row || row.count < MAX_LOGIN_FAILURES) return 0;
  const remainingMs = row.window_start + LOGIN_WINDOW_MS - now;
  return remainingMs > 0 ? Math.ceil(remainingMs / 1000) : 0;
}

export async function recordLoginFailure(db: D1Database, email: string, now = Date.now()): Promise<void> {
  await db
    .prepare(
      `INSERT INTO login_failures (email, window_start, count)
       VALUES (?, ?, 1)
       ON CONFLICT(email) DO UPDATE SET
         count = CASE WHEN excluded.window_start - login_failures.window_start >= ? THEN 1
                      ELSE login_failures.count + 1 END,
         window_start = CASE WHEN excluded.window_start - login_failures.window_start >= ? THEN excluded.window_start
                             ELSE login_failures.window_start END`
    )
    .bind(email, now, LOGIN_WINDOW_MS, LOGIN_WINDOW_MS)
    .run();
}

export async function clearLoginFailures(db: D1Database, email: string): Promise<void> {
  await db.prepare('DELETE FROM login_failures WHERE email = ?').bind(email).run();
}

/** Cron cleanup: drop counters whose window has expired. */
export async function cleanupLoginFailures(db: D1Database, now = Date.now()): Promise<number> {
  const res = await db
    .prepare('DELETE FROM login_failures WHERE window_start < ?')
    .bind(now - LOGIN_WINDOW_MS)
    .run();
  return res.meta.changes ?? 0;
}
