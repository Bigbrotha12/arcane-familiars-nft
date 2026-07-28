import Phaser from 'phaser';
import { gameApiClient } from '../api/client';

interface DungeonFailData {
  roomsExplored?: number;
  enemiesDefeated?: number;
}

export class DungeonFailScene extends Phaser.Scene {
  private roomsExplored = 0;
  private enemiesDefeated = 0;

  constructor() {
    super({ key: 'DungeonFailScene' });
  }

  init(data: DungeonFailData): void {
    this.roomsExplored = data.roomsExplored ?? 0;
    this.enemiesDefeated = data.enemiesDefeated ?? 0;
  }

  create(): void {
    const { width, height } = this.scale;

    const overlay = this.add.rectangle(width / 2, height / 2, width, height, 0x0a0a0f);

    const skull = this.add.text(width / 2, height * 0.25, '☠', {
      fontSize: '64px',
      fontFamily: 'monospace',
      color: '#ef4444',
    }).setOrigin(0.5);

    this.tweens.add({
      targets: skull,
      alpha: { from: 0.6, to: 1 },
      duration: 1500,
      yoyo: true,
      repeat: -1,
    });

    this.add.text(width / 2, height * 0.38, 'Defeated', {
      fontSize: '36px',
      fontFamily: 'monospace',
      color: '#ef4444',
    }).setOrigin(0.5);

    this.add.text(width / 2, height * 0.44, 'Your party has fallen...', {
      fontSize: '16px',
      fontFamily: 'monospace',
      color: '#a0a0b0',
    }).setOrigin(0.5);

    const lineY = height * 0.52;
    this.add.rectangle(width / 2, lineY, 200, 1, 0x3b3870);

    this.add.text(width / 2, height * 0.57, `Rooms Explored: ${this.roomsExplored}`, {
      fontSize: '14px',
      fontFamily: 'monospace',
      color: '#a0a0b0',
    }).setOrigin(0.5);

    this.add.text(width / 2, height * 0.62, `Enemies Defeated: ${this.enemiesDefeated}`, {
      fontSize: '14px',
      fontFamily: 'monospace',
      color: '#a0a0b0',
    }).setOrigin(0.5);

    const btnBg = this.add.rectangle(width / 2, height * 0.75, 240, 40, 0x7C5CFC);
    btnBg.setStrokeStyle(1, 0x9b7eff);

    const btnText = this.add.text(width / 2, height * 0.75, 'Return to World Map', {
      fontSize: '14px',
      fontFamily: 'monospace',
      color: '#ffffff',
    }).setOrigin(0.5);

    btnBg.setInteractive({ useHandCursor: true });
    btnBg.on('pointerover', () => btnBg.setFillStyle(0x6b4ce0));
    btnBg.on('pointerout', () => btnBg.setFillStyle(0x7C5CFC));
    btnBg.on('pointerdown', async () => {
      btnText.setText('Leaving dungeon...');
      btnBg.disableInteractive();
      try {
        await gameApiClient.exitDungeon();
      } catch {
      }
      this.scene.start('WorldMapScene');
    });
  }
}
