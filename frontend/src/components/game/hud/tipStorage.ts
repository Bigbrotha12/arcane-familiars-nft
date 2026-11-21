// Best-effort localStorage for tips. Every access is wrapped because storage
// can be unavailable in private/embedded contexts; the hook keeps an in-memory
// fallback so tips still work for the current session.

import { TIPS, type TipId } from './tipRules';

const PLAYER_ID_KEY = 'af_anonymous_id';
const ENABLED_KEY = 'af_tips_enabled';
const SEEN_PREFIX = 'af_tips_seen:';

const VALID_TIP_IDS = new Set<string>(TIPS.map((tip) => tip.id));

export function readTipsEnabled(): boolean {
  try {
    return localStorage.getItem(ENABLED_KEY) !== '0';
  } catch {
    return true;
  }
}

export function writeTipsEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(ENABLED_KEY, enabled ? '1' : '0');
  } catch {
    // Storage unavailable: the in-memory toggle still applies this session.
  }
}

/**
 * Mirrors game/src/api/client.ts: the guest/account key is the stored
 * `af_anonymous_id`. The game client creates it before the first snapshot, so
 * an absent key only happens when storage is unavailable.
 */
export function currentTipsPlayerId(): string {
  try {
    return localStorage.getItem(PLAYER_ID_KEY) || 'guest';
  } catch {
    return 'guest';
  }
}

export function readSeenTips(playerId: string): Set<TipId> {
  try {
    const raw = localStorage.getItem(`${SEEN_PREFIX}${playerId}`);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is TipId => typeof id === 'string' && VALID_TIP_IDS.has(id)));
  } catch {
    return new Set();
  }
}

export function writeSeenTips(playerId: string, seen: ReadonlySet<TipId>): void {
  try {
    localStorage.setItem(`${SEEN_PREFIX}${playerId}`, JSON.stringify([...seen]));
  } catch {
    // Storage unavailable: seen tips still live in memory for this session.
  }
}
