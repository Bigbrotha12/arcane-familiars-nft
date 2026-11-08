const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8787';

export interface AuthUser {
  id: string;
  email: string;
}

export interface AuthSession {
  csrfToken: string;
  expiresAt: string;
  user: AuthUser;
}

declare global {
  interface Window {
    __arcaneCsrfToken?: string;
  }
}

let csrfToken: string | null = null;

export function getCsrfToken(): string | null {
  return csrfToken;
}

function setCsrfToken(value: string | null): void {
  csrfToken = value;
  if (typeof window !== 'undefined') {
    window.__arcaneCsrfToken = value ?? undefined;
  }
}

async function parseError(res: Response): Promise<string> {
  const body = await res.json().catch(() => ({ error: res.statusText }));
  return (body as { error?: string }).error || `Request failed (${res.status})`;
}

async function authRequest<T>(path: string, body: unknown): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (csrfToken) headers['X-CSRF-Token'] = csrfToken;

  const res = await fetch(`${BACKEND_URL}${path}`, {
    method: 'POST',
    credentials: 'include',
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<T>;
}

export async function register(email: string, password: string): Promise<AuthSession> {
  const session = await authRequest<AuthSession>('/api/auth/register', { email, password });
  setCsrfToken(session.csrfToken);
  return session;
}

export async function login(email: string, password: string): Promise<AuthSession> {
  const session = await authRequest<AuthSession>('/api/auth/login', { email, password });
  setCsrfToken(session.csrfToken);
  return session;
}

export async function logout(): Promise<void> {
  try {
    await authRequest<{ success: boolean }>('/api/auth/logout', {});
  } finally {
    setCsrfToken(null);
  }
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/auth/me`, { credentials: 'include' });
    if (!res.ok) {
      setCsrfToken(null);
      return null;
    }
    const data = (await res.json()) as {
      authenticated: boolean;
      userId?: string;
      email?: string;
      csrfToken?: string | null;
    };
    if (!data.authenticated || !data.userId || !data.email) {
      setCsrfToken(null);
      return null;
    }
    setCsrfToken(data.csrfToken ?? null);
    return { id: data.userId, email: data.email };
  } catch {
    return null;
  }
}

/** Move the current browser's guest save to the signed-in account. */
export async function adoptGuestGame(anonymousId: string): Promise<boolean> {
  try {
    const result = await authRequest<{ adopted: boolean }>('/api/auth/adopt', { anonymousId });
    return result.adopted === true;
  } catch {
    return false;
  }
}
