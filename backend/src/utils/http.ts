import type { Context } from 'hono';
import type { Bindings, Variables } from '../types';

export function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/**
 * Parse a JSON request body as an object, returning null on empty/malformed
 * bodies so routes can respond 400 instead of bubbling a 500.
 *
 * When an authenticated request carries a token-derived account key (set on
 * the context by the auth middleware), it overrides the body-provided
 * `anonymousId`. This lets the game handlers use the Passport `sub` as the
 * account key without any handler changes — a forged body anonymousId is
 * never trusted over the verified token-derived key.
 */
export async function readBody<T extends Record<string, unknown>>(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
): Promise<T | null> {
  try {
    const body: unknown = await c.req.json();
    if (typeof body !== 'object' || body === null) return null;
    const accountKey = c.get('accountKey');
    if (accountKey) {
      (body as Record<string, unknown>).anonymousId = accountKey;
    }
    return body as T;
  } catch {
    return null;
  }
}
