import type { Directions } from '@/utils/dungeonEngine';

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
  Boss
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
  pendingEncounter?: { enemyId: string; resolved: boolean; level?: number };
  pendingTreasure?: { itemId: string; looted: boolean };
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
}
