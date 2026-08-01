import Phaser from 'phaser';
import type { GameState } from '@arcane-familiars/game-logic';
import { AREAS, FAMILIARS } from '@arcane-familiars/game-logic';
import { gameApiClient } from '../api/client';
import { SCENE_KEYS } from '../constants/scenes';
import { gameEventBus } from '../event-bus';
import { GameEvent } from '../events';
import type { GameStateSnapshot } from '../events';

interface AreaCard {
  areaId: string;
  areaName: string;
  unlocked: boolean;
  border: Phaser.GameObjects.Rectangle;
  texts: Phaser.GameObjects.Text[];
}

export class WorldMapScene extends Phaser.Scene {
  private readonly MESSAGE_DISPLAY_MS = 2000;
  private cards: AreaCard[] = [];
  private loadingText!: Phaser.GameObjects.Text;
  private statsText!: Phaser.GameObjects.Text;
  private messageText!: Phaser.GameObjects.Text;
  private timers: Phaser.Time.TimerEvent[] = [];
  private _sceneGeneration = 0;
  private selectedCardIndex = -1;
  private fullGameState: GameState | null = null;
  private ariaLiveElement: HTMLDivElement | null = null;

  constructor() {
    super({ key: SCENE_KEYS.WORLD_MAP });
    this.ariaLiveElement = document.createElement('div');
    this.ariaLiveElement.setAttribute('role', 'status');
    this.ariaLiveElement.setAttribute('aria-live', 'polite');
    this.ariaLiveElement.setAttribute('aria-atomic', 'true');
    this.ariaLiveElement.style.position = 'absolute';
    this.ariaLiveElement.style.left = '-9999px';
    this.ariaLiveElement.style.width = '1px';
    this.ariaLiveElement.style.height = '1px';
    this.ariaLiveElement.style.overflow = 'hidden';
    document.body.appendChild(this.ariaLiveElement);
  }

  init(): void {
    this._sceneGeneration++;
    this.cards = [];
    this.timers = [];
    this.selectedCardIndex = -1;
    this.events.off('shutdown', this.onShutdown, this);
    this.events.on('shutdown', this.onShutdown, this);
  }

  async create(): Promise<void> {
    // Wire EventBus for save/exit
    gameEventBus.on(GameEvent.SAVE_GAME, this.handleSave);
    gameEventBus.on(GameEvent.EXIT_GAME, this.handleExit);
    gameEventBus.emit(GameEvent.SCENE_CHANGED, { scene: 'world_map' });
    const gen = this._sceneGeneration;
    const { width, height } = this.scale;

    this.add.text(width / 2, 35, 'Arcane Familiars', {
      fontSize: '32px',
      fontFamily: 'Fredoka',
      fontStyle: '600',
      color: '#7C5CFC',
    }).setOrigin(0.5);

    this.add.text(width / 2, 70, 'Choose a Dungeon', {
      fontSize: '15px',
      fontFamily: 'DM Sans',
      fontStyle: '500',
      color: '#A5A3C4',
    }).setOrigin(0.5);

    this.loadingText = this.add.text(width / 2, height / 2, 'Loading...', {
      fontSize: '18px',
      fontFamily: 'DM Sans',
      fontStyle: '400',
      color: '#A5A3C4',
    }).setOrigin(0.5);

    this.messageText = this.add.text(width / 2, height - 55, '', {
      fontSize: '14px',
      fontFamily: 'DM Sans',
      fontStyle: '400',
      color: '#EF4444',
    }).setOrigin(0.5).setAlpha(0);

    const statsBg = this.add.rectangle(width / 2, height - 18, width - 40, 36, 0x1E1B4B);
    statsBg.setStrokeStyle(1, 0x3B3870);

    this.statsText = this.add.text(width / 2, height - 18, '', {
      fontSize: '12px',
      fontFamily: 'JetBrains Mono',
      fontStyle: '500',
      color: '#A5A3C4',
    }).setOrigin(0.5);

    this.setupKeyboardNavigation();

    try {
      const result = await gameApiClient.loadGameState();
      if (this._sceneGeneration !== gen) return;

      const state = result.state;
      this.fullGameState = state;

      this.statsText.setText(
        `Battles: ${state.battleCount}  |  Wins: ${state.winCount}  |  Currency: ${state.inventory?.currency ?? 0}`
      );

      const unlockedAreas = state.unlockedAreas?.length ? state.unlockedAreas : ['verdantMeadow'];
      this.createAreaCards(unlockedAreas);
      this.loadingText.setAlpha(0);
      this.emitStateUpdate();
    } catch (err) {
      if (this._sceneGeneration !== gen) return;
      console.error('WorldMapScene: failed to load game state:', err);

      this.statsText.setText('Battles: 0  |  Wins: 0  |  Currency: 0');
      this.createAreaCards(['verdantMeadow']);
      this.loadingText.setAlpha(0);
    }
  }

