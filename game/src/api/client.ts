import type {
  GameState,
  BattleState,
  BattleAction,
  BattleTurnResult,
  DungeonState,
  Room,
  Area,
  Inventory,
} from '@arcane-familiars/game-logic';

// crypto.randomUUID only exists in secure contexts (HTTPS / localhost); fall
// back to getRandomValues so LAN play over plain HTTP still works.
function randomId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0'));
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`;
}

const PASSPORT_ID_TOKEN_KEY = 'af_passport_id_token';

// Fired when a token refresh attempt fails and the client falls back to guest
// play, so the signed-in shell can update instead of the player silently
// continuing on a different account key.
const AUTH_EXPIRED_EVENT = 'af:auth-expired';

/**
 * The frontend installs this on `window` (see frontend/src/lib/authBridge.ts).
 * The game package cannot import the frontend's Immutable auth libs, so the
 * provider is a runtime contract rather than a build-time dependency.
 */
interface ArcaneAuthBridge {
  getIdToken: () => Promise<string | null>;
  refreshIdToken: () => Promise<string | null>;
}

function authBridge(): ArcaneAuthBridge | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { __arcaneAuth?: ArcaneAuthBridge }).__arcaneAuth;
}

function clearStoredToken(): void {
  try {
    sessionStorage.removeItem(PASSPORT_ID_TOKEN_KEY);
  } catch {
    // ignore storage failures
  }
}

class GameApiClient {
  private baseUrl: string;
  private anonymousId: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || import.meta.env.VITE_BACKEND_URL || 'http://localhost:8787';
    const stored = localStorage.getItem('af_anonymous_id');
    if (stored) {
      this.anonymousId = stored;
    } else {
      this.anonymousId = randomId();
      localStorage.setItem('af_anonymous_id', this.anonymousId);
    }
  }

  private getToken(): string | null {
    try {
      return sessionStorage.getItem(PASSPORT_ID_TOKEN_KEY);
    } catch {
      return null;
    }
  }

  /**
   * Resolve the token for a request. When signed in, prefer a fresh token from
   * the auth bridge (which silently renews an expired ID token); fall back to
   * the cached session token. Returns null for guests.
   */
  private async resolveToken(): Promise<string | null> {
    const cached = this.getToken();
    if (!cached) return null;

    const bridge = authBridge();
    if (!bridge) return cached;

    try {
      const token = await bridge.getIdToken();
      return token ?? cached;
    } catch {
      return cached;
    }
  }

  /** Single fetch with an explicit token. No auth/refresh logic. */
  private async send(method: string, url: string, body: string | undefined, token: string | null): Promise<Response> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;

    const options: RequestInit = { method, headers };
    if (body !== undefined) options.body = body;

    try {
      return await fetch(url, options);
    } catch (err) {
      throw new Error(`Network error: ${(err as Error).message}`, { cause: err });
    }
  }

  // Guest sessions (no Passport id token in session storage) are still fully
  // persisted by the backend, keyed by a client-generated anonymous id.
  private async request<T>(method: string, path: string, body?: Record<string, unknown>): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const serialized = body ? JSON.stringify(body) : undefined;

    let res = await this.send(method, url, serialized, await this.resolveToken());

    // An ID token that the backend rejects (expired/rotated) must not silently
    // downgrade the player to their guest key. Refresh once and retry; if the
    // session is genuinely gone, drop the token and continue as a guest while
    // telling the shell so the UI is honest about it.
    if (res.status === 401) {
      const bridge = authBridge();
      const refreshed = bridge ? await bridge.refreshIdToken().catch(() => null) : null;

      if (refreshed) {
        res = await this.send(method, url, serialized, refreshed);
      } else {
        clearStoredToken();
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT));
        }
        res = await this.send(method, url, serialized, null);
      }
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      const error = new Error(err.error || `Request failed: ${res.status}`) as Error & { status?: number };
      error.status = res.status;
      throw error;
    }
    return res.json() as Promise<T>;
  }

  async loadGameState(): Promise<{ state: GameState }> {
    return this.request('POST', '/api/game/state/load', { anonymousId: this.anonymousId });
  }

  async setParty(activeParty: string[]): Promise<{ success: boolean; state: GameState }> {
    return this.request('POST', '/api/game/state/party', { anonymousId: this.anonymousId, activeParty });
  }

  async setActiveFamiliar(familiarId: string): Promise<{ success: boolean; state: GameState }> {
    return this.request('POST', '/api/game/state/party/active', { anonymousId: this.anonymousId, familiarId });
  }

  async enterDungeon(areaId: string): Promise<{ dungeon: DungeonState; area: Area }> {
    return this.request('POST', '/api/game/dungeon/enter', { anonymousId: this.anonymousId, areaId });
  }

  async exploreRoom(
    roomId: string
  ): Promise<{ room: Room; encounter: boolean; enemy: string | null; treasure: boolean; treasureItem: string | null }> {
    return this.request('POST', '/api/game/dungeon/explore', { anonymousId: this.anonymousId, roomId });
  }

  async collectTreasure(roomId: string, itemId: string): Promise<{ success: boolean; inventory: Inventory }> {
    return this.request('POST', '/api/game/dungeon/collect-treasure', {
      anonymousId: this.anonymousId,
      roomId,
      itemId,
    });
  }

  async exitDungeon(): Promise<{ success: boolean }> {
    return this.request('POST', '/api/game/dungeon/exit', { anonymousId: this.anonymousId });
  }

  async startBattle(playerFamiliarId: string): Promise<{ battle: BattleState }> {
    return this.request('POST', '/api/game/battle/start', { anonymousId: this.anonymousId, playerFamiliarId });
  }

  async battleAction(
    battleId: string,
    action: BattleAction,
    expectedTurnCount?: number
  ): Promise<{ turnResult: BattleTurnResult; state?: GameState; turnCount: number }> {
    return this.request('POST', '/api/game/battle/action', {
      anonymousId: this.anonymousId,
      battleId,
      action,
      expectedTurnCount,
    });
  }

  async fleeBattle(
    battleId: string,
    expectedTurnCount?: number
  ): Promise<{ success: boolean; message: string; battle: BattleState }> {
    return this.request('POST', '/api/game/battle/flee', {
      anonymousId: this.anonymousId,
      battleId,
      expectedTurnCount,
    });
  }

  async swapFamiliar(
    battleId: string,
    newFamiliarId: string,
    expectedTurnCount?: number
  ): Promise<{ battle: BattleState }> {
    return this.request('POST', '/api/game/battle/swap', {
      anonymousId: this.anonymousId,
      battleId,
      newFamiliarId,
      expectedTurnCount,
    });
  }

  async getOwnedFamiliars(): Promise<string[]> {
    const token = this.getToken();
    if (!token) return [];

    try {
      const result = await this.request<{ familiars: string[]; synced: boolean }>('GET', '/api/game/owned-familiars');
      return result.familiars || [];
    } catch {
      return [];
    }
  }
}

export const gameApiClient = new GameApiClient();
export { GameApiClient };
