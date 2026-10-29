import Phaser from 'phaser';
import { SHOP_STOCK, getItem, describeItem } from '@arcane-familiars/game-logic';
import type { GameState } from '@arcane-familiars/game-logic';
import { gameApiClient } from '../api/client';
import { SCENE_KEYS } from '../constants/scenes';
import { Layout } from '../ui/layout';
import { C } from '../ui/theme';

export class ShopScene extends Phaser.Scene {
  private layout!: Layout;
  private state: GameState | null = null;
  private currencyText!: Phaser.GameObjects.Text;
  private messageText!: Phaser.GameObjects.Text;
  private rowTexts: Phaser.GameObjects.Text[] = [];
  private rowObjects: Phaser.GameObjects.GameObject[] = [];
  private isBuying = false;

  constructor() {
    super({ key: SCENE_KEYS.SHOP });
  }

  create(): void {
    this.layout = new Layout(this);
    this.isBuying = false;
    this.rowTexts = [];
    this.rowObjects = [];

    this.add
      .rectangle(this.scale.width / 2, this.scale.height / 2, this.scale.width, this.scale.height, C.bg)
      .setDepth(-1);

    this.add
      .text(this.layout.x(400), this.layout.y(40), 'Meadow Market', {
        fontSize: this.layout.font(30),
        fontFamily: 'Fredoka',
        fontStyle: '600',
        color: '#7C5CFC',
      })
      .setOrigin(0.5);

    this.currencyText = this.add
      .text(this.layout.x(400), this.layout.y(75), '', {
        fontSize: this.layout.font(14),
        fontFamily: 'JetBrains Mono',
        color: '#FBBF24',
      })
      .setOrigin(0.5);

    this.messageText = this.add
      .text(this.layout.x(400), this.layout.y(545), '', {
        fontSize: this.layout.font(13),
        fontFamily: 'DM Sans',
        color: '#A5A3C4',
      })
      .setOrigin(0.5);

    const back = this.add
      .text(this.layout.x(60), this.layout.y(580), '< Back', {
        fontSize: this.layout.font(14),
        fontFamily: 'DM Sans',
        color: '#A5A3C4',
      })
      .setOrigin(0, 0.5)
      .setInteractive({ useHandCursor: true });
    back.on('pointerdown', () => this.scene.start(SCENE_KEYS.WORLD_MAP));
    back.on('pointerover', () => back.setColor('#F0EFFF'));
    back.on('pointerout', () => back.setColor('#A5A3C4'));

    this.loadState();
  }

  private async loadState(): Promise<void> {
    try {
      const { state } = await gameApiClient.loadGameState();
      this.state = state;
      this.renderRows();
    } catch (err) {
      this.messageText.setText(err instanceof Error ? err.message : 'Could not load the shop');
    }
  }

  private renderRows(): void {
    for (const obj of this.rowObjects) obj.destroy();
    this.rowTexts = [];
    this.rowObjects = [];

    if (!this.state) return;
    this.currencyText.setText(`Currency: ${this.state.inventory.currency}`);

    SHOP_STOCK.forEach((entry, index) => {
      const item = getItem(entry.itemId);
      if (!item) return;
      const y = this.layout.y(115 + index * 62);

      const rowBg = this.add.rectangle(
        this.layout.x(400),
        y,
        this.layout.s(680),
        this.layout.s(52),
        index % 2 === 0 ? 0x1e1b4b : 0x191640
      );
      rowBg.setStrokeStyle(this.layout.s(1), 0x3b3870);

      const name = this.add.text(this.layout.x(80), y - this.layout.s(15), item.name, {
        fontSize: this.layout.font(16),
        fontFamily: 'Fredoka',
        fontStyle: '600',
        color: '#F0EFFF',
      });
      const desc = this.add.text(this.layout.x(80), y + this.layout.s(4), describeItem(item), {
        fontSize: this.layout.font(11),
        fontFamily: 'DM Sans',
        color: '#A5A3C4',
        wordWrap: { width: this.layout.s(430) },
      });
      const price = this.add
        .text(this.layout.x(560), y, `${entry.price}`, {
          fontSize: this.layout.font(15),
          fontFamily: 'JetBrains Mono',
          color: '#FBBF24',
        })
        .setOrigin(0.5);

      const buyBg = this.add
        .rectangle(this.layout.x(660), y, this.layout.s(110), this.layout.s(32), 0x7c5cfc)
        .setInteractive({ useHandCursor: true });
      const buyText = this.add
        .text(this.layout.x(660), y, 'Buy', {
          fontSize: this.layout.font(13),
          fontFamily: 'DM Sans',
          fontStyle: '500',
          color: '#FFFFFF',
        })
        .setOrigin(0.5);

      buyBg.on('pointerover', () => buyBg.setFillStyle(0x6a4ae8));
      buyBg.on('pointerout', () => buyBg.setFillStyle(0x7c5cfc));
      buyBg.on('pointerdown', () => {
        this.buy(entry.itemId);
      });

      this.rowTexts.push(name, desc, price, buyText);
      this.rowObjects.push(rowBg, name, desc, price, buyBg, buyText);
    });
  }

  private async buy(itemId: string): Promise<void> {
    if (this.isBuying) return;
    this.isBuying = true;
    this.messageText.setText('Buying...');

    try {
      const result = await gameApiClient.buyItem(itemId);
      this.state = result.state;
      const item = getItem(itemId);
      this.messageText.setText(`Purchased ${item?.name ?? itemId}.`);
      this.renderRows();
    } catch (err) {
      this.messageText.setText(err instanceof Error ? err.message : 'Purchase failed');
    } finally {
      this.isBuying = false;
    }
  }
}
