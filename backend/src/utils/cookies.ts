import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { Bindings, Variables } from '../types';
import { readBearerToken } from './auth';

type AppContext = Context<{ Bindings: Bindings; Variables: Variables }>;

export const SESSION_COOKIE = 'af_session';
export const CSRF_COOKIE = 'af_csrf';
export const CSRF_HEADER = 'X-CSRF-Token';

const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

function cookieOptions(env: Bindings, httpOnly: boolean) {
  const secure = env.ENVIRONMENT !== 'development';
  return {
    httpOnly,
    secure,
    // The SPA reaches the API same-origin: in production through the Pages
    // Function proxy (frontend/functions/api), locally on localhost (ports do
    // not change the site). So the cookies never need to travel cross-site, and
    // Lax keeps browsers from attaching them to cross-site POSTs at all.
    sameSite: 'Lax' as const,
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}

/** Cookie first; Bearer fallback is retained for API clients and focused tests. */
export function readSessionCookie(c: AppContext): string | null {
  return getCookie(c, SESSION_COOKIE) ?? null;
}

export function readSessionToken(c: AppContext): string | null {
  return getCookie(c, SESSION_COOKIE) ?? readBearerToken(c);
}

export function readCsrfCookie(c: AppContext): string | null {
  return getCookie(c, CSRF_COOKIE) ?? null;
}

export function readCsrfHeader(c: AppContext): string | null {
  return c.req.header(CSRF_HEADER) ?? null;
}

export function setCsrfCookie(c: AppContext, csrfToken: string): void {
  // HttpOnly is fine for double-submit: the API only needs to compare the
  // header to the cookie, and the client receives the value in the auth JSON.
  setCookie(c, CSRF_COOKIE, csrfToken, cookieOptions(c.env, true));
}

export function setSessionCookies(c: AppContext, token: string, csrfToken: string): void {
  setCookie(c, SESSION_COOKIE, token, cookieOptions(c.env, true));
  setCsrfCookie(c, csrfToken);
}

export function clearSessionCookies(c: AppContext): void {
  // Deletion must carry the SAME attributes as the original Set-Cookie, or the
  // browser matches it to a different cookie jar entry and keeps the stale one.
  // This matters in production, where the API and SPA are cross-site: a
  // deletion without Secure/SameSite=None is itself cross-site and Chrome
  // drops it, leaving the old session cookie in place.
  const { httpOnly, secure, sameSite, path } = cookieOptions(c.env, true);
  deleteCookie(c, SESSION_COOKIE, { httpOnly, secure, sameSite, path });
  deleteCookie(c, CSRF_COOKIE, { httpOnly, secure, sameSite, path });
}
