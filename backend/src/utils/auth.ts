import type { Context } from 'hono';
import type { D1Database } from '@cloudflare/workers-types';

const PASSWORD_ITERATIONS = 120_000;
const PASSWORD_HASH_BYTES = 32;
const PASSWORD_SALT_BYTES = 16;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const encoder = new TextEncoder();

interface PasswordHash {
  hash: string;
  salt: string;
  iterations: number;
}

export interface SessionUser {
  userId: string;
  email: string;
}

export interface SessionResult {
  token: string;
  expiresAt: string;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Deliberately permissive: the email provider/domain is the real authority. */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

export function validatePassword(password: string): string | null {
  if (password.length < 8) return 'Password must be at least 8 characters';
  if (password.length > 200) return 'Password must be at most 200 characters';
  return null;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function base64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function derivePasswordBits(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), { name: 'PBKDF2' }, false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    key,
    PASSWORD_HASH_BYTES * 8
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<PasswordHash> {
  const salt = crypto.getRandomValues(new Uint8Array(PASSWORD_SALT_BYTES));
  const hash = await derivePasswordBits(password, salt, PASSWORD_ITERATIONS);
  return {
    hash: bytesToBase64(hash),
    salt: bytesToBase64(salt),
    iterations: PASSWORD_ITERATIONS,
  };
}

export async function verifyPassword(
  password: string,
  expectedHash: string,
  salt: string,
  iterations: number
): Promise<boolean> {
  if (!Number.isInteger(iterations) || iterations < 10_000 || iterations > 1_000_000) return false;

  try {
    const actual = await derivePasswordBits(password, base64ToBytes(salt), iterations);
    const expected = base64ToBytes(expectedHash);
    if (actual.length !== expected.length) return false;

    let diff = 0;
    for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i];
    return diff === 0;
  } catch {
    return false;
  }
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function createCsrfToken(): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(32)));
}

export async function createSession(db: D1Database, userId: string): Promise<SessionResult> {
  const token = base64Url(crypto.getRandomValues(new Uint8Array(32)));
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  await db
    .prepare("INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, datetime('now'))")
    .bind(await sha256Hex(token), userId, expiresAt)
    .run();
  return { token, expiresAt };
}

export async function getSessionUser(db: D1Database, token: string): Promise<SessionUser | null> {
  const row = await db
    .prepare(
      `SELECT u.user_id AS userId, u.email AS email
         FROM sessions s
         JOIN users u ON u.user_id = s.user_id
        WHERE s.token_hash = ? AND datetime(s.expires_at) > datetime('now')`
    )
    .bind(await sha256Hex(token))
    .first<SessionUser>();
  return row ?? null;
}

export async function deleteSession(db: D1Database, token: string): Promise<void> {
  await db
    .prepare('DELETE FROM sessions WHERE token_hash = ?')
    .bind(await sha256Hex(token))
    .run();
}

export async function cleanupExpiredSessions(db: D1Database): Promise<number> {
  const result = await db.prepare(`DELETE FROM sessions WHERE datetime(expires_at) < datetime('now')`).run();
  return result.meta.changes ?? 0;
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
