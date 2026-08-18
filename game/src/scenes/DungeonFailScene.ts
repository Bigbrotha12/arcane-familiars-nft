import Phaser from 'phaser';
import { gameApiClient } from '../api/client';
import { gameEventBus } from '../event-bus';
import { GameEvent } from '../events';
import type { GameStateSnapshot } from '../events';
import { Layout } from '../ui/layout';

interface DungeonFailData {
  roomsExplored?: number;
  enemiesDefeated?: number;
}

export class DungeonFailScene extends Phaser.Scene {
  private roomsExplored = 0;
  private enemiesDefeated = 0;
  private activeTweens: Phaser.Tweens.Tween[] = [];
  private isExiting = false;
  private keyboardHandlers: { enter: () => void; space: () => void } | null = null;

  constructor() {
    super({ key: 'DungeonFailScene' });
  }

  init(data: DungeonFailData): void {
    this.roomsExplored = data.roomsExplored ?? 0;
    this.enemiesDefeated = data.enemiesDefeated ?? 0;
    this.events.off('shutdown', this.onShutdown, this);
    this.events.on('shutdown', this.onShutdown, this);
  }

  create(): void {
    // Wire EventBus for save/exit
    gameEventBus.on(GameEvent.SAVE_GAME, this.handleSave);
    gameEventBus.on(GameEvent.EXIT_GAME, this.handleEventExit);
    gameEventBus.emit(GameEvent.SCENE_CHANGED, { scene: 'dungeon_fail' });
    this.emitStateUpdate();

    const { width, height } = this.scale;
    const layout = new Layout(this);

    const SKULL_Y_RATIO = 0.25;
    const TITLE_Y_RATIO = 0.38;
    const SUBTITLE_Y_RATIO = 0.44;
    const DIVIDER_Y_RATIO = 0.52;
    const ROOMS_STAT_Y_RATIO = 0.57;
    const ENEMIES_STAT_Y_RATIO = 0.62;
    const BUTTON_Y_RATIO = 0.75;
    const ERROR_Y_OFFSET = 48;
    const BUTTON_WIDTH = layout.s(240);
    const BUTTON_HEIGHT = layout.s(40);
    const DIVIDER_WIDTH = layout.s(200);

    this.add.rectangle(width / 2, height / 2, width, height, 0x0A0A0F);

    const skull = this.add.text(width / 2, height * SKULL_Y_RATIO, '☠', {
      fontSize: layout.font(64),
      fontFamily: 'Fredoka',
      fontStyle: '600',
      color: '#EF4444',
    }).setOrigin(0.5);

    const skullTween = this.tweens.add({
      targets: skull,
      alpha: { from: 0.6, to: 1 },
      duration: 1500,
      yoyo: true,
      repeat: -1,
    });
    this.activeTweens.push(skullTween);

    this.events.on('shutdown', this.cleanupTweens, this);
    this.events.on('destroy', this.cleanupTweens, this);

    this.add.text(width / 2, height * TITLE_Y_RATIO, 'Defeated', {
      fontSize: layout.font(36),
      fontFamily: 'Fredoka',
      fontStyle: '600',
      color: '#EF4444',
    }).setOrigin(0.5);

    this.add.text(width / 2, height * SUBTITLE_Y_RATIO, 'Your party has fallen...', {
      fontSize: layout.font(16),
      fontFamily: 'DM Sans',
      fontStyle: '400',
      color: '#A5A3C4',
    }).setOrigin(0.5);

    this.add.rectangle(width / 2, height * DIVIDER_Y_RATIO, DIVIDER_WIDTH, layout.s(1), 0x3B3870);

    this.add.text(width / 2, height * ROOMS_STAT_Y_RATIO, `Rooms Explored: ${this.roomsExplored}`, {
      fontSize: layout.font(14),
      fontFamily: 'JetBrains Mono',
      fontStyle: '500',
      color: '#A5A3C4',
    }).setOrigin(0.5);

    this.add.text(width / 2, height * ENEMIES_STAT_Y_RATIO, `Enemies Defeated: ${this.enemiesDefeated}`, {
      fontSize: layout.font(14),
      fontFamily: 'JetBrains Mono',
      fontStyle: '500',
      color: '#A5A3C4',
    }).setOrigin(0.5);

    const btnBg = this.add.rectangle(0, 0, BUTTON_WIDTH, BUTTON_HEIGHT, 0x7C5CFC);

    const btnText = this.add.text(0, 0, 'Return to World Map', {
      fontSize: layout.font(14),
      fontFamily: 'DM Sans',
      fontStyle: '600',
      color: '#F0EFFF',
    }).setOrigin(0.5);

    const button = this.add.container(width / 2, height * BUTTON_Y_RATIO, [btnBg, btnText]);
    button.setSize(BUTTON_WIDTH, BUTTON_HEIGHT);
    button.setInteractive({ useHandCursor: true });

    const errorText = this.add.text(width / 2, height * BUTTON_Y_RATIO + layout.s(ERROR_Y_OFFSET), '', {
      fontSize: layout.font(12),
      fontFamily: 'DM Sans',
      fontStyle: '400',
      color: '#EF4444',
    }).setOrigin(0.5);

    button.on('pointerover', () => {
      if (!this.isExiting) btnBg.setFillStyle(0x6A4AE8);
    });
    button.on('pointerout', () => {
      if (!this.isExiting) btnBg.setFillStyle(0x7C5CFC);
    });
    button.on('pointerdown', () => this.handleExit(btnBg, btnText, errorText));

    const onEnter = () => this.handleExit(btnBg, btnText, errorText);
    const onSpace = () => this.handleExit(btnBg, btnText, errorText);
    this.input.keyboard?.on('keydown-ENTER', onEnter);
    this.input.keyboard?.on('keydown-SPACE', onSpace);
    this.keyboardHandlers = { enter: onEnter, space: onSpace };
  }

