import type { Directions } from '@/utils/dungeonEngine';
import type { CharmInstance, CharmRoll } from '@/data/charms';
import type { EliteId } from '@/data/elites';
import type { Inventory } from '@/types/gameState';

export interface Area {
  id: string;
  name: string;
  description: string;
  levelRange: [number, number];
  encounterPool: string[];
  roomCount: number;
  bossId: string;
  bossReward: BossReward;
  bgColor: number;
  baseFamiliar: string;
  unlocks: string | null;
}

export enum RoomType {
  Start,
  Normal,
  Deadend,
  Boss,
  /** Safe room that restores party HP/MP once per run. */
  Rest,
}

/** Chest quality. Dead ends hold rare caches; bosses drop an epic chest. */
export type ChestTier = 'common' | 'rare' | 'epic';

export interface PendingTreasure {
  /**
   * First item in the chest. Kept as the canonical id for old saves and the
   * collect route's item check; `items` still lists the full contents.
   */
  itemId: string;
  looted: boolean;
  tier?: ChestTier;
  /** Every item in the chest. Older saves omit this and hold only itemId. */
  items?: string[];
  currency?: number;
  /** Charm rolled into this chest, shown before Take. */
  charm?: CharmRoll;
}

export interface Room {
  id: string;
  name: string;
  description: string;
  type: RoomType;
  exits: RoomExit[];
  encounterChance: number;
  treasureChance: number;
  treasurePool: TreasureEntry[];
  cleared: boolean;
  /** Rest rooms only: whether this run's one-time heal has been taken. */
  rested?: boolean;
  pendingEncounter?: { enemyId: string; resolved: boolean; level?: number; elite?: EliteId };
  pendingTreasure?: PendingTreasure;
  /**
   * Chest placed at generation (dead-end caches). Known to the player in
   * advance via the minimap; `pendingTreasure` is still created on arrival.
   */
  chest?: ChestTier;
  /** A curio placed at generation. Optional so old saves still load. */
  curio?: { id: string; used: boolean };
}

/** HP/MP actually restored to one party member at a rest shrine. */
export interface RestHealAmount {
  hp: number;
  mp: number;
}

export interface RestHeal {
  healed: Record<string, RestHealAmount>;
}

export interface TreasureEntry {
  itemId: string;
  weight: number;
}

/**
 * Tallies for one dungeon run. Created lazily by `getRunStats` so saves made
 * before run summaries existed keep loading. Every field is additive: the
 * matching route increments the counters as events happen.
 */
export interface RunStats {
  battlesWon: number;
  elitesWon: number;
  roomsExplored: number;
  chestsOpened: number;
  curiosUsed: number;
  xpByFamiliar: Record<string, number>;
  /** Levels gained per familiar during the run (not the final level). */
  levelsByFamiliar: Record<string, number>;
  /** Largest single player damage step, with the action that produced it. */
  bestHit?: { familiarId: string; damage: number; abilityName: string };
  /** Species ids recruited during the run. */
  recruits: string[];
  /** Bond gained per unowned species during the run. */
  bondGains: Record<string, number>;
  /** Display strings, e.g. "White Dog learned Sturdy". */
  learned: string[];
  /** Display strings, e.g. "White Dog unlocked Sturdy". */
  passiveUnlocks: string[];
}

/** Loot shape used by the end-of-run summary. */
export interface RunSummaryLoot {
  currency: number;
  /** One entry per item unit, so the client can group and count. */
  items: string[];
  charms?: number;
}

export interface RunSummary {
  outcome: 'cleared' | 'retreated' | 'defeated';
  areaId: string;
  areaName: string;
  stats: RunStats;
  loot: RunSummaryLoot;
  /** Only set for a defeat: the loot that was discarded. */
  lost?: RunSummaryLoot;
}

export interface RoomExit {
  direction: Directions;
  roomId: string;
  label: string;
}

export interface BossReward {
  currency: number;
  items: string[];
}

export interface DungeonState {
  areaId: string;
  currentRoomId: string;
  party: string[];
  partyHp: Record<string, number>;
  partyMp: Record<string, number>;
  rooms: Record<string, Room>;
  activeIndex?: number;
  seed?: number;
  /** Loot found during this run; banked on exit/victory, lost on defeat. */
  runLoot?: Inventory;
  /** Charms found during this run; banked on exit/victory, lost on defeat. */
  runCharms?: CharmInstance[];
  /** Per-run event tallies; created lazily by `getRunStats`. */
  runStats?: RunStats;
  /** UTC day (YYYY-MM-DD) of a Daily Expedition; absent on normal runs. */
  daily?: string;
  /**
   * Species recruited during this run that may still be swapped into the
   * party once (from the victory screen). Limits the swap to fresh recruits so
   * it cannot be used to cycle owned familiars back in at full HP.
   */
  runRecruits?: string[];
}
