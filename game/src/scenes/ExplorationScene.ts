import Phaser from 'phaser';
import type { CurioResponse, DungeonState, Area, Room, RestHeal, EliteId } from '@arcane-familiars/game-logic';
import {
  AREAS,
  CURIOS,
  ELITES,
  eliteName,
  RoomType,
  getFamiliar,
  getItem,
  describeItem,
  itemRarity,
  getRunLoot,
  passiveTierRoman,
  Directions,
  charmName,
} from '@arcane-familiars/game-logic';
import { gameApiClient } from '../api/client';
import { ExplorationUI, roomBackgroundKey } from '../ui/ExplorationUI';
import { Layout } from '../ui/layout';
import { gameEventBus } from '../event-bus';
import { GameEvent } from '../events';
import { SCENE_KEYS } from '../constants/scenes';
import { toFamiliarStateFromData, sortRoomIds } from '../utils/familiarState';
import type {
  GameStateSnapshot,
  FamiliarState,
  NavigateRoomPayload,
  PartySwapPayload,
  RecruitSwap,
  DungeonRoomSnapshot,
  EncounterSnapshot,
  CurioChoicePayload,
  CurioResultSnapshot,
} from '../events';
import type { GameState } from '@arcane-familiars/game-logic';
import { audioManager } from '../audio/manager';
import { fadeIn, fadeToScene } from '../ui/transitions';

interface ExplorationSceneData {
  areaId: string;
  /** True when this run is today's shared Daily Expedition. */
  daily?: boolean;
  lastBattleOutcome?: 'victory' | 'defeat' | 'fled';
  pendingTreasureItemId?: string | null;
  recruitSwap?: RecruitSwap;
  activeIndex?: number;
  enemiesDefeated?: number;
  roomsExplored?: number;
}

export class ExplorationScene extends Phaser.Scene {
  private readonly ENCOUNTER_DELAY_MS = 300;
  private readonly TREASURE_DELAY_MS = 300;
  private readonly EXITS_DELAY_MS = 200;
  private gameApi = gameApiClient;
  private explorationUI!: ExplorationUI;
  private dungeon: DungeonState | null = null;
  private fullGameState: GameState | null = null;
  private area: Area | null = null;
  private areaId!: string;
  private daily = false;
  private layout!: Layout;
  private isProcessing = false;
  private isSwapping = false;
  private visitedRoomIds: Set<string> = new Set();
  private currentRoomIndex = 0;
  private encounterActive = false;
  private treasureActive = false;
  private bossActive = false;
  private pendingEnemyId: string | null = null;
  private pendingTreasureItemId: string | null = null;
  private pendingRecruitSwap: RecruitSwap | null = null;
  private enemiesDefeated = 0;
  private lastBattleOutcome?: 'victory' | 'defeat' | 'fled';
  private resumeActiveIndex?: number;
  private curioResult: CurioResultSnapshot | null = null;
  private dismissedCurios: Set<string> = new Set();
  private timers: Phaser.Time.TimerEvent[] = [];

  constructor() {
    super({ key: SCENE_KEYS.EXPLORATION });
  }

  init(data: ExplorationSceneData): void {
    this.areaId = data.areaId;
    this.daily = data.daily === true;
    this.isProcessing = false;
    this.isSwapping = false;
    this.dungeon = null;
    this.area = null;
    this.visitedRoomIds = new Set();
    this.currentRoomIndex = 0;
    this.encounterActive = false;
    this.treasureActive = false;
    this.bossActive = false;
    this.pendingEnemyId = null;
    this.pendingTreasureItemId = data.pendingTreasureItemId ?? null;
    this.pendingRecruitSwap = data.recruitSwap ?? null;
    this.lastBattleOutcome = data.lastBattleOutcome;
    this.enemiesDefeated =
      data.lastBattleOutcome === 'victory' ? (data.enemiesDefeated ?? 0) + 1 : (data.enemiesDefeated ?? 0);
    this.resumeActiveIndex = data.activeIndex;
    this.curioResult = null;
    this.dismissedCurios = new Set();
  }

  preload(): void {
    audioManager.preload(this, {
      music: ['exploration', 'dungeon'],
      ambience: ['forest', 'cave'],
      sfx: ['door', 'footstep', 'encounter', 'loot', 'flee', 'heal', 'ui_confirm', 'ui_cancel', 'ui_error'],
    });
    const roomAreas: Record<string, string> = {
      verdantMeadow: 'verdant-meadow',
      crystalCaves: 'crystal-caves',
      shadowForest: 'shadow-forest',
      emberHollow: 'ember-hollow',
      frostpeakSummit: 'frostpeak-summit',
      sunkenArchive: 'sunken-archive',
    };
    const dir = roomAreas[this.areaId];
    if (!dir) return;
    for (let n = 1; n <= 3; n++) {
      this.load.image(`room_${this.areaId}_${n}`, `/assets/rooms/${dir}/room-0${n}.png`);
    }
  }

  /** Texture key of the current room's art; must match ExplorationUI.showRoomInfo. */
  private roomBackgroundKey(): string {
    return roomBackgroundKey(this.areaId, this.currentRoomIndex);
  }

