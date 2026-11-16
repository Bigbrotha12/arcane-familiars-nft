import type { Directions } from '@/utils/dungeonEngine';
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
  pendingEncounter?: { enemyId: string; resolved: boolean; level?: number };
  pendingTreasure?: { itemId: string; looted: boolean };
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
  /**
   * Species recruited during this run that may still be swapped into the
   * party once (from the victory screen). Limits the swap to fresh recruits so
   * it cannot be used to cycle owned familiars back in at full HP.
   */
  runRecruits?: string[];
}
