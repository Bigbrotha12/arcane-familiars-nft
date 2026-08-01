export type { LoadStateRequest, LoadStateResponse, SaveStateRequest, SaveStateResponse, EnterDungeonRequest, EnterDungeonResponse, ExploreRequest, ExploreResponse, ExitDungeonRequest, ExitDungeonResponse, BattleActionRequest, BattleActionResponse } from '@/types/api';
export { ActionType, Outcome, BattleResult } from '@/types/battle';
export type { BattleFamiliar, StatusEffect, BattleAction, ActionResult, BattleTurnResult, BattleRewards, BattleState } from '@/types/battle';
export { RoomType } from '@/types/exploration';
export type { Area, Room, TreasureEntry, RoomExit, BossReward, DungeonState } from '@/types/exploration';
export type { Inventory, InventoryItem, GameState } from '@/types/gameState';
