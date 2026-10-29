import Phaser from 'phaser';
import type { GameState } from '@arcane-familiars/game-logic';
import { AREAS, FAMILIARS } from '@arcane-familiars/game-logic';
import { gameApiClient } from '../api/client';
import { SCENE_KEYS } from '../constants/scenes';
import { gameEventBus } from '../event-bus';
import { GameEvent } from '../events';
import type { GameStateSnapshot } from '../events';
import { Layout } from '../ui/layout';

interface AreaCard {
  areaId: string;
  areaName: string;
  unlocked: boolean;
  border: Phaser.GameObjects.Rectangle;
  texts: Phaser.GameObjects.Text[];
}

export class WorldMapScene extends Phaser.Scene {
  private readonly MESSAGE_DISPLAY_MS = 2000;
  private layout!: Layout;
  private cards: AreaCard[] = [];
  private loadingText!: Phaser.GameObjects.Text;
  private statsText!: Phaser.GameObjects.Text;
  private messageText!: Phaser.GameObjects.Text;
  private timers: Phaser.Time.TimerEvent[] = [];
  private _sceneGeneration = 0;
  private selectedCardIndex = -1;
  private fullGameState: GameState | null = null;
  private ariaLiveElement: HTMLDivElement | null = null;
  private keyboardCleanup: (() => void) | null = null;

  constructor() {
    super({ key: SCENE_KEYS.WORLD_MAP });
  }

  init(): void {
    this._sceneGeneration++;
    this.cards = [];
    this.timers = [];
    this.selectedCardIndex = -1;
    this.events.off('shutdown', this.onShutdown, this);
    this.events.on('shutdown', this.onShutdown, this);

    // Created per scene start; removed on shutdown so revisits don't leak nodes.
    if (!this.ariaLiveElement) {
      const el = document.createElement('div');
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      el.setAttribute('aria-atomic', 'true');
      el.style.position = 'absolute';
      el.style.left = '-9999px';
      el.style.width = '1px';
      el.style.height = '1px';
      el.style.overflow = 'hidden';
      document.body.appendChild(el);
      this.ariaLiveElement = el;
    }
  }

