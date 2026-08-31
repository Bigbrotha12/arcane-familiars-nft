import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:workers';
import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { Hono } from 'hono';
import { app, scheduled } from '../src/index';
import { createRateLimitMiddleware, cleanupRateLimits, WINDOW_MS } from '../src/middleware/rateLimit';
import type { Bindings, Variables } from '../src/types';

/**
 * Rate-limit tests.
 *
 * The focused tests drive `createRateLimitMiddleware` mounted on a minimal
 * Hono app with a low `maxRequests` so the window is exhausted cheaply, using
 * distinct `CF-Connecting-IP` headers so counters never collide (the shared
 * in-memory D1 persists across tests within this file). A final suite drives
 * the real `app` from `src/index.ts` to prove the production mount order, and
 * exercises `cleanupRateLimits` + the `scheduled` wiring.
 */

function makeEnv(): Bindings {
  return { ...(env as unknown as Bindings), ENVIRONMENT: 'production' };
}

async function fetchApp(request: Request): Promise<Response> {
  const ctx = createExecutionContext();
  const response = await app.fetch(request, makeEnv(), ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

function makeLimitedApp(
  opts: { maxRequests?: number; windowMs?: number } = {}
): Hono<{ Bindings: Bindings; Variables: Variables }> {
  const h = new Hono<{ Bindings: Bindings; Variables: Variables }>();
  h.use('/api/*', createRateLimitMiddleware(opts));
  h.get('/api/ping', (c) => c.json({ ok: true }));
  h.get('/api/health', (c) => c.json({ status: 'ok' }));
  h.get('/ping', (c) => c.json({ ok: true }));
  return h;
}

async function fetchLimited(
  app: Hono<{ Bindings: Bindings; Variables: Variables }>,
  path: string,
  ip: string,
  method = 'GET'
): Promise<Response> {
  const ctx = createExecutionContext();
  const res = await app.fetch(
    new Request(`https://example.com${path}`, {
      method,
      headers: { 'CF-Connecting-IP': ip },
    }),
    makeEnv(),
    ctx
  );
  await waitOnExecutionContext(ctx);
  return res;
}

async function fetchLimitedWithToken(
  app: Hono<{ Bindings: Bindings; Variables: Variables }>,
  path: string,
  ip: string,
  token: string
): Promise<Response> {
  const ctx = createExecutionContext();
  const res = await app.fetch(
    new Request(`https://example.com${path}`, {
      headers: {
        'CF-Connecting-IP': ip,
        authorization: `Bearer ${token}`,
      },
    }),
    makeEnv(),
    ctx
  );
  await waitOnExecutionContext(ctx);
  return res;
}

async function rateLimitRow(key: string): Promise<{ count: number; window_start: number } | null> {
  return env.DB.prepare('SELECT count, window_start FROM rate_limits WHERE key = ?')
    .bind(key)
    .first<{ count: number; window_start: number }>();
}

describe('rate limit middleware', () => {
  it('allows requests under the limit', async () => {
    const h = makeLimitedApp({ maxRequests: 5 });
    const res = await fetchLimited(h, '/api/ping', '1.0.0.1');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('returns 429 with Retry-After when the window is exhausted', async () => {
    const h = makeLimitedApp({ maxRequests: 5, windowMs: 60_000 });
    for (let i = 0; i < 5; i++) {
      expect((await fetchLimited(h, '/api/ping', '1.0.0.2')).status).toBe(200);
    }
    const res = await fetchLimited(h, '/api/ping', '1.0.0.2');
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('60');
    expect(await res.json()).toEqual({ error: 'Too many requests' });
  });

  it('keeps independent counters per IP', async () => {
    const h = makeLimitedApp({ maxRequests: 3 });
    expect((await fetchLimited(h, '/api/ping', '1.0.0.3')).status).toBe(200);
    expect((await fetchLimited(h, '/api/ping', '1.0.0.3')).status).toBe(200);
    expect((await fetchLimited(h, '/api/ping', '1.0.0.3')).status).toBe(200);
    expect((await fetchLimited(h, '/api/ping', '1.0.0.3')).status).toBe(429);
    // A different IP starts fresh.
    expect((await fetchLimited(h, '/api/ping', '1.0.0.4')).status).toBe(200);
  });

  it('does not rate-limit non-/api paths, /api/health, or OPTIONS preflights', async () => {
    const h = makeLimitedApp({ maxRequests: 2 });

    // Non-/api path is never limited.
    expect((await fetchLimited(h, '/ping', '1.0.0.5')).status).toBe(200);
    expect((await fetchLimited(h, '/ping', '1.0.0.5')).status).toBe(200);
    expect((await fetchLimited(h, '/ping', '1.0.0.5')).status).toBe(200);

    // /api/health is excluded from limiting.
    expect((await fetchLimited(h, '/api/health', '1.0.0.5')).status).toBe(200);
    expect((await fetchLimited(h, '/api/health', '1.0.0.5')).status).toBe(200);

    // OPTIONS preflights must not consume budget: a GET from the same IP that
    // has already exhausted its window is still 429, but the OPTIONS calls
    // themselves never 429.
    const g = makeLimitedApp({ maxRequests: 1 });
    for (let i = 0; i < 3; i++) {
      expect((await fetchLimited(g, '/api/ping', '1.0.0.6', 'OPTIONS')).status).not.toBe(429);
    }
    expect((await fetchLimited(g, '/api/ping', '1.0.0.6')).status).toBe(200);
    expect((await fetchLimited(g, '/api/ping', '1.0.0.6')).status).toBe(429);
  });

  it('fallbacks to x-forwarded-for when CF-Connecting-IP is absent', async () => {
    const h = makeLimitedApp({ maxRequests: 1 });
    const ctx = createExecutionContext();
    const res = await h.fetch(
      new Request('https://example.com/api/ping', {
        headers: { 'x-forwarded-for': '10.0.0.1, 10.0.0.2' },
      }),
      makeEnv(),
      ctx
    );
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(200);
    // Key derived from the first x-forwarded-for entry.
    expect(await rateLimitRow('10.0.0.1')).not.toBeNull();
  });

  it('keys authenticated requests on ip+token hash instead of IP alone', async () => {
    const h = makeLimitedApp({ maxRequests: 1 });
    const ip = '1.0.0.9';

    // Same IP, different Bearer tokens → independent budgets of 1 each.
    expect((await fetchLimitedWithToken(h, '/api/ping', ip, 'token-a')).status).toBe(200);
    expect((await fetchLimitedWithToken(h, '/api/ping', ip, 'token-b')).status).toBe(200);
    // A third request with token-a is over its budget.
    expect((await fetchLimitedWithToken(h, '/api/ping', ip, 'token-a')).status).toBe(429);

    // The raw token and the bare IP must never be used as counter keys.
    expect(await rateLimitRow('token-a')).toBeNull();
    expect(await rateLimitRow(ip)).toBeNull();
  });

  it('does not rate-limit HEAD requests', async () => {
    const h = makeLimitedApp({ maxRequests: 1 });
    expect((await fetchLimited(h, '/api/ping', '1.0.0.7', 'HEAD')).status).toBe(200);
    expect((await fetchLimited(h, '/api/ping', '1.0.0.7', 'HEAD')).status).toBe(200);
    expect((await fetchLimited(h, '/api/ping', '1.0.0.7', 'HEAD')).status).toBe(200);
  });

  it('fail-opens (allows) when the D1 read/write throws', async () => {
    const brokenDb = {
      prepare: () => {
        throw new Error('simulated D1 outage');
      },
    } as unknown as D1Database;

    const h = makeLimitedApp({ maxRequests: 1 });
    const ctx = createExecutionContext();
    const res = await h.fetch(
      new Request('https://example.com/api/ping', {
        headers: { 'CF-Connecting-IP': '6.6.6.6' },
      }),
      { ...makeEnv(), DB: brokenDb },
      ctx
    );
    await waitOnExecutionContext(ctx);
    // A rate-limiter outage must never 429 or 500 the request — it passes.
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});

describe('real app wiring', () => {
  it('rate-limits /api/* through the full production app (121st request from one IP → 429)', async () => {
    const ip = '9.9.9.9';
    let status = 0;
    for (let i = 0; i < 121; i++) {
      const res = await fetchApp(
        new Request('https://example.com/api/nope', {
          headers: { 'CF-Connecting-IP': ip },
        })
      );
      status = res.status;
      if (status === 429) break;
    }
    // First 120 allowed (404 here, but not 429); the 121st is rejected.
    expect(status).toBe(429);
    const row = await rateLimitRow(ip);
    expect(row?.count).toBe(120);
  });

  it('keeps /api/health reachable even when the limiter has fired', async () => {
    const ip = '9.9.9.8';
    // Exhaust the window for this IP against a real mounted endpoint.
    for (let i = 0; i < 121; i++) {
      const res = await fetchApp(
        new Request('https://example.com/api/nope', {
          headers: { 'CF-Connecting-IP': ip },
        })
      );
      if (res.status === 429) break;
    }
    // Health must never be throttled.
    const health = await fetchApp(
      new Request('https://example.com/api/health', {
        headers: { 'CF-Connecting-IP': ip },
      })
    );
    expect(health.status).toBe(200);
  });
});

describe('rate-limit cleanup', () => {
  it('cleanupRateLimits removes expired windows but keeps fresh ones', async () => {
    const db = env.DB;
    const now = Date.now();
    await db
      .prepare('INSERT INTO rate_limits (key, window_start, count) VALUES (?, ?, 1)')
      .bind('old-key', now - 2 * WINDOW_MS)
      .run();
    await db
      .prepare('INSERT INTO rate_limits (key, window_start, count) VALUES (?, ?, 1)')
      .bind('fresh-key', now)
      .run();

    const deleted = await cleanupRateLimits(db);
    expect(deleted).toBe(1);
    expect(await rateLimitRow('old-key')).toBeNull();
    expect(await rateLimitRow('fresh-key')).not.toBeNull();
  });

  it('scheduled handler purges expired rate-limit rows', async () => {
    const now = Date.now();
    await env.DB.prepare('INSERT INTO rate_limits (key, window_start, count) VALUES (?, ?, 1)')
      .bind('sched-old', now - 2 * WINDOW_MS)
      .run();
    await env.DB.prepare('INSERT INTO rate_limits (key, window_start, count) VALUES (?, ?, 1)')
      .bind('sched-fresh', now)
      .run();

    const ctx = createExecutionContext();
    await scheduled({ cron: '0 * * * *', scheduledTime: now, type: 'scheduled' } as ScheduledEvent, makeEnv(), ctx);
    await waitOnExecutionContext(ctx);

    expect(await rateLimitRow('sched-old')).toBeNull();
    expect(await rateLimitRow('sched-fresh')).not.toBeNull();
  });
});
