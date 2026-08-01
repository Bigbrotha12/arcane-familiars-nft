import type { Inventory } from '@/types/gameState';
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
  inventory: Inventory;
  rooms: Record<string, Room>;
}
