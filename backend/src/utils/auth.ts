import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { Context } from 'hono';
import type { Bindings } from '../types';

// Remote JWKS sets are created once and shared across requests. The `cacheMaxAge`
// bounds the in-memory cache of fetched keys (≤ 1h) so key rotation picks up.
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getJwks(uri: string): ReturnType<typeof createRemoteJWKSet> {
  let jwks = jwksCache.get(uri);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(uri), { cacheMaxAge: 3600_000 });
    jwksCache.set(uri, jwks);
  }
  return jwks;
}

/**
 * Validate a Passport ID token against Immutable's JWKS. Returns the derived
 * account key (the `sub` claim) on success, or null on any validation failure.
 * Never throws on an invalid token.
 */
export async function verifyIdToken(
  token: string,
  env: Bindings,
): Promise<{ sub: string } | null> {
  try {
    const { payload } = await jwtVerify(token, getJwks(env.IMMUTABLE_JWKS_URI), {
      issuer: env.IMMUTABLE_AUTH_ISSUER,
      audience: env.IMMUTABLE_CLIENT_ID,
    });
    if (!payload.sub) return null;
    return { sub: payload.sub };
  } catch {
    return null;
  }
}

/**
 * Extract a Bearer token from the Authorization header, or null if absent or
 * not in `Bearer <token>` form.
 */
export function readBearerToken(c: Context): string | null {
  const header = c.req.header('Authorization');
  if (!header || !header.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length).trim();
}