  private createAreaCards(unlockedAreas: string[]): void {
    const { width, height } = this.scale;
    const areaList = Object.values(AREAS);
    const startY = 100;
    const cardHeight = 125;
    const gap = 12;
    const cardWidth = width - 100;

    const availableHeight = height - 60 - startY;
    const maxCards = Math.max(1, Math.floor(availableHeight / (cardHeight + gap)));
    const displayAreas = areaList.length > maxCards ? areaList.slice(0, maxCards) : areaList;

    if (areaList.length > maxCards) {
      console.warn(`WorldMapScene: ${areaList.length} areas exceed available space. Displaying ${maxCards} of ${areaList.length}.`);
    }

    displayAreas.forEach((area, index) => {
      const unlocked = unlockedAreas.includes(area.id);
      const y = startY + index * (cardHeight + gap);
      const cx = width / 2;

      const bossData = FAMILIARS[area.bossId];

      const border = this.add.rectangle(cx, y + cardHeight / 2, cardWidth, cardHeight, unlocked ? 0x1E1B4B : 0x15133A);
      border.setStrokeStyle(2, unlocked ? 0x7C5CFC : 0x3B3870);

      const texts: Phaser.GameObjects.Text[] = [];
      const left = cx - cardWidth / 2 + 15;

      texts.push(
        this.add.text(left, y + 8, area.name, {
          fontSize: '19px',
          fontFamily: 'Fredoka',
          fontStyle: '600',
          color: unlocked ? '#7C5CFC' : '#6366A1',
        })
      );

      texts.push(
        this.add.text(left, y + 32, area.description, {
          fontSize: '12px',
          fontFamily: 'DM Sans',
          fontStyle: '400',
          color: unlocked ? '#A5A3C4' : '#6366A1',
        })
      );

      const bossName = bossData?.name || area.bossId;
      texts.push(
        this.add.text(left, y + 54, `Level ${area.levelRange[0]}-${area.levelRange[1]}  |  Boss: ${bossName}`, {
          fontSize: '11px',
          fontFamily: 'DM Sans',
          fontStyle: '400',
          color: unlocked ? '#6366A1' : '#3B3870',
        })
      );

      texts.push(
        this.add.text(left, y + 74, `Recommended Level: ${area.levelRange[0]}+`, {
          fontSize: '11px',
          fontFamily: 'DM Sans',
          fontStyle: '400',
          color: unlocked ? '#6366A1' : '#3B3870',
        })
      );

      const statusColor = unlocked ? '#10B981' : '#EF4444';
      const statusText = unlocked ? '● AVAILABLE' : '● LOCKED';
      texts.push(
        this.add.text(cx + cardWidth / 2 - 15, y + 8, statusText, {
          fontSize: '11px',
          fontFamily: 'DM Sans',
          fontStyle: '500',
          color: statusColor,
        }).setOrigin(1, 0)
      );

      if (unlocked) {
        border.setInteractive({ useHandCursor: true });
        border.on('pointerover', () => border.setFillStyle(0x2D2A5E));
        border.on('pointerout', () => border.setFillStyle(0x1E1B4B));
        border.on('pointerdown', () => {
          this.scene.start(SCENE_KEYS.PARTY_SELECT, { areaId: area.id });
        });
      } else {
        border.setInteractive();
        border.on('pointerover', () => this.showMessage('Not yet unlocked'));
        border.on('pointerout', () => this.hideMessage());
      }

      this.cards.push({ areaId: area.id, areaName: area.name, unlocked, border, texts });
    });
  }

