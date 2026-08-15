import Phaser from 'phaser';
import type { DungeonState, Area, Room, FamiliarData } from '@arcane-familiars/game-logic';
import { AREAS, RoomType, getFamiliar, Directions, Affinity } from '@arcane-familiars/game-logic';
import { gameApiClient } from '../api/client';
import { ExplorationUI, ExplorationUICallbacks } from '../ui/ExplorationUI';
import { gameEventBus } from '../event-bus';
import { GameEvent } from '../events';
import type { GameStateSnapshot, FamiliarState, OverlayModePayload, NavigateRoomPayload, DungeonSnapshot, DungeonRoomSnapshot } from '../events';
import type { GameState } from '@arcane-familiars/game-logic';

interface ExplorationSceneData {
  areaId: string;
  lastBattleOutcome?: 'victory' | 'defeat' | 'fled';
  pendingTreasureItemId?: string | null;
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
  private isProcessing = false;
  private visitedRoomIds: Set<string> = new Set();
  private currentRoomIndex = 0;
  private encounterActive = false;
  private treasureActive = false;
  private bossActive = false;
  private pendingEnemyId: string | null = null;
  private pendingTreasureItemId: string | null = null;
  private enemiesDefeated = 0;
  private lastBattleOutcome?: 'victory' | 'defeat' | 'fled';
  private resumeActiveIndex?: number;
  private timers: Phaser.Time.TimerEvent[] = [];

  constructor() {
    super({ key: 'ExplorationScene' });
  }

  init(data: ExplorationSceneData): void {
    this.areaId = data.areaId;
    this.isProcessing = false;
    this.dungeon = null;
    this.area = null;
    this.visitedRoomIds = new Set();
    this.currentRoomIndex = 0;
    this.encounterActive = false;
    this.treasureActive = false;
    this.bossActive = false;
    this.pendingEnemyId = null;
    this.pendingTreasureItemId = data.pendingTreasureItemId ?? null;
    this.lastBattleOutcome = data.lastBattleOutcome;
    this.enemiesDefeated = data.lastBattleOutcome === 'victory'
      ? (data.enemiesDefeated ?? 0) + 1
      : (data.enemiesDefeated ?? 0);
    this.resumeActiveIndex = data.activeIndex;
  }

  async create(): Promise<void> {
    const callbacks: ExplorationUICallbacks = {
      onNavigate: (roomId) => this.navigateToRoom(roomId).catch((err) => {
        console.error('Navigate error:', err);
      }),
      onBattle: (enemyId) => this.startBattle(enemyId),
      onFlee: () => this.handleFlee(),
      onTakeTreasure: (itemId) => this.handleTakeTreasure(itemId).catch((err) => {
        console.error('Take treasure error:', err);
      }),
      onLeaveTreasure: () => this.handleLeaveTreasure(),
      onExitDungeon: () => this.exitDungeon(),
      onRetreatFromBoss: () => this.handleBossRetreat(),
    };

    const area = AREAS[this.areaId];
    if (!area) {
      this.add.text(400, 300, `Unknown area: ${this.areaId}`, {
        fontSize: '16px',
        fontFamily: 'DM Sans',
        color: '#EF4444',
      }).setOrigin(0.5);
      return;
    }

    this.area = area;
    this.explorationUI = new ExplorationUI(this, callbacks);
    this.explorationUI.init(area);
    this.events.on('shutdown', this.onShutdown, this);

    // Wire EventBus for save/exit
    gameEventBus.on(GameEvent.SAVE_GAME, this.handleSave);
    gameEventBus.on(GameEvent.EXIT_GAME, this.handleExit);
    gameEventBus.on(GameEvent.NAVIGATE_ROOM, this.handleNavigateRoom);
    gameEventBus.on(GameEvent.COLLECT_TREASURE, this.handleCollectTreasure);
    gameEventBus.on(GameEvent.FLEE_ENCOUNTER, this.handleFleeEncounter);
    gameEventBus.on(GameEvent.START_BATTLE, this.handleStartBattle);
    gameEventBus.on(GameEvent.OVERLAY_MODE_CHANGED, this.handleOverlayModeChanged);

    gameEventBus.emit(GameEvent.SCENE_CHANGED, { scene: 'exploration', areaId: this.areaId });

    await this.loadDungeonState();
  }

