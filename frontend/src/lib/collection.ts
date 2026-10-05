import { forceRefreshIdToken } from '@/lib/immutable';
import { readIdToken, storeIdToken, clearIdToken } from '@/lib/token';

/**
 * Backend base URL — mirrors the game client (`game/src/api/client.ts`).
 */
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8787';

/** A row from `GET /api/collection` — the D1 `familiars` catalog. */
export interface CatalogFamiliar {
  familiar_id: number;
  name: string;
  description: string;
  image: string;
  affinity: string;
  hp: number;
  mp: number;
  attack: number;
  defense: number;
  arcane: number;
  speed: number;
  ability_1: string;
  ability_2: string;
  ability_3: string;
  ability_4: string;
  rarity: string;
  generation: number;
}

/** Response contract of `GET /api/game/owned-familiars`. */
export interface OwnedFamiliarsResult {
  familiars: string[];
  synced: boolean;
  error?: string;
  /**
   * True when the stored ID token was rejected and could not be silently
   * refreshed, so the caller should fall back to the guest view.
   */
  unauthenticated?: boolean;
}

/** Fetch the public familiar catalog. Throws on network / non-2xx errors. */
export async function fetchCatalog(): Promise<CatalogFamiliar[]> {
  const res = await fetch(`${BACKEND_URL}/api/collection`, {
    headers: { 'Content-Type': 'application/json' },
  });

  if (!res.ok) {
    throw new Error(`Failed to load the catalog (${res.status})`);
  }

  const data = (await res.json()) as unknown;
  return Array.isArray(data) ? (data as CatalogFamiliar[]) : [];
}

/** Single authed request with an explicit token. No refresh logic. */
function requestOwnedFamiliars(token: string): Promise<Response> {
  return fetch(`${BACKEND_URL}/api/game/owned-familiars`, {
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  });
}

/**
 * Fetch the familiar species the signed-in player owns on-chain. Reads the same
 * Passport ID token the game client uses (`readIdToken()`); no token means guest.
 *
 * The backend already degrades upstream failures to a 200
 * `{ familiars: [], synced: false, error }`, which is returned as-is so the page
 * can show a notice without going blank. Network errors still throw.
 */
export async function fetchOwnedFamiliars(): Promise<OwnedFamiliarsResult> {
  const token = readIdToken();
  if (!token) {
    return { familiars: [], synced: false };
  }

  let res = await requestOwnedFamiliars(token);

  // Mirror the game client's auth handling: a 401 means the ID token was
  // rejected (expired/rotated). Refresh once and retry; if the session can no
  // longer be renewed, clear it and tell the caller to degrade to the guest
  // view rather than surfacing a dead token as a generic sync error.
  if (res.status === 401) {
    const refreshed = await forceRefreshIdToken().catch(() => undefined);
    if (refreshed) {
      storeIdToken(refreshed);
      res = await requestOwnedFamiliars(refreshed);
    }

    if (res.status === 401) {
      clearIdToken();
      return { familiars: [], synced: false, unauthenticated: true };
    }
  }

  if (!res.ok) {
    return { familiars: [], synced: false, error: `Sync failed (${res.status})` };
  }

  const data = (await res.json()) as Partial<OwnedFamiliarsResult>;
  return {
    familiars: Array.isArray(data.familiars) ? data.familiars : [],
    synced: Boolean(data.synced),
    error: data.error,
  };
}
