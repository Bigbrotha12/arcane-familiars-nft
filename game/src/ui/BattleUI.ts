import Phaser from 'phaser';
import {
  BattleFamiliar,
  BattleAction,
  getAbility,
  ActionType,
} from '@arcane-familiars/game-logic';

export interface BattleUICallbacks {
  onAction: (action: BattleAction) => void;
  onFlee: () => void;
  onShowAbility?: () => void;
  onShowItem?: () => void;
}

const C = {
  bg: 0x0A0A0F,
  primary: 0x7C5CFC,
  primaryHover: 0x6A4AE8,
  text: '#A5A3C4',
  textLight: '#F0EFFF',
  textMuted: '#6366A1',
  hpBar: 0x2DD4BF,
  hpBarMid: 0xF59E0B,
  hpBarLow: 0xEF4444,
  mpBar: 0x6366A1,
  buttonBg: 0x3B3870,
  panelBg: 0x1E1B4B,
  border: 0x3B3870,
  cardBg: 0x2D2A5E,
  barBg: 0x1A1A2E,
};

export const BATTLE_CONTINUE_EVENT = 'continue-after-battle';

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
  private owned: Phaser.GameObjects.GameObject[] = [];
  private floatingTweens: Phaser.Tweens.Tween[] = [];
  private readonly ENEMY_CENTER_X = 480;
  private readonly ENEMY_CENTER_Y = 140;
  private readonly PLAYER_CENTER_X = 180;
  private readonly PLAYER_CENTER_Y = 400;

  constructor(scene: Phaser.Scene, callbacks: BattleUICallbacks) {
    this.scene = scene;
    this.callbacks = callbacks;
    this.gameWidth = scene.scale.width;
    this.gameHeight = scene.scale.height;
  }

  private register<T extends Phaser.GameObjects.GameObject>(obj: T): T {
    this.owned.push(obj);
    return obj;
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
    this.register(this.scene.add.rectangle(
      this.gameWidth / 2,
      this.gameHeight / 2,
      this.gameWidth,
      this.gameHeight,
      C.bg,
    ));

    const separatorY = this.gameHeight - 80;
    this.register(this.scene.add.rectangle(
      this.gameWidth / 2,
      separatorY,
      this.gameWidth - 40,
      2,
      0x1E1B4B,
    ));
  }

  private createEnemyArea(): void {
    const sx = this.ENEMY_CENTER_X;
    const sy = this.ENEMY_CENTER_Y;

    this.enemySprite = this.register(this.scene.add.rectangle(sx, sy, 100, 100, 0x4E2A2A));
    this.enemySprite.setStrokeStyle(2, 0xEF4444);

    this.enemyName = this.register(this.scene.add.text(sx, 70, '', {
      fontSize: '14px',
      fontFamily: 'DM Sans',
      color: '#EF4444',
    }));
    this.enemyName.setOrigin(0.5);

    this.enemyHpBar = this.register(this.scene.add.graphics());
    this.enemyMpBar = this.register(this.scene.add.graphics());

    this.enemyHpText = this.register(this.scene.add.text(560, 200, '', {
      fontSize: '11px',
      fontFamily: 'JetBrains Mono',
      color: C.text,
    }));

    this.enemyMpText = this.register(this.scene.add.text(560, 218, '', {
      fontSize: '11px',
      fontFamily: 'JetBrains Mono',
      color: C.text,
    }));

    const enemyLabel = this.register(this.scene.add.text(sx, sy + 60, 'ENEMY', {
      fontSize: '9px',
      fontFamily: 'DM Sans',
      color: '#EF4444',
    }));
    enemyLabel.setOrigin(0.5);
  }

  private createPlayerArea(): void {
    const sx = this.PLAYER_CENTER_X;
    const sy = this.PLAYER_CENTER_Y;

    this.playerSprite = this.register(this.scene.add.rectangle(sx, sy, 100, 100, 0x2A2A4E));
    this.playerSprite.setStrokeStyle(2, 0x7C5CFC);

    this.playerName = this.register(this.scene.add.text(sx, 455, '', {
      fontSize: '14px',
      fontFamily: 'DM Sans',
      color: '#7C5CFC',
    }));
    this.playerName.setOrigin(0.5);

    this.playerHpBar = this.register(this.scene.add.graphics());
    this.playerMpBar = this.register(this.scene.add.graphics());

    this.playerHpText = this.register(this.scene.add.text(260, 478, '', {
      fontSize: '11px',
      fontFamily: 'JetBrains Mono',
      color: C.text,
    }));

    this.playerMpText = this.register(this.scene.add.text(260, 496, '', {
      fontSize: '11px',
      fontFamily: 'JetBrains Mono',
      color: C.text,
    }));

    const playerLabel = this.register(this.scene.add.text(sx, sy + 60, 'PLAYER', {
      fontSize: '9px',
      fontFamily: 'DM Sans',
      color: '#7C5CFC',
    }));
    playerLabel.setOrigin(0.5);
  }

  private createLogPanel(): void {
    const px = 605;
    const py = 50;
    const pw = 180;
    const ph = 310;

    const logBg = this.register(this.scene.add.rectangle(
      px + pw / 2,
      py + ph / 2,
      pw,
      ph,
      C.panelBg,
      0.9,
    ));
    logBg.setStrokeStyle(1, C.border);

    const logTitle = this.register(this.scene.add.text(px + 8, py + 6, 'Battle Log', {
      fontSize: '11px',
      fontFamily: 'DM Sans',
      color: '#7C5CFC',
    }));

    this.logText = this.register(this.scene.add.text(px + 8, py + 24, '', {
      fontSize: '10px',
      fontFamily: 'DM Sans',
      color: C.text,
      wordWrap: { width: pw - 16 },
      lineSpacing: 4,
    }));
  }

  private createMainActions(): void {
    this.mainActions = this.register(this.scene.add.container(0, 0));
    this.mainActions.setVisible(false);

    const buttonDefs = [
      { label: 'Attack', action: () => this.callbacks.onAction({ type: ActionType.Attack }) },
      { label: 'Defend', action: () => this.callbacks.onAction({ type: ActionType.Defend }) },
      { label: 'Ability', action: () => this.callbacks.onShowAbility?.() },
      { label: 'Item', action: () => this.callbacks.onShowItem?.() },
      { label: 'Run', action: () => this.callbacks.onFlee() },
    ];

    const positions = [210, 305, 400, 495, 590];
    const bw = 80;
    const bh = 34;
    const by = 565;

    buttonDefs.forEach((def, i) => {
      const bg = this.register(this.scene.add.rectangle(0, 0, bw, bh, C.buttonBg));
      bg.setStrokeStyle(1, C.border);

      const label = this.register(this.scene.add.text(0, 0, def.label, {
        fontSize: '13px',
        fontFamily: 'DM Sans',
        color: '#F0EFFF',
      }));
      label.setOrigin(0.5);

      const container = this.register(this.scene.add.container(positions[i], by, [bg, label]));
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
    this.abilityPanel = this.register(this.scene.add.container(0, 0));
    this.abilityPanel.setVisible(false);
  }

  private createItemPanel(): void {
    this.itemPanel = this.register(this.scene.add.container(0, 0));
    this.itemPanel.setVisible(false);
  }

  private createOutcomeOverlay(): void {
    this.outcomeOverlay = this.register(this.scene.add.container(0, 0));
    this.outcomeOverlay.setVisible(false);
  }

  showConnecting(): void {
    // Guard: destroy any existing connecting text to prevent a leak
    if (this.connectingText) {
      this.connectingText.destroy();
      this.removeFromOwned(this.connectingText);
      this.connectingText = undefined;
    }
    this.connectingText = this.register(this.scene.add.text(
      this.gameWidth / 2,
      this.gameHeight / 2,
      'Connecting...',
      {
        fontSize: '18px',
        fontFamily: 'DM Sans',
        color: '#A5A3C4',
      },
    ));
    this.connectingText.setOrigin(0.5);
  }

  hideConnecting(): void {
    if (this.connectingText) {
      this.connectingText.destroy();
      this.removeFromOwned(this.connectingText);
      this.connectingText = undefined;
    }
  }

  private removeFromOwned(obj: Phaser.GameObjects.GameObject): void {
    const idx = this.owned.indexOf(obj);
    if (idx !== -1) this.owned.splice(idx, 1);
  }

  private purgeOwned(): void {
    this.owned = this.owned.filter(o => o && o.scene);
  }

  enableMainActions(): void {
    this.mainActions.setVisible(true);
  }

  disableMainActions(): void {
    this.mainActions.setVisible(false);
  }

  updatePlayerDisplay(familiar: BattleFamiliar): void {
    const stats = familiar.familiarData.stats;
    if (!stats) return;

    this.playerName.setText(familiar.familiarData.name);
    const hp = Math.max(0, familiar.currentHp);
    const mp = Math.max(0, familiar.currentMp);

    const hpColor = this.getHpColor(hp, stats.maxHp);
    this.drawBar(this.playerHpBar, 105, 478, 150, 12, hp, stats.maxHp, hpColor);
    this.drawBar(this.playerMpBar, 105, 496, 150, 8, mp, stats.maxMp, C.mpBar);

    this.playerHpText.setText(`HP: ${hp}/${stats.maxHp}`);
    this.playerMpText.setText(`MP: ${mp}/${stats.maxMp}`);
  }

  updateEnemyDisplay(familiar: BattleFamiliar): void {
    const stats = familiar.familiarData.stats;
    if (!stats) return;

    this.enemyName.setText(familiar.familiarData.name);
    const hp = Math.max(0, familiar.currentHp);
    const mp = Math.max(0, familiar.currentMp);

    const hpColor = this.getHpColor(hp, stats.maxHp);
    this.drawBar(this.enemyHpBar, 405, 200, 150, 12, hp, stats.maxHp, hpColor);
    this.drawBar(this.enemyMpBar, 405, 218, 150, 8, mp, stats.maxMp, C.mpBar);

    this.enemyHpText.setText(`HP: ${hp}/${stats.maxHp}`);
    this.enemyMpText.setText(`MP: ${mp}/${stats.maxMp}`);
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
    this.purgeOwned();
    this.abilityPanel.setVisible(true);
    this.mainActions.setVisible(false);

    const overlay = this.scene.add.rectangle(
      this.gameWidth / 2, this.gameHeight / 2,
      this.gameWidth, this.gameHeight,
      0x000000, 0.6,
    );
    overlay.setInteractive();
    overlay.on('pointerdown', () => this.showMainActions());
    this.abilityPanel.add(overlay);

    const panelBg = this.scene.add.rectangle(
      this.gameWidth / 2, 320,
      340, 300, C.panelBg, 0.95,
    );
    panelBg.setStrokeStyle(1, C.border);
    this.abilityPanel.add(panelBg);

    const title = this.scene.add.text(this.gameWidth / 2, 190, 'Select Ability', {
      fontSize: '16px',
      fontFamily: 'Fredoka',
      color: '#F0EFFF',
      fontStyle: '600',
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

      const bg = this.scene.add.rectangle(this.gameWidth / 2, y, 300, 42, canUse ? C.cardBg : 0x1A1A2E);
      bg.setStrokeStyle(1, canUse ? C.border : 0x2A2A4E);
      this.abilityPanel.add(bg);

      const name = this.scene.add.text(this.gameWidth / 2 - 130, y - 7, ability.name, {
        fontSize: '13px',
        fontFamily: 'DM Sans',
        color: canUse ? '#F0EFFF' : '#6366A1',
      });
      this.abilityPanel.add(name);

      const desc = this.scene.add.text(this.gameWidth / 2 - 130, y + 9, `${ability.description}`, {
        fontSize: '9px',
        fontFamily: 'DM Sans',
        color: canUse ? '#A5A3C4' : '#6366A1',
      });
      this.abilityPanel.add(desc);

      const cost = this.scene.add.text(this.gameWidth / 2 + 130, y, `MP:${ability.mpCost}`, {
        fontSize: '11px',
        fontFamily: 'JetBrains Mono',
        color: canUse ? '#6366A1' : '#6366A1',
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
          this.callbacks.onAction({ type: ActionType.Ability, abilityId });
        });

        this.abilityPanel.add(btn);
      }
    });

    this.addPanelBackButton(this.abilityPanel, this.gameHeight - 150);
  }

  showItemPanel(inventory: { itemId: string; quantity: number }[]): void {
    this.itemPanel.removeAll(true);
    this.purgeOwned();
    this.itemPanel.setVisible(true);
    this.mainActions.setVisible(false);

    const overlay = this.scene.add.rectangle(
      this.gameWidth / 2, this.gameHeight / 2,
      this.gameWidth, this.gameHeight,
      0x000000, 0.6,
    );
    overlay.setInteractive();
    overlay.on('pointerdown', () => this.showMainActions());
    this.itemPanel.add(overlay);

    const panelBg = this.scene.add.rectangle(
      this.gameWidth / 2, 320,
      340, 300, C.panelBg, 0.95,
    );
    panelBg.setStrokeStyle(1, C.border);
    this.itemPanel.add(panelBg);

    const title = this.scene.add.text(this.gameWidth / 2, 190, 'Select Item', {
      fontSize: '16px',
      fontFamily: 'Fredoka',
      color: '#F0EFFF',
      fontStyle: '600',
    });
    title.setOrigin(0.5);
    this.itemPanel.add(title);

    if (!inventory || inventory.length === 0) {
      const msg = this.scene.add.text(this.gameWidth / 2, 300, 'No items available', {
        fontSize: '13px',
        fontFamily: 'DM Sans',
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
          fontFamily: 'DM Sans',
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
          this.callbacks.onAction({ type: ActionType.Item, itemId: entry.itemId });
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
      fontFamily: 'DM Sans',
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

  getEnemyDamagePosition(): { x: number; y: number } {
    return { x: this.ENEMY_CENTER_X, y: this.ENEMY_CENTER_Y - 30 };
  }

  getPlayerDamagePosition(): { x: number; y: number } {
    return { x: this.PLAYER_CENTER_X, y: this.PLAYER_CENTER_Y - 30 };
  }

  showDamageNumber(x: number, y: number, amount: number, color: string): void {
    this.addFloatingText(x, y, `-${amount}`, color);
  }

  showHealNumber(x: number, y: number, amount: number): void {
    this.addFloatingText(x, y, `+${amount}`, '#10B981');
  }

  private addFloatingText(x: number, y: number, text: string, color: string): void {
    const textObj = this.scene.add.text(x, y, text, {
      fontSize: '22px',
      fontFamily: 'Fredoka',
      color,
      fontStyle: '600',
      stroke: '#000000',
      strokeThickness: 3,
    });
    textObj.setOrigin(0.5);

    const tween = this.scene.tweens.add({
      targets: textObj,
      y: y - 60,
      alpha: 0,
      duration: 1000,
      ease: 'Power2',
      onComplete: () => {
        textObj.destroy();
        this.floatingTweens = this.floatingTweens.filter(t => t !== tween);
      },
      onStop: () => {
        textObj.destroy();
        this.floatingTweens = this.floatingTweens.filter(t => t !== tween);
      },
    });
    this.floatingTweens.push(tween);
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
    this.purgeOwned();
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
        fontFamily: 'Fredoka',
        color,
        fontStyle: '600',
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
          fontFamily: 'DM Sans',
          color: '#A5A3C4',
        },
      );
      lineText.setOrigin(0.5);
      this.outcomeOverlay.add(lineText);
    });

    const continueBg = this.scene.add.rectangle(0, 0, 140, 40, C.primary);
    const continueLabel = this.scene.add.text(0, 0, 'Continue', {
      fontSize: '16px',
      fontFamily: 'DM Sans',
      color: '#F0EFFF',
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
    continueBtn.on('pointerdown', () => this.scene.events.emit(BATTLE_CONTINUE_EVENT));

    this.outcomeOverlay.add(continueBtn);
  }

  destroy(): void {
    for (const tween of this.floatingTweens) {
      tween.stop();
    }
    this.floatingTweens = [];

    for (const obj of this.owned) {
      if (obj && obj.scene) {
        obj.destroy();
      }
    }
    this.owned = [];

    // Null out all references so no dangling pointers
    this.playerSprite = null!;
    this.enemySprite = null!;
    this.playerName = null!;
    this.enemyName = null!;
    this.playerHpBar = null!;
    this.playerMpBar = null!;
    this.enemyHpBar = null!;
    this.enemyMpBar = null!;
    this.playerHpText = null!;
    this.playerMpText = null!;
    this.enemyHpText = null!;
    this.enemyMpText = null!;
    this.logText = null!;
    this.mainActions = null!;
    this.abilityPanel = null!;
    this.itemPanel = null!;
    this.outcomeOverlay = null!;
    this.actionButtons = [];
    this.battleLog = [];
    this.connectingText = undefined;
    this.scene = null!;
    this.callbacks = null!;
  }
}