  async create(): Promise<void> {
    this.layout = new Layout(this);

    const area = AREAS[this.areaId];
    if (!area) {
      this.add
        .text(this.layout.x(400), this.layout.y(300), `Unknown area: ${this.areaId}`, {
          fontSize: this.layout.font(16),
          fontFamily: 'DM Sans',
          color: '#EF4444',
        })
        .setOrigin(0.5);
      return;
    }

    this.area = area;
    this.syncAreaAudio();
    this.explorationUI = new ExplorationUI(this);
    this.explorationUI.init(area);
    fadeIn(this);
    // Scenes are restarted constantly; drop any listener from a previous run
    // or every shutdown would fire onShutdown once per past restart.
    this.events.off('shutdown', this.onShutdown, this);
    this.events.on('shutdown', this.onShutdown, this);

    // Wire EventBus for save/exit
    gameEventBus.on(GameEvent.SAVE_GAME, this.handleSave);
    gameEventBus.on(GameEvent.EXIT_GAME, this.handleExit);
    gameEventBus.on(GameEvent.NAVIGATE_ROOM, this.handleNavigateRoom);
    gameEventBus.on(GameEvent.COLLECT_TREASURE, this.handleCollectTreasure);
    gameEventBus.on(GameEvent.FLEE_ENCOUNTER, this.handleFleeEncounter);
    gameEventBus.on(GameEvent.START_BATTLE, this.handleStartBattle);
    gameEventBus.on(GameEvent.PARTY_SWAP_REQUESTED, this.handlePartySwapRequest);
    gameEventBus.on(GameEvent.CURIO_CHOICE, this.handleCurioChoice);
    gameEventBus.on(GameEvent.CURIO_LEAVE, this.handleCurioLeave);

    gameEventBus.emit(GameEvent.SCENE_CHANGED, { scene: 'exploration', areaId: this.areaId });

    await this.loadDungeonState();

    // A recruit swapped in from the victory screen is applied once, before the
    // player can act. Failure is logged but never blocks exploration.
    if (this.pendingRecruitSwap && this.dungeon && !this.explorationUI.isDestroyed()) {
      await this.applyRecruitSwap(this.pendingRecruitSwap);
    }
  }

  private syncAreaAudio(): void {
    const dungeonAreas = new Set(['crystalCaves', 'sunkenArchive']);
    const caveAreas = new Set(['crystalCaves', 'emberHollow', 'frostpeakSummit', 'sunkenArchive']);
    audioManager.playMusic(dungeonAreas.has(this.areaId) ? 'dungeon' : 'exploration');
    audioManager.playAmbience(caveAreas.has(this.areaId) ? 'cave' : 'forest');
  }

