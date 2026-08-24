import Phaser from 'phaser';
import type { DungeonState, Area, Room, FamiliarData } from '@arcane-familiars/game-logic';
import { AREAS, RoomType, getFamiliar, Directions, Affinity } from '@arcane-familiars/game-logic';
import { gameApiClient } from '../api/client';
import { ExplorationUI } from '../ui/ExplorationUI';
import { Layout } from '../ui/layout';
import { gameEventBus } from '../event-bus';
import { GameEvent } from '../events';
import { SCENE_KEYS } from '../constants/scenes';
import { toFamiliarStateFromData, sortRoomIds } from '../utils/familiarState';
import type { GameStateSnapshot, FamiliarState, NavigateRoomPayload, PartySwapPayload, DungeonSnapshot, DungeonRoomSnapshot, OverlayModePayload } from '../events';
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
  private enemiesDefeated = 0;
  private lastBattleOutcome?: 'victory' | 'defeat' | 'fled';
  private resumeActiveIndex?: number;
  private timers: Phaser.Time.TimerEvent[] = [];

  constructor() {
    super({ key: SCENE_KEYS.EXPLORATION });
  }

  init(data: ExplorationSceneData): void {
    this.areaId = data.areaId;
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
    this.lastBattleOutcome = data.lastBattleOutcome;
    this.enemiesDefeated = data.lastBattleOutcome === 'victory'
      ? (data.enemiesDefeated ?? 0) + 1
      : (data.enemiesDefeated ?? 0);
    this.resumeActiveIndex = data.activeIndex;
  }

  preload(): void {
    const roomAreas: Record<string, string> = {
      verdantMeadow: 'verdant-meadow',
      crystalCaves: 'crystal-caves',
      shadowForest: 'shadow-forest',
    };
    const dir = roomAreas[this.areaId];
    if (!dir) return;
    for (let n = 1; n <= 3; n++) {
      this.load.image(`room_${this.areaId}_${n}`, `/assets/rooms/${dir}/room-0${n}.png`);
    }
  }

  async create(): Promise<void> {
    this.layout = new Layout(this);

    const area = AREAS[this.areaId];
    if (!area) {
      this.add.text(this.layout.x(400), this.layout.y(300), `Unknown area: ${this.areaId}`, {
        fontSize: this.layout.font(16),
        fontFamily: 'DM Sans',
        color: '#EF4444',
      }).setOrigin(0.5);
      return;
    }

    this.area = area;
    this.explorationUI = new ExplorationUI(this);
    this.explorationUI.init(area);
    this.events.on('shutdown', this.onShutdown, this);

    // Wire EventBus for save/exit
    gameEventBus.on(GameEvent.SAVE_GAME, this.handleSave);
    gameEventBus.on(GameEvent.EXIT_GAME, this.handleExit);
    gameEventBus.on(GameEvent.NAVIGATE_ROOM, this.handleNavigateRoom);
    gameEventBus.on(GameEvent.COLLECT_TREASURE, this.handleCollectTreasure);
    gameEventBus.on(GameEvent.FLEE_ENCOUNTER, this.handleFleeEncounter);
    gameEventBus.on(GameEvent.START_BATTLE, this.handleStartBattle);
    gameEventBus.on(GameEvent.PARTY_SWAP_REQUESTED, this.handlePartySwapRequest);

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
        this.explorationUI.addLogMessage(`Resuming exploration in ${this.area.name}...`);

        if (currentRoom.type === RoomType.Boss) {
          this.pendingEnemyId = this.area.bossId;
          this.bossActive = true;
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
      this.explorationUI.addLogMessage(`Entering ${this.area!.name}...`);
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

    try {
      const result = await this.gameApi.exploreRoom(roomId);
      this.dungeon.currentRoomId = roomId;
      this.dungeon.rooms[roomId] = { ...this.dungeon.rooms[roomId], ...result.room };
      this.visitedRoomIds.add(roomId);

      const roomIndex = this.getRoomIndex(roomId);
      this.currentRoomIndex = roomIndex;

      this.explorationUI.showRoomInfo(result.room, roomIndex, this.area.roomCount, this.area);

      const isBossRoom = result.room.type === RoomType.Boss;

      if (isBossRoom) {
        this.explorationUI.addLogMessage('You sense a powerful presence...');
        this.pendingEnemyId = this.area.bossId;
        this.bossActive = true;
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
          this.isProcessing = false;
          this.emitStateUpdate();
        }));
      } else if (result.treasure && result.treasureItem) {
        this.pendingTreasureItemId = result.treasureItem;
        this.explorationUI.addLogMessage(`You find something in ${result.room.name}.`);
        this.timers.push(this.time.delayedCall(this.TREASURE_DELAY_MS, () => {
          this.treasureActive = true;
          this.isProcessing = false;
          this.emitStateUpdate();
        }));
      } else {
        this.explorationUI.addLogMessage(`You arrive at ${result.room.name}.`);
        this.emitStateUpdate();
        this.timers.push(this.time.delayedCall(this.EXITS_DELAY_MS, () => {
          this.isProcessing = false;
        }));
        return;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to explore room';
      this.explorationUI.addLogMessage(`Error: ${message}`);
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
    this.scene.start(SCENE_KEYS.BATTLE, {
      enemyId,
      returnScene: SCENE_KEYS.EXPLORATION,
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
      this.explorationUI.addLogMessage(`You took ${itemId}.`);
    } catch (err) {
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
    gameEventBus.emit(GameEvent.OVERLAY_MODE_CHANGED, { mode: 'exploration', enabled: false });
    this.scene.start(SCENE_KEYS.WORLD_MAP);
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
        const state = toFamiliarStateFromData(fd);
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
        return {
          id: room.id,
          name: room.name,
          type: RoomType[room.type],
          cleared: room.cleared,
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
    if (this.isProcessing || this.encounterActive || this.treasureActive || this.pendingEnemyId !== null || !this.dungeon) return;
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
    } catch (err) {
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
