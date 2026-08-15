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

  private async request<T>(method: string, path: string, body?: any): Promise<T> {
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
      throw new Error(err.error || `Request failed: ${res.status}`);
    }
    return res.json() as Promise<T>;
  }

  async loadGameState(): Promise<{ state: GameState }> {
    return this.request('POST', '/api/game/state/load', { anonymousId: this.anonymousId });
  }

  async saveGameState(state: GameState): Promise<{ success: boolean }> {
    return this.request('POST', '/api/game/state/save', { anonymousId: this.anonymousId, state });
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

  async startBattle(playerFamiliarId: string, enemyFamiliarId: string): Promise<{ battle: BattleState }> {
    return this.request('POST', '/api/game/battle/start', { anonymousId: this.anonymousId, playerFamiliarId, enemyFamiliarId });
  }

  async battleAction(battleId: string, action: BattleAction): Promise<{ turnResult: BattleTurnResult; state?: GameState; turnCount: number }> {
    return this.request('POST', '/api/game/battle/action', { anonymousId: this.anonymousId, battleId, action });
  }

  async fleeBattle(battleId: string): Promise<{ success: boolean; message: string; battle: BattleState }> {
    return this.request('POST', '/api/game/battle/flee', { anonymousId: this.anonymousId, battleId });
  }

  async swapFamiliar(battleId: string, newFamiliarId: string): Promise<{ battle: BattleState }> {
    return this.request('POST', '/api/game/battle/swap', { anonymousId: this.anonymousId, battleId, newFamiliarId });
  }
}

export const gameApiClient = new GameApiClient();
export { GameApiClient };
