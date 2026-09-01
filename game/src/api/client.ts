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

  // Guest sessions (no Passport id token in session storage) are still fully
  // persisted by the backend, keyed by a client-generated anonymous id.
  private async request<T>(method: string, path: string, body?: Record<string, unknown>): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const options: RequestInit = {
      method,
      headers: { 'Content-Type': 'application/json' },
    };

    const token = this.getToken();
    if (token) {
      options.headers = {
        ...options.headers,
        Authorization: `Bearer ${token}`,
      };
    }

    if (body) options.body = JSON.stringify(body);

    let res: Response;
    try {
      res = await fetch(url, options);
    } catch (err) {
      throw new Error(`Network error: ${(err as Error).message}`, { cause: err });
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