  private async loadDungeonState(): Promise<void> {
    try {
      const { state, battle } = await this.gameApi.bootstrap();
      this.fullGameState = state;

      if (state.dungeon) {
        this.dungeon = state.dungeon;
        this.areaId = state.dungeon.areaId;
        this.daily = Boolean(state.dungeon.daily);
        this.area = AREAS[this.areaId];
        this.syncAreaAudio();

        if (!this.area) {
          this.explorationUI.addLogMessage(`Unknown area: ${this.areaId}`);
          return;
        }

        if (typeof this.resumeActiveIndex === 'number') {
          this.dungeon.activeIndex = this.resumeActiveIndex;
        }

        const currentRoom = this.dungeon.rooms[this.dungeon.currentRoomId];
        if (!currentRoom) {
          console.error(`Room ${this.dungeon.currentRoomId} not found in dungeon`);
          return;
        }

        this.visitedRoomIds.add(currentRoom.id);
        this.currentRoomIndex = this.getRoomIndex(currentRoom.id);

        this.explorationUI.showRoomInfo(currentRoom, this.currentRoomIndex, this.area.roomCount, this.area);

        // A refresh mid-battle leaves an active battle row. Resume it with the
        // server's combat HP/MP instead of starting a fresh fight.
        if (battle) {
          this.explorationUI.destroy();
          fadeToScene(this, SCENE_KEYS.BATTLE, {
            enemyId: battle.enemyFamiliar.familiarData.id,
            returnScene: SCENE_KEYS.EXPLORATION,
            areaId: this.areaId,
            backgroundKey: this.roomBackgroundKey(),
            pendingTreasureItemId: this.pendingTreasureItemId,
            roomsExplored: this.visitedRoomIds.size,
            enemiesDefeated: this.enemiesDefeated,
          });
          return;
        }

        this.explorationUI.addLogMessage(`Resuming exploration in ${this.area.name}...`);
        this.logCurioNotice(currentRoom);

        if (currentRoom.type === RoomType.Boss) {
          this.pendingEnemyId = this.area.bossId;
          this.bossActive = true;
        } else if (currentRoom.pendingEncounter && !currentRoom.pendingEncounter.resolved) {
          this.pendingEnemyId = currentRoom.pendingEncounter.enemyId;
          this.encounterActive = true;
          this.logEliteReveal(currentRoom.pendingEncounter.enemyId, currentRoom.pendingEncounter.elite);
        } else if (this.pendingTreasureItemId) {
          this.treasureActive = true;
        }
        this.emitStateUpdate();
      } else {
        await this.enterDungeon();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load dungeon state';
      this.explorationUI.addLogMessage(`Error: ${message}`);
    }
  }

  private async enterDungeon(): Promise<void> {
    try {
      this.pendingTreasureItemId = null;
      this.enemiesDefeated = 0;
      const result = await this.gameApi.enterDungeon(this.areaId, this.daily);
      this.dungeon = result.dungeon;
      this.areaId = result.dungeon.areaId;
      this.area = AREAS[this.areaId] ?? this.area;
      this.daily = Boolean(result.dungeon.daily);

      const currentRoom = result.dungeon.rooms[result.dungeon.currentRoomId];
      if (!currentRoom) {
        console.error(`Room ${result.dungeon.currentRoomId} not found in dungeon`);
        return;
      }

      this.visitedRoomIds.add(currentRoom.id);
      this.currentRoomIndex = 0;

      this.explorationUI.showRoomInfo(currentRoom, this.currentRoomIndex, this.area!.roomCount, this.area!);
      this.explorationUI.addLogMessage(`Entering ${this.area!.name}...`);
      audioManager.playSfx('door');
      this.emitStateUpdate();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to enter dungeon';
      this.explorationUI.addLogMessage(`Error: ${message}`);
    }
  }

  private async navigateToRoom(roomId: string): Promise<void> {
    if (this.isProcessing || this.explorationUI?.isDestroyed() || !this.dungeon || !this.area) return;
    this.isProcessing = true;
    this.encounterActive = false;
    this.treasureActive = false;
    this.bossActive = false;
    this.pendingEnemyId = null;
    this.pendingTreasureItemId = null;
    this.curioResult = null;

    try {
      const result = await this.gameApi.exploreRoom(roomId);
      // The player can leave during the round-trip; touching the destroyed UI
      // container afterwards throws inside Phaser's renderer.
      if (this.explorationUI?.isDestroyed()) return;
      this.dungeon.currentRoomId = roomId;
      this.dungeon.rooms[roomId] = { ...this.dungeon.rooms[roomId], ...result.room };
      this.visitedRoomIds.add(roomId);
      this.dismissedCurios.delete(roomId);

      const roomIndex = this.getRoomIndex(roomId);
      this.currentRoomIndex = roomIndex;

      this.explorationUI.showRoomInfo(result.room, roomIndex, this.area.roomCount, this.area);
      this.logCurioNotice(result.room);
      audioManager.playSfx('footstep');
      if (result.encounter) audioManager.playSfx('encounter');
      if (result.treasure) audioManager.playSfx('loot');

      const isBossRoom = result.room.type === RoomType.Boss;

      if (isBossRoom) {
        this.explorationUI.addLogMessage('You sense a powerful presence...');
        audioManager.playSfx('encounter');
        this.pendingEnemyId = this.area.bossId;
        this.bossActive = true;
        this.isProcessing = false;
        this.emitStateUpdate();
      } else if (result.encounter && result.enemy) {
        if (result.treasure) {
          this.pendingTreasureItemId = result.treasureItem;
          const enemyName = result.eliteName ?? getFamiliar(result.enemy)?.name ?? 'enemy';
          this.explorationUI.addLogMessage(`A chest sits behind the ${enemyName}…`);
        }
        if (result.elite) {
          const eliteDisplay =
            result.eliteName ?? eliteName(getFamiliar(result.enemy)?.name ?? result.enemy, result.elite);
          this.explorationUI.addLogMessage(`An elite ${eliteDisplay} blocks the way!`);
        } else {
          this.explorationUI.addLogMessage(`An enemy appears in ${result.room.name}!`);
        }
        this.timers.push(
          this.time.delayedCall(this.ENCOUNTER_DELAY_MS, () => {
            this.encounterActive = true;
            this.pendingEnemyId = result.enemy!;
            this.isProcessing = false;
            this.emitStateUpdate();
          })
        );
      } else if (result.treasure && result.treasureItem) {
        this.pendingTreasureItemId = result.treasureItem;
        this.explorationUI.addLogMessage(`You find something in ${result.room.name}.`);
        this.timers.push(
          this.time.delayedCall(this.TREASURE_DELAY_MS, () => {
            this.treasureActive = true;
            this.isProcessing = false;
            this.emitStateUpdate();
          })
        );
      } else {
        this.explorationUI.addLogMessage(`You arrive at ${result.room.name}.`);
        // Rest shrines are safe rooms, so this is the only branch they reach.
        if (result.rest) this.applyRestHeal(result.rest);
        this.emitStateUpdate();
        this.timers.push(
          this.time.delayedCall(this.EXITS_DELAY_MS, () => {
            this.isProcessing = false;
          })
        );
        return;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to explore room';
      this.explorationUI.addLogMessage(`Error: ${message}`);
      this.isProcessing = false;
    }
  }

  /**
   * Reflect a rest shrine's server-applied heal in local HP/MP and log it.
   * The server returns the amounts actually restored (already capped), so they
   * can be added to the local run totals without re-deriving the cap.
   */
  private applyRestHeal(rest: RestHeal): void {
    const dungeon = this.dungeon;
    if (!dungeon) return;

    const lines: string[] = [];
    for (const [familiarId, amount] of Object.entries(rest.healed)) {
      dungeon.partyHp[familiarId] = (dungeon.partyHp[familiarId] ?? 0) + amount.hp;
      dungeon.partyMp[familiarId] = (dungeon.partyMp[familiarId] ?? 0) + amount.mp;
      if (amount.hp <= 0 && amount.mp <= 0) continue;
      const name = getFamiliar(familiarId)?.name ?? familiarId;
      lines.push(`${name} +${amount.hp} HP, +${amount.mp} MP`);
    }

    this.explorationUI.addLogMessage('The shrine restores your party.');
    for (const line of lines) this.explorationUI.addLogMessage(line);
    audioManager.playSfx('heal');
  }

  private startBattle(enemyId: string): void {
    if (!this.area) return;
    this.isProcessing = true;
    this.encounterActive = false;
    this.bossActive = false;
    this.pendingEnemyId = null;
    this.explorationUI.destroy();
    audioManager.playSfx('encounter');
    fadeToScene(this, SCENE_KEYS.BATTLE, {
      enemyId,
      returnScene: SCENE_KEYS.EXPLORATION,
      areaId: this.areaId,
      backgroundKey: this.roomBackgroundKey(),
      pendingTreasureItemId: this.pendingTreasureItemId,
      activeIndex: this.dungeon?.activeIndex ?? 0,
      roomsExplored: this.visitedRoomIds.size,
      enemiesDefeated: this.enemiesDefeated,
    });
  }

  private handleFlee(): void {
    if (this.isProcessing || !this.explorationUI || this.explorationUI.isDestroyed()) return;
    this.encounterActive = false;
    this.pendingEnemyId = null;
    audioManager.playSfx('flee');
    this.explorationUI.addLogMessage('You avoided the encounter.');
    if (this.pendingTreasureItemId) {
      this.treasureActive = true;
      this.emitStateUpdate();
      return;
    }
    this.emitStateUpdate();
  }

  private async handleTakeTreasure(itemId: string): Promise<void> {
    if (!this.dungeon || this.isProcessing) return;
    this.isProcessing = true;

    const currentRoomId = this.dungeon.currentRoomId;

    try {
      const result = await this.gameApi.collectTreasure(currentRoomId, itemId);
      if (this.fullGameState) {
        this.fullGameState.inventory = result.inventory;
      }
      if (this.dungeon) {
        this.dungeon.runLoot = result.runLoot;
      }
      this.explorationUI.addLogMessage(`You took ${itemId}.`);
      if (result.charm) {
        this.explorationUI.addLogMessage(`◆ ${charmName(result.charm)}`);
      }
      audioManager.playSfx('loot');
    } catch (err) {
      audioManager.playSfx('ui_error');
      const message = err instanceof Error ? err.message : 'Failed to collect treasure';
      this.explorationUI.addLogMessage(message);
    }

    this.treasureActive = false;
    this.pendingTreasureItemId = null;
    this.isProcessing = false;
    this.emitStateUpdate();
  }

  private handleLeaveTreasure(): void {
    this.explorationUI.addLogMessage('You left the treasure behind.');
    this.treasureActive = false;
    this.pendingTreasureItemId = null;
    this.emitStateUpdate();
  }

  private handleBossRetreat(): void {
    this.pendingEnemyId = null;
    this.bossActive = false;
    audioManager.playSfx('flee');
    this.explorationUI.addLogMessage('You retreat from the boss chamber.');
    this.emitStateUpdate();
  }

  private async exitDungeon(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      await this.gameApi.exitDungeon();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error('Exit dungeon error:', message);
      // Continue to world map even if exit API fails
    }

    this.explorationUI.destroy();
    audioManager.playSfx('ui_cancel');
    gameEventBus.emit(GameEvent.OVERLAY_MODE_CHANGED, { mode: 'exploration', enabled: false });
    fadeToScene(this, SCENE_KEYS.WORLD_MAP);
  }

  private cleanupTimers(): void {
    for (const timer of this.timers) {
      timer.destroy();
    }
    this.timers = [];
  }

  private emitStateUpdate(): void {
    const dungeon = this.dungeon;
    if (!dungeon) return;
    const currentRoom = dungeon.rooms[dungeon.currentRoomId];

    const party: FamiliarState[] = (dungeon.party ?? [])
      .map((id) => {
        const fd = getFamiliar(id);
        if (!fd) return null;
        const state = toFamiliarStateFromData(fd, this.fullGameState?.familiarLevels?.[id] ?? 1);
        const hp = dungeon.partyHp[id];
        const mp = dungeon.partyMp[id];
        if (typeof hp === 'number') state.hp = hp;
        if (typeof mp === 'number') state.mp = mp;
        return state;
      })
      .filter((f): f is FamiliarState => f !== null);

    const roomIds = sortRoomIds(Object.keys(dungeon.rooms));

    const rooms: DungeonRoomSnapshot[] = roomIds
      .map((roomId) => dungeon.rooms[roomId])
      .filter((room): room is Room => Boolean(room))
      .map((room) => {
        const seen = new Set<string>();
        const looted = room.pendingTreasure?.looted === true;
        return {
          id: room.id,
          name: room.name,
          type: RoomType[room.type],
          cleared: room.cleared,
          chest: looted ? undefined : room.chest,
          hasTreasure: Boolean(room.pendingTreasure && !room.pendingTreasure.looted),
          hasCurio: Boolean(room.curio && !room.curio.used),
          elite: room.pendingEncounter && !room.pendingEncounter.resolved ? room.pendingEncounter.elite : undefined,
          exits: room.exits
            .filter((e) => {
              if (seen.has(e.roomId)) return false;
              seen.add(e.roomId);
              return true;
            })
            .map((e) => ({
              direction: Directions[e.direction].toLowerCase(),
              roomId: e.roomId,
              label: e.label,
            })),
        };
      });

    // The HUD Active chip must reflect whoever battle start would field:
    // party[activeIndex], not blindly party[0] (a KO relay can move the lead).
    const leadIdx = dungeon.activeIndex ?? 0;

    const snapshot: GameStateSnapshot = {
      familiars: party,
      activeId: party[leadIdx]?.id,
      currency: (this.fullGameState?.inventory?.currency ?? 0) + getRunLoot(this.dungeon).currency,
      battleCount: this.fullGameState?.battleCount ?? 0,
      wins: this.fullGameState?.winCount ?? 0,
      currentScene: 'exploration',
      areaName: this.area?.name,
      daily: Boolean(dungeon.daily),
      roomName: currentRoom?.name,
      roomType: currentRoom ? RoomType[currentRoom.type] : undefined,
      roomDescription: currentRoom?.description,
      roomLog: [...this.explorationUI.getLog()],
      pendingEncounter: this.buildPendingEncounter(currentRoom),
      treasure: this.buildTreasureView(currentRoom),
      curio: this.buildCurioView(currentRoom),
      curioResult: this.curioResult ?? undefined,
      recruitBond: this.fullGameState?.recruitBond,
      ownedFamiliars: this.fullGameState?.playerFamiliars,
      dungeon: {
        areaId: dungeon.areaId,
        currentRoomId: dungeon.currentRoomId,
        currentRoomIndex: this.currentRoomIndex,
        roomCount: this.area?.roomCount ?? Object.keys(dungeon.rooms).length,
        visitedRoomIds: [...this.visitedRoomIds],
        rooms,
      },
      encounterActive: this.encounterActive,
      treasureActive: this.treasureActive,
      bossRoom: this.bossActive,
      runLootCurrency: getRunLoot(this.dungeon).currency,
      runLootItemCount: getRunLoot(this.dungeon).items.reduce((sum, item) => sum + item.quantity, 0),
    };
    gameEventBus.emit(GameEvent.STATE_UPDATED, snapshot);
  }

  private buildPendingEncounter(room?: Room): EncounterSnapshot | undefined {
    if (!this.pendingEnemyId) return undefined;
    const base = getFamiliar(this.pendingEnemyId);
    const isBoss = this.bossActive || base?.isBoss === true;
    const level = isBoss
      ? (this.area?.levelRange[1] ?? room?.pendingEncounter?.level ?? 1)
      : (room?.pendingEncounter?.level ?? this.area?.levelRange[0] ?? 1);
    const eliteId = room?.pendingEncounter && !room.pendingEncounter.resolved ? room.pendingEncounter.elite : undefined;
    const elite = eliteId
      ? {
          id: eliteId,
          name: eliteName(base?.name ?? this.pendingEnemyId, eliteId),
          description: ELITES[eliteId].description,
        }
      : undefined;
    return { enemyId: this.pendingEnemyId, level, isBoss, ...(elite ? { elite } : {}) };
  }

  /** Log the reveal line for an elite encounter, if one is pending. */
  private logEliteReveal(enemyId: string, eliteId?: EliteId): void {
    if (!eliteId) return;
    const baseName = getFamiliar(enemyId)?.name ?? enemyId;
    this.explorationUI.addLogMessage(`An elite ${eliteName(baseName, eliteId)} blocks the way!`);
  }

  /**
   * Content of the current room's unlooted treasure, for the overlay. Falls
   * back to the carried pendingTreasureItemId for older saves that persisted
   * only the single item id.
   */
  private buildTreasureView(room?: Room): GameStateSnapshot['treasure'] {
    const pending = room?.pendingTreasure;
    const itemIds =
      pending?.items && pending.items.length > 0
        ? pending.items
        : pending?.itemId
          ? [pending.itemId]
          : this.pendingTreasureItemId
            ? [this.pendingTreasureItemId]
            : [];

    if (itemIds.length === 0 && !pending?.charm) return undefined;

    return {
      tier: pending?.tier ?? 'common',
      items: itemIds.map((id) => {
        const item = getItem(id);
        return {
          id,
          name: item?.name ?? id,
          description: item ? describeItem(item) : '',
          icon: item?.icon,
          rarity: item ? itemRarity(item) : 'common',
        };
      }),
      currency: pending?.currency ?? 0,
      ...(pending?.charm ? { charm: pending.charm } : {}),
    };
  }

  /** The current room's unused curio, unless another overlay owns the screen. */
  private buildCurioView(room?: Room): GameStateSnapshot['curio'] {
    const placed = room?.curio;
    if (!placed || placed.used) return undefined;
    if (this.encounterActive || this.treasureActive || this.bossActive || this.curioResult) return undefined;
    if (room?.pendingEncounter && !room.pendingEncounter.resolved) return undefined;
    if (room && this.dismissedCurios.has(room.id)) return undefined;

    const curio = CURIOS[placed.id];
    if (!curio) return undefined;

    const runLoot = getRunLoot(this.dungeon);
    const bankedCoins = this.fullGameState?.inventory?.currency ?? 0;

    return {
      id: curio.id,
      name: curio.name,
      description: curio.description,
      options: curio.options.map((option) => {
        let available = true;
        let reason: string | undefined;

        if (option.requiresItem && !this.ownsItem(option.requiresItem)) {
          available = false;
          const itemName = getItem(option.requiresItem)?.name ?? option.requiresItem;
          reason = `Needs ${withArticle(itemName)}`;
        } else if (option.costCurrency && runLoot.currency + bankedCoins < option.costCurrency) {
          available = false;
          reason = `Needs ${option.costCurrency} coins`;
        }

        return { id: option.id, label: option.label, available, ...(reason ? { reason } : {}) };
      }),
    };
  }

  private ownsItem(itemId: string): boolean {
    if (getRunLoot(this.dungeon).items.some((item) => item.itemId === itemId && item.quantity > 0)) return true;
    return (this.fullGameState?.inventory?.items ?? []).some((item) => item.itemId === itemId && item.quantity > 0);
  }

  private logCurioNotice(room: Room): void {
    if (!room.curio || room.curio.used) return;
    const curio = CURIOS[room.curio.id];
    if (curio) this.explorationUI.addLogMessage(`You notice a ${curio.name}.`);
  }

  private async chooseCurio(optionId: string): Promise<void> {
    const dungeon = this.dungeon;
    if (!dungeon) return;
    const roomId = dungeon.currentRoomId;
    this.isProcessing = true;

    try {
      const result = await this.gameApi.chooseCurio(roomId, optionId);
      if (this.explorationUI?.isDestroyed()) return;

      if (this.dungeon) {
        this.dungeon.currentRoomId = result.dungeon.currentRoomId;
        this.dungeon.rooms = result.dungeon.rooms;
        this.dungeon.partyHp = result.dungeon.partyHp;
        this.dungeon.partyMp = result.dungeon.partyMp;
        this.dungeon.runLoot = result.runLoot;
      }

      if (this.fullGameState) {
        this.fullGameState.inventory = result.inventory;
        // XP gains can raise levels; keep max HP/MP (and the rings) accurate.
        for (const level of result.gains.levels ?? []) {
          this.fullGameState.familiarLevels ??= {};
          this.fullGameState.familiarLevels[level.familiarId] = level.level;
        }
        if (result.gains.bond) {
          this.fullGameState.recruitBond ??= {};
          this.fullGameState.recruitBond[result.gains.bond.speciesId] = result.gains.bond.bond;
        }
      }

      this.explorationUI.addLogMessage(result.text);
      audioManager.playSfx(
        result.outcome.kind === 'healParty' ? 'heal' : result.outcome.kind === 'hurtParty' ? 'ui_error' : 'loot'
      );

      if (result.encounter && result.enemy) {
        // An ambush becomes the room's normal pending encounter; hand over to
        // the same encounter overlay flow that explore uses.
        this.pendingEnemyId = result.enemy;
        const enemyName = getFamiliar(result.enemy)?.name ?? 'enemy';
        this.explorationUI.addLogMessage(`${enemyName} attacks!`);
        this.timers.push(
          this.time.delayedCall(this.ENCOUNTER_DELAY_MS, () => {
            this.encounterActive = true;
            this.isProcessing = false;
            this.emitStateUpdate();
          })
        );
        return;
      }

      this.curioResult = {
        text: result.text,
        gains: this.formatCurioGains(result),
        ...(result.gains.charms?.length ? { charms: result.gains.charms } : {}),
      };
      this.isProcessing = false;
      this.emitStateUpdate();
    } catch (err) {
      audioManager.playSfx('ui_error');
      const message = err instanceof Error ? err.message : 'Failed to use the curio';
      this.explorationUI.addLogMessage(message);
      this.isProcessing = false;
      this.emitStateUpdate();
    }
  }

  /** Human-readable lines for the result panel, derived from the server gains. */
  private formatCurioGains(result: CurioResponse): string[] {
    const lines: string[] = [];
    const gains = result.gains;

    for (const [familiarId, amount] of Object.entries(gains.healed ?? {})) {
      const name = getFamiliar(familiarId)?.name ?? familiarId;
      const parts: string[] = [];
      if (amount.hp > 0) parts.push(`+${amount.hp} HP`);
      if (amount.mp > 0) parts.push(`+${amount.mp} MP`);
      if (parts.length > 0) lines.push(`${name} ${parts.join(', ')}`);
    }

    for (const [familiarId, lost] of Object.entries(gains.hurt ?? {})) {
      if (lost <= 0) continue;
      const name = getFamiliar(familiarId)?.name ?? familiarId;
      lines.push(`${name} -${lost} HP`);
    }

    if (gains.items && gains.items.length > 0) {
      const counts = new Map<string, number>();
      for (const itemId of gains.items) counts.set(itemId, (counts.get(itemId) ?? 0) + 1);
      for (const [itemId, count] of counts) {
        const name = getItem(itemId)?.name ?? itemId;
        lines.push(`+${count} ${name}`);
      }
    }

    if (gains.currency) lines.push(`+${gains.currency} coins`);

    if (gains.xp) {
      const names = (gains.levels ?? []).map((level) => level.name);
      lines.push(names.length > 0 ? `+${gains.xp} XP · ${names.join(', ')}` : `+${gains.xp} XP`);
      for (const level of gains.levels ?? []) {
        if (level.levelsGained > 0) lines.push(`${level.name} reached Lv ${level.level}`);
      }
    }

    for (const learned of gains.learned ?? []) {
      lines.push(`${learned.familiarName} learned ${learned.abilityName}`);
    }
    for (const unlock of gains.passiveUnlocks ?? []) {
      lines.push(
        `${unlock.familiarName} unlocked ${unlock.passiveName} ${passiveTierRoman(unlock.tier as 1 | 2 | 3 | 4)}`
      );
    }
    if (gains.bond) {
      lines.push(`Bond with ${gains.bond.name} ${gains.bond.bond}/${gains.bond.needed}`);
    }

    return lines;
  }

  private handleSave = async (): Promise<void> => {
    // The server owns game state; exploration state is persisted server-side
    // on every navigation. Nothing to write here.
    gameEventBus.emit(GameEvent.SAVE_COMPLETE, { success: true });
  };

  private handleExit = (): void => {
    // Ending the session from exploration ends the dungeon run so a stale
    // active dungeon cannot block the next session.
    this.exitDungeon();
  };

  private handleNavigateRoom = (payload: NavigateRoomPayload): void => {
    if (
      this.isProcessing ||
      this.encounterActive ||
      this.treasureActive ||
      this.pendingEnemyId !== null ||
      this.curioResult !== null ||
      !this.dungeon
    )
      return;
    const currentRoom = this.dungeon.rooms[this.dungeon.currentRoomId];
    if (!currentRoom) return;
    if (!currentRoom.exits.some((e) => e.roomId === payload.roomId)) {
      console.warn(`[ExplorationScene] No exit matches room "${payload.roomId}" from room ${currentRoom.id}`);
      return;
    }
    this.navigateToRoom(payload.roomId).catch((err) => {
      console.error('Navigate error:', err);
    });
  };

  private handleCollectTreasure = (): void => {
    if (this.isProcessing || !this.treasureActive || !this.pendingTreasureItemId) return;
    this.handleTakeTreasure(this.pendingTreasureItemId).catch((err) => {
      console.error('Take treasure error:', err);
    });
  };

  private handleCurioChoice = (payload: CurioChoicePayload): void => {
    if (this.isProcessing || !payload?.optionId || !this.dungeon || this.curioResult) return;
    const room = this.dungeon.rooms[this.dungeon.currentRoomId];
    if (!room?.curio || room.curio.used) return;
    this.chooseCurio(payload.optionId).catch((err) => {
      console.error('Curio error:', err);
      this.isProcessing = false;
    });
  };

  private handleCurioLeave = (): void => {
    if (this.isProcessing) return;

    // Continue on a result panel only dismisses the panel; otherwise Leave
    // closes the curio for this visit without spending it.
    if (this.curioResult) {
      this.curioResult = null;
      this.emitStateUpdate();
      return;
    }

    const room = this.dungeon?.rooms[this.dungeon.currentRoomId];
    if (!room?.curio || room.curio.used) return;
    this.dismissedCurios.add(room.id);
    audioManager.playSfx('ui_cancel');
    this.emitStateUpdate();
  };

  private handleFleeEncounter = (): void => {
    if (this.isProcessing || !this.dungeon) return;
    const currentRoom = this.dungeon.rooms[this.dungeon.currentRoomId];
    if (this.encounterActive) {
      this.handleFlee();
    } else if (this.treasureActive) {
      this.handleLeaveTreasure();
    } else if (currentRoom?.type === RoomType.Boss && this.pendingEnemyId !== null) {
      this.handleBossRetreat();
    }
  };

  private handleStartBattle = (): void => {
    if (this.isProcessing || this.treasureActive || !this.pendingEnemyId) return;
    if (!this.explorationUI || this.explorationUI.isDestroyed()) return;
    this.startBattle(this.pendingEnemyId);
  };

  private handlePartySwapRequest = (payload: PartySwapPayload): void => {
    if (this.isSwapping || !this.dungeon) return;
    const familiarId = payload?.familiarId;
    if (!familiarId) return;

    const party = this.dungeon.party ?? [];
    if (!party.includes(familiarId)) {
      this.explorationUI.addLogMessage('That familiar is not in your party.');
      this.emitStateUpdate();
      return;
    }
    // Already the lead — the server would short-circuit to a no-op.
    if (party[0] === familiarId) return;

    this.applyPartySwap(familiarId).catch((err) => {
      console.error('Party swap error:', err);
      this.isSwapping = false;
    });
  };

  /** Apply a victory-screen recruit swap once, then resume normal exploration. */
  private async applyRecruitSwap(swap: RecruitSwap): Promise<void> {
    this.pendingRecruitSwap = null;
    try {
      const { state } = await this.gameApi.replacePartyMember(swap.outId, swap.inId);

      if (this.dungeon && state.dungeon) {
        this.dungeon.party = state.dungeon.party;
        this.dungeon.partyHp = state.dungeon.partyHp;
        this.dungeon.partyMp = state.dungeon.partyMp;
        this.dungeon.activeIndex = state.dungeon.activeIndex ?? this.dungeon.activeIndex;
      }
      this.fullGameState = state;

      const incomingName = getFamiliar(swap.inId)?.name ?? swap.inId;
      const outgoingName = getFamiliar(swap.outId)?.name ?? swap.outId;
      this.explorationUI.addLogMessage(`${incomingName} joins the party; ${outgoingName} returns to camp.`);
      audioManager.playSfx('ui_confirm');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to swap the recruit into the party';
      this.explorationUI.addLogMessage(`Error: ${message}`);
    } finally {
      this.emitStateUpdate();
    }
  }

  private async applyPartySwap(familiarId: string): Promise<void> {
    this.isSwapping = true;
    try {
      const { state } = await this.gameApi.setActiveFamiliar(familiarId);

      // Adopt the server response wholesale: the endpoint reordered both
      // activeParty and dungeon.party, and hp/mp stay id-keyed records, so
      // copying the run roster + resource fields directly cannot diverge from
      // server truth. Reset activeIndex — battle starts pick
      // party[activeIndex], and the new lead is now index 0.
      const dungeon = this.dungeon;
      if (dungeon) {
        if (state.dungeon) {
          dungeon.party = state.dungeon.party;
          dungeon.partyHp = state.dungeon.partyHp;
          dungeon.partyMp = state.dungeon.partyMp;
        }
        dungeon.activeIndex = 0;
      }

      this.fullGameState = state;
      const name = getFamiliar(familiarId)?.name ?? familiarId;
      this.explorationUI.addLogMessage(`${name} takes the lead.`);
      audioManager.playSfx('ui_confirm');
    } catch (err) {
      audioManager.playSfx('ui_error');
      const message = err instanceof Error ? err.message : 'Failed to swap party leader';
      this.explorationUI.addLogMessage(`Error: ${message}`);
    } finally {
      this.isSwapping = false;
      this.emitStateUpdate();
    }
  }

  private onShutdown(): void {
    this.cleanupTimers();
    gameEventBus.off(GameEvent.SAVE_GAME, this.handleSave);
    gameEventBus.off(GameEvent.EXIT_GAME, this.handleExit);
    gameEventBus.off(GameEvent.NAVIGATE_ROOM, this.handleNavigateRoom);
    gameEventBus.off(GameEvent.COLLECT_TREASURE, this.handleCollectTreasure);
    gameEventBus.off(GameEvent.FLEE_ENCOUNTER, this.handleFleeEncounter);
    gameEventBus.off(GameEvent.START_BATTLE, this.handleStartBattle);
    gameEventBus.off(GameEvent.PARTY_SWAP_REQUESTED, this.handlePartySwapRequest);
    gameEventBus.off(GameEvent.CURIO_CHOICE, this.handleCurioChoice);
    gameEventBus.off(GameEvent.CURIO_LEAVE, this.handleCurioLeave);
  }

  private getRoomIndex(roomId: string): number {
    if (!this.dungeon) return 0;
    // Main-path rooms keep their numeric order; a side branch borrows the index
    // of the room it hangs off, so progress and art depth stay on the main path.
    const roomIds = Object.keys(this.dungeon.rooms)
      .filter((id) => /^room_\d+$/.test(id))
      .sort((a, b) => parseInt(a.slice(5), 10) - parseInt(b.slice(5), 10));
    const index = roomIds.indexOf(roomId);
    if (index !== -1) return index;
    const host = Object.values(this.dungeon.rooms).find((room) => room.exits.some((exit) => exit.roomId === roomId));
    return host ? Math.max(0, roomIds.indexOf(host.id)) : 0;
  }
}

function withArticle(name: string): string {
  return `${/^[aeiou]/i.test(name) ? 'an' : 'a'} ${name}`;
}
