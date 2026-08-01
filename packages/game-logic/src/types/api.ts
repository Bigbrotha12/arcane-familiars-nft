import type { BattleAction, BattleTurnResult } from '@/types/battle';
import type { Directions } from '@/utils/dungeonEngine';
import type { DungeonState, Room } from '@/types/exploration';
import type { GameState } from '@/types/gameState';

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
  direction?: Directions;
}

export interface ExploreResponse {
  room: Room;
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
  result: BattleTurnResult;
  state: GameState;
}
