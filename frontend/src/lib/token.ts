export const PASSPORT_ID_TOKEN_KEY = 'af_passport_id_token';

export function storeIdToken(token: string): void {
  try {
    sessionStorage.setItem(PASSPORT_ID_TOKEN_KEY, token);
  } catch {
    // ignore storage failures
  }
}

export function readIdToken(): string | null {
  try {
    return sessionStorage.getItem(PASSPORT_ID_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function clearIdToken(): void {
  try {
    sessionStorage.removeItem(PASSPORT_ID_TOKEN_KEY);
  } catch {
    // ignore storage failures
  }
}
