import type { Context } from 'hono';
import type { Bindings, Variables } from '../types';
import { ClientError, InvalidAccountIdError } from './errors';

export function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/**
 * Standard error response used by every route catch block. Deliberately thrown
 * client errors (bad guest account id, account-save access) are mapped to their
 * 4xx status; anything else is a 500 with request-id correlation so clients and
 * support can correlate logs.
 */
export function internalError(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
  err: unknown,
  context: string
): Response {
  if (err instanceof ClientError) {
    return c.json({ error: err.message }, err.status);
  }

  const requestId = c.get('requestId');
  console.error(`[${requestId}] ${context} error:`, getErrorMessage(err));
  return c.json({ error: 'Internal server error', requestId }, 500);
}

// UUID shape (8-4-4-4-12 hex). The game client generates v4 UUIDs; the shape
// check is deliberate rather than version-strict so any RFC 4122 variant works.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Parse a JSON request body as an object, returning null on empty/malformed
 * bodies so routes can respond 400 instead of bubbling a 500.
 *
 * When an authenticated request carries a token-derived account key (set on
 * the context by the auth middleware), it overrides the body-provided
 * `anonymousId`. This lets the game handlers use the authenticated user id as the
 * account key without any handler changes — a forged body anonymousId is
 * never trusted over the verified token-derived key.
 *
 * Guests have no verified key, so their client-supplied `anonymousId` is
 * validated as UUID-shaped here; anything else is rejected (400) before a route
 * can create a junk D1 row keyed by an arbitrary string.
 */
export async function readBody<T extends Record<string, unknown>>(
  c: Context<{ Bindings: Bindings; Variables: Variables }>
): Promise<T | null> {
  try {
    const body: unknown = await c.req.json();
    if (typeof body !== 'object' || body === null) return null;
    const accountKey = c.get('accountKey');
    if (accountKey) {
      (body as Record<string, unknown>).anonymousId = accountKey;
    } else {
      const anonymousId = (body as Record<string, unknown>).anonymousId;
      if (anonymousId !== undefined && (typeof anonymousId !== 'string' || !UUID_RE.test(anonymousId))) {
        throw new InvalidAccountIdError();
      }
    }
    return body as T;
  } catch (error: unknown) {
    if (error instanceof InvalidAccountIdError) throw error;
    return null;
  }
}
