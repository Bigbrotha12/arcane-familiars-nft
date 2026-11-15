import Phaser from 'phaser';
import type { GameState } from '@arcane-familiars/game-logic';
import { AREAS, FAMILIARS } from '@arcane-familiars/game-logic';
import { gameApiClient } from '../api/client';
import { SCENE_KEYS } from '../constants/scenes';
import { gameEventBus } from '../event-bus';
import { GameEvent } from '../events';
import type { GameStateSnapshot } from '../events';
import { Layout } from '../ui/layout';
import { MOTION } from '../ui/motion';
import { fadeIn, fadeToScene } from '../ui/transitions';
import { audioManager } from '../audio/manager';

interface AreaCard {
  areaId: string;
  areaName: string;
  unlocked: boolean;
  container: Phaser.GameObjects.Container;
  border: Phaser.GameObjects.Rectangle;
  baseY: number;
}

/** Areas that already have painted room art; the rest get an area-coloured gradient. */
const AREA_ART: Record<string, string> = {
  verdantMeadow: 'verdant-meadow',
  crystalCaves: 'crystal-caves',
  shadowForest: 'shadow-forest',
};

const CARD = {
  WIDTH: 340,
  HEIGHT: 140,
  GAP_X: 10,
  GAP_Y: 8,
  COLUMNS: 2,
  START_Y: 92,
} as const;

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

  preload(): void {
    for (const [areaId, dir] of Object.entries(AREA_ART)) {
      this.load.image(this.areaArtKey(areaId), `/assets/rooms/${dir}/room-01.png`);
    }
  }

  private areaArtKey(areaId: string): string {
    return `world_area_${areaId}`;
  }

  async create(): Promise<void> {
    audioManager.playMusic('main');
    audioManager.stopAmbience();
    // Wire EventBus for save/exit
    gameEventBus.on(GameEvent.SAVE_GAME, this.handleSave);
    gameEventBus.on(GameEvent.EXIT_GAME, this.handleExit);
    gameEventBus.emit(GameEvent.SCENE_CHANGED, { scene: 'world_map' });
    const gen = this._sceneGeneration;
    this.layout = new Layout(this);
    fadeIn(this);

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
      .text(this.layout.x(400), this.layout.y(546), '', {
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

    const shopText = this.add
      .text(this.layout.x(720), this.layout.y(558), '🛒 Shop', {
        fontSize: this.layout.font(13),
        fontFamily: 'DM Sans',
        fontStyle: '500',
        color: '#7C5CFC',
      })
      .setOrigin(1, 0.5)
      .setInteractive({ useHandCursor: true });
    shopText.on('pointerdown', () => {
      audioManager.playSfx('ui_click');
      fadeToScene(this, SCENE_KEYS.SHOP);
    });
    shopText.on('pointerover', () => shopText.setColor('#A78BFA'));
    shopText.on('pointerout', () => shopText.setColor('#7C5CFC'));

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
      this.createAreaCards(unlockedAreas, state.defeatedBosses ?? []);
      this.loadingText.setAlpha(0);
      this.emitStateUpdate();
    } catch (err) {
      if (this._sceneGeneration !== gen) return;
      console.error('WorldMapScene: failed to load game state:', err);

      this.statsText.setText('Battles: 0  |  Wins: 0  |  Currency: 0');
      this.createAreaCards(['verdantMeadow'], []);
      this.loadingText.setAlpha(0);
    }
  }

  private createAreaCards(unlockedAreas: string[], defeatedBosses: string[]): void {
    const areaList = Object.values(AREAS);
    const totalWidth = CARD.COLUMNS * CARD.WIDTH + (CARD.COLUMNS - 1) * CARD.GAP_X;
    const leftEdge = 400 - totalWidth / 2;

    areaList.forEach((area, index) => {
      const unlocked = unlockedAreas.includes(area.id);
      const cleared = defeatedBosses.includes(area.bossId);
      const column = index % CARD.COLUMNS;
      const row = Math.floor(index / CARD.COLUMNS);
      const cx = this.layout.x(leftEdge + CARD.WIDTH / 2 + column * (CARD.WIDTH + CARD.GAP_X));
      const centerY = this.layout.y(CARD.START_Y + row * (CARD.HEIGHT + CARD.GAP_Y) + CARD.HEIGHT / 2);

      const container = this.add.container(cx, centerY);
      const cardW = this.layout.s(CARD.WIDTH);
      const cardH = this.layout.s(CARD.HEIGHT);

      const bg = this.add.rectangle(0, 0, cardW, cardH, unlocked ? 0x1e1b4b : 0x15133a);
      container.add(bg);
      container.add(this.createThumbnail(area.id, area.bgColor, cardW, cardH, unlocked));

      // Scrim keeps the card text readable over any art.
      const scrim = this.add.rectangle(0, 0, cardW, cardH, 0x0a0a0f, unlocked ? 0.55 : 0.7);
      container.add(scrim);

      const border = this.add.rectangle(0, 0, cardW, cardH);
      border.setStrokeStyle(this.layout.s(2), unlocked ? 0x7c5cfc : 0x3b3870);
      container.add(border);

      const left = -cardW / 2 + this.layout.s(12);
      const top = -cardH / 2;

      container.add(
        this.add.text(left, top + this.layout.s(9), area.name, {
          fontSize: this.layout.font(16),
          fontFamily: 'Fredoka',
          fontStyle: '600',
          color: unlocked ? '#F0EFFF' : '#6366A1',
        })
      );

      container.add(
        this.add.text(left, top + this.layout.s(34), area.description, {
          fontSize: this.layout.font(10),
          fontFamily: 'DM Sans',
          fontStyle: '400',
          color: unlocked ? '#B8B5E0' : '#3B3870',
          wordWrap: { width: cardW - this.layout.s(90) },
        })
      );

      const bossName = FAMILIARS[area.bossId]?.name ?? area.bossId;
      container.add(
        this.add.text(
          left,
          top + this.layout.s(70),
          `Lv ${area.levelRange[0]}-${area.levelRange[1]}  ·  Boss: ${bossName}`,
          {
            fontSize: this.layout.font(10),
            fontFamily: 'JetBrains Mono',
            fontStyle: '500',
            color: unlocked ? '#A5A3C4' : '#3B3870',
          }
        )
      );

      container.add(
        this.add.text(left, top + this.layout.s(90), unlocked ? 'Tap to enter' : 'Locked', {
          fontSize: this.layout.font(10),
          fontFamily: 'DM Sans',
          fontStyle: '500',
          color: unlocked ? '#7C5CFC' : '#6366A1',
        })
      );

      // Status chip (top-right): available / locked / cleared.
      const statusLabel = cleared ? '★ CLEARED' : unlocked ? '● AVAILABLE' : '● LOCKED';
      const statusColor = cleared ? '#FBBF24' : unlocked ? '#10B981' : '#EF4444';
      container.add(
        this.add
          .text(cardW / 2 - this.layout.s(12), top + this.layout.s(9), statusLabel, {
            fontSize: this.layout.font(9),
            fontFamily: 'DM Sans',
            fontStyle: '500',
            color: statusColor,
          })
          .setOrigin(1, 0)
      );

      if (!unlocked) {
        container.add(this.createLockOverlay(area.id, cardW, cardH));
      }

      bg.setInteractive({ useHandCursor: unlocked });
      bg.on('pointerover', () => {
        if (!unlocked) {
          audioManager.playSfx('ui_error', { volume: 0.5 });
          this.showMessage('Not yet unlocked');
          return;
        }
        this.liftCard(container, centerY, true);
        border.setStrokeStyle(this.layout.s(3), 0xa78bfa);
      });
      bg.on('pointerout', () => {
        if (!unlocked) {
          this.hideMessage();
          return;
        }
        this.liftCard(container, centerY, false);
        border.setStrokeStyle(this.layout.s(2), 0x7c5cfc);
      });
      bg.on('pointerdown', () => {
        if (!unlocked) {
          audioManager.playSfx('ui_error');
          this.showMessage(this.lockConditionText(area.id));
          return;
        }
        audioManager.playSfx('ui_click');
        this.openArea(area.id);
      });

      this.cards.push({ areaId: area.id, areaName: area.name, unlocked, container, border, baseY: centerY });
    });
  }

  /**
   * Card background art: the area's painted room shot, cover-cropped to the card
   * (centre crop + uniform scale, so nothing is stretched), or a gradient built
   * from the area's palette colour when no art exists for that area yet.
   */
  private createThumbnail(
    areaId: string,
    bgColor: number,
    cardW: number,
    cardH: number,
    unlocked: boolean
  ): Phaser.GameObjects.GameObject {
    const key = this.areaArtKey(areaId);
    if (this.textures.exists(key)) {
      const source = this.textures.get(key).getSourceImage() as { width: number; height: number };
      const targetRatio = CARD.WIDTH / CARD.HEIGHT;
      let cropW = source.width;
      let cropH = source.height;
      if (source.width / source.height > targetRatio) cropW = source.height * targetRatio;
      else cropH = source.width / targetRatio;

      const image = this.add.image(0, 0, key);
      image.setCrop((source.width - cropW) / 2, (source.height - cropH) / 2, cropW, cropH);
      image.setScale(Math.max(cardW / cropW, cardH / cropH));
      image.setAlpha(unlocked ? 0.75 : 0.35);
      return image;
    }

    // No art yet: a vertical gradient from the area's own colour (WebGL draws
    // the gradient; the canvas fallback paints the base tint).
    const light = this.lighten(bgColor, 0.35);
    const dark = this.lighten(bgColor, -0.55);
    const graphics = this.add.graphics();
    graphics.fillGradientStyle(light, light, dark, dark, unlocked ? 0.9 : 0.5);
    graphics.fillRect(-cardW / 2, -cardH / 2, cardW, cardH);
    return graphics;
  }

  private lighten(color: number, amount: number): number {
    const r = (color >> 16) & 0xff;
    const g = (color >> 8) & 0xff;
    const b = color & 0xff;
    const adjust = (channel: number) =>
      Math.max(0, Math.min(255, Math.round(amount >= 0 ? channel + (255 - channel) * amount : channel * (1 + amount))));
    return (adjust(r) << 16) | (adjust(g) << 8) | adjust(b);
  }

  /** Dim + lock badge showing the unlock condition for a locked area. */
  private createLockOverlay(areaId: string, cardW: number, cardH: number): Phaser.GameObjects.Container {
    const overlay = this.add.container(0, 0);
    const dim = this.add.rectangle(0, 0, cardW, cardH, 0x0a0a0f, 0.55);
    overlay.add(dim);

    overlay.add(
      this.add
        .text(0, -this.layout.s(10), `🔒 ${this.lockConditionText(areaId)}`, {
          fontSize: this.layout.font(12),
          fontFamily: 'DM Sans',
          fontStyle: '500',
          color: '#F0EFFF',
          align: 'center',
          wordWrap: { width: cardW - this.layout.s(32) },
        })
        .setOrigin(0.5)
    );
    return overlay;
  }

  /** "<Defeat previous boss>" derived from the area that unlocks this one. */
  private lockConditionText(areaId: string): string {
    const previous = Object.values(AREAS).find((area) => area.unlocks === areaId);
    if (!previous) return 'Complete earlier dungeons to unlock';
    const bossName = FAMILIARS[previous.bossId]?.name ?? previous.bossId;
    return `Defeat ${bossName} in ${previous.name}`;
  }

  private liftCard(container: Phaser.GameObjects.Container, baseY: number, lifted: boolean): void {
    this.tweens.add({
      targets: container,
      y: baseY - (lifted ? this.layout.s(4) : 0),
      duration: MOTION.short,
      ease: 'Cubic.easeOut',
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
      fadeToScene(this, SCENE_KEYS.EXPLORATION, { areaId: dungeon.areaId });
      return;
    }
    fadeToScene(this, SCENE_KEYS.PARTY_SELECT, { areaId });
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

  /**
   * True while a DOM control or dialog owns the keyboard (toolbar auth form,
   * exit modal). Phaser listens on the window, so without this every Tab press
   * in the sign-in form also cycled the dungeon cards.
   */
  private domOwnsKeyboard(): boolean {
    if (typeof document === 'undefined') return false;
    if (document.querySelector('[role="dialog"][aria-modal="true"]')) return true;
    const active = document.activeElement as HTMLElement | null;
    if (!active || active === document.body) return false;
    const tag = active.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON' || active.isContentEditable;
  }

  private setupKeyboardNavigation(): void {
    const onTab = (event: KeyboardEvent) => {
      if (this.domOwnsKeyboard()) return;
      event.preventDefault();
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
      if (this.domOwnsKeyboard()) return;
      if (this.selectedCardIndex >= 0 && this.selectedCardIndex < this.cards.length) {
        const card = this.cards[this.selectedCardIndex];
        if (card.unlocked) {
          audioManager.playSfx('ui_click');
          this.openArea(card.areaId);
        }
      }
    };

    const onSpace = () => {
      if (this.domOwnsKeyboard()) return;
      if (this.selectedCardIndex >= 0 && this.selectedCardIndex < this.cards.length) {
        const card = this.cards[this.selectedCardIndex];
        if (card.unlocked) {
          audioManager.playSfx('ui_click');
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
      this.liftCard(prevCard.container, prevCard.baseY, false);
    }

    this.selectedCardIndex = index;

    if (index >= 0 && index < this.cards.length) {
      audioManager.playSfx('ui_hover', { volume: 0.45 });
      const card = this.cards[index];
      card.border.setStrokeStyle(this.layout.s(3), 0xa78bfa);
      this.liftCard(card.container, card.baseY, true);

      const status = card.unlocked ? 'Available' : 'Locked';
      this.announceForScreenReader(`${card.areaName} — ${status}`);
    }
  }
}
