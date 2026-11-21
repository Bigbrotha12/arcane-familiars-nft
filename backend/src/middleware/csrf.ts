import type { Context, Next } from 'hono';
import type { Bindings, Variables } from '../types';
import { CSRF_HEADER, readCsrfCookie, readSessionCookie } from '../utils/cookies';

type AppContext = Context<{ Bindings: Bindings; Variables: Variables }>;

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
// Credential-establishing endpoints cannot require a CSRF token (the caller
// does not have one yet), but they still must not be usable cross-site: a
// text/plain no-preflight POST could otherwise log the victim into an attacker
// account (login CSRF). They get the Origin/Sec-Fetch-Site checks and a JSON
// Content-Type requirement below.
const CREDENTIAL_PATHS = new Set(['/api/auth/login', '/api/auth/register']);

const JSON_CONTENT_TYPE = /^application\/json\b/i;

const PROD_ORIGINS = ['https://arcane-familiars.pages.dev', 'https://arcane-familiars-staging.pages.dev'];

function originAllowed(origin: string, env: Bindings): boolean {
  if (env.ENVIRONMENT !== 'development') return PROD_ORIGINS.includes(origin);

  try {
    const host = new URL(origin).hostname;
    return (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
    );
  } catch {
    return false;
  }
}

function equal(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * CSRF guard for cookie-authenticated unsafe requests.
 *
 * Double-submit token: the HttpOnly `af_csrf` cookie must match the
 * `X-CSRF-Token` request header. The auth JSON also returns the value to the
 * SPA so it can populate the header without reading the cookie.
 *
 * Origin and Sec-Fetch-Site checks are an additional browser-layer defence.
 * Login/register are exempt from the double-submit token (there is no session
 * yet) but NOT from these checks: a cross-site login POST is a login-CSRF
 * attack. They must also send an explicit JSON Content-Type so a browser cannot
 * emit them as a simple (no-preflight) request.
 *
 * Guest requests are exempt from the double-submit token: they have no session
 * cookie, so there is no ambient credential to forge.
 */
export async function csrfMiddleware(c: AppContext, next: Next): Promise<Response | void> {
  if (SAFE_METHODS.has(c.req.method)) return next();

  const isCredentialPath = CREDENTIAL_PATHS.has(c.req.path);
  const sessionToken = readSessionCookie(c);

  // Applies to credential endpoints regardless of session, and to every
  // cookie-authenticated unsafe request.
  if (isCredentialPath || sessionToken) {
    const origin = c.req.header('Origin');
    if (origin && !originAllowed(origin, c.env)) {
      return c.json({ error: 'Invalid request origin' }, 403);
    }

    // An allowlisted Origin is authoritative (browsers cannot forge it). The
    // production SPA (*.pages.dev) and API (*.workers.dev) are different sites,
    // so legitimate requests arrive as `Sec-Fetch-Site: cross-site`; only block
    // cross-site requests that carry no Origin to vouch for them.
    if (!origin && c.req.header('Sec-Fetch-Site') === 'cross-site') {
      return c.json({ error: 'Cross-site request blocked' }, 403);
    }
  }

  if (isCredentialPath) {
    if (!JSON_CONTENT_TYPE.test(c.req.header('content-type') ?? '')) {
      return c.json({ error: 'Content-Type must be application/json' }, 415);
    }
    return next();
  }

  if (!sessionToken) return next();

  const cookieToken = readCsrfCookie(c);
  const headerToken = c.req.header(CSRF_HEADER);

  if (!cookieToken || !headerToken || !equal(cookieToken, headerToken)) {
    return c.json({ error: `Missing or invalid ${CSRF_HEADER}` }, 403);
  }

  return next();
}
