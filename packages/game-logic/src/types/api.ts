import type { BattleAction, BattleState, BattleTurnResult } from '@/types/battle';
import type { Area, ChestTier, DungeonState, RestHeal, Room, RunSummary } from '@/types/exploration';
import type { CharmRoll } from '@/data/charms';
import type { CurioOutcome } from '@/data/curios';
import type { EliteId } from '@/data/elites';
import type { GameState, Inventory } from '@/types/gameState';
import type { RunLootSummary } from '@/utils/runLoot';

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
  /** Ignored when `daily` is true; the server uses the day's expedition area. */
  areaId: string;
  /** Enter the shared UTC-day expedition instead of the requested area. */
  daily?: boolean;
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
  /** Chest tier, when the room's treasure is a chest roll. */
  treasureTier?: ChestTier;
  /** Full chest contents (old saves omit these; treasureItem still works). */
  treasureItems?: string[];
  treasureCurrency?: number;
  /** Present only on the first visit to a rest shrine. */
  rest?: RestHeal;
  /** Elite affix on this encounter, if any. */
  elite?: EliteId;
  /** Prefixed display name of the elite ("Armored White Dog"). */
  eliteName?: string;
}

export interface CollectTreasureRequest {
  anonymousId: string;
  roomId: string;
  itemId: string;
}

export interface CollectTreasureResponse {
  success: boolean;
  inventory: Inventory;
  runLoot: Inventory;
  /** Charm collected with the chest, if it held one. */
  charm?: CharmRoll;
}

export interface CurioRequest {
  anonymousId: string;
  roomId: string;
  optionId: string;
}

/** What a curio choice changed, for the client's result list and HUD. */
export interface CurioGains {
  healed?: Record<string, { hp: number; mp: number }>;
  /** HP lost per familiar id (hurt outcomes never drop a member below 1). */
  hurt?: Record<string, number>;
  items?: string[];
  currency?: number;
  /** Charm found inside a chest outcome. */
  charms?: CharmRoll[];
  xp?: number;
  levels?: {
    familiarId: string;
    name: string;
    level: number;
    levelsGained: number;
    /** XP actually awarded to this familiar in this outcome. */
    xp?: number;
    /** This familiar's award was boosted by the catch-up multiplier. */
    catchUp?: boolean;
  }[];
  learned?: { familiarId: string; familiarName: string; abilityId: string; abilityName: string }[];
  passiveUnlocks?: { familiarId: string; familiarName: string; passiveId: string; passiveName: string; tier: number }[];
  bond?: { speciesId: string; name: string; bond: number; needed: number };
}

export interface CurioResponse {
  success: boolean;
  text: string;
  outcome: CurioOutcome;
  gains: CurioGains;
  runLoot: Inventory;
  /** Post-payment bank inventory, so item/coin costs stay in sync client-side. */
  inventory: Inventory;
  /** Sanitized dungeon copy (seed removed) so party HP/MP update without a reload. */
  dungeon: Omit<DungeonState, 'seed'>;
  /** Present when the outcome spawned an ambush encounter in this room. */
  encounter?: boolean;
  enemy?: string;
}

export interface UseFieldItemRequest {
  anonymousId: string;
  itemId: string;
  /** Target for heal items; ignored by revive_party items. */
  familiarId?: string;
}

export interface UseFieldItemResponse {
  success: boolean;
  partyHp: Record<string, number>;
  partyMp: Record<string, number>;
  runLoot: Inventory;
  inventory: Inventory;
  /** Human-readable result, e.g. "White Dog recovers 50 HP". */
  text: string;
}

export interface ExitDungeonRequest {
  anonymousId: string;
}

export interface ExitDungeonResponse {
  success: boolean;
  /** What leaving the run banked, including charms and any auto-salvage. */
  banked?: RunLootSummary;
  /** End-of-run summary; also stored on the state as `lastRunSummary`. */
  runSummary?: RunSummary;
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
  /** Set when this turn ended the run (boss clear or defeat). */
  runSummary?: RunSummary;
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

export interface BootstrapResponse {
  state: GameState;
  battle: BattleState | null;
}

export interface AbandonBattleRequest {
  anonymousId: string;
  battleId: string;
  expectedTurnCount: number;
}

export interface AbandonBattleResponse {
  success: boolean;
  state: GameState;
  forfeited: boolean;
}

export interface AckRunSummaryRequest {
  anonymousId: string;
}

export interface AckRunSummaryResponse {
  success: boolean;
}
