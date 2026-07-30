export enum GameEvent {
  STATE_UPDATED    = 'game:stateUpdated',
  SAVE_GAME        = 'game:save',
  SAVE_COMPLETE    = 'game:saveComplete',
  EXIT_GAME        = 'game:exit',
  BATTLE_STARTED   = 'game:battleStarted',
  BATTLE_ENDED     = 'game:battleEnded',
  SCENE_CHANGED    = 'game:sceneChanged',
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
}

export interface SaveResult {
  success: boolean
  error?: string
}
