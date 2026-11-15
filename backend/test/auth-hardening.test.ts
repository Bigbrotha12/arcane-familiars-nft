import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:workers';
import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { app } from '../src/index';
import type { Bindings } from '../src/types';

/**
 * Regressions for two auth hardening findings:
 * - logout must delete cookies with the same attributes they were set with
 *   (Secure / SameSite) or the browser may ignore the deletion and the stale
 *   session survives.
 * - login/register must not be usable as a login-CSRF vector: a cross-site or
 *   non-JSON POST is rejected even though those paths are CSRF-token exempt.
 */

function makeEnv(environment = 'production'): Bindings {
  return { ...(env as unknown as Bindings), ENVIRONMENT: environment };
}

async function fetchApp(request: Request): Promise<Response> {
  const ctx = createExecutionContext();
  const response = await app.fetch(request, makeEnv(), ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

// Unique client IP per request so the per-IP auth limiter (10/min) does not
// trip across unrelated tests; tests that exercise the limiter pin an IP.
let ipCounter = 0;
function nextIp(): string {
  ipCounter += 1;
  return `10.30.${Math.floor(ipCounter / 250)}.${(ipCounter % 250) + 1}`;
}

function post(
  path: string,
  body: unknown,
  opts: { headers?: Record<string, string>; cookie?: string; csrf?: string } = {}
): Request {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'CF-Connecting-IP': nextIp(),
    ...(opts.headers ?? {}),
  };
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.csrf) headers['x-csrf-token'] = opts.csrf;
  return new Request(`https://example.com${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

async function register(email: string): Promise<{ cookie: string; csrf: string; userId: string }> {
  const res = await fetchApp(post('/api/auth/register', { email, password: 'correct horse battery' }));
  expect(res.status).toBe(201);
  const body = (await res.json()) as { csrfToken: string; user: { id: string } };
  return {
    cookie: res.headers
      .getSetCookie()
      .map((header) => header.split(';')[0])
      .join('; '),
    csrf: body.csrfToken,
    userId: body.user.id,
  };
}

describe('logout cookie deletion', () => {
  it('deletes the session and CSRF cookies with the attributes they were set with', async () => {
    const auth = await register('logout-attrs@example.com');
    const res = await fetchApp(post('/api/auth/logout', {}, auth));
    expect(res.status).toBe(200);

    const deleted = res.headers.getSetCookie().filter((h) => /^af_(session|csrf)=;/.test(h));
    expect(deleted).toHaveLength(2);
    for (const header of deleted) {
      expect(header).toMatch(/Secure/i);
      expect(header).toMatch(/SameSite=Lax/i);
      expect(header).toMatch(/HttpOnly/i);
      expect(header).toMatch(/Path=\//i);
    }
  });
});

describe('login/register CSRF hardening', () => {
  it('rejects a text/plain login body with 415', async () => {
    await register('login-content-type@example.com');
    const res = await fetchApp(
      post(
        '/api/auth/login',
        { email: 'login-content-type@example.com', password: 'correct horse battery' },
        { headers: { 'content-type': 'text/plain' } }
      )
    );
    expect(res.status).toBe(415);
    expect(((await res.json()) as { error: string }).error).toBe('Content-Type must be application/json');
  });

  it('rejects a text/plain register body with 415', async () => {
    const res = await fetchApp(
      post(
        '/api/auth/register',
        { email: 'register-content-type@example.com', password: 'correct horse battery' },
        { headers: { 'content-type': 'text/plain' } }
      )
    );
    expect(res.status).toBe(415);
  });

  it('rejects a login from a disallowed Origin', async () => {
    await register('login-origin@example.com');
    const res = await fetchApp(
      post(
        '/api/auth/login',
        { email: 'login-origin@example.com', password: 'correct horse battery' },
        { headers: { Origin: 'https://evil.example' } }
      )
    );
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: string }).error).toBe('Invalid request origin');
  });

  it('rejects a cross-site login that carries no Origin', async () => {
    await register('login-cross-site@example.com');
    const res = await fetchApp(
      post(
        '/api/auth/login',
        { email: 'login-cross-site@example.com', password: 'correct horse battery' },
        { headers: { 'Sec-Fetch-Site': 'cross-site' } }
      )
    );
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: string }).error).toBe('Cross-site request blocked');
  });

  // Production topology: SPA on *.pages.dev, API on *.workers.dev — different
  // sites, so the browser labels legitimate requests cross-site.
  it('accepts a cross-site login from the allowlisted SPA origin', async () => {
    await register('login-prod-topology@example.com');
    const res = await fetchApp(
      post(
        '/api/auth/login',
        { email: 'login-prod-topology@example.com', password: 'correct horse battery' },
        {
          headers: {
            Origin: 'https://arcane-familiars.pages.dev',
            'Sec-Fetch-Site': 'cross-site',
          },
        }
      )
    );
    expect(res.status).toBe(200);
  });

  it('accepts a cross-site authenticated game write from the allowlisted SPA origin', async () => {
    const auth = await register('game-prod-topology@example.com');
    const res = await fetchApp(
      post(
        '/api/game/state/load',
        { anonymousId: auth.userId },
        {
          ...auth,
          headers: {
            Origin: 'https://arcane-familiars.pages.dev',
            'Sec-Fetch-Site': 'cross-site',
          },
        }
      )
    );
    expect(res.status).toBe(200);
  });

  it('still accepts a same-site JSON login from the SPA origin', async () => {
    await register('login-allowed@example.com');
    const res = await fetchApp(
      post(
        '/api/auth/login',
        { email: 'login-allowed@example.com', password: 'correct horse battery' },
        {
          headers: {
            Origin: 'https://arcane-familiars.pages.dev',
            'Sec-Fetch-Site': 'same-site',
          },
        }
      )
    );
    expect(res.status).toBe(200);
    expect(res.headers.getSetCookie().some((header) => header.includes('af_session='))).toBe(true);
  });
});
