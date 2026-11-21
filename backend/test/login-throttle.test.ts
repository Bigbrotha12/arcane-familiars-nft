import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:workers';
import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { app } from '../src/index';
import type { Bindings } from '../src/types';
import { AUTH_MAX_REQUESTS } from '../src/middleware/rateLimit';
import { MAX_LOGIN_FAILURES } from '../src/utils/loginThrottle';
import { PASSWORD_ITERATIONS } from '../src/utils/auth';

const PASSWORD = 'correct horse battery';

function makeEnv(): Bindings {
  return { ...(env as unknown as Bindings), ENVIRONMENT: 'production' };
}

async function fetchApp(request: Request): Promise<Response> {
  const ctx = createExecutionContext();
  const response = await app.fetch(request, makeEnv(), ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

let ipCounter = 0;
function nextIp(): string {
  ipCounter += 1;
  return `10.40.${Math.floor(ipCounter / 250)}.${(ipCounter % 250) + 1}`;
}

function post(path: string, body: unknown, ip = nextIp()): Request {
  return new Request(`https://example.com${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'CF-Connecting-IP': ip },
    body: JSON.stringify(body),
  });
}

const login = (email: string, password: string, ip?: string) =>
  fetchApp(post('/api/auth/login', { email, password }, ip));

async function register(email: string): Promise<void> {
  const res = await fetchApp(post('/api/auth/register', { email, password: PASSWORD }));
  expect(res.status).toBe(201);
}

describe('per-email login throttle', () => {
  it('refuses further attempts after too many failures, even with the right password', async () => {
    const email = 'throttle-me@example.com';
    await register(email);

    for (let i = 0; i < MAX_LOGIN_FAILURES; i++) {
      expect((await login(email, 'wrong password!')).status).toBe(401);
    }

    const blocked = await login(email, PASSWORD);
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get('Retry-After'))).toBeGreaterThan(0);
  });

  it('clears the failure counter on a successful login', async () => {
    const email = 'throttle-reset@example.com';
    await register(email);

    for (let i = 0; i < MAX_LOGIN_FAILURES - 1; i++) {
      expect((await login(email, 'wrong password!')).status).toBe(401);
    }
    expect((await login(email, PASSWORD)).status).toBe(200);

    // Counter reset: a fresh run of failures is allowed again.
    for (let i = 0; i < MAX_LOGIN_FAILURES - 1; i++) {
      expect((await login(email, 'wrong password!')).status).toBe(401);
    }
    expect((await login(email, PASSWORD)).status).toBe(200);
  });

  it('throttles unknown emails the same way, so it does not reveal which accounts exist', async () => {
    const email = 'nobody-here@example.com';
    for (let i = 0; i < MAX_LOGIN_FAILURES; i++) {
      expect((await login(email, 'whatever123')).status).toBe(401);
    }
    expect((await login(email, 'whatever123')).status).toBe(429);
  });
});

describe('per-IP auth rate limit', () => {
  it(`allows ${AUTH_MAX_REQUESTS} login attempts per minute from one IP, then 429`, async () => {
    const ip = '10.99.0.1';
    for (let i = 0; i < AUTH_MAX_REQUESTS; i++) {
      // Spread over distinct emails so the per-email throttle is not what trips.
      expect((await login(`ip-limit-${i}@example.com`, 'wrong password!', ip)).status).toBe(401);
    }
    expect((await login('ip-limit-last@example.com', 'wrong password!', ip)).status).toBe(429);
  });

  it('does not count ordinary game traffic against the auth budget', async () => {
    const ip = '10.99.0.2';
    for (let i = 0; i < AUTH_MAX_REQUESTS + 5; i++) {
      const res = await fetchApp(
        new Request('https://example.com/api/collection', { headers: { 'CF-Connecting-IP': ip } })
      );
      expect(res.status).not.toBe(429);
    }
    expect((await login('ip-separate@example.com', 'wrong password!', ip)).status).toBe(401);
  });
});

describe('password rehash on login', () => {
  it(`moves a legacy 120k-iteration hash to ${PASSWORD_ITERATIONS} on the next successful login`, async () => {
    const email = 'legacy-hash@example.com';
    await register(email);

    // Simulate a hash created before the iteration change.
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(PASSWORD), 'PBKDF2', false, [
      'deriveBits',
    ]);
    const bits = new Uint8Array(
      await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 120_000, hash: 'SHA-256' }, key, 256)
    );
    const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
    await env.DB.prepare(
      'UPDATE users SET password_hash = ?, password_salt = ?, password_iterations = 120000 WHERE email = ?'
    )
      .bind(b64(bits), b64(salt), email)
      .run();

    expect((await login(email, PASSWORD)).status).toBe(200);

    const row = await env.DB.prepare('SELECT password_iterations FROM users WHERE email = ?')
      .bind(email)
      .first<{ password_iterations: number }>();
    expect(row?.password_iterations).toBe(PASSWORD_ITERATIONS);

    // The rehashed credential still works; the wrong password still fails.
    expect((await login(email, PASSWORD)).status).toBe(200);
    expect((await login(email, 'wrong password!')).status).toBe(401);
  });
});
