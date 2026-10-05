import { forceRefreshIdToken, getIdToken } from '@/lib/immutable';
import { storeIdToken } from '@/lib/token';

/**
 * Cross-package auth bridge.
 *
 * The Phaser game lives in its own workspace package (`game/`) and cannot import
 * the frontend's React libs, but it must send a fresh Passport ID token on every
 * `/api/game/*` request. It reads this provider off `window` so the frontend can
 * inject it without creating a package dependency (or pulling the game bundle
 * into the landing page).
 *
 * `getIdToken` returns the current token, silently renewing it if it has
 * expired. `refreshIdToken` forces a renewal and is used after a 401.
 */
export interface ArcaneAuthBridge {
  getIdToken: () => Promise<string | null>;
  refreshIdToken: () => Promise<string | null>;
}

declare global {
  interface Window {
    __arcaneAuth?: ArcaneAuthBridge;
  }
}

let installed = false;

export function installAuthBridge(): void {
  if (typeof window === 'undefined' || installed) return;

  window.__arcaneAuth = {
    getIdToken: async () => {
      const token = await getIdToken();
      if (token) storeIdToken(token);
      return token ?? null;
    },
    refreshIdToken: async () => {
      const token = await forceRefreshIdToken();
      if (token) storeIdToken(token);
      return token ?? null;
    },
  };

  installed = true;
}
