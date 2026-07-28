import Phaser from 'phaser';
import { FAMILIARS, getAbility } from '@arcane-familiars/game-logic';
import { gameApiClient } from '../api/client';

interface PartySelectData {
  areaId: string;
}

interface FamiliarCard {
  familiarId: string;
  selected: boolean;
  border: Phaser.GameObjects.Rectangle;
  bg: Phaser.GameObjects.Rectangle;
  container: Phaser.GameObjects.Container;
}

export class PartySelectScene extends Phaser.Scene {
  private areaId!: string;
  private cards: FamiliarCard[] = [];
  private selectedIds: string[] = [];
  private loadingText!: Phaser.GameObjects.Text;
  private confirmText!: Phaser.GameObjects.Text;
  private confirmBg!: Phaser.GameObjects.Rectangle;
  private backText!: Phaser.GameObjects.Text;
  private instructionText!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'PartySelectScene' });
  }

  init(data: PartySelectData): void {
    this.areaId = data.areaId;
    this.cards = [];
    this.selectedIds = [];
  }

  async create(): Promise<void> {
    const { width, height } = this.scale;

    this.add.text(width / 2, 30, 'Select Your Party', {
      fontSize: '28px',
      fontFamily: 'monospace',
      color: '#7C5CFC',
    }).setOrigin(0.5);

    this.instructionText = this.add.text(width / 2, 60, 'Choose 2 Familiars', {
      fontSize: '14px',
      fontFamily: 'monospace',
      color: '#a0a0b0',
    }).setOrigin(0.5);

    this.loadingText = this.add.text(width / 2, height / 2, 'Loading...', {
      fontSize: '18px',
      fontFamily: 'monospace',
      color: '#a0a0b0',
    }).setOrigin(0.5);

    this.confirmBg = this.add.rectangle(width / 2, height - 30, 200, 36, 0x374151);
    this.confirmBg.setStrokeStyle(1, 0x4b5563);

    this.confirmText = this.add.text(width / 2, height - 30, 'Confirm Party', {
      fontSize: '14px',
      fontFamily: 'monospace',
      color: '#6b7280',
    }).setOrigin(0.5);

    this.backText = this.add.text(30, height - 30, '< Back', {
      fontSize: '14px',
      fontFamily: 'monospace',
      color: '#a0a0b0',
    }).setInteractive({ useHandCursor: true });

    this.backText.on('pointerdown', () => {
      this.scene.start('WorldMapScene');
    });
    this.backText.on('pointerover', () => this.backText.setColor('#ffffff'));
    this.backText.on('pointerout', () => this.backText.setColor('#a0a0b0'));

    try {
      const result = await gameApiClient.loadGameState();
      const state = result.state;
      const familiarIds = state.playerFamiliars?.length ? state.playerFamiliars : ['whiteDog', 'yellowFighter'];

      this.loadingText.setAlpha(0);
      this.createFamiliarCards(familiarIds);

      if (state.activeParty?.length) {
        state.activeParty.forEach((id) => {
          const card = this.cards.find((c) => c.familiarId === id);
          if (card) this.toggleCard(card);
        });
      }
    } catch {
      this.loadingText.setAlpha(0);
      this.createFamiliarCards(['whiteDog', 'yellowFighter']);
    }
  }

  private createFamiliarCards(familiarIds: string[]): void {
    const { width } = this.scale;
    const cardWidth = 160;
    const cardHeight = 360;
    const totalWidth = familiarIds.length * cardWidth + (familiarIds.length - 1) * 15;
    const startX = (width - totalWidth) / 2 + cardWidth / 2;
    const y = 190;

    familiarIds.forEach((id, index) => {
      const familiar = FAMILIARS[id];
      if (!familiar) return;
      const x = startX + index * (cardWidth + 15);

      const bg = this.add.rectangle(0, 0, cardWidth, cardHeight, 0x1e1b4b);
      const border = this.add.rectangle(0, 0, cardWidth, cardHeight);
      border.setStrokeStyle(2, 0x3b3870);
      border.setFillStyle(0x1e1b4b);

      const container = this.add.container(x, y, [border, bg]);

      const offsetY = -cardHeight / 2 + 12;

      const nameText = this.add.text(0, offsetY, familiar.name, {
        fontSize: '16px',
        fontFamily: 'monospace',
        color: '#7C5CFC',
      }).setOrigin(0.5, 0);

      const affinityText = this.add.text(0, offsetY + 24, familiar.affinity, {
        fontSize: '11px',
        fontFamily: 'monospace',
        color: '#a0a0b0',
      }).setOrigin(0.5, 0);

      const statsStr =
        `HP: ${familiar.stats.hp}\n` +
        `ATK: ${familiar.stats.attack}\n` +
        `DEF: ${familiar.stats.defense}\n` +
        `SPD: ${familiar.stats.speed}\n` +
        `ARC: ${familiar.stats.arcane}`;

      const statsText = this.add.text(0, offsetY + 48, statsStr, {
        fontSize: '11px',
        fontFamily: 'monospace',
        color: '#a0a0b0',
        align: 'left',
      }).setOrigin(0.5, 0);

      const abilityNames = familiar.abilities
        .map((aId) => {
          const ability = getAbility(aId);
          return ability?.name || aId;
        })
        .join(', ');

      const abilitiesLabel = this.add.text(0, offsetY + 165, 'Abilities:', {
        fontSize: '11px',
        fontFamily: 'monospace',
        color: '#808090',
      }).setOrigin(0.5, 0);

      const abilitiesText = this.add.text(0, offsetY + 180, abilityNames, {
        fontSize: '10px',
        fontFamily: 'monospace',
        color: '#a0a0b0',
        wordWrap: { width: cardWidth - 20 },
        align: 'center',
      }).setOrigin(0.5, 0);

      container.add([nameText, affinityText, statsText, abilitiesLabel, abilitiesText]);

      border.setInteractive({ useHandCursor: true });
      border.on('pointerdown', () => {
        const card = this.cards.find((c) => c.familiarId === id);
        if (card) this.toggleCard(card);
      });
      border.on('pointerover', () => {
        if (!this.cards.find((c) => c.familiarId === id)?.selected) {
          border.setFillStyle(0x2a2560);
        }
      });
      border.on('pointerout', () => {
        if (!this.cards.find((c) => c.familiarId === id)?.selected) {
          border.setFillStyle(0x1e1b4b);
        }
      });

      this.cards.push({ familiarId: id, selected: false, border, bg, container });
    });
  }

  private toggleCard(card: FamiliarCard): void {
    if (card.selected) {
      card.selected = false;
      card.border.setStrokeStyle(2, 0x3b3870);
      card.border.setFillStyle(0x1e1b4b);
      this.selectedIds = this.selectedIds.filter((id) => id !== card.familiarId);
    } else {
      if (this.selectedIds.length >= 2) return;
      card.selected = true;
      card.border.setStrokeStyle(2, 0x7C5CFC);
      card.border.setFillStyle(0x1e1b4b);
      this.selectedIds.push(card.familiarId);
    }

    this.updateConfirmButton();
  }

  private updateConfirmButton(): void {
    const ready = this.selectedIds.length === 2;
    this.confirmBg.setFillStyle(ready ? 0x7C5CFC : 0x374151);
    this.confirmBg.setStrokeStyle(1, ready ? 0x9b7eff : 0x4b5563);
    this.confirmText.setColor(ready ? '#ffffff' : '#6b7280');

    if (ready) {
      if (!this.confirmBg.input?.enabled) {
        this.confirmBg.setInteractive({ useHandCursor: true });
        this.confirmBg.on('pointerdown', () => this.confirmParty());
      }
    } else {
      if (this.confirmBg.input?.enabled) {
        this.confirmBg.disableInteractive();
        this.confirmBg.removeAllListeners('pointerdown');
      }
    }
  }

  private async confirmParty(): Promise<void> {
    this.confirmText.setText('Saving...');
    this.confirmBg.disableInteractive();

    try {
      const result = await gameApiClient.loadGameState();
      const state = result.state;
      state.activeParty = [...this.selectedIds];
      await gameApiClient.saveGameState(state);
      this.scene.start('ExplorationScene', { areaId: this.areaId });
    } catch {
      this.confirmText.setText('Failed to save');
      this.time.delayedCall(1000, () => this.confirmParty());
    }
  }
}
