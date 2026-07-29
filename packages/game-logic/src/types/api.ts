import type { BattleAction, BattleState } from './battle';
import type { DungeonState } from './exploration';
import type { GameState, Inventory } from './gameState';

export interface LoadStateRequest {
  anonymousId: string;
}

export interface LoadStateResponse {
  state: GameState | null;
}

export interface SaveStateRequest {
  state: GameState;
}

export interface SaveStateResponse {
  success: boolean;
  lastSaved: number;
}

export interface EnterDungeonRequest {
  areaId: string;
  party: string[];
}

export interface EnterDungeonResponse {
  dungeon: DungeonState;
}

export interface ExploreRequest {
  dungeonId: string;
  direction?: string;
}

export interface ExploreResponse {
  room: import('./exploration').Room;
  encounter?: string;
  treasure?: string;
  dungeon: DungeonState;
}

export interface ExitDungeonRequest {
  dungeonId: string;
}

export interface ExitDungeonResponse {
  state: GameState;
}

export interface BattleActionRequest {
  battleId: string;
  action: BattleAction;
}

export interface BattleActionResponse {
  result: import('./battle').BattleTurnResult;
  state: GameState;
}
