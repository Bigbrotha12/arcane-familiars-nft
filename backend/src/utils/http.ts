import type { Context } from 'hono';

export function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/**
 * Parse a JSON request body as an object, returning null on empty/malformed
 * bodies so routes can respond 400 instead of bubbling a 500.
 */
export async function readBody<T extends Record<string, unknown>>(c: Context): Promise<T | null> {
  try {
    const body: unknown = await c.req.json();
    if (typeof body !== 'object' || body === null) return null;
    return body as T;
  } catch {
    return null;
  }
}
