import type { Context, Next } from 'hono';
import type { Bindings, Variables } from '../types';
import { getSessionUser } from '../utils/auth';
import { readSessionToken } from '../utils/cookies';

type GameContext = Context<{ Bindings: Bindings; Variables: Variables }>;

/**
 * Guard for /api/game/*.
 *
 * No token → guest play, keyed by the client-generated anonymous id.
 * Valid session token → `accountKey` is the local user id and `isGuest` is false.
 * Invalid/expired token → 401, never a silent downgrade to the guest save.
 *
 * Every handler behind this gate MUST read its body via `readBody()` in
 * `utils/http.ts`, which overrides `anonymousId` with `accountKey`.
 */
export async function authMiddleware(c: GameContext, next: Next): Promise<Response | void> {
  const token = readSessionToken(c);

  if (token) {
    const user = await getSessionUser(c.env.DB, token);
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    c.set('accountKey', user.userId);
    c.set('isGuest', false);
    return next();
  }

  c.set('isGuest', true);
  return next();
}
