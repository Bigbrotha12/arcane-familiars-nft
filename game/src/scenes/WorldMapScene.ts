import Phaser from 'phaser';
import { AREAS, FAMILIARS } from '@arcane-familiars/game-logic';
import { gameApiClient } from '../api/client';

interface AreaCard {
  areaId: string;
  unlocked: boolean;
  border: Phaser.GameObjects.Rectangle;
  texts: Phaser.GameObjects.Text[];
}

export class WorldMapScene extends Phaser.Scene {
  private cards: AreaCard[] = [];
  private loadingText!: Phaser.GameObjects.Text;
  private statsText!: Phaser.GameObjects.Text;
  private messageText!: Phaser.GameObjects.Text;
  private messageTimer: Phaser.Time.TimerEvent | null = null;

  constructor() {
    super({ key: 'WorldMapScene' });
  }

  async create(): Promise<void> {
    const { width, height } = this.scale;

    this.add.text(width / 2, 35, 'Arcane Familiars', {
      fontSize: '32px',
      fontFamily: 'monospace',
      color: '#7C5CFC',
    }).setOrigin(0.5);

    this.add.text(width / 2, 70, 'Choose a Dungeon', {
      fontSize: '15px',
      fontFamily: 'monospace',
      color: '#a0a0b0',
    }).setOrigin(0.5);

    this.loadingText = this.add.text(width / 2, height / 2, 'Loading...', {
      fontSize: '18px',
      fontFamily: 'monospace',
      color: '#a0a0b0',
    }).setOrigin(0.5);

    this.messageText = this.add.text(width / 2, 330, '', {
      fontSize: '14px',
      fontFamily: 'monospace',
      color: '#ef4444',
    }).setOrigin(0.5).setAlpha(0);

    const statsBg = this.add.rectangle(width / 2, height - 18, width - 40, 36, 0x1e1b4b);
    statsBg.setStrokeStyle(1, 0x3b3870);

    this.statsText = this.add.text(width / 2, height - 18, '', {
      fontSize: '13px',
      fontFamily: 'monospace',
      color: '#a0a0b0',
    }).setOrigin(0.5);

    try {
      const result = await gameApiClient.loadGameState();
      const state = result.state;

      this.statsText.setText(
        `Battles: ${state.battleCount}  |  Wins: ${state.winCount}  |  Currency: ${state.inventory.currency}`
      );

      this.createAreaCards(state.unlockedAreas ?? ['verdantMeadow']);
      this.loadingText.setAlpha(0);
    } catch {
      this.statsText.setText('Battles: 0  |  Wins: 0  |  Currency: 0');
      this.createAreaCards(['verdantMeadow']);
      this.loadingText.setAlpha(0);
    }
  }

  private createAreaCards(unlockedAreas: string[]): void {
    const { width } = this.scale;
    const areaList = Object.values(AREAS);
    const startY = 100;
    const cardHeight = 125;
    const gap = 12;
    const cardWidth = width - 100;

    areaList.forEach((area, index) => {
      const unlocked = unlockedAreas.includes(area.id);
      const y = startY + index * (cardHeight + gap);
      const cx = width / 2;

      const bossData = FAMILIARS[area.bossId];

      const border = this.add.rectangle(cx, y + cardHeight / 2, cardWidth, cardHeight, unlocked ? 0x1e1b4b : 0x111827);
      border.setStrokeStyle(2, unlocked ? 0x7C5CFC : 0x374151);

      const texts: Phaser.GameObjects.Text[] = [];
      const left = cx - cardWidth / 2 + 15;

      texts.push(
        this.add.text(left, y + 8, area.name, {
          fontSize: '18px',
          fontFamily: 'monospace',
          color: unlocked ? '#7C5CFC' : '#6b7280',
        })
      );

      texts.push(
        this.add.text(left, y + 32, area.description, {
          fontSize: '12px',
          fontFamily: 'monospace',
          color: unlocked ? '#a0a0b0' : '#4b5563',
        })
      );

      const bossName = bossData?.name || area.bossId;
      texts.push(
        this.add.text(left, y + 54, `Level ${area.levelRange[0]}-${area.levelRange[1]}  |  Boss: ${bossName}`, {
          fontSize: '11px',
          fontFamily: 'monospace',
          color: unlocked ? '#808090' : '#374151',
        })
      );

      texts.push(
        this.add.text(left, y + 74, `Recommended Level: ${area.levelRange[0]}+`, {
          fontSize: '11px',
          fontFamily: 'monospace',
          color: unlocked ? '#808090' : '#374151',
        })
      );

      const statusColor = unlocked ? '#10b981' : '#ef4444';
      const statusText = unlocked ? '● AVAILABLE' : '● LOCKED';
      texts.push(
        this.add.text(cx + cardWidth / 2 - 15, y + 8, statusText, {
          fontSize: '11px',
          fontFamily: 'monospace',
          color: statusColor,
        }).setOrigin(1, 0)
      );

      if (unlocked) {
        border.setInteractive({ useHandCursor: true });
        border.on('pointerover', () => border.setFillStyle(0x2a2560));
        border.on('pointerout', () => border.setFillStyle(0x1e1b4b));
        border.on('pointerdown', () => {
          this.scene.start('PartySelectScene', { areaId: area.id });
        });
      } else {
        border.setInteractive({ useHandCursor: true });
        border.on('pointerover', () => this.showMessage('Not yet unlocked'));
        border.on('pointerout', () => this.hideMessage());
      }

      this.cards.push({ areaId: area.id, unlocked, border, texts });
    });
  }

  private showMessage(msg: string): void {
    this.messageText.setText(msg).setAlpha(1);
    if (this.messageTimer) this.messageTimer.remove();
    this.messageTimer = this.time.delayedCall(2000, () => this.hideMessage());
  }

  private hideMessage(): void {
    this.messageText.setAlpha(0);
  }
}
