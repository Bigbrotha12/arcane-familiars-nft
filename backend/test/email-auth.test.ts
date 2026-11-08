import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:workers';
import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { app } from '../src/index';
import type { Bindings } from '../src/types';

function makeEnv(environment = 'production'): Bindings {
  return { ...(env as unknown as Bindings), ENVIRONMENT: environment };
}

async function fetchApp(request: Request, environment = 'production'): Promise<Response> {
  const ctx = createExecutionContext();
  const response = await app.fetch(request, makeEnv(environment), ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

interface AuthCookies {
  cookie: string;
  csrf: string;
}

function cookiesFrom(res: Response): string {
  return res.headers
    .getSetCookie()
    .map((header) => header.split(';')[0])
    .join('; ');
}

function post(path: string, body: unknown, auth?: Partial<AuthCookies>, ip = '10.20.0.1'): Request {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'CF-Connecting-IP': ip,
  };
  if (auth?.cookie) headers.cookie = auth.cookie;
  if (auth?.csrf) headers['x-csrf-token'] = auth.csrf;
  return new Request(`https://example.com${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

function get(path: string, auth?: Partial<AuthCookies>, ip = '10.20.0.1'): Request {
  const headers: Record<string, string> = { 'CF-Connecting-IP': ip };
  if (auth?.cookie) headers.cookie = auth.cookie;
  return new Request(`https://example.com${path}`, { headers });
}

async function register(email: string, password = 'correct horse battery'): Promise<AuthCookies & { userId: string }> {
  const res = await fetchApp(post('/api/auth/register', { email, password }));
  expect(res.status).toBe(201);
  const body = (await res.json()) as {
    csrfToken: string;
    user: { id: string; email: string };
  };
  expect(body.user.email).toBe(email.toLowerCase());
  return { cookie: cookiesFrom(res), csrf: body.csrfToken, userId: body.user.id };
}

async function seedGuestState(anonymousId: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO game_states (anonymous_id, state_json, version, updated_at, is_anonymous)
     VALUES (?, ?, 1, datetime('now'), 1)`
  )
    .bind(anonymousId, JSON.stringify({ anonymousId, playerFamiliars: ['whiteDog'] }))
    .run();
}

describe('email/password auth', () => {
  it('registers, sets HttpOnly cookies, and resolves /auth/me', async () => {
    const res = await fetchApp(
      post('/api/auth/register', { email: 'new-player@example.com', password: 'correct horse battery' })
    );
    expect(res.status).toBe(201);
    expect(cookiesFrom(res)).toContain('af_session=');
    expect(res.headers.getSetCookie().some((header) => header.includes('HttpOnly'))).toBe(true);

    const body = (await res.json()) as { csrfToken: string; user: { id: string; email: string } };
    const me = await fetchApp(get('/api/auth/me', { cookie: cookiesFrom(res) }));
    expect(me.status).toBe(200);
    expect(await me.json()).toMatchObject({
      authenticated: true,
      userId: body.user.id,
      email: 'new-player@example.com',
      csrfToken: body.csrfToken,
    });
  });

  it('rejects duplicate emails and weak passwords', async () => {
    await register('duplicate@example.com');

    const duplicate = await fetchApp(
      post('/api/auth/register', { email: 'DUPLICATE@example.com', password: 'another good password' })
    );
    expect(duplicate.status).toBe(409);

    const weak = await fetchApp(post('/api/auth/register', { email: 'weak@example.com', password: 'short' }));
    expect(weak.status).toBe(400);
  });

  it('logs in and rejects wrong credentials', async () => {
    await register('login@example.com', 'a very good password');

    const ok = await fetchApp(
      post('/api/auth/login', { email: 'login@example.com', password: 'a very good password' })
    );
    expect(ok.status).toBe(200);
    expect(cookiesFrom(ok)).toContain('af_session=');

    const bad = await fetchApp(post('/api/auth/login', { email: 'login@example.com', password: 'wrong password' }));
    expect(bad.status).toBe(401);
  });

  it('revokes the session on logout and clears cookies', async () => {
    const auth = await register('logout@example.com');

    const logout = await fetchApp(post('/api/auth/logout', {}, auth));
    expect(logout.status).toBe(200);
    expect(logout.headers.getSetCookie().some((header) => header.includes('af_session=;'))).toBe(true);

    const me = await fetchApp(get('/api/auth/me', auth));
    expect(await me.json()).toEqual({ authenticated: false });
  });

  it('rejects an unsafe request with a session but no CSRF token', async () => {
    const auth = await register('csrf@example.com');
    const res = await fetchApp(post('/api/game/state/load', { anonymousId: 'forged' }, { cookie: auth.cookie }));
    expect(res.status).toBe(403);
  });

  it('adopts a guest save after registration', async () => {
    const guestId = 'email-auth-guest-adopt';
    await seedGuestState(guestId);
    const auth = await register('adopt@example.com');

    const adopt = await fetchApp(post('/api/auth/adopt', { anonymousId: guestId }, auth));
    expect(adopt.status).toBe(200);
    expect(await adopt.json()).toEqual({ adopted: true, userId: auth.userId });

    const row = await env.DB.prepare('SELECT anonymous_id, is_anonymous FROM game_states WHERE anonymous_id = ?')
      .bind(auth.userId)
      .first<{ anonymous_id: string; is_anonymous: number }>();
    expect(row).toEqual({ anonymous_id: auth.userId, is_anonymous: 0 });
    expect(await env.DB.prepare('SELECT 1 FROM game_states WHERE anonymous_id = ?').bind(guestId).first()).toBeNull();
  });

  it('rejects a bad session and binds a valid session to the user id', async () => {
    const invalid = await fetchApp(get('/api/auth/me', { cookie: 'af_session=bad-token' }));
    expect(await invalid.json()).toEqual({ authenticated: false });

    const auth = await register('game@example.com');
    const load = await fetchApp(post('/api/game/state/load', { anonymousId: 'forged' }, auth));
    expect(load.status).toBe(200);
    const body = (await load.json()) as { state: { anonymousId: string } };
    expect(body.state.anonymousId).toBe(auth.userId);
  });
});
