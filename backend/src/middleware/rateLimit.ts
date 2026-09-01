import type { Context, Next } from 'hono';
import type { Bindings, Variables } from '../types';

type GameContext = Context<{ Bindings: Bindings; Variables: Variables }>;

// Fixed-window budget for ALL /api/* traffic: 120 requests per 60s per client
// identity. Enough for normal play loops; tight enough to stop UUID-spam
// abuse from minting junk D1 rows. The window is lazily reset: the first
// request in a new 60s window starts a fresh counter instead of waiting for a
// background sweep.
export const WINDOW_MS = 60_000;
export const MAX_REQUESTS = 120;

const TOO_MANY_REQUESTS = { error: 'Too many requests' };

export interface RateLimitOptions {
  windowMs?: number;
  maxRequests?: number;
}

/**
 * D1-backed fixed-window rate limiter for /api/* (window with lazy reset).
 *
 * KEY STRATEGY: the counter key is the client IP alone when no Bearer token
 * is present. When an `Authorization: Bearer` header IS present (which this
 * middleware reads BEFORE the auth middleware verifies it — it runs first, see
 * `index.ts`), the key becomes a SHA-256 hash of `${ip}:${token}` so
 * authenticated players behind a shared NAT/proxy each get their own budget
 * instead of collectively locking each other out. The raw token is never
 * stored or logged; only the hash is persisted. The pre-auth mount means the
 * token is unverified here — keying on it is a best-effort identity signal,
 * not an auth decision.
 *
 * FAIL-OPEN: if the D1 read/write fails the request is ALLOWED through — a
 * rate-limiter outage must never take the game down.
 *
 * RACE TOLERANCE: two concurrent requests may both pass the check and
 * increment. That is an accepted soft limit; no transactions/batches.
 */
export function createRateLimitMiddleware(
  opts: RateLimitOptions = {}
): (c: GameContext, next: Next) => Promise<Response | void> {
  const windowMs = opts.windowMs ?? WINDOW_MS;
  const maxRequests = opts.maxRequests ?? MAX_REQUESTS;

  return async function rateLimitMiddleware(c: GameContext, next: Next): Promise<Response | void> {
    // Only /api/* traffic is rate-limited. CORS preflights, HEAD probes, and
    // the health endpoint are always allowed through (they must not trip the
    // limiter).
    if (!c.req.path.startsWith('/api/')) return next();
    if (c.req.method === 'OPTIONS' || c.req.method === 'HEAD') return next();
    if (c.req.path === '/api/health') return next();

    try {
      const now = Date.now();
      const key = await rateLimitKey(c);

      const row = await c.env.DB.prepare('SELECT window_start, count FROM rate_limits WHERE key = ?')
        .bind(key)
        .first<{ window_start: number; count: number }>();

      if (!row) {
        await c.env.DB.prepare('INSERT INTO rate_limits (key, window_start, count) VALUES (?, ?, 1)')
          .bind(key, now)
          .run();
        return next();
      }

      // Window expired → start a fresh window counting this request.
      if (now - row.window_start >= windowMs) {
        await c.env.DB.prepare('UPDATE rate_limits SET window_start = ?, count = 1 WHERE key = ?').bind(now, key).run();
        return next();
      }

      if (row.count >= maxRequests) {
        // Actual seconds left until the window resets, not the full window.
        const retryAfter = Math.ceil((row.window_start + windowMs - now) / 1000);
        return c.json(TOO_MANY_REQUESTS, 429, {
          'Retry-After': String(retryAfter),
        });
      }

      await c.env.DB.prepare("UPDATE rate_limits SET count = count + 1, updated_at = datetime('now') WHERE key = ?")
        .bind(key)
        .run();
      return next();
    } catch (err) {
      // Fail-open: never 500 the game because the limiter itself failed.
      console.error(`[${c.get('requestId')}] rateLimit: D1 read/write failed, allowing request through`, err);
      return next();
    }
  };
}

export const rateLimitMiddleware = createRateLimitMiddleware();

/**
 * Purge rate-limit rows whose window started before `now - windowMs`. The
 * table is tiny (one row per active client IP), so a single DELETE suffices.
 * Returns the number of rows deleted.
 */
export async function cleanupRateLimits(db: D1Database, windowMs: number = WINDOW_MS): Promise<number> {
  const res = await db
    .prepare('DELETE FROM rate_limits WHERE window_start < ?')
    .bind(Date.now() - windowMs)
    .run();
  return res.meta.changes ?? 0;
}

function clientIp(c: GameContext): string {
  const cf = c.req.header('CF-Connecting-IP');
  if (cf) return cf;
  const xff = c.req.header('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return 'unknown';
}

/**
 * Derive the rate-limit counter key for a request. With a `Bearer` token the
 * key is a SHA-256 hash of `${ip}:${token}` (never the raw token), otherwise
 * the bare client IP. The `auth:` prefix keeps the two key spaces disjoint.
 */
async function rateLimitKey(c: GameContext): Promise<string> {
  const ip = clientIp(c);
  const auth = c.req.header('Authorization');
  if (auth && auth.startsWith('Bearer ')) {
    const token = auth.slice('Bearer '.length).trim();
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${ip}:${token}`));
    const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
    return `auth:${hex}`;
  }
  return ip;
}
