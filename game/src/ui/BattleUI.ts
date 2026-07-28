import Phaser from 'phaser';
import {
  BattleFamiliar,
  BattleAction,
  getAbility,
} from '@arcane-familiars/game-logic';

export interface BattleUICallbacks {
  onAction: (action: BattleAction) => void;
  onFlee: () => void;
  onShowAbility?: () => void;
  onShowItem?: () => void;
}

const C = {
  bg: 0x0a0a0f,
  primary: 0x7c5cfc,
  primaryHover: 0x6a4ae8,
  text: '#a0a0b0',
  textLight: '#F0EFFF',
  textMuted: '#6366A1',
  hpBar: 0x2dd4bf,
  hpBarMid: 0xf59e0b,
  hpBarLow: 0xef4444,
  mpBar: 0x6366a1,
  buttonBg: 0x3b3870,
  panelBg: 0x1e1b4b,
  border: 0x3b3870,
  cardBg: 0x2d2a5e,
  barBg: 0x1a1a2e,
};

export class BattleUI {
  private scene: Phaser.Scene;
  private callbacks: BattleUICallbacks;
  private gameWidth: number;
  private gameHeight: number;

  private playerSprite!: Phaser.GameObjects.Rectangle;
  private enemySprite!: Phaser.GameObjects.Rectangle;
  private playerName!: Phaser.GameObjects.Text;
  private enemyName!: Phaser.GameObjects.Text;
  private playerHpBar!: Phaser.GameObjects.Graphics;
  private playerMpBar!: Phaser.GameObjects.Graphics;
  private enemyHpBar!: Phaser.GameObjects.Graphics;
  private enemyMpBar!: Phaser.GameObjects.Graphics;
  private playerHpText!: Phaser.GameObjects.Text;
  private playerMpText!: Phaser.GameObjects.Text;
  private enemyHpText!: Phaser.GameObjects.Text;
  private enemyMpText!: Phaser.GameObjects.Text;
  private logText!: Phaser.GameObjects.Text;
  private mainActions!: Phaser.GameObjects.Container;
  private abilityPanel!: Phaser.GameObjects.Container;
  private itemPanel!: Phaser.GameObjects.Container;
  private actionButtons: Phaser.GameObjects.Container[] = [];
  private outcomeOverlay!: Phaser.GameObjects.Container;
  private battleLog: string[] = [];
  private connectingText?: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, callbacks: BattleUICallbacks) {
    this.scene = scene;
    this.callbacks = callbacks;
    this.gameWidth = scene.scale.width;
    this.gameHeight = scene.scale.height;
  }

  init(): void {
    this.createBackground();
    this.createEnemyArea();
    this.createPlayerArea();
    this.createLogPanel();
    this.createMainActions();
    this.createAbilityPanel();
    this.createItemPanel();
    this.createOutcomeOverlay();
    this.showConnecting();
  }

  private createBackground(): void {
    this.scene.add.rectangle(
      this.gameWidth / 2,
      this.gameHeight / 2,
      this.gameWidth,
      this.gameHeight,
      C.bg,
    );

    const separatorY = this.gameHeight - 80;
    this.scene.add.rectangle(
      this.gameWidth / 2,
      separatorY,
      this.gameWidth - 40,
      2,
      0x1e1b4b,
    );
  }

  private createEnemyArea(): void {
    const sx = 480;
    const sy = 140;

    this.enemySprite = this.scene.add.rectangle(sx, sy, 100, 100, 0x4e2a2a);
    this.enemySprite.setStrokeStyle(2, 0xfc5c5c);

    this.enemyName = this.scene.add.text(sx, 70, '', {
      fontSize: '14px',
      fontFamily: 'monospace',
      color: '#fc5c5c',
    });
    this.enemyName.setOrigin(0.5);

    this.enemyHpBar = this.scene.add.graphics();
    this.enemyMpBar = this.scene.add.graphics();

    this.enemyHpText = this.scene.add.text(560, 200, '', {
      fontSize: '11px',
      fontFamily: 'monospace',
      color: C.text,
    });

    this.enemyMpText = this.scene.add.text(560, 218, '', {
      fontSize: '11px',
      fontFamily: 'monospace',
      color: C.text,
    });

    const enemyLabel = this.scene.add.text(sx, sy + 60, 'ENEMY', {
      fontSize: '9px',
      fontFamily: 'monospace',
      color: '#fc5c5c',
    });
    enemyLabel.setOrigin(0.5);
  }

  private createPlayerArea(): void {
    const sx = 180;
    const sy = 400;

    this.playerSprite = this.scene.add.rectangle(sx, sy, 100, 100, 0x2a2a4e);
    this.playerSprite.setStrokeStyle(2, 0x7c5cfc);

    this.playerName = this.scene.add.text(sx, 455, '', {
      fontSize: '14px',
      fontFamily: 'monospace',
      color: '#7C5CFC',
    });
    this.playerName.setOrigin(0.5);

    this.playerHpBar = this.scene.add.graphics();
    this.playerMpBar = this.scene.add.graphics();

    this.playerHpText = this.scene.add.text(260, 478, '', {
      fontSize: '11px',
      fontFamily: 'monospace',
      color: C.text,
    });

    this.playerMpText = this.scene.add.text(260, 496, '', {
      fontSize: '11px',
      fontFamily: 'monospace',
      color: C.text,
    });

    const playerLabel = this.scene.add.text(sx, sy + 60, 'PLAYER', {
      fontSize: '9px',
      fontFamily: 'monospace',
      color: '#7C5CFC',
    });
    playerLabel.setOrigin(0.5);
  }

  private createLogPanel(): void {
    const px = 605;
    const py = 50;
    const pw = 180;
    const ph = 310;

    const logBg = this.scene.add.rectangle(
      px + pw / 2,
      py + ph / 2,
      pw,
      ph,
      C.panelBg,
      0.9,
    );
    logBg.setStrokeStyle(1, C.border);

    const logTitle = this.scene.add.text(px + 8, py + 6, 'Battle Log', {
      fontSize: '11px',
      fontFamily: 'monospace',
      color: '#7C5CFC',
    });

    this.logText = this.scene.add.text(px + 8, py + 24, '', {
      fontSize: '10px',
      fontFamily: 'monospace',
      color: C.text,
      wordWrap: { width: pw - 16 },
      lineSpacing: 4,
    });
  }

  private createMainActions(): void {
    this.mainActions = this.scene.add.container(0, 0);
    this.mainActions.setVisible(false);

    const buttonDefs = [
      { label: 'Attack', action: () => this.callbacks.onAction({ type: 'attack' }) },
      { label: 'Defend', action: () => this.callbacks.onAction({ type: 'defend' }) },
      { label: 'Ability', action: () => this.callbacks.onShowAbility?.() },
      { label: 'Item', action: () => this.callbacks.onShowItem?.() },
      { label: 'Run', action: () => this.callbacks.onFlee() },
    ];

    const positions = [210, 305, 400, 495, 590];
    const bw = 80;
    const bh = 34;
    const by = 565;

    buttonDefs.forEach((def, i) => {
      const bg = this.scene.add.rectangle(0, 0, bw, bh, C.buttonBg);
      bg.setStrokeStyle(1, C.border);

      const label = this.scene.add.text(0, 0, def.label, {
        fontSize: '13px',
        fontFamily: 'monospace',
        color: '#F0EFFF',
      });
      label.setOrigin(0.5);

      const container = this.scene.add.container(positions[i], by, [bg, label]);
      container.setSize(bw, bh);
      container.setInteractive({ useHandCursor: true });

      container.on('pointerover', () => bg.setFillStyle(C.primaryHover));
      container.on('pointerout', () => bg.setFillStyle(C.buttonBg));
      container.on('pointerdown', () => def.action());

      this.mainActions.add(container);
      this.actionButtons.push(container);
    });
  }

  private createAbilityPanel(): void {
    this.abilityPanel = this.scene.add.container(0, 0);
    this.abilityPanel.setVisible(false);
  }

  private createItemPanel(): void {
    this.itemPanel = this.scene.add.container(0, 0);
    this.itemPanel.setVisible(false);
  }

  private createOutcomeOverlay(): void {
    this.outcomeOverlay = this.scene.add.container(0, 0);
    this.outcomeOverlay.setVisible(false);
  }

  showConnecting(): void {
    this.connectingText = this.scene.add.text(
      this.gameWidth / 2,
      this.gameHeight / 2,
      'Connecting...',
      {
        fontSize: '18px',
        fontFamily: 'monospace',
        color: '#a0a0b0',
      },
    );
    this.connectingText.setOrigin(0.5);
  }

  hideConnecting(): void {
    if (this.connectingText) {
      this.connectingText.destroy();
      this.connectingText = undefined;
    }
  }

  enableMainActions(): void {
    this.mainActions.setVisible(true);
  }

  disableMainActions(): void {
    this.mainActions.setVisible(false);
  }

  updatePlayerDisplay(familiar: BattleFamiliar): void {
    const stats = familiar.familiarData.stats;
    this.playerName.setText(familiar.familiarData.name);

    const hpColor = this.getHpColor(familiar.currentHp, stats.maxHp);
    this.drawBar(this.playerHpBar, 105, 478, 150, 12, familiar.currentHp, stats.maxHp, hpColor);
    this.drawBar(this.playerMpBar, 105, 496, 150, 8, familiar.currentMp, stats.maxMp, C.mpBar);

    this.playerHpText.setText(`HP: ${familiar.currentHp}/${stats.maxHp}`);
    this.playerMpText.setText(`MP: ${familiar.currentMp}/${stats.maxMp}`);
  }

  updateEnemyDisplay(familiar: BattleFamiliar): void {
    const stats = familiar.familiarData.stats;
    this.enemyName.setText(familiar.familiarData.name);

    const hpColor = this.getHpColor(familiar.currentHp, stats.maxHp);
    this.drawBar(this.enemyHpBar, 405, 200, 150, 12, familiar.currentHp, stats.maxHp, hpColor);
    this.drawBar(this.enemyMpBar, 405, 218, 150, 8, familiar.currentMp, stats.maxMp, C.mpBar);

    this.enemyHpText.setText(`HP: ${familiar.currentHp}/${stats.maxHp}`);
    this.enemyMpText.setText(`MP: ${familiar.currentMp}/${stats.maxMp}`);
  }

  private getHpColor(current: number, max: number): number {
    const ratio = current / max;
    if (ratio > 0.5) return C.hpBar;
    if (ratio > 0.25) return C.hpBarMid;
    return C.hpBarLow;
  }

  private drawBar(
    g: Phaser.GameObjects.Graphics,
    x: number, y: number, w: number, h: number,
    cur: number, max: number, color: number,
  ): void {
    g.clear();
    g.fillStyle(C.barBg, 1);
    g.fillRect(x, y, w, h);
    g.lineStyle(1, C.border, 1);
    g.strokeRect(x, y, w, h);
    const ratio = Math.max(0, Math.min(1, cur / max));
    if (ratio > 0) {
      g.fillStyle(color, 1);
      g.fillRect(x + 1, y + 1, (w - 2) * ratio, h - 2);
    }
  }

  showAbilityPanel(familiar: BattleFamiliar): void {
    this.abilityPanel.removeAll(true);
    this.abilityPanel.setVisible(true);
    this.mainActions.setVisible(false);

    const overlay = this.scene.add.rectangle(
      this.gameWidth / 2, this.gameHeight / 2,
      this.gameWidth, this.gameHeight,
      0x000000, 0.6,
    );
    overlay.setInteractive();
    this.abilityPanel.add(overlay);

    const panelBg = this.scene.add.rectangle(
      this.gameWidth / 2, 320,
      340, 300, C.panelBg, 0.95,
    );
    panelBg.setStrokeStyle(1, C.border);
    this.abilityPanel.add(panelBg);

    const title = this.scene.add.text(this.gameWidth / 2, 190, 'Select Ability', {
      fontSize: '16px',
      fontFamily: 'monospace',
      color: '#F0EFFF',
    });
    title.setOrigin(0.5);
    this.abilityPanel.add(title);

    const abilities = familiar.familiarData.abilities;
    const startY = 215;

    abilities.forEach((abilityId, index) => {
      const ability = getAbility(abilityId);
      if (!ability) return;

      const y = startY + index * 50;
      const canUse = familiar.currentMp >= ability.mpCost;

      const bg = this.scene.add.rectangle(this.gameWidth / 2, y, 300, 42, canUse ? C.cardBg : 0x1a1a2e);
      bg.setStrokeStyle(1, canUse ? C.border : 0x2a2a4e);
      this.abilityPanel.add(bg);

      const name = this.scene.add.text(this.gameWidth / 2 - 130, y - 7, ability.name, {
        fontSize: '13px',
        fontFamily: 'monospace',
        color: canUse ? '#F0EFFF' : '#6366A1',
      });
      this.abilityPanel.add(name);

      const desc = this.scene.add.text(this.gameWidth / 2 - 130, y + 9, `${ability.description}`, {
        fontSize: '9px',
        fontFamily: 'monospace',
        color: canUse ? '#a0a0b0' : '#4a4a5a',
      });
      this.abilityPanel.add(desc);

      const cost = this.scene.add.text(this.gameWidth / 2 + 130, y, `MP:${ability.mpCost}`, {
        fontSize: '11px',
        fontFamily: 'monospace',
        color: canUse ? '#6366A1' : '#4a4a5a',
      });
      cost.setOrigin(1, 0.5);
      this.abilityPanel.add(cost);

      if (canUse) {
        const btn = this.scene.add.container(0, 0);
        btn.setSize(300, 42);
        btn.setPosition(this.gameWidth / 2, y);
        btn.setInteractive({ useHandCursor: true });

        btn.on('pointerover', () => bg.setFillStyle(C.primaryHover));
        btn.on('pointerout', () => bg.setFillStyle(C.cardBg));
        btn.on('pointerdown', () => {
          this.callbacks.onAction({ type: 'ability', abilityId });
        });

        this.abilityPanel.add(btn);
      }
    });

    this.addPanelBackButton(this.abilityPanel, this.gameHeight - 150);
  }

  showItemPanel(inventory: { itemId: string; quantity: number }[]): void {
    this.itemPanel.removeAll(true);
    this.itemPanel.setVisible(true);
    this.mainActions.setVisible(false);

    const overlay = this.scene.add.rectangle(
      this.gameWidth / 2, this.gameHeight / 2,
      this.gameWidth, this.gameHeight,
      0x000000, 0.6,
    );
    overlay.setInteractive();
    this.itemPanel.add(overlay);

    const panelBg = this.scene.add.rectangle(
      this.gameWidth / 2, 320,
      340, 300, C.panelBg, 0.95,
    );
    panelBg.setStrokeStyle(1, C.border);
    this.itemPanel.add(panelBg);

    const title = this.scene.add.text(this.gameWidth / 2, 190, 'Select Item', {
      fontSize: '16px',
      fontFamily: 'monospace',
      color: '#F0EFFF',
    });
    title.setOrigin(0.5);
    this.itemPanel.add(title);

    if (!inventory || inventory.length === 0) {
      const msg = this.scene.add.text(this.gameWidth / 2, 300, 'No items available', {
        fontSize: '13px',
        fontFamily: 'monospace',
        color: C.textMuted,
      });
      msg.setOrigin(0.5);
      this.itemPanel.add(msg);
    } else {
      const startY = 215;
      inventory.forEach((entry, index) => {
        const y = startY + index * 50;
        const bg = this.scene.add.rectangle(this.gameWidth / 2, y, 300, 42, C.cardBg);
        bg.setStrokeStyle(1, C.border);
        this.itemPanel.add(bg);

        const name = this.scene.add.text(this.gameWidth / 2 - 130, y, `${entry.itemId} (x${entry.quantity})`, {
          fontSize: '13px',
          fontFamily: 'monospace',
          color: '#F0EFFF',
        });
        this.itemPanel.add(name);

        const btn = this.scene.add.container(0, 0);
        btn.setSize(300, 42);
        btn.setPosition(this.gameWidth / 2, y);
        btn.setInteractive({ useHandCursor: true });

        btn.on('pointerover', () => bg.setFillStyle(C.primaryHover));
        btn.on('pointerout', () => bg.setFillStyle(C.cardBg));
        btn.on('pointerdown', () => {
          this.callbacks.onAction({ type: 'item', itemId: entry.itemId });
        });

        this.itemPanel.add(btn);
      });
    }

    this.addPanelBackButton(this.itemPanel, this.gameHeight - 150);
  }

  private addPanelBackButton(panel: Phaser.GameObjects.Container, y: number): void {
    const bg = this.scene.add.rectangle(0, 0, 100, 34, C.buttonBg);
    bg.setStrokeStyle(1, C.border);

    const label = this.scene.add.text(0, 0, 'Back', {
      fontSize: '13px',
      fontFamily: 'monospace',
      color: '#F0EFFF',
    });
    label.setOrigin(0.5);

    const btn = this.scene.add.container(this.gameWidth / 2, y, [bg, label]);
    btn.setSize(100, 34);
    btn.setInteractive({ useHandCursor: true });

    btn.on('pointerover', () => bg.setFillStyle(C.primaryHover));
    btn.on('pointerout', () => bg.setFillStyle(C.buttonBg));
    btn.on('pointerdown', () => {
      panel.setVisible(false);
      this.mainActions.setVisible(true);
    });

    panel.add(btn);
  }

  hideActionPanels(): void {
    this.mainActions.setVisible(false);
    this.abilityPanel.setVisible(false);
    this.itemPanel.setVisible(false);
  }

  showMainActions(): void {
    this.abilityPanel.setVisible(false);
    this.itemPanel.setVisible(false);
    this.mainActions.setVisible(true);
  }

  addLogMessage(message: string): void {
    this.battleLog.push(message);
    if (this.battleLog.length > 12) {
      this.battleLog.splice(0, this.battleLog.length - 12);
    }
    this.logText.setText(this.battleLog.join('\n'));
  }

  showDamageNumber(x: number, y: number, value: number, color: string): void {
    const prefix = value >= 0 ? '+' : '';
    const text = this.scene.add.text(x, y, `${prefix}${value}`, {
      fontSize: '22px',
      fontFamily: 'monospace',
      color,
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 3,
    });
    text.setOrigin(0.5);

    this.scene.tweens.add({
      targets: text,
      y: y - 60,
      alpha: 0,
      duration: 1000,
      ease: 'Power2',
      onComplete: () => text.destroy(),
    });
  }

  showVictory(rewards?: { currency?: number; items?: string[] }): void {
    this.showOutcomeMessage('VICTORY!', '#2DD4BF', [
      'Your familiar emerged triumphant!',
      ...(rewards?.currency ? [`+${rewards.currency} currency`] : []),
      ...(rewards?.items?.length ? [`Items: ${rewards.items.join(', ')}`] : []),
    ]);
  }

  showDefeat(): void {
    this.showOutcomeMessage('DEFEAT', '#EF4444', [
      'Your familiar has fallen in battle.',
    ]);
  }

  showFled(): void {
    this.showOutcomeMessage('FLED', '#F59E0B', [
      'You successfully escaped the battle.',
    ]);
  }

  private showOutcomeMessage(title: string, color: string, lines: string[]): void {
    this.outcomeOverlay.removeAll(true);
    this.outcomeOverlay.setVisible(true);
    this.hideActionPanels();

    const overlay = this.scene.add.rectangle(
      this.gameWidth / 2, this.gameHeight / 2,
      this.gameWidth, this.gameHeight,
      0x000000, 0.7,
    );
    this.outcomeOverlay.add(overlay);

    const titleText = this.scene.add.text(
      this.gameWidth / 2, this.gameHeight / 2 - 60,
      title,
      {
        fontSize: '36px',
        fontFamily: 'monospace',
        color,
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 4,
      },
    );
    titleText.setOrigin(0.5);
    this.outcomeOverlay.add(titleText);

    lines.forEach((line, i) => {
      const lineText = this.scene.add.text(
        this.gameWidth / 2, this.gameHeight / 2 - 10 + i * 24,
        line,
        {
          fontSize: '14px',
          fontFamily: 'monospace',
          color: '#a0a0b0',
        },
      );
      lineText.setOrigin(0.5);
      this.outcomeOverlay.add(lineText);
    });

    const continueBg = this.scene.add.rectangle(0, 0, 140, 40, C.primary);
    const continueLabel = this.scene.add.text(0, 0, 'Continue', {
      fontSize: '16px',
      fontFamily: 'monospace',
      color: '#FFFFFF',
    });
    continueLabel.setOrigin(0.5);

    const continueBtn = this.scene.add.container(
      this.gameWidth / 2, this.gameHeight / 2 + 80 + lines.length * 12,
      [continueBg, continueLabel],
    );
    continueBtn.setSize(140, 40);
    continueBtn.setInteractive({ useHandCursor: true });

    continueBtn.on('pointerover', () => continueBg.setFillStyle(C.primaryHover));
    continueBtn.on('pointerout', () => continueBg.setFillStyle(C.primary));
    continueBtn.on('pointerdown', () => this.scene.events.emit('continue-after-battle'));

    this.outcomeOverlay.add(continueBtn);
  }

  destroy(): void {
    this.scene.children.removeAll();
  }
}