  async create(): Promise<void> {
    // Wire EventBus for save/exit
    gameEventBus.on(GameEvent.SAVE_GAME, this.handleSave);
    gameEventBus.on(GameEvent.EXIT_GAME, this.handleExit);
    gameEventBus.emit(GameEvent.SCENE_CHANGED, { scene: 'world_map' });
    const gen = this._sceneGeneration;
    this.layout = new Layout(this);

    this.add
      .text(this.layout.x(400), this.layout.y(35), 'Arcane Familiars', {
        fontSize: this.layout.font(32),
        fontFamily: 'Fredoka',
        fontStyle: '600',
        color: '#7C5CFC',
      })
      .setOrigin(0.5);

    this.add
      .text(this.layout.x(400), this.layout.y(70), 'Choose a Dungeon', {
        fontSize: this.layout.font(15),
        fontFamily: 'DM Sans',
        fontStyle: '500',
        color: '#A5A3C4',
      })
      .setOrigin(0.5);

    this.loadingText = this.add
      .text(this.layout.x(400), this.layout.y(300), 'Loading...', {
        fontSize: this.layout.font(18),
        fontFamily: 'DM Sans',
        fontStyle: '400',
        color: '#A5A3C4',
      })
      .setOrigin(0.5);

    this.messageText = this.add
      .text(this.layout.x(400), this.layout.y(545), '', {
        fontSize: this.layout.font(14),
        fontFamily: 'DM Sans',
        fontStyle: '400',
        color: '#EF4444',
      })
      .setOrigin(0.5)
      .setAlpha(0);

    const statsBg = this.add.rectangle(
      this.layout.x(400),
      this.layout.y(582),
      this.layout.s(760),
      this.layout.s(36),
      0x1e1b4b
    );
    statsBg.setStrokeStyle(1, 0x3b3870);

    this.statsText = this.add
      .text(this.layout.x(400), this.layout.y(582), '', {
        fontSize: this.layout.font(12),
        fontFamily: 'JetBrains Mono',
        fontStyle: '500',
        color: '#A5A3C4',
      })
      .setOrigin(0.5);

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
    const areaList = Object.values(AREAS);
    const startY = 100;
    const cardHeight = 125;
    const gap = 12;
    const cardWidth = this.layout.s(700);

    const availableHeight = 600 - 60 - startY;
    const maxCards = Math.max(1, Math.floor(availableHeight / (cardHeight + gap)));
    const displayAreas = areaList.length > maxCards ? areaList.slice(0, maxCards) : areaList;

    if (areaList.length > maxCards) {
      console.warn(
        `WorldMapScene: ${areaList.length} areas exceed available space. Displaying ${maxCards} of ${areaList.length}.`
      );
    }

    displayAreas.forEach((area, index) => {
      const unlocked = unlockedAreas.includes(area.id);
      const y = this.layout.y(startY + index * (cardHeight + gap));
      const cx = this.layout.x(400);

      const bossData = FAMILIARS[area.bossId];

      const border = this.add.rectangle(
        cx,
        y + this.layout.s(cardHeight / 2),
        cardWidth,
        this.layout.s(cardHeight),
        unlocked ? 0x1e1b4b : 0x15133a
      );
      border.setStrokeStyle(this.layout.s(2), unlocked ? 0x7c5cfc : 0x3b3870);

      const texts: Phaser.GameObjects.Text[] = [];
      const left = cx - cardWidth / 2 + this.layout.s(15);

      texts.push(
        this.add.text(left, y + this.layout.s(8), area.name, {
          fontSize: this.layout.font(19),
          fontFamily: 'Fredoka',
          fontStyle: '600',
          color: unlocked ? '#7C5CFC' : '#6366A1',
        })
      );

      texts.push(
        this.add.text(left, y + this.layout.s(32), area.description, {
          fontSize: this.layout.font(12),
          fontFamily: 'DM Sans',
          fontStyle: '400',
          color: unlocked ? '#A5A3C4' : '#6366A1',
        })
      );

      const bossName = bossData?.name || area.bossId;
      texts.push(
        this.add.text(
          left,
          y + this.layout.s(54),
          `Level ${area.levelRange[0]}-${area.levelRange[1]}  |  Boss: ${bossName}`,
          {
            fontSize: this.layout.font(11),
            fontFamily: 'DM Sans',
            fontStyle: '400',
            color: unlocked ? '#6366A1' : '#3B3870',
          }
        )
      );

      texts.push(
        this.add.text(left, y + this.layout.s(74), `Recommended Level: ${area.levelRange[0]}+`, {
          fontSize: this.layout.font(11),
          fontFamily: 'DM Sans',
          fontStyle: '400',
          color: unlocked ? '#6366A1' : '#3B3870',
        })
      );

      const statusColor = unlocked ? '#10B981' : '#EF4444';
      const statusText = unlocked ? '● AVAILABLE' : '● LOCKED';
      texts.push(
        this.add
          .text(cx + cardWidth / 2 - this.layout.s(15), y + this.layout.s(8), statusText, {
            fontSize: this.layout.font(11),
            fontFamily: 'DM Sans',
            fontStyle: '500',
            color: statusColor,
          })
          .setOrigin(1, 0)
      );

      if (unlocked) {
        border.setInteractive({ useHandCursor: true });
        border.on('pointerover', () => border.setFillStyle(0x2d2a5e));
        border.on('pointerout', () => border.setFillStyle(0x1e1b4b));
        border.on('pointerdown', () => {
          this.openArea(area.id);
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
    };
    gameEventBus.emit(GameEvent.STATE_UPDATED, snapshot);
  }

  private handleSave = async (): Promise<void> => {
    // The server owns game state; nothing client-side to persist here.
    gameEventBus.emit(GameEvent.SAVE_COMPLETE, { success: true });
  };

  /**
   * Open an area card. If a dungeon run is already active (e.g. resumed after a
   * refresh), continue that run instead of opening party selection — an active
   * dungeon rejects party changes with a 409.
   */
  private openArea(areaId: string): void {
    const dungeon = this.fullGameState?.dungeon;
    if (dungeon) {
      this.scene.start(SCENE_KEYS.EXPLORATION, { areaId: dungeon.areaId });
      return;
    }
    this.scene.start(SCENE_KEYS.PARTY_SELECT, { areaId });
  }

  private handleExit = (): void => {
    this.cleanupTimers();
  };

  private onShutdown(): void {
    this.cleanupTimers();
    this.keyboardCleanup?.();
    this.keyboardCleanup = null;
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
    const onTab = (event: KeyboardEvent) => {
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
    };

    const onEnter = () => {
      if (this.selectedCardIndex >= 0 && this.selectedCardIndex < this.cards.length) {
        const card = this.cards[this.selectedCardIndex];
        if (card.unlocked) {
          this.openArea(card.areaId);
        }
      }
    };

    const onSpace = () => {
      if (this.selectedCardIndex >= 0 && this.selectedCardIndex < this.cards.length) {
        const card = this.cards[this.selectedCardIndex];
        if (card.unlocked) {
          this.openArea(card.areaId);
        }
      }
    };

    this.input.keyboard?.on('keydown-TAB', onTab);
    this.input.keyboard?.on('keydown-ENTER', onEnter);
    this.input.keyboard?.on('keydown-SPACE', onSpace);

    this.keyboardCleanup = () => {
      this.input.keyboard?.off('keydown-TAB', onTab);
      this.input.keyboard?.off('keydown-ENTER', onEnter);
      this.input.keyboard?.off('keydown-SPACE', onSpace);
    };
  }

  private focusCard(index: number): void {
    if (this.selectedCardIndex >= 0 && this.selectedCardIndex < this.cards.length) {
      const prevCard = this.cards[this.selectedCardIndex];
      prevCard.border.setStrokeStyle(this.layout.s(2), prevCard.unlocked ? 0x7c5cfc : 0x3b3870);
      prevCard.border.setFillStyle(0x1e1b4b);
    }

    this.selectedCardIndex = index;

    if (index >= 0 && index < this.cards.length) {
      const card = this.cards[index];
      card.border.setStrokeStyle(this.layout.s(3), 0xa78bfa);

      const status = card.unlocked ? 'Available' : 'Locked';
      this.announceForScreenReader(`${card.areaName} — ${status}`);
    }
  }
}
