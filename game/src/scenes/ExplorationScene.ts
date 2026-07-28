import Phaser from 'phaser';
import type { DungeonState, Area } from '@arcane-familiars/game-logic';
import { AREAS } from '@arcane-familiars/game-logic';
import { GameApiClient } from '../api/client';
import { ExplorationUI, ExplorationUICallbacks } from '../ui/ExplorationUI';

interface ExplorationSceneData {
  areaId: string;
}

export class ExplorationScene extends Phaser.Scene {
  private gameApi!: GameApiClient;
  private explorationUI!: ExplorationUI;
  private dungeon: DungeonState | null = null;
  private area: Area | null = null;
  private areaId!: string;
  private isProcessing = false;
  private visitedRoomIds: Set<string> = new Set();
  private currentRoomIndex = 0;

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
    this.gameApi = new GameApiClient();

    const callbacks: ExplorationUICallbacks = {
      onNavigate: (roomId) => this.navigateToRoom(roomId),
      onBattle: (enemyId) => this.startBattle(enemyId),
      onFlee: () => this.handleFlee(),
      onTakeTreasure: (itemId) => this.handleTakeTreasure(itemId),
      onLeaveTreasure: () => this.handleLeaveTreasure(),
      onExitDungeon: () => this.exitDungeon(),
      onRetreatFromBoss: () => this.handleBossRetreat(),
    };

    const area = AREAS[this.areaId];
    if (!area) {
      this.add.text(400, 300, `Unknown area: ${this.areaId}`, {
        fontSize: '16px',
        fontFamily: 'monospace',
        color: '#ef4444',
      }).setOrigin(0.5);
      return;
    }

    this.area = area;
    this.explorationUI = new ExplorationUI(this, callbacks);
    this.explorationUI.init(area);

    await this.enterDungeon();
  }

  private async enterDungeon(): Promise<void> {
    try {
      const result = await this.gameApi.enterDungeon(this.areaId);
      this.dungeon = result.dungeon;

      const currentRoom = result.dungeon.rooms[result.dungeon.currentRoomId];
      if (!currentRoom) return;

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
      this.explorationUI.showNewGameArea();
      this.explorationUI.showExits(currentRoom.exits);
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

      const isBossRoom = result.room.type === 'boss';

      if (isBossRoom) {
        this.explorationUI.addLogMessage('You sense a powerful presence...');
        this.explorationUI.showBossWarning(this.area.bossId);
      } else if (result.encounter && result.enemy) {
        this.explorationUI.addLogMessage(`An enemy appears in ${result.room.name}!`);
        this.time.delayedCall(300, () => {
          this.explorationUI.showEncounter(result.enemy!);
        });
      } else if (result.treasure) {
        this.explorationUI.addLogMessage(`You find something in ${result.room.name}.`);
        this.time.delayedCall(300, () => {
          this.explorationUI.showTreasure(result.treasure!);
        });
      } else {
        this.explorationUI.addLogMessage(`You arrive at ${result.room.name}.`);
        this.time.delayedCall(200, () => {
          this.explorationUI.showExits(result.room.exits);
          this.isProcessing = false;
        });
        return;
      }

      this.isProcessing = false;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to explore room';
      this.explorationUI.addLogMessage(`Error: ${message}`);
      this.explorationUI.showNavPanel();
      this.isProcessing = false;
    }
  }

  private startBattle(enemyId: string): void {
    if (!this.area) return;
    const isBoss = this.area.bossId === enemyId;
    this.explorationUI.destroy();
    this.scene.start('BattleScene', { enemyId, isBoss, areaId: this.areaId });
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

  private handleTakeTreasure(itemId: string): void {
    this.explorationUI.addLogMessage(`You took ${itemId}.`);
    this.explorationUI.hideTreasurePanel();
    if (this.dungeon) {
      const currentRoom = this.dungeon.rooms[this.dungeon.currentRoomId];
      if (currentRoom) {
        this.explorationUI.showExits(currentRoom.exits);
      }
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
    } catch {
      // Continue to world map even if exit API fails
    }

    this.explorationUI.destroy();
    this.scene.start('WorldMapScene');
  }

  private getRoomIndex(roomId: string): number {
    if (!this.dungeon) return 0;
    const roomIds = Object.keys(this.dungeon.rooms).sort();
    return roomIds.indexOf(roomId);
  }
}