  private async loadDungeonState(): Promise<void> {
    try {
      const { state } = await this.gameApi.loadGameState();
      this.fullGameState = state;

      if (state.dungeon) {
        this.dungeon = state.dungeon;
        this.areaId = state.dungeon.areaId;
        this.area = AREAS[this.areaId];
        
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
        this.explorationUI.showAreaProgress(this.currentRoomIndex + 1, this.area.roomCount);
        this.explorationUI.updatePartyStatus(
          this.dungeon.partyHp,
          this.dungeon.partyMp,
          this.dungeon.party,
        );
        this.explorationUI.updateMiniMap(this.dungeon.rooms, currentRoom.id, this.visitedRoomIds);
        this.explorationUI.addLogMessage(`Resuming exploration in ${this.area.name}...`);

        if (currentRoom.type === RoomType.Boss) {
          this.pendingEnemyId = this.area.bossId;
          this.bossActive = true;
          this.explorationUI.hideNavPanel();
          this.explorationUI.showBossWarning(this.area.bossId);
        } else if (this.pendingTreasureItemId) {
          this.treasureActive = true;
          this.explorationUI.showTreasure(this.pendingTreasureItemId);
        } else {
          this.explorationUI.showExits(currentRoom.exits);
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
      const result = await this.gameApi.enterDungeon(this.areaId);
      this.dungeon = result.dungeon;

      const currentRoom = result.dungeon.rooms[result.dungeon.currentRoomId];
      if (!currentRoom) {
        console.error(`Room ${result.dungeon.currentRoomId} not found in dungeon`);
        return;
      }

      this.visitedRoomIds.add(currentRoom.id);
      this.currentRoomIndex = 0;

      this.explorationUI.showRoomInfo(currentRoom, this.currentRoomIndex, this.area!.roomCount, this.area!);
      this.explorationUI.showAreaProgress(1, this.area!.roomCount);
      this.explorationUI.updatePartyStatus(
        result.dungeon.partyHp,
        result.dungeon.partyMp,
        result.dungeon.party,
      );
      this.explorationUI.updateMiniMap(result.dungeon.rooms, currentRoom.id, this.visitedRoomIds);
      this.explorationUI.addLogMessage(`Entering ${this.area!.name}...`);
      this.explorationUI.showExits(currentRoom.exits);
      this.emitStateUpdate();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to enter dungeon';
      this.explorationUI.addLogMessage(`Error: ${message}`);
    }
  }

  private async navigateToRoom(roomId: string): Promise<void> {
    if (this.isProcessing || !this.dungeon || !this.area) return;
    this.isProcessing = true;
    this.encounterActive = false;
    this.treasureActive = false;
    this.bossActive = false;
    this.pendingEnemyId = null;
    this.pendingTreasureItemId = null;

    this.explorationUI.hideBossWarning();
    this.explorationUI.hideNavPanel();

    try {
      const result = await this.gameApi.exploreRoom(roomId);
      this.dungeon.currentRoomId = roomId;
      this.dungeon.rooms[roomId] = { ...this.dungeon.rooms[roomId], ...result.room };
      this.visitedRoomIds.add(roomId);

      const roomIndex = this.getRoomIndex(roomId);
      this.currentRoomIndex = roomIndex;

      this.explorationUI.showRoomInfo(result.room, roomIndex, this.area.roomCount, this.area);
      this.explorationUI.showAreaProgress(roomIndex + 1, this.area.roomCount);
      this.explorationUI.updatePartyStatus(
        this.dungeon.partyHp,
        this.dungeon.partyMp,
        this.dungeon.party,
      );
      this.explorationUI.updateMiniMap(this.dungeon.rooms, roomId, this.visitedRoomIds);

      const isBossRoom = result.room.type === RoomType.Boss;

      if (isBossRoom) {
        this.explorationUI.addLogMessage('You sense a powerful presence...');
        this.pendingEnemyId = this.area.bossId;
        this.bossActive = true;
        this.explorationUI.showBossWarning(this.area.bossId);
        this.isProcessing = false;
        this.emitStateUpdate();
      } else if (result.encounter && result.enemy) {
        if (result.treasure && result.treasureItem) {
          this.pendingTreasureItemId = result.treasureItem;
        }
        this.explorationUI.addLogMessage(`An enemy appears in ${result.room.name}!`);
        this.timers.push(this.time.delayedCall(this.ENCOUNTER_DELAY_MS, () => {
          this.encounterActive = true;
          this.pendingEnemyId = result.enemy!;
          this.explorationUI.showEncounter(result.enemy!);
          this.isProcessing = false;
          this.emitStateUpdate();
        }));
      } else if (result.treasure && result.treasureItem) {
        this.pendingTreasureItemId = result.treasureItem;
        this.explorationUI.addLogMessage(`You find something in ${result.room.name}.`);
        this.timers.push(this.time.delayedCall(this.TREASURE_DELAY_MS, () => {
          this.treasureActive = true;
          this.explorationUI.showTreasure(result.treasureItem!);
          this.isProcessing = false;
          this.emitStateUpdate();
        }));
      } else {
        this.explorationUI.addLogMessage(`You arrive at ${result.room.name}.`);
        this.emitStateUpdate();
        this.timers.push(this.time.delayedCall(this.EXITS_DELAY_MS, () => {
          this.explorationUI.showExits(result.room.exits);
          this.isProcessing = false;
        }));
        return;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to explore room';
      this.explorationUI.addLogMessage(`Error: ${message}`);
      this.explorationUI.showNavPanel();
      this.isProcessing = false;
    }
  }

  private startBattle(enemyId: string): void {
    if (!this.area) return;
    this.isProcessing = true;
    this.encounterActive = false;
    this.bossActive = false;
    this.pendingEnemyId = null;
    this.explorationUI.destroy();
    this.scene.start('BattleScene', {
      enemyId,
      returnScene: 'ExplorationScene',
      areaId: this.areaId,
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
    this.explorationUI.addLogMessage('You avoided the encounter.');
    this.explorationUI.hideEncounterPanel();
    if (this.pendingTreasureItemId) {
      this.treasureActive = true;
      this.explorationUI.showTreasure(this.pendingTreasureItemId);
      this.emitStateUpdate();
      return;
    }
    if (this.dungeon) {
      const currentRoom = this.dungeon.rooms[this.dungeon.currentRoomId];
      if (currentRoom) {
        this.explorationUI.showExits(currentRoom.exits);
      }
    }
    this.emitStateUpdate();
  }

  private async handleTakeTreasure(itemId: string): Promise<void> {
    if (!this.dungeon || this.isProcessing) return;
    this.isProcessing = true;

    const currentRoomId = this.dungeon.currentRoomId;

    try {
      await this.gameApi.collectTreasure(currentRoomId, itemId);
      this.explorationUI.addLogMessage(`You took ${itemId}.`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to collect treasure';
      this.explorationUI.addLogMessage(message);
    }

    this.explorationUI.hideTreasurePanel();
    this.treasureActive = false;
    this.pendingTreasureItemId = null;
    const currentRoom = this.dungeon.rooms[currentRoomId];
    if (currentRoom) {
      this.explorationUI.showExits(currentRoom.exits);
    }
    this.isProcessing = false;
    this.emitStateUpdate();
  }

  private handleLeaveTreasure(): void {
    this.explorationUI.addLogMessage('You left the treasure behind.');
    this.explorationUI.hideTreasurePanel();
    this.treasureActive = false;
    this.pendingTreasureItemId = null;
    if (this.dungeon) {
      const currentRoom = this.dungeon.rooms[this.dungeon.currentRoomId];
      if (currentRoom) {
        this.explorationUI.showExits(currentRoom.exits);
      }
    }
    this.emitStateUpdate();
  }

  private handleBossRetreat(): void {
    this.pendingEnemyId = null;
    this.bossActive = false;
    this.explorationUI.addLogMessage('You retreat from the boss chamber.');
    if (this.dungeon) {
      const currentRoom = this.dungeon.rooms[this.dungeon.currentRoomId];
      if (currentRoom) {
        this.explorationUI.showExits(currentRoom.exits);
      }
    }
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
    gameEventBus.emit(GameEvent.OVERLAY_MODE_CHANGED, { mode: 'exploration', enabled: false });
    this.scene.start('WorldMapScene');
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
        const state = this.toFamiliarStateFromData(fd);
        const hp = dungeon.partyHp[id];
        const mp = dungeon.partyMp[id];
        if (typeof hp === 'number') state.hp = hp;
        if (typeof mp === 'number') state.mp = mp;
        return state;
      })
      .filter((f): f is FamiliarState => f !== null);

    const roomIds = Object.keys(dungeon.rooms).sort((a, b) => {
      const numA = parseInt(a, 10);
      const numB = parseInt(b, 10);
      if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
      return a.localeCompare(b);
    });

    const rooms: DungeonRoomSnapshot[] = roomIds
      .map((roomId) => dungeon.rooms[roomId])
      .filter((room): room is Room => Boolean(room))
      .map((room) => ({
        id: room.id,
        name: room.name,
        type: RoomType[room.type],
        cleared: room.cleared,
        exits: room.exits.map((e) => ({
          direction: Directions[e.direction].toLowerCase(),
          roomId: e.roomId,
          label: e.label,
        })),
      }));

    const snapshot: GameStateSnapshot = {
      familiars: party,
      currency: this.fullGameState?.inventory?.currency ?? 0,
      battleCount: this.fullGameState?.battleCount ?? 0,
      wins: this.fullGameState?.winCount ?? 0,
      currentScene: 'exploration',
      areaName: this.area?.name,
      roomName: currentRoom?.name,
      roomType: currentRoom ? RoomType[currentRoom.type] : undefined,
      roomDescription: currentRoom?.description,
      roomLog: [...this.explorationUI.getLog()],
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
    };
    gameEventBus.emit(GameEvent.STATE_UPDATED, snapshot);
  }

  private toFamiliarStateFromData(fd: FamiliarData): FamiliarState {
    return {
      id: fd.id,
      name: fd.name,
      hp: fd.stats.hp,
      maxHp: fd.stats.maxHp,
      mp: fd.stats.mp,
      maxMp: fd.stats.maxMp,
      attack: fd.stats.attack,
      defense: fd.stats.defense,
      speed: fd.stats.speed,
      arcane: fd.stats.arcane,
      affinity: Affinity[fd.affinity] ?? String(fd.affinity),
    };
  }

  private handleSave = async (): Promise<void> => {
    try {
      if (!this.fullGameState || !this.dungeon) {
        throw new Error('No game loaded to save');
      }
      this.fullGameState.dungeon = this.dungeon
      await this.gameApi.saveGameState(this.fullGameState);
      gameEventBus.emit(GameEvent.SAVE_COMPLETE, { success: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Save failed';
      gameEventBus.emit(GameEvent.SAVE_COMPLETE, { success: false, error: message });
    }
  };

  private handleExit = (): void => {
    this.explorationUI.destroy();
    gameEventBus.emit(GameEvent.OVERLAY_MODE_CHANGED, { mode: 'exploration', enabled: false });
    this.scene.start('WorldMapScene');
  };

  private handleNavigateRoom = (payload: NavigateRoomPayload): void => {
    if (this.isProcessing || this.encounterActive || this.treasureActive || this.pendingEnemyId !== null || !this.dungeon) return;
    const currentRoom = this.dungeon.rooms[this.dungeon.currentRoomId];
    if (!currentRoom) return;
    const exit = currentRoom.exits.find((e) => Directions[e.direction].toLowerCase() === payload.direction);
    if (!exit) {
      console.warn(`[ExplorationScene] No exit matches direction "${payload.direction}" in room ${currentRoom.id}`);
      return;
    }
    this.navigateToRoom(exit.roomId).catch((err) => {
      console.error('Navigate error:', err);
    });
  };

  private handleCollectTreasure = (): void => {
    if (this.isProcessing || !this.treasureActive || !this.pendingTreasureItemId) return;
    this.handleTakeTreasure(this.pendingTreasureItemId).catch((err) => {
      console.error('Take treasure error:', err);
    });
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

  private handleOverlayModeChanged = (payload: OverlayModePayload): void => {
    if (payload.mode !== 'exploration') return;
    this.explorationUI.setVisible(!payload.enabled);
  };

  private onShutdown(): void {
    this.cleanupTimers();
    gameEventBus.off(GameEvent.SAVE_GAME, this.handleSave);
    gameEventBus.off(GameEvent.EXIT_GAME, this.handleExit);
    gameEventBus.off(GameEvent.NAVIGATE_ROOM, this.handleNavigateRoom);
    gameEventBus.off(GameEvent.COLLECT_TREASURE, this.handleCollectTreasure);
    gameEventBus.off(GameEvent.FLEE_ENCOUNTER, this.handleFleeEncounter);
    gameEventBus.off(GameEvent.START_BATTLE, this.handleStartBattle);
    gameEventBus.off(GameEvent.OVERLAY_MODE_CHANGED, this.handleOverlayModeChanged);
  }

  private getRoomIndex(roomId: string): number {
    if (!this.dungeon) return 0;
    const roomIds = Object.keys(this.dungeon.rooms).sort((a, b) => {
      const numA = parseInt(a, 10);
      const numB = parseInt(b, 10);
      if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
      return a.localeCompare(b);
    });
    return roomIds.indexOf(roomId);
  }
}
