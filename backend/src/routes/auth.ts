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
  PASSWORD_ITERATIONS,
  validatePassword,
  verifyPassword,
} from '../utils/auth';
import { clearLoginFailures, loginRetryAfterSeconds, recordLoginFailure } from '../utils/loginThrottle';
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
    // Throttle check first, so a throttled email costs no hashing CPU.
    const retryAfter = await loginRetryAfterSeconds(c.env.DB, credentials.email);
    if (retryAfter > 0) {
      return c.json({ error: 'Too many failed sign-in attempts. Please try again later.' }, 429, {
        'Retry-After': String(retryAfter),
      });
    }

    const user = await c.env.DB.prepare(
      `SELECT user_id, email, password_hash, password_salt, password_iterations
         FROM users WHERE email = ?`
    )
      .bind(credentials.email)
      .first<UserRow>();

    const valid =
      user !== null &&
      (await verifyPassword(credentials.password, user.password_hash, user.password_salt, user.password_iterations));
    if (!user || !valid) {
      await recordLoginFailure(c.env.DB, credentials.email);
      return c.json({ error: 'Invalid email or password' }, 401);
    }

    await clearLoginFailures(c.env.DB, credentials.email);

    // Move the stored hash to the current iteration count (e.g. after the
    // 120k -> 10k change). Best-effort: a failed rehash must not fail login.
    if (user.password_iterations !== PASSWORD_ITERATIONS) {
      try {
        const rehashed = await hashPassword(credentials.password);
        await c.env.DB.prepare(
          `UPDATE users SET password_hash = ?, password_salt = ?, password_iterations = ?,
                            updated_at = datetime('now')
            WHERE user_id = ?`
        )
          .bind(rehashed.hash, rehashed.salt, rehashed.iterations, user.user_id)
          .run();
      } catch (err) {
        console.error(`[${c.get('requestId')}] Login rehash failed`, err);
      }
    }

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

    try {
      // One batch: the game_states move, the battle move, and the dungeon move
      // commit together. The game_states UPDATE is conditional on the account
      // row still not existing, and the follow-up moves only run when the guest
      // row is gone AND the account row is present — i.e. exactly when this
      // batch's move succeeded. If another writer created the account row in
      // between, all three statements match 0 rows instead of moving the guest's
      // battles into an unrelated account.
      const [move] = await c.env.DB.batch([
        c.env.DB.prepare(
          `UPDATE game_states
              SET anonymous_id = ?, is_anonymous = 0
            WHERE anonymous_id = ? AND is_anonymous = 1
              AND NOT EXISTS (SELECT 1 FROM game_states WHERE anonymous_id = ?)`
        ).bind(user.userId, anonymousId, user.userId),
        c.env.DB.prepare(
          `UPDATE active_battles
              SET anonymous_id = ?
            WHERE anonymous_id = ?
              AND NOT EXISTS (SELECT 1 FROM game_states WHERE anonymous_id = ?)
              AND EXISTS (SELECT 1 FROM game_states WHERE anonymous_id = ? AND is_anonymous = 0)`
        ).bind(user.userId, anonymousId, anonymousId, user.userId),
        c.env.DB.prepare(
          `UPDATE dungeon_runs
              SET anonymous_id = ?
            WHERE anonymous_id = ?
              AND NOT EXISTS (SELECT 1 FROM game_states WHERE anonymous_id = ?)
              AND EXISTS (SELECT 1 FROM game_states WHERE anonymous_id = ? AND is_anonymous = 0)`
        ).bind(user.userId, anonymousId, anonymousId, user.userId),
      ]);

      if (move.meta.changes !== 1) {
        const nowAccount = await c.env.DB.prepare('SELECT 1 FROM game_states WHERE anonymous_id = ?')
          .bind(user.userId)
          .first();
        return c.json({ adopted: false, reason: nowAccount ? 'existing-account' : 'no-guest' });
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('UNIQUE constraint failed')) {
        return c.json({ adopted: false, reason: 'existing-account' });
      }
      throw error;
    }

    return c.json({ adopted: true, userId: user.userId });
  } catch (error: unknown) {
    return internalError(c, error, 'Adopt guest game');
  }
});

export default authRouter;
