import type { BattleAction, BattleState, BattleTurnResult } from '@/types/battle';
import type { Area, DungeonState, Room } from '@/types/exploration';
import type { GameState, Inventory } from '@/types/gameState';

export interface LoadStateRequest {
  anonymousId: string;
}

export interface LoadStateResponse {
  state: GameState;
}

export interface SetPartyRequest {
  anonymousId: string;
  activeParty: string[];
}

export interface SetPartyResponse {
  success: boolean;
  state: GameState;
}

export interface EnterDungeonRequest {
  anonymousId: string;
  areaId: string;
}

export interface EnterDungeonResponse {
  dungeon: DungeonState;
  area: Area;
}

export interface ExploreRequest {
  anonymousId: string;
  roomId: string;
}

export interface ExploreResponse {
  room: Room;
  encounter: boolean;
  enemy: string | null;
  treasure: boolean;
  treasureItem: string | null;
}

export interface CollectTreasureRequest {
  anonymousId: string;
  roomId: string;
  itemId: string;
}

export interface CollectTreasureResponse {
  success: boolean;
  inventory: Inventory;
}

export interface ExitDungeonRequest {
  anonymousId: string;
}

export interface ExitDungeonResponse {
  success: boolean;
}

export interface StartBattleRequest {
  anonymousId: string;
  playerFamiliarId: string;
}

export interface StartBattleResponse {
  battle: BattleState;
}

export interface BattleActionRequest {
  anonymousId: string;
  battleId: string;
  action: BattleAction;
  expectedTurnCount?: number;
}

export interface BattleActionResponse {
  turnResult: BattleTurnResult;
  state?: GameState;
  turnCount: number;
}

export interface SwapFamiliarRequest {
  anonymousId: string;
  battleId: string;
  newFamiliarId: string;
  expectedTurnCount?: number;
}

export interface SwapFamiliarResponse {
  battle: BattleState;
}

export interface FleeBattleRequest {
  anonymousId: string;
  battleId: string;
  expectedTurnCount?: number;
}

export interface FleeBattleResponse {
  success: boolean;
  message: string;
  battle: BattleState;
}