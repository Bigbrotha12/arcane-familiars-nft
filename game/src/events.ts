import type {
  ChestTier,
  ItemRarity,
  CharmMod,
  CharmRoll,
  CharmInstance,
  EliteId,
  RunSummary,
} from '@arcane-familiars/game-logic';

export enum GameEvent {
  STATE_UPDATED = 'game:stateUpdated',
  SAVE_GAME = 'game:save',
  SAVE_COMPLETE = 'game:saveComplete',
  EXIT_GAME = 'game:exit',
  BATTLE_STARTED = 'game:battleStarted',
  BATTLE_ENDED = 'game:battleEnded',
  SCENE_CHANGED = 'game:sceneChanged',
  PLAYER_ACTION = 'game:playerAction',
  NAVIGATE_ROOM = 'game:navigateRoom',
  COLLECT_TREASURE = 'game:collectTreasure',
  FLEE_ENCOUNTER = 'game:fleeEncounter',
  START_BATTLE = 'game:startBattle',
  CURIO_CHOICE = 'game:curioChoice', // React → Phaser: pick a curio option
  CURIO_LEAVE = 'game:curioLeave', // React → Phaser: leave the curio / dismiss its result
  OVERLAY_MODE_CHANGED = 'game:overlayModeChanged',
  BATTLE_CONTINUE = 'game:battleContinue', // React → Phaser: user dismissed outcome, continue
  PARTY_SWAP_REQUESTED = 'game:partySwapRequested', // React → Phaser: promote familiarId to party lead (out of battle)
  FIELD_USE_ITEM = 'game:fieldUseItem', // React → Phaser: use a field-usable item on a party familiar
  LEAVE_DUNGEON = 'game:leaveDungeon', // React → Phaser: leave the dungeon from the entrance
  TOGGLE_MUTE = 'game:toggleMute', // React → Phaser: toggle music/SFX mute
  UI_SFX = 'game:uiSfx', // React → Phaser: play a UI sound
  SET_BATTLE_SPEED = 'game:setBattleSpeed', // React → Phaser: change battle turn playback speed
  OPEN_CHARMS = 'game:openCharms', // Phaser → React: open the charm management modal
  CHARM_EQUIP = 'game:charmEquip', // React → Phaser: equip/unequip a charm
  CHARM_SALVAGE = 'game:charmSalvage', // React → Phaser: salvage an unequipped charm
  SHOW_RUN_SUMMARY = 'game:showRunSummary', // Phaser → React: open the end-of-run summary
  RUN_SUMMARY_ACK = 'game:runSummaryAck', // React → Phaser: summary dismissed, clear it server-side
  WORLD_ACTION = 'game:worldAction', // React → Phaser: world-map dock action (shop/charms/daily)
}

/** Secondary actions available from the world-map dock. */
export type WorldAction = 'shop' | 'charms' | 'daily';

export interface WorldActionPayload {
  action: WorldAction;
}

/** Today's Daily Expedition area and whether its bonus was already claimed. */
export interface WorldMapDaily {
  areaName: string;
  cleared: boolean;
}

/** A charm worn by a roster familiar, with everything `applyCharm` needs. */
export interface RosterCharm {
  name: string;
  modsLabel: string;
  mods: CharmMod[];
}

/** One owned familiar, for the read-only Team modal on the world map. */
export interface RosterEntry {
  id: string;
  level: number;
  xp: number;
  /** True when the species is in the current `activeParty`. */
  inParty: boolean;
  charm?: RosterCharm;
}

export type BattleSpeed = 'slow' | 'medium' | 'fast';

export interface BattleSpeedPayload {
  speed: BattleSpeed;
}

export type UiSfxName = 'click' | 'confirm' | 'cancel' | 'error' | 'hover';

export interface StatusEffectView {
  id: string;
  icon: string;
  duration?: number;
}

export interface PassiveView {
  id: string;
  name: string;
  tier: number;
  description: string;
}

export interface FamiliarState {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  attack: number;
  defense: number;
  speed: number;
  arcane: number;
  affinity: string;
  level?: number;
  /** Boss charge telegraph: true while the combatant is gathering power. */
  charged?: boolean;
  /** Elite affix on this combatant, if any. */
  elite?: EliteId;
  /** Boss entered phase two (set once at or below 50% HP). */
  phaseTwo?: boolean;
  statusEffects?: StatusEffectView[];
}

