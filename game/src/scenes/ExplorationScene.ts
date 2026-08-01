import Phaser from 'phaser';
import type { DungeonState, Area } from '@arcane-familiars/game-logic';
import { AREAS, RoomType } from '@arcane-familiars/game-logic';
import { gameApiClient } from '../api/client';
import { ExplorationUI, ExplorationUICallbacks } from '../ui/ExplorationUI';
import { gameEventBus } from '../event-bus';
import { GameEvent } from '../events';
import type { GameStateSnapshot, FamiliarState } from '../events';
import type { GameState } from '@arcane-familiars/game-logic';

interface ExplorationSceneData {
  areaId: string;
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
      this.explorationUI.showExits(currentRoom.exits);
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

    this.explorationUI.hideNavPanel();

    try {
      const result = await this.gameApi.exploreRoom(roomId);
      this.dungeon.currentRoomId = roomId;
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

      this.emitStateUpdate()

      if (isBossRoom) {
        this.explorationUI.addLogMessage('You sense a powerful presence...');
        this.explorationUI.showBossWarning(this.area.bossId);
        this.isProcessing = false;
      } else if (result.encounter && result.enemy) {
        this.explorationUI.addLogMessage(`An enemy appears in ${result.room.name}!`);
        this.timers.push(this.time.delayedCall(this.ENCOUNTER_DELAY_MS, () => {
          this.explorationUI.showEncounter(result.enemy!);
          this.isProcessing = false;
        }));
      } else if (result.treasure) {
        this.explorationUI.addLogMessage(`You find something in ${result.room.name}.`);
        this.timers.push(this.time.delayedCall(this.TREASURE_DELAY_MS, () => {
          this.explorationUI.showTreasure(result.treasureItem!);
          this.isProcessing = false;
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
    this.explorationUI.destroy();
    this.scene.start('BattleScene', { enemyId, returnScene: 'ExplorationScene', areaId: this.areaId });
  }

  private handleFlee(): void {
    this.explorationUI.addLogMessage('You avoided the encounter.');
    this.explorationUI.hideEncounterPanel();
    if (this.dungeon) {
      const currentRoom = this.dungeon.rooms[this.dungeon.currentRoomId];
      if (currentRoom) {
        this.explorationUI.showExits(currentRoom.exits);
      }
    }
  }

  private async handleTakeTreasure(itemId: string): Promise<void> {
    if (!this.dungeon) return;

    const currentRoomId = this.dungeon.currentRoomId;

    try {
      await this.gameApi.collectTreasure(currentRoomId, itemId);
      this.explorationUI.addLogMessage(`You took ${itemId}.`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to collect treasure';
      this.explorationUI.addLogMessage(message);
    }

    this.explorationUI.hideTreasurePanel();
    const currentRoom = this.dungeon.rooms[currentRoomId];
    if (currentRoom) {
      this.explorationUI.showExits(currentRoom.exits);
    }
  }

  private handleLeaveTreasure(): void {
    this.explorationUI.addLogMessage('You left the treasure behind.');
    this.explorationUI.hideTreasurePanel();
    if (this.dungeon) {
      const currentRoom = this.dungeon.rooms[this.dungeon.currentRoomId];
      if (currentRoom) {
        this.explorationUI.showExits(currentRoom.exits);
      }
    }
  }

  private handleBossRetreat(): void {
    this.explorationUI.addLogMessage('You retreat from the boss chamber.');
    if (this.dungeon) {
      const currentRoom = this.dungeon.rooms[this.dungeon.currentRoomId];
      if (currentRoom) {
        this.explorationUI.showExits(currentRoom.exits);
      }
    }
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
    this.scene.start('WorldMapScene');
  }

  private cleanupTimers(): void {
    for (const timer of this.timers) {
      timer.destroy();
    }
    this.timers = [];
  }

  private emitStateUpdate(): void {
    const currentRoom = this.dungeon ? this.dungeon.rooms[this.dungeon.currentRoomId] : null
    const snapshot: GameStateSnapshot = {
      familiars: [],
      currency: this.fullGameState?.inventory?.currency ?? 0,
      battleCount: this.fullGameState?.battleCount ?? 0,
      wins: this.fullGameState?.winCount ?? 0,
      currentScene: 'exploration',
      areaName: this.area?.name,
      roomName: currentRoom?.name,
    }
    gameEventBus.emit(GameEvent.STATE_UPDATED, snapshot)
  }

  private handleSave = async (): Promise<void> => {
    try {
      if (this.fullGameState && this.dungeon) {
        this.fullGameState.dungeon = this.dungeon
        await this.gameApi.saveGameState(this.fullGameState);
      }
      gameEventBus.emit(GameEvent.SAVE_COMPLETE, { success: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Save failed';
      gameEventBus.emit(GameEvent.SAVE_COMPLETE, { success: false, error: message });
    }
  };

  private handleExit = (): void => {
    this.explorationUI.destroy();
    this.scene.start('WorldMapScene');
  };

  private onShutdown(): void {
    this.cleanupTimers();
    gameEventBus.off(GameEvent.SAVE_GAME, this.handleSave);
    gameEventBus.off(GameEvent.EXIT_GAME, this.handleExit);
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
