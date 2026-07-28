import type { GameState, BattleState, BattleAction, ActionResult, DungeonState, Room, Area } from '@arcane-familiars/game-logic';

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

    const res = await fetch(url, options);
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

  async exploreRoom(roomId: string): Promise<{ room: Room; encounter: boolean; enemy: string | null; treasure: string | null }> {
    return this.request('POST', '/api/game/dungeon/explore', { anonymousId: this.anonymousId, roomId });
  }

  async exitDungeon(): Promise<{ success: boolean }> {
    return this.request('POST', '/api/game/dungeon/exit', { anonymousId: this.anonymousId });
  }

  async startBattle(enemyId: string, isBoss?: boolean): Promise<{ battle: BattleState }> {
    return this.request('POST', '/api/game/battle/start', { anonymousId: this.anonymousId, enemyId, isBoss });
  }

  async battleAction(battleId: string, action: BattleAction): Promise<{ battle: BattleState; playerResult: ActionResult; enemyResult: ActionResult; outcome: string }> {
    return this.request('POST', '/api/game/battle/action', { anonymousId: this.anonymousId, battleId, action });
  }

  async fleeBattle(battleId: string): Promise<{ battle: BattleState; outcome: string }> {
    return this.request('POST', '/api/game/battle/flee', { anonymousId: this.anonymousId, battleId });
  }
}

export const gameApiClient = new GameApiClient();
export { GameApiClient };
