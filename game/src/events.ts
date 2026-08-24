export enum GameEvent {
  STATE_UPDATED    = 'game:stateUpdated',
  SAVE_GAME        = 'game:save',
  SAVE_COMPLETE    = 'game:saveComplete',
  EXIT_GAME        = 'game:exit',
  BATTLE_STARTED   = 'game:battleStarted',
  BATTLE_ENDED     = 'game:battleEnded',
  SCENE_CHANGED    = 'game:sceneChanged',
  PLAYER_ACTION        = 'game:playerAction',
  NAVIGATE_ROOM        = 'game:navigateRoom',
  COLLECT_TREASURE     = 'game:collectTreasure',
  FLEE_ENCOUNTER       = 'game:fleeEncounter',
  START_BATTLE         = 'game:startBattle',
  OVERLAY_MODE_CHANGED = 'game:overlayModeChanged',
  BATTLE_CONTINUE     = 'game:battleContinue',     // React → Phaser: user dismissed outcome, continue
}

export interface FamiliarState {
  id: string
  name: string
  hp: number
  maxHp: number
  mp: number
  maxMp: number
  attack: number
  defense: number
  speed: number
  arcane: number
  affinity: string
}

export interface GameStateSnapshot {
  familiars: FamiliarState[]
  currency: number
  battleCount: number
  wins: number
  currentScene: string
  areaName?: string
  roomName?: string
  enemy?: FamiliarState
  phase?: BattlePhase
  battleLog?: string[]
  abilities?: AbilityOption[]
  items?: ItemOption[]
  canSwap?: boolean
  party?: FamiliarState[]
  isBoss?: boolean
  roomType?: string
  roomDescription?: string
  roomLog?: string[]
  dungeon?: DungeonSnapshot
  encounterActive?: boolean
  treasureActive?: boolean
  bossRoom?: boolean
}

export interface SaveResult {
  success: boolean
  error?: string
}

export type BattleActionName = 'attack' | 'defend' | 'ability' | 'item' | 'swap' | 'run'

export type ExploreDirection = 'north' | 'south' | 'east' | 'west' | 'northeast' | 'northwest' | 'southeast' | 'southwest'

export type OverlayMode = 'battle' | 'exploration' | 'none'

export type BattlePhase =
  | 'connecting'
  | 'menu'
  | 'acting'
  | 'outcome'

export interface PlayerActionPayload {
  action: BattleActionName
  payload?: {
    abilityId?: string
    itemId?: string
    targetId?: string
  }
}

export interface NavigateRoomPayload {
  roomId: string
}

export interface OverlayModePayload {
  mode: OverlayMode
  enabled: boolean
}

export interface BattleStartedPayload {
  enemyId: string
  enemyName: string
  enemyHp: number
  enemyMaxHp: number
  isBoss: boolean
  playerFamiliars: FamiliarState[]
}

export interface BattleEndedPayload {
  outcome: 'victory' | 'defeat' | 'fled'
  rewards?: {
    currency: number
    items: string[]
  }
}

export interface AbilityOption {
  id: string
  name: string
  description: string
  mpCost: number
  usable: boolean
}

export interface ItemOption {
  id: string
  name: string
  description: string
  quantity: number
  usable: boolean
  iconUrl?: string
}

export interface DungeonRoomSnapshot {
  id: string
  name: string
  type: string
  cleared: boolean
  exits: { direction: string; roomId: string; label: string }[]
}

export interface DungeonSnapshot {
  areaId: string
  currentRoomId: string
  currentRoomIndex: number
  roomCount: number
  visitedRoomIds: string[]
  rooms: DungeonRoomSnapshot[]
}
