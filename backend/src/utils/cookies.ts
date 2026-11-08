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
    // The API and SPA are separate origins in production. Lax is enough for
    // localhost (ports do not change the site); None is required across sites.
    sameSite: secure ? ('None' as const) : ('Lax' as const),
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
  deleteCookie(c, SESSION_COOKIE, { path: '/' });
  deleteCookie(c, CSRF_COOKIE, { path: '/' });
}
