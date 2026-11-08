import { Hono } from 'hono';
import type { Bindings, Variables } from '../types';
import {
  createCsrfToken,
  createSession,
  deleteSession,
  getSessionUser,
  hashPassword,
  isValidEmail,
  normalizeEmail,
  validatePassword,
  verifyPassword,
} from '../utils/auth';
import {
  clearSessionCookies,
  readCsrfCookie,
  readSessionToken,
  setCsrfCookie,
  setSessionCookies,
} from '../utils/cookies';
import { internalError } from '../utils/http';
import { generateId } from '../utils/uuid';

const authRouter = new Hono<{ Bindings: Bindings; Variables: Variables }>();

interface UserRow {
  user_id: string;
  email: string;
  password_hash: string;
  password_salt: string;
  password_iterations: number;
}

function authBody(body: unknown): { email: string; password: string } | null {
  if (typeof body !== 'object' || body === null) return null;
  const { email, password } = body as Record<string, unknown>;
  if (typeof email !== 'string' || typeof password !== 'string') return null;
  return { email: normalizeEmail(email), password };
}

function sessionResponse(csrfToken: string, expiresAt: string, userId: string, email: string) {
  return {
    csrfToken,
    expiresAt,
    user: { id: userId, email },
  };
}

/**
 * GET /auth/me
 * Confirms the current session. Unauthenticated by design.
 */
authRouter.get('/auth/me', async (c) => {
  const token = readSessionToken(c);
  if (!token) return c.json({ authenticated: false });

  try {
    const user = await getSessionUser(c.env.DB, token);
    if (!user) {
      clearSessionCookies(c);
      return c.json({ authenticated: false });
    }
    let csrfToken = readCsrfCookie(c);
    if (!csrfToken) {
      csrfToken = createCsrfToken();
      setCsrfCookie(c, csrfToken);
    }
    return c.json({
      authenticated: true,
      userId: user.userId,
      email: user.email,
      csrfToken,
    });
  } catch (error: unknown) {
    return internalError(c, error, 'Auth me');
  }
});

/**
 * POST /auth/register
 * Create an email/password account and a 30-day session.
 */
authRouter.post('/auth/register', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const credentials = authBody(body);
  if (!credentials) return c.json({ error: 'Missing required fields: email, password' }, 400);
  if (!isValidEmail(credentials.email)) return c.json({ error: 'Invalid email address' }, 400);

  const passwordError = validatePassword(credentials.password);
  if (passwordError) return c.json({ error: passwordError }, 400);

  try {
    const existing = await c.env.DB.prepare('SELECT 1 FROM users WHERE email = ?').bind(credentials.email).first();
    if (existing) return c.json({ error: 'An account with that email already exists' }, 409);

    const userId = generateId();
    const password = await hashPassword(credentials.password);
    await c.env.DB.prepare(
      `INSERT INTO users (user_id, email, password_hash, password_salt, password_iterations)
       VALUES (?, ?, ?, ?, ?)`
    )
      .bind(userId, credentials.email, password.hash, password.salt, password.iterations)
      .run();

    const session = await createSession(c.env.DB, userId);
    const csrfToken = createCsrfToken();
    setSessionCookies(c, session.token, csrfToken);
    return c.json(sessionResponse(csrfToken, session.expiresAt, userId, credentials.email), 201);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('UNIQUE constraint failed')) {
      return c.json({ error: 'An account with that email already exists' }, 409);
    }
    return internalError(c, error, 'Register');
  }
});

/**
 * POST /auth/login
 * Verify email/password and create a new session.
 */
authRouter.post('/auth/login', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const credentials = authBody(body);
  if (!credentials) return c.json({ error: 'Missing required fields: email, password' }, 400);

  try {
    const user = await c.env.DB.prepare(
      `SELECT user_id, email, password_hash, password_salt, password_iterations
         FROM users WHERE email = ?`
    )
      .bind(credentials.email)
      .first<UserRow>();

    if (!user) return c.json({ error: 'Invalid email or password' }, 401);

    const valid = await verifyPassword(
      credentials.password,
      user.password_hash,
      user.password_salt,
      user.password_iterations
    );
    if (!valid) return c.json({ error: 'Invalid email or password' }, 401);

    const session = await createSession(c.env.DB, user.user_id);
    const csrfToken = createCsrfToken();
    setSessionCookies(c, session.token, csrfToken);
    return c.json(sessionResponse(csrfToken, session.expiresAt, user.user_id, user.email));
  } catch (error: unknown) {
    return internalError(c, error, 'Login');
  }
});

/**
 * POST /auth/logout
 * Revoke the current session. Idempotent from the client's point of view.
 */
authRouter.post('/auth/logout', async (c) => {
  const token = readSessionToken(c);
  if (!token) {
    clearSessionCookies(c);
    return c.json({ success: true });
  }

  try {
    await deleteSession(c.env.DB, token);
    clearSessionCookies(c);
    return c.json({ success: true });
  } catch (error: unknown) {
    return internalError(c, error, 'Logout');
  }
});

/**
 * POST /auth/adopt
 * Move a guest's saved game to the signed-in account.
 *
 * Policy: if the account already has a save, keep it and leave the guest row
 * untouched. Only guest-marked rows are adoptable.
 */
authRouter.post('/auth/adopt', async (c) => {
  const token = readSessionToken(c);
  if (!token) return c.json({ error: 'Unauthorized' }, 401);

  try {
    const user = await getSessionUser(c.env.DB, token);
    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }
    if (typeof body !== 'object' || body === null) return c.json({ error: 'Invalid JSON body' }, 400);

    const { anonymousId } = body as Record<string, unknown>;
    if (typeof anonymousId !== 'string' || anonymousId.length === 0) {
      return c.json({ error: 'Missing required field: anonymousId' }, 400);
    }

    if (anonymousId === user.userId) {
      return c.json({ adopted: false, reason: 'no-guest' });
    }

    const guest = await c.env.DB.prepare(
      'SELECT anonymous_id FROM game_states WHERE anonymous_id = ? AND is_anonymous = 1'
    )
      .bind(anonymousId)
      .first();
    if (!guest) return c.json({ adopted: false, reason: 'no-guest' });

    const account = await c.env.DB.prepare('SELECT anonymous_id FROM game_states WHERE anonymous_id = ?')
      .bind(user.userId)
      .first();
    if (account) return c.json({ adopted: false, reason: 'existing-account' });

    const move = await c.env.DB.prepare(
      'UPDATE game_states SET anonymous_id = ?, is_anonymous = 0 WHERE anonymous_id = ?'
    )
      .bind(user.userId, anonymousId)
      .run();

    if (move.meta.changes !== 1) {
      return c.json({ adopted: false, reason: 'no-guest' });
    }

    await c.env.DB.batch([
      c.env.DB.prepare('UPDATE active_battles SET anonymous_id = ? WHERE anonymous_id = ?').bind(
        user.userId,
        anonymousId
      ),
      c.env.DB.prepare('UPDATE dungeon_runs SET anonymous_id = ? WHERE anonymous_id = ?').bind(
        user.userId,
        anonymousId
      ),
    ]);

    return c.json({ adopted: true, userId: user.userId });
  } catch (error: unknown) {
    return internalError(c, error, 'Adopt guest game');
  }
});

export default authRouter;
