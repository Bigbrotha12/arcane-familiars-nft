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

export interface Room {
  id: string;
  name: string;
  description: string;
  type: 'start' | 'normal' | 'deadend' | 'boss';
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
  direction: string;
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
  inventory: import('./gameState').Inventory;
  rooms: Record<string, Room>;
}