export interface GameStateSnapshot {
  familiars: FamiliarState[];
  currency: number;
  battleCount: number;
  wins: number;
  currentScene: string;
  areaName?: string;
  roomName?: string;
  enemy?: FamiliarState;
  phase?: BattlePhase;
  battleLog?: string[];
  abilities?: AbilityOption[];
  items?: ItemOption[];
  /** Field-usable items in run loot + bank, for the exploration item panel. */
  fieldItems?: FieldItemSnapshot[];
  canSwap?: boolean;
  party?: FamiliarState[];
  activeId?: string;
  isBoss?: boolean;
  roomType?: string;
  roomDescription?: string;
  roomLog?: string[];
  dungeon?: DungeonSnapshot;
  /** Enemy identity/level for the exploration encounter overlay, when one is pending. */
  pendingEncounter?: EncounterSnapshot;
  /** Unlooted chest contents for the treasure overlay. */
  treasure?: TreasureSnapshot;
  /** An unused curio in the current room, for the curio overlay. */
  curio?: CurioSnapshot;
  /** Outcome of the last curio choice, shown until Continue. */
  curioResult?: CurioResultSnapshot;
  encounterActive?: boolean;
  treasureActive?: boolean;
  bossRoom?: boolean;
  runLootCurrency?: number;
  runLootItemCount?: number;
  /** Per-species recruit bond built by wins against unowned species. */
  recruitBond?: Record<string, number>;
  /** Species ids the player owns, for exploration recruitability hints. */
  ownedFamiliars?: string[];
  /** Party-wide passives active in this battle. */
  passives?: PassiveView[];
  /** True while exploring today's Daily Expedition. */
  daily?: boolean;
  /** World map only: today's Daily Expedition area and whether it was cleared. */
  worldDaily?: WorldMapDaily;
  /** Owned familiars with level/XP/party/charm, for the world-map Team modal. */
  roster?: RosterEntry[];
  /** Set on the single snapshot emitted when a KO relay swaps in a backup. */
  forcedSwap?: boolean;
  /** Outcome and rewards while the battle outcome screen is open. */
  battleOutcome?: BattleEndedPayload;
  /** Set only for a brand-new player's guided first battle. */
  guided?: boolean;
  /** Identity of the battle on screen, for session-scoped guided coaching. */
  battleId?: string;
  /** Turns resolved in the current battle (0 on the opening snapshot). */
  turnCount?: number;
}

/** The elite affix on a pending encounter, shown before the fight. */
export interface EliteSnapshot {
  id: EliteId;
  /** Prefixed display name ("Armored White Dog"). */
  name: string;
  /** What the affix does ("Defense ×1.5"). */
  description: string;
}

/** An item usable while exploring, with its combined run-loot + bank count. */
export interface FieldItemSnapshot {
  id: string;
  name: string;
  description: string;
  /** Icon file under /assets/sprites/items/ (without extension). */
  icon?: string;
  quantity: number;
}

/** React → Phaser: use a field item, targeting a familiar for heals. */
export interface FieldUseItemPayload {
  itemId: string;
  familiarId?: string;
}

/** What the explore response knows about a pending encounter, for the HUD. */
export interface EncounterSnapshot {
  enemyId: string;
  level: number;
  isBoss: boolean;
  elite?: EliteSnapshot;
}

/** One item shown in a treasure chest before the player takes it. */
export interface TreasureItemSnapshot {
  id: string;
  name: string;
  description: string;
  /** Icon file under /assets/sprites/items/ (without extension). */
  icon?: string;
  rarity: ItemRarity;
}

/** Unlooted chest contents for the treasure overlay. */
export interface TreasureSnapshot {
  tier: ChestTier;
  items: TreasureItemSnapshot[];
  currency: number;
  /** Charm rolled into the chest, shown before Take. */
  charm?: CharmRoll;
}

/** One choice on a curio; `available=false` explains what it would cost. */
export interface CurioOptionSnapshot {
  id: string;
  label: string;
  available: boolean;
  reason?: string;
}

/** A curio in the current room, before use. */
export interface CurioSnapshot {
  id: string;
  name: string;
  description: string;
  options: CurioOptionSnapshot[];
}

/** What a curio choice produced, for the result panel. */
export interface CurioResultSnapshot {
  text: string;
  gains: string[];
  /** Charms found in a chest outcome, rendered with rarity colour. */
  charms?: CharmRoll[];
}

export interface CurioChoicePayload {
  optionId: string;
}

export interface SaveResult {
  success: boolean;
  error?: string;
}

export type BattleActionName = 'attack' | 'defend' | 'ability' | 'item' | 'swap' | 'run';

export type ExploreDirection =
  'north' | 'south' | 'east' | 'west' | 'northeast' | 'northwest' | 'southeast' | 'southwest';

export type OverlayMode = 'battle' | 'exploration' | 'none';

