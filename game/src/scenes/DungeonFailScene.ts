import Phaser from 'phaser';
import { gameApiClient } from '../api/client';

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
  }

  create(): void {
    const { width, height } = this.scale;

    const SKULL_Y_RATIO = 0.25;
    const TITLE_Y_RATIO = 0.38;
    const SUBTITLE_Y_RATIO = 0.44;
    const DIVIDER_Y_RATIO = 0.52;
    const ROOMS_STAT_Y_RATIO = 0.57;
    const ENEMIES_STAT_Y_RATIO = 0.62;
    const BUTTON_Y_RATIO = 0.75;
    const ERROR_Y_OFFSET = 48;
    const BUTTON_WIDTH = 240;
    const BUTTON_HEIGHT = 40;
    const DIVIDER_WIDTH = 200;

    this.add.rectangle(width / 2, height / 2, width, height, 0x0A0A0F);

    const skull = this.add.text(width / 2, height * SKULL_Y_RATIO, '☠', {
      fontSize: '64px',
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
      fontSize: '36px',
      fontFamily: 'Fredoka',
      fontStyle: '600',
      color: '#EF4444',
    }).setOrigin(0.5);

    this.add.text(width / 2, height * SUBTITLE_Y_RATIO, 'Your party has fallen...', {
      fontSize: '16px',
      fontFamily: 'DM Sans',
      fontStyle: '400',
      color: '#A5A3C4',
    }).setOrigin(0.5);

    this.add.rectangle(width / 2, height * DIVIDER_Y_RATIO, DIVIDER_WIDTH, 1, 0x3B3870);

    this.add.text(width / 2, height * ROOMS_STAT_Y_RATIO, `Rooms Explored: ${this.roomsExplored}`, {
      fontSize: '14px',
      fontFamily: 'JetBrains Mono',
      fontStyle: '500',
      color: '#A5A3C4',
    }).setOrigin(0.5);

    this.add.text(width / 2, height * ENEMIES_STAT_Y_RATIO, `Enemies Defeated: ${this.enemiesDefeated}`, {
      fontSize: '14px',
      fontFamily: 'JetBrains Mono',
      fontStyle: '500',
      color: '#A5A3C4',
    }).setOrigin(0.5);

    const btnBg = this.add.rectangle(0, 0, BUTTON_WIDTH, BUTTON_HEIGHT, 0x7C5CFC);

    const btnText = this.add.text(0, 0, 'Return to World Map', {
      fontSize: '14px',
      fontFamily: 'DM Sans',
      fontStyle: '600',
      color: '#F0EFFF',
    }).setOrigin(0.5);

    const button = this.add.container(width / 2, height * BUTTON_Y_RATIO, [btnBg, btnText]);
    button.setSize(BUTTON_WIDTH, BUTTON_HEIGHT);
    button.setInteractive({ useHandCursor: true });

    const errorText = this.add.text(width / 2, height * BUTTON_Y_RATIO + ERROR_Y_OFFSET, '', {
      fontSize: '12px',
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
