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

const AUTH_EXPIRED_EVENT = 'af:auth-expired';

function csrfToken(): string | null {
  if (typeof window === 'undefined') return null;
  return (window as unknown as { __arcaneCsrfToken?: string }).__arcaneCsrfToken ?? null;
}

let csrfCheckAttempted = false;

function setCsrfToken(value: string | null): void {
  if (typeof window === 'undefined') return;
  (window as unknown as { __arcaneCsrfToken?: string }).__arcaneCsrfToken = value ?? undefined;
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

  private async ensureCsrfToken(): Promise<void> {
    if (csrfToken() || csrfCheckAttempted) return;
    csrfCheckAttempted = true;
    try {
      const res = await fetch(`${this.baseUrl}/api/auth/me`, { credentials: 'include' });
      if (!res.ok) return;
      const data = (await res.json()) as { csrfToken?: string | null };
      setCsrfToken(data.csrfToken ?? null);
    } catch {
      // Guest play needs no CSRF token.
    }
  }

  private async request<T>(method: string, path: string, body?: Record<string, unknown>): Promise<T> {
    if (method !== 'GET' && method !== 'HEAD') await this.ensureCsrfToken();
    const url = `${this.baseUrl}${path}`;
    const serialized = body ? JSON.stringify(body) : undefined;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const csrf = csrfToken();
    if (csrf) headers['X-CSRF-Token'] = csrf;

    let res: Response;
    try {
      res = await fetch(url, {
        method,
        credentials: 'include',
        headers,
        body: serialized,
      });
    } catch (err) {
      throw new Error(`Network error: ${(err as Error).message}`, { cause: err });
    }

    if (res.status === 401) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT));
        window.dispatchEvent(new CustomEvent('af:auth-changed'));
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

  /** Drop the guest bearer id after adoption/logout so another account on this browser cannot inherit it. */
  rotateGuestIdentity(): string {
    this.anonymousId = randomId();
    localStorage.setItem('af_anonymous_id', this.anonymousId);
    return this.anonymousId;
  }

  async loadGameState(): Promise<{ state: GameState }> {
    return this.request('POST', '/api/game/state/load', { anonymousId: this.anonymousId });
  }

  async bootstrap(): Promise<{ state: GameState; battle: BattleState | null }> {
    return this.request('POST', '/api/game/bootstrap', { anonymousId: this.anonymousId });
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

  async collectTreasure(
    roomId: string,
    itemId: string
  ): Promise<{ success: boolean; inventory: Inventory; runLoot: Inventory }> {
    return this.request('POST', '/api/game/dungeon/collect-treasure', {
      anonymousId: this.anonymousId,
      roomId,
      itemId,
    });
  }

  async exitDungeon(): Promise<{ success: boolean }> {
    return this.request('POST', '/api/game/dungeon/exit', { anonymousId: this.anonymousId });
  }

  async buyItem(itemId: string): Promise<{ success: boolean; state: GameState }> {
    return this.request('POST', '/api/game/shop/buy', { anonymousId: this.anonymousId, itemId });
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

  async abandonBattle(
    battleId: string,
    expectedTurnCount: number
  ): Promise<{ success: boolean; state: GameState; forfeited: boolean; lostLoot?: Inventory }> {
    return this.request('POST', '/api/game/battle/abandon', {
      anonymousId: this.anonymousId,
      battleId,
      expectedTurnCount,
    });
  }
}

export const gameApiClient = new GameApiClient();
export { GameApiClient };