  private showMessage(msg: string): void {
    this.messageText.setText(msg).setAlpha(1);
    this.cleanupTimers();
    const timer = this.time.delayedCall(this.MESSAGE_DISPLAY_MS, () => this.hideMessage());
    this.timers.push(timer);
  }

  private hideMessage(): void {
    this.messageText.setAlpha(0);
  }

  private emitStateUpdate(): void {
    const snapshot: GameStateSnapshot = {
      familiars: [],
      currency: this.fullGameState?.inventory?.currency ?? 0,
      battleCount: this.fullGameState?.battleCount ?? 0,
      wins: this.fullGameState?.winCount ?? 0,
      currentScene: 'world_map',
    }
    gameEventBus.emit(GameEvent.STATE_UPDATED, snapshot)
  }

  private handleSave = async (): Promise<void> => {
    try {
      if (this.fullGameState) {
        await gameApiClient.saveGameState(this.fullGameState);
      }
      gameEventBus.emit(GameEvent.SAVE_COMPLETE, { success: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Save failed';
      gameEventBus.emit(GameEvent.SAVE_COMPLETE, { success: false, error: message });
    }
  };

  private handleExit = (): void => {
    this.cleanupTimers();
  };

  private onShutdown(): void {
    this.cleanupTimers();
    gameEventBus.off(GameEvent.SAVE_GAME, this.handleSave);
    gameEventBus.off(GameEvent.EXIT_GAME, this.handleExit);
    this.ariaLiveElement?.remove();
    this.ariaLiveElement = null;
  }

  private cleanupTimers(): void {
    for (const timer of this.timers) {
      timer.destroy();
    }
    this.timers = [];
  }

  private announceForScreenReader(message: string): void {
    if (this.ariaLiveElement) {
      this.ariaLiveElement.textContent = message;
    }
  }

  private setupKeyboardNavigation(): void {
    this.input.keyboard?.on('keydown-TAB', (event: KeyboardEvent) => {
      const unlockedIndices = this.cards
        .map((card, i) => ({ card, i }))
        .filter(({ card }) => card.unlocked)
        .map(({ i }) => i);

      if (unlockedIndices.length === 0) return;

      const currentPos = unlockedIndices.indexOf(this.selectedCardIndex);
      if (event.shiftKey) {
        const nextPos = (currentPos - 1 + unlockedIndices.length) % unlockedIndices.length;
        this.focusCard(unlockedIndices[nextPos]);
      } else {
        const nextPos = (currentPos + 1) % unlockedIndices.length;
        this.focusCard(unlockedIndices[nextPos]);
      }
    });

    this.input.keyboard?.on('keydown-ENTER', () => {
      if (this.selectedCardIndex >= 0 && this.selectedCardIndex < this.cards.length) {
        const card = this.cards[this.selectedCardIndex];
        if (card.unlocked) {
          this.scene.start(SCENE_KEYS.PARTY_SELECT, { areaId: card.areaId });
        }
      }
    });

    this.input.keyboard?.on('keydown-SPACE', () => {
      if (this.selectedCardIndex >= 0 && this.selectedCardIndex < this.cards.length) {
        const card = this.cards[this.selectedCardIndex];
        if (card.unlocked) {
          this.scene.start(SCENE_KEYS.PARTY_SELECT, { areaId: card.areaId });
        }
      }
    });
  }

  private focusCard(index: number): void {
    if (this.selectedCardIndex >= 0 && this.selectedCardIndex < this.cards.length) {
      const prevCard = this.cards[this.selectedCardIndex];
      prevCard.border.setStrokeStyle(2, prevCard.unlocked ? 0x7C5CFC : 0x3B3870);
      prevCard.border.setFillStyle(0x1E1B4B);
    }

    this.selectedCardIndex = index;

    if (index >= 0 && index < this.cards.length) {
      const card = this.cards[index];
      card.border.setStrokeStyle(3, 0xA78BFA);

      const status = card.unlocked ? 'Available' : 'Locked';
      this.announceForScreenReader(`${card.areaName} — ${status}`);
    }
  }
}
