import type { Context, Next } from 'hono';
import type { Bindings, Variables } from '../types';
import { CSRF_HEADER, readCsrfCookie, readSessionCookie } from '../utils/cookies';

type AppContext = Context<{ Bindings: Bindings; Variables: Variables }>;

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const CSRF_EXEMPT_PATHS = new Set(['/api/auth/login', '/api/auth/register']);

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
 * Guest requests (no session cookie) and login/register are exempt.
 */
export async function csrfMiddleware(c: AppContext, next: Next): Promise<Response | void> {
  if (SAFE_METHODS.has(c.req.method)) return next();
  if (CSRF_EXEMPT_PATHS.has(c.req.path)) return next();

  const sessionToken = readSessionCookie(c);
  if (!sessionToken) return next();

  const origin = c.req.header('Origin');
  if (origin && !originAllowed(origin, c.env)) {
    return c.json({ error: 'Invalid request origin' }, 403);
  }

  const fetchSite = c.req.header('Sec-Fetch-Site');
  if (fetchSite === 'cross-site') {
    return c.json({ error: 'Cross-site request blocked' }, 403);
  }

  const cookieToken = readCsrfCookie(c);
  const headerToken = c.req.header(CSRF_HEADER);

  if (!cookieToken || !headerToken || !equal(cookieToken, headerToken)) {
    return c.json({ error: `Missing or invalid ${CSRF_HEADER}` }, 403);
  }

  return next();
}