export type BattlePhase = 'connecting' | 'menu' | 'acting' | 'outcome';

export interface PlayerActionPayload {
  action: BattleActionName;
  payload?: {
    abilityId?: string;
    itemId?: string;
    targetId?: string;
  };
}

export interface NavigateRoomPayload {
  roomId: string;
}

export interface PartySwapPayload {
  familiarId: string;
}

export interface RecruitSwap {
  inId: string;
  outId: string;
}

export interface BattleContinuePayload {
  recruitSwap?: RecruitSwap;
}

export interface OverlayModePayload {
  mode: OverlayMode;
  enabled: boolean;
}

export interface BattleStartedPayload {
  enemyId: string;
  enemyName: string;
  enemyHp: number;
  enemyMaxHp: number;
  isBoss: boolean;
  playerFamiliars: FamiliarState[];
}

export interface BattleEndedPayload {
  outcome: 'victory' | 'defeat' | 'fled';
  rewards?: {
    currency: number;
    items: string[];
    /** Epic chest from a first boss clear. */
    bossChest?: { items: string[]; currency: number; charm?: CharmRoll };
    /** Rare chest from an elite victory. */
    eliteChest?: { items: string[]; currency: number; charm?: CharmRoll };
    /** First Daily Expedition clear of the day. */
    dailyBonus?: { currency: number; items: string[]; charm?: CharmRoll };
    xp?: number;
    /** The active familiar's XP was boosted by the catch-up multiplier. */
    xpCatchUp?: boolean;
    levelUp?: number;
    /** Display name of the familiar that landed the winning blow. */
    activeFamiliarName?: string;
    /** XP share for the party member that did not land the winning blow. */
    benchXp?: number;
    /** The bench party member's XP was boosted by the catch-up multiplier. */
    benchXpCatchUp?: boolean;
    benchFamiliarId?: string;
    /** Display name of that bench party member. */
    benchFamiliarName?: string;
    benchLevelUp?: number;
    recruitedFamiliar?: string;
    recruitedName?: string;
    recruitedLevel?: number;
    recruitProgress?: {
      familiarId: string;
      name: string;
      bond: number;
      needed: number;
    };
    /** Abilities unlocked by level-ups earned in this battle. */
    learned?: {
      familiarId: string;
      familiarName: string;
      abilityId: string;
      abilityName: string;
    }[];
    /** Passive tiers unlocked by level-ups earned in this battle. */
    passiveUnlocks?: {
      familiarId: string;
      familiarName: string;
      passiveId: string;
      passiveName: string;
      tier: number;
    }[];
  };
  /** True when the victory happened inside a dungeon run. */
  inDungeon?: boolean;
  lostLoot?: {
    currency: number;
    items: { itemId: string; name: string; quantity: number }[];
  };
}

export interface AbilityOption {
  id: string;
  name: string;
  description: string;
  mpCost: number;
  usable: boolean;
  cooldown?: number;
  disabledReason?: string;
}

export interface ItemOption {
  id: string;
  name: string;
  description: string;
  quantity: number;
  usable: boolean;
  iconUrl?: string;
}

export interface DungeonRoomSnapshot {
  id: string;
  name: string;
  type: string;
  cleared: boolean;
  exits: { direction: string; roomId: string; label: string }[];
  /** Chest placed at generation (dead ends); visible before it is visited. */
  chest?: ChestTier;
  /** The room holds unlooted treasure the player has discovered. */
  hasTreasure?: boolean;
  /** The room holds an unused curio the player has discovered. */
  hasCurio?: boolean;
  /** Unresolved elite encounter in this room, for the minimap marker. */
  elite?: EliteId;
}

export interface DungeonSnapshot {
  areaId: string;
  currentRoomId: string;
  currentRoomIndex: number;
  roomCount: number;
  visitedRoomIds: string[];
  rooms: DungeonRoomSnapshot[];
}

/** A familiar the player owns, for the Charms screen's equip picker. */
export interface CharmFamiliar {
  id: string;
  name: string;
  level: number;
}

/** Payload for opening the Charms modal. */
export interface CharmsPayload {
  charms: CharmInstance[];
  familiars: CharmFamiliar[];
}

/** React → Phaser: equip a charm, or unequip with familiarId null. */
export interface CharmEquipPayload {
  charmUid: string;
  familiarId: string | null;
}

/** React → Phaser: salvage an unequipped charm. */
export interface CharmSalvagePayload {
  charmUid: string;
}

/** Phaser → React: the run's summary, plus final levels for the Lv → Lv line. */
export interface RunSummaryPayload {
  summary: RunSummary;
  familiarLevels?: Record<string, number>;
}
