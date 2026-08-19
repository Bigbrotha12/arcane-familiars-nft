import type { GameState, BattleState, BattleAction, BattleTurnResult, DungeonState, Room, Area, Inventory } from '@arcane-familiars/game-logic';

class GameApiClient {
  private baseUrl: string;
  private anonymousId: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || import.meta.env.VITE_BACKEND_URL || 'http://localhost:8787';
    const stored = localStorage.getItem('af_anonymous_id');
    if (stored) {
      this.anonymousId = stored;
    } else {
      this.anonymousId = crypto.randomUUID();
      localStorage.setItem('af_anonymous_id', this.anonymousId);
    }
  }

  private async request<T>(method: string, path: string, body?: Record<string, unknown>): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const options: RequestInit = {
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (body) options.body = JSON.stringify(body);

    let res: Response;
    try {
      res = await fetch(url, options);
    } catch (err) {
      throw new Error(`Network error: ${(err as Error).message}`);
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

  async enterDungeon(areaId: string): Promise<{ dungeon: DungeonState; area: Area }> {
    return this.request('POST', '/api/game/dungeon/enter', { anonymousId: this.anonymousId, areaId });
  }

  async exploreRoom(roomId: string): Promise<{ room: Room; encounter: boolean; enemy: string | null; treasure: boolean; treasureItem: string | null }> {
    return this.request('POST', '/api/game/dungeon/explore', { anonymousId: this.anonymousId, roomId });
  }

  async collectTreasure(roomId: string, itemId: string): Promise<{ success: boolean; inventory: Inventory }> {
    return this.request('POST', '/api/game/dungeon/collect-treasure', { anonymousId: this.anonymousId, roomId, itemId });
  }

  async exitDungeon(): Promise<{ success: boolean }> {
    return this.request('POST', '/api/game/dungeon/exit', { anonymousId: this.anonymousId });
  }

  async startBattle(playerFamiliarId: string): Promise<{ battle: BattleState }> {
    return this.request('POST', '/api/game/battle/start', { anonymousId: this.anonymousId, playerFamiliarId });
  }

  async battleAction(battleId: string, action: BattleAction, expectedTurnCount?: number): Promise<{ turnResult: BattleTurnResult; state?: GameState; turnCount: number }> {
    return this.request('POST', '/api/game/battle/action', { anonymousId: this.anonymousId, battleId, action, expectedTurnCount });
  }

  async fleeBattle(battleId: string, expectedTurnCount?: number): Promise<{ success: boolean; message: string; battle: BattleState }> {
    return this.request('POST', '/api/game/battle/flee', { anonymousId: this.anonymousId, battleId, expectedTurnCount });
  }

  async swapFamiliar(battleId: string, newFamiliarId: string, expectedTurnCount?: number): Promise<{ battle: BattleState }> {
    return this.request('POST', '/api/game/battle/swap', { anonymousId: this.anonymousId, battleId, newFamiliarId, expectedTurnCount });
  }
}

export const gameApiClient = new GameApiClient();
export { GameApiClient };