  private async handleExit(
    btnBg: Phaser.GameObjects.Rectangle,
    btnText: Phaser.GameObjects.Text,
    errorText: Phaser.GameObjects.Text,
  ): Promise<void> {
    if (this.isExiting) return;
    this.isExiting = true;

    errorText.setText('');
    btnText.setText('Leaving dungeon...');
    btnBg.setAlpha(0.6);

    try {
      await gameApiClient.exitDungeon();
      this.scene.start('WorldMapScene');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to exit dungeon';
      errorText.setText(message);
      btnText.setText('Return to World Map');
      btnBg.setAlpha(1);
      this.isExiting = false;
    }
  }

  private emitStateUpdate(): void {
    const snapshot: GameStateSnapshot = {
      familiars: [],
      currency: 0,
      battleCount: 0,
      wins: 0,
      currentScene: 'dungeon_fail',
    }
    gameEventBus.emit(GameEvent.STATE_UPDATED, snapshot)
  }

  private handleSave = async (): Promise<void> => {
    // The server owns game state; nothing client-side to persist here.
    gameEventBus.emit(GameEvent.SAVE_COMPLETE, { success: true });
  };

  private handleEventExit = (): void => {
    if (!this.isExiting) {
      this.isExiting = true;
      this.scene.start('WorldMapScene');
    }
  };

  private onShutdown(): void {
    gameEventBus.off(GameEvent.SAVE_GAME, this.handleSave);
    gameEventBus.off(GameEvent.EXIT_GAME, this.handleEventExit);
    this.cleanupTweens();
  }

  private cleanupTweens(): void {
    for (const tween of this.activeTweens) {
      tween.stop();
    }
    this.activeTweens = [];

    if (this.keyboardHandlers) {
      this.input.keyboard?.off('keydown-ENTER', this.keyboardHandlers.enter);
      this.input.keyboard?.off('keydown-SPACE', this.keyboardHandlers.space);
      this.keyboardHandlers = null;
    }
  }
}
