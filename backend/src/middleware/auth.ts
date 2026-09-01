import type { Context, Next } from 'hono';
import type { Bindings, Variables } from '../types';
import { readBearerToken, verifyIdToken } from '../utils/auth';

type GameContext = Context<{ Bindings: Bindings; Variables: Variables }>;

/**
 * Guard for /api/game/*. When a valid Passport Bearer ID token is present, its
 * `sub` claim becomes the game's account key (stored in the request context) and
 * `isGuest` is set to `false`.
 *
 * When no/invalid token is present, the request is allowed through in ALL
 * environments with `accountKey` unset and `isGuest = true`. Guests are
 * identified by a client-generated anonymous id, but their game state is still
 * PERSISTED to D1 exactly like a signed-in user's (marked `is_anonymous = 1` so
 * a future cleanup job can purge stale guest rows).
 *
 * SECURITY INVARIANT: every handler behind this gate MUST read its body via
 * `readBody()` from `utils/http.ts`, which overrides `anonymousId` with the
 * verified `accountKey` from context. A handler that reads `c.req.json()`
 * directly would trust the client-provided anonymousId, reintroducing the
 * account-forgery risk this middleware was designed to prevent.
 */
export async function authMiddleware(c: GameContext, next: Next): Promise<Response | void> {
  const token = readBearerToken(c);

  if (token) {
    const result = await verifyIdToken(token, c.env);
    if (result) {
      c.set('accountKey', result.sub);
      c.set('isGuest', false);
      return next();
    }
  }

  c.set('isGuest', true);
  return next();
}
