import Phaser from 'phaser';
import {
  BattleFamiliar,
  BattleAction,
  getAbility,
  ActionType,
} from '@arcane-familiars/game-logic';
import { Layout } from './layout';
import { C, getHpColor, drawBar } from './theme';

export interface BattleUICallbacks {
  onAction: (action: BattleAction) => void;
  onFlee: () => void;
  onShowAbility?: () => void;
  onShowItem?: () => void;
  onSwap?: () => void;
}

export const BATTLE_CONTINUE_EVENT = 'continue-after-battle';

export class BattleUI {
  private scene: Phaser.Scene;
  private callbacks: BattleUICallbacks;
  private layout: Layout;
  private gameWidth: number;
  private gameHeight: number;

  private playerSprite!: Phaser.GameObjects.Image;
  private enemySprite!: Phaser.GameObjects.Image;
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
  private uiOnly: Phaser.GameObjects.GameObject[] = [];
  private floatingTweens: Phaser.Tweens.Tween[] = [];
  private overlayActive = false;

  private get enemyCenterX(): number {
    return this.layout.x(640);
  }

  private get enemyCenterY(): number {
    return this.layout.y(105);
  }

  private get playerCenterX(): number {
    return this.layout.x(180);
  }

  private get playerCenterY(): number {
    return this.layout.y(400);
  }

  constructor(scene: Phaser.Scene, callbacks: BattleUICallbacks) {
    this.scene = scene;
    this.callbacks = callbacks;
    this.layout = new Layout(scene);
    this.gameWidth = scene.scale.width;
    this.gameHeight = scene.scale.height;
  }

  private register<T extends Phaser.GameObjects.GameObject>(obj: T): T {
    this.owned.push(obj);
    return obj;
  }

  private registerUI<T extends Phaser.GameObjects.GameObject>(obj: T): T {
    this.owned.push(obj);
    this.uiOnly.push(obj);
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
    // NOTE: no full-screen opaque rect here. The scene camera clear color
    // (#0A0A0F, set in gameConfig) already provides the fallback backdrop, and
    // an opaque full-screen rect at depth 0 would cover the scene-level battle
    // background image that BattleScene adds (also depth 0) BEFORE battleUI.init(),
    // so all UI added afterwards renders on top.

    const separatorY = this.layout.y(520);
    this.register(this.scene.add.rectangle(
      this.layout.x(400),
      separatorY,
      this.layout.s(760),
      this.layout.s(2),
      0x1E1B4B,
    ));
  }

  private createEnemyArea(): void {
    const sx = this.enemyCenterX;
    const sy = this.enemyCenterY;

    this.enemySprite = this.registerUI(this.scene.add.image(sx, sy, 'familiar_whiteDog'));
    this.enemySprite.setDisplaySize(this.layout.s(120), this.layout.s(120));
    this.enemySprite.setDepth(1);

    const card = this.createStatCard(sx, sy + this.layout.s(100), C.textLight, '#EF4444');
    this.enemyName = card.name;
    this.enemyHpBar = card.hpBar;
    this.enemyMpBar = card.mpBar;
    this.enemyHpText = card.hpText;
    this.enemyMpText = card.mpText;
  }

  private createPlayerArea(): void {
    const sx = this.playerCenterX;
    const sy = this.playerCenterY;

    this.playerSprite = this.registerUI(this.scene.add.image(sx, sy, 'familiar_whiteDog'));
    this.playerSprite.setDisplaySize(this.layout.s(120), this.layout.s(120));
    this.playerSprite.setDepth(1);

    const card = this.createStatCard(sx, sy + this.layout.s(100), C.textLight, '#7C5CFC');
    this.playerName = card.name;
    this.playerHpBar = card.hpBar;
    this.playerMpBar = card.mpBar;
    this.playerHpText = card.hpText;
    this.playerMpText = card.mpText;
  }

  private createStatCard(
    x: number,
    y: number,
    textColor: string,
    nameColor: string,
  ): {
    container: Phaser.GameObjects.Container;
    name: Phaser.GameObjects.Text;
    hpBar: Phaser.GameObjects.Graphics;
    mpBar: Phaser.GameObjects.Graphics;
    hpText: Phaser.GameObjects.Text;
    mpText: Phaser.GameObjects.Text;
  } {
    const w = this.layout.s(200);
    const h = this.layout.s(68);

    const bg = this.scene.add.graphics();
    bg.fillStyle(C.panelBg, 0.95);
    bg.fillRoundedRect(-w / 2, -h / 2, w, h, this.layout.s(8));
    bg.lineStyle(1, C.border, 1);
    bg.strokeRoundedRect(-w / 2, -h / 2, w, h, this.layout.s(8));

    const name = this.scene.add.text(0, this.layout.s(-24), '', {
      fontSize: this.layout.font(14),
      fontFamily: 'DM Sans',
      fontStyle: '600',
      color: nameColor,
    });
    name.setOrigin(0.5);

    const hpBar = this.scene.add.graphics();
    const mpBar = this.scene.add.graphics();

    const hpText = this.scene.add.text(0, this.layout.s(-2), '', {
      fontSize: this.layout.font(9),
      fontFamily: 'JetBrains Mono',
      color: textColor,
    });
    hpText.setOrigin(0.5);

    const mpText = this.scene.add.text(0, this.layout.s(18), '', {
      fontSize: this.layout.font(9),
      fontFamily: 'JetBrains Mono',
      color: textColor,
    });
    mpText.setOrigin(0.5);

    const container = this.scene.add.container(x, y, [bg, name, hpBar, mpBar, hpText, mpText]);
    this.registerUI(container);
    this.registerUI(bg);
    this.registerUI(name);
    this.registerUI(hpBar);
    this.registerUI(mpBar);
    this.registerUI(hpText);
    this.registerUI(mpText);

    return { container, name, hpBar, mpBar, hpText, mpText };
  }

  private createLogPanel(): void {
    const px = this.layout.x(605);
    const py = this.layout.y(50);
    const pw = this.layout.s(180);
    const ph = this.layout.s(310);

    const logBg = this.registerUI(this.scene.add.rectangle(
      px + pw / 2,
      py + ph / 2,
      pw,
      ph,
      C.panelBg,
      0.9,
    ));
    logBg.setStrokeStyle(1, C.border);

    const logTitle = this.registerUI(this.scene.add.text(px + this.layout.s(8), py + this.layout.s(6), 'Battle Log', {
      fontSize: this.layout.font(11),
      fontFamily: 'DM Sans',
      color: '#7C5CFC',
    }));

    this.logText = this.registerUI(this.scene.add.text(px + this.layout.s(8), py + this.layout.s(24), '', {
      fontSize: this.layout.font(10),
      fontFamily: 'DM Sans',
      color: C.text,
      wordWrap: { width: pw - this.layout.s(16) },
      lineSpacing: this.layout.s(4),
    }));
  }

  private createMainActions(): void {
    this.mainActions = this.registerUI(this.scene.add.container(0, 0));
    this.mainActions.setVisible(false);

    const buttonDefs = [
      { label: 'Attack', action: () => this.callbacks.onAction({ type: ActionType.Attack }) },
      { label: 'Defend', action: () => this.callbacks.onAction({ type: ActionType.Defend }) },
      { label: 'Ability', action: () => this.callbacks.onShowAbility?.() },
      { label: 'Item', action: () => this.callbacks.onShowItem?.() },
      { label: 'Swap', action: () => this.callbacks.onSwap?.() },
      { label: 'Run', action: () => this.callbacks.onFlee() },
    ];

    const positions = [120, 210, 300, 390, 480, 570].map((p) => this.layout.x(p));
    const bw = this.layout.s(75);
    const bh = this.layout.s(34);
    const by = this.layout.y(565);

    buttonDefs.forEach((def, i) => {
      const bg = this.registerUI(this.scene.add.rectangle(0, 0, bw, bh, C.buttonBg));
      bg.setStrokeStyle(1, C.border);

      const label = this.registerUI(this.scene.add.text(0, 0, def.label, {
        fontSize: this.layout.font(13),
        fontFamily: 'DM Sans',
        color: '#F0EFFF',
      }));
      label.setOrigin(0.5);

      const container = this.registerUI(this.scene.add.container(positions[i], by, [bg, label]));
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
    this.abilityPanel = this.registerUI(this.scene.add.container(0, 0));
    this.abilityPanel.setVisible(false);
  }

  private createItemPanel(): void {
    this.itemPanel = this.registerUI(this.scene.add.container(0, 0));
    this.itemPanel.setVisible(false);
  }

  private createOutcomeOverlay(): void {
    this.outcomeOverlay = this.registerUI(this.scene.add.container(0, 0));
    this.outcomeOverlay.setVisible(false);
  }

  showConnecting(): void {
    // Guard: destroy any existing connecting text to prevent a leak
    if (this.connectingText) {
      this.connectingText.destroy();
      this.removeFromOwned(this.connectingText);
      this.connectingText = undefined;
    }
    this.connectingText = this.registerUI(this.scene.add.text(
      this.layout.x(400),
      this.layout.y(300),
      'Connecting...',
      {
        fontSize: this.layout.font(18),
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
    const uiIdx = this.uiOnly.indexOf(obj);
    if (uiIdx !== -1) this.uiOnly.splice(uiIdx, 1);
  }

  private purgeOwned(): void {
    this.owned = this.owned.filter(o => o && o.scene);
    this.uiOnly = this.uiOnly.filter(o => o && o.scene);
  }

  setOverlayActive(active: boolean): void {
    this.overlayActive = active;
    this.setActionUIVisible(!active);
  }

  private setActionUIVisible(enabled: boolean): void {
    for (const obj of this.uiOnly) {
      if (!obj || !obj.scene) continue;
      (obj as unknown as Phaser.GameObjects.Components.Visible).setVisible(enabled);
      if (obj instanceof Phaser.GameObjects.Container) {
        if (enabled) {
          obj.setInteractive();
        } else {
          obj.disableInteractive();
        }
      }
    }
  }

  enableMainActions(): void {
    if (this.overlayActive) return;
    this.mainActions.setVisible(true);
  }

  disableMainActions(): void {
    this.mainActions.setVisible(false);
  }

  updatePlayerDisplay(familiar: BattleFamiliar): void {
    const stats = familiar.familiarData.stats;
    if (!stats) return;

    this.playerName.setText(familiar.familiarData.name);
    const textureKey = `familiar_${familiar.familiarData.id}`;
    if (this.scene.textures.exists(textureKey)) {
      this.playerSprite.setTexture(textureKey);
      this.playerSprite.setDisplaySize(this.layout.s(120), this.layout.s(120));
    }
    const hp = Math.max(0, familiar.currentHp);
    const mp = Math.max(0, familiar.currentMp);

    const hpColor = getHpColor(hp, stats.maxHp);
    drawBar(this.playerHpBar, this.layout.s(-92), this.layout.s(-14), this.layout.s(184), this.layout.s(10), hp, stats.maxHp, hpColor);
    drawBar(this.playerMpBar, this.layout.s(-92), this.layout.s(6), this.layout.s(184), this.layout.s(8), mp, stats.maxMp, C.mpBar);

    this.playerHpText.setText(`HP: ${hp}/${stats.maxHp}`);
    this.playerMpText.setText(`MP: ${mp}/${stats.maxMp}`);
  }

  updateEnemyDisplay(familiar: BattleFamiliar): void {
    const stats = familiar.familiarData.stats;
    if (!stats) return;

    this.enemyName.setText(familiar.familiarData.name);
    const textureKey = `familiar_${familiar.familiarData.id}`;
    if (this.scene.textures.exists(textureKey)) {
      this.enemySprite.setTexture(textureKey);
      this.enemySprite.setDisplaySize(this.layout.s(120), this.layout.s(120));
    }
    const hp = Math.max(0, familiar.currentHp);
    const mp = Math.max(0, familiar.currentMp);

    const hpColor = getHpColor(hp, stats.maxHp);
    drawBar(this.enemyHpBar, this.layout.s(-92), this.layout.s(-14), this.layout.s(184), this.layout.s(10), hp, stats.maxHp, hpColor);
    drawBar(this.enemyMpBar, this.layout.s(-92), this.layout.s(6), this.layout.s(184), this.layout.s(8), mp, stats.maxMp, C.mpBar);

    this.enemyHpText.setText(`HP: ${hp}/${stats.maxHp}`);
    this.enemyMpText.setText(`MP: ${mp}/${stats.maxMp}`);
  }

  showAbilityPanel(familiar: BattleFamiliar): void {
    if (this.overlayActive) return;
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
      this.layout.x(400), this.layout.y(320),
      this.layout.s(340), this.layout.s(300), C.panelBg, 0.95,
    );
    panelBg.setStrokeStyle(1, C.border);
    this.abilityPanel.add(panelBg);

    const title = this.scene.add.text(this.layout.x(400), this.layout.y(190), 'Select Ability', {
      fontSize: this.layout.font(16),
      fontFamily: 'Fredoka',
      color: '#F0EFFF',
      fontStyle: '600',
    });
    title.setOrigin(0.5);
    this.abilityPanel.add(title);

    const abilities = familiar.familiarData.abilities;
    const startY = this.layout.y(215);

    abilities.forEach((abilityId, index) => {
      const ability = getAbility(abilityId);
      if (!ability) return;

      const y = startY + index * this.layout.s(50);
      const canUse = familiar.currentMp >= ability.mpCost;

      const bg = this.scene.add.rectangle(this.layout.x(400), y, this.layout.s(300), this.layout.s(42), canUse ? C.cardBg : 0x1A1A2E);
      bg.setStrokeStyle(1, canUse ? C.border : 0x2A2A4E);
      this.abilityPanel.add(bg);

      const name = this.scene.add.text(this.layout.x(400) - this.layout.s(130), y - this.layout.s(7), ability.name, {
        fontSize: this.layout.font(13),
        fontFamily: 'DM Sans',
        color: canUse ? '#F0EFFF' : '#6366A1',
      });
      this.abilityPanel.add(name);

      const desc = this.scene.add.text(this.layout.x(400) - this.layout.s(130), y + this.layout.s(9), `${ability.description}`, {
        fontSize: this.layout.font(9),
        fontFamily: 'DM Sans',
        color: canUse ? '#A5A3C4' : '#6366A1',
      });
      this.abilityPanel.add(desc);

      const cost = this.scene.add.text(this.layout.x(400) + this.layout.s(130), y, `MP:${ability.mpCost}`, {
        fontSize: this.layout.font(11),
        fontFamily: 'JetBrains Mono',
        color: canUse ? '#6366A1' : '#6366A1',
      });
      cost.setOrigin(1, 0.5);
      this.abilityPanel.add(cost);

      if (canUse) {
        const btn = this.scene.add.container(0, 0);
        btn.setSize(this.layout.s(300), this.layout.s(42));
        btn.setPosition(this.layout.x(400), y);
        btn.setInteractive({ useHandCursor: true });

        btn.on('pointerover', () => bg.setFillStyle(C.primaryHover));
        btn.on('pointerout', () => bg.setFillStyle(C.cardBg));
        btn.on('pointerdown', () => {
          this.callbacks.onAction({ type: ActionType.Ability, abilityId });
        });

        this.abilityPanel.add(btn);
      }
    });

    this.addPanelBackButton(this.abilityPanel, this.layout.y(450));
  }

  showItemPanel(inventory: { itemId: string; quantity: number }[]): void {
    if (this.overlayActive) return;
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
      this.layout.x(400), this.layout.y(320),
      this.layout.s(340), this.layout.s(300), C.panelBg, 0.95,
    );
    panelBg.setStrokeStyle(1, C.border);
    this.itemPanel.add(panelBg);

    const title = this.scene.add.text(this.layout.x(400), this.layout.y(190), 'Select Item', {
      fontSize: this.layout.font(16),
      fontFamily: 'Fredoka',
      color: '#F0EFFF',
      fontStyle: '600',
    });
    title.setOrigin(0.5);
    this.itemPanel.add(title);

    if (!inventory || inventory.length === 0) {
      const msg = this.scene.add.text(this.layout.x(400), this.layout.y(300), 'No items available', {
        fontSize: this.layout.font(13),
        fontFamily: 'DM Sans',
        color: C.textMuted,
      });
      msg.setOrigin(0.5);
      this.itemPanel.add(msg);
    } else {
      const startY = this.layout.y(215);
      inventory.forEach((entry, index) => {
        const y = startY + index * this.layout.s(50);
        const bg = this.scene.add.rectangle(this.layout.x(400), y, this.layout.s(300), this.layout.s(42), C.cardBg);
        bg.setStrokeStyle(1, C.border);
        this.itemPanel.add(bg);

        const name = this.scene.add.text(this.layout.x(400) - this.layout.s(130), y, `${entry.itemId} (x${entry.quantity})`, {
          fontSize: this.layout.font(13),
          fontFamily: 'DM Sans',
          color: '#F0EFFF',
        });
        this.itemPanel.add(name);

        const btn = this.scene.add.container(0, 0);
        btn.setSize(this.layout.s(300), this.layout.s(42));
        btn.setPosition(this.layout.x(400), y);
        btn.setInteractive({ useHandCursor: true });

        btn.on('pointerover', () => bg.setFillStyle(C.primaryHover));
        btn.on('pointerout', () => bg.setFillStyle(C.cardBg));
        btn.on('pointerdown', () => {
          this.callbacks.onAction({ type: ActionType.Item, itemId: entry.itemId });
        });

        this.itemPanel.add(btn);
      });
    }

    this.addPanelBackButton(this.itemPanel, this.layout.y(450));
  }

  private addPanelBackButton(panel: Phaser.GameObjects.Container, y: number): void {
    const bg = this.scene.add.rectangle(0, 0, this.layout.s(100), this.layout.s(34), C.buttonBg);
    bg.setStrokeStyle(1, C.border);

    const label = this.scene.add.text(0, 0, 'Back', {
      fontSize: this.layout.font(13),
      fontFamily: 'DM Sans',
      color: '#F0EFFF',
    });
    label.setOrigin(0.5);

    const btn = this.scene.add.container(this.layout.x(400), y, [bg, label]);
    btn.setSize(this.layout.s(100), this.layout.s(34));
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
    if (this.overlayActive) return;
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

  getLog(): string[] {
    return [...this.battleLog];
  }

  setVisible(enabled: boolean): void {
    for (const obj of this.owned) {
      if (!obj || !obj.scene) continue;
      (obj as unknown as Phaser.GameObjects.Components.Visible).setVisible(enabled);
      if (obj instanceof Phaser.GameObjects.Container) {
        if (enabled) {
          obj.setInteractive();
        } else {
          obj.disableInteractive();
        }
      }
    }
  }

  getEnemyDamagePosition(): { x: number; y: number } {
    return { x: this.enemyCenterX, y: this.enemyCenterY - this.layout.s(30) };
  }

  getPlayerDamagePosition(): { x: number; y: number } {
    return { x: this.playerCenterX, y: this.playerCenterY - this.layout.s(30) };
  }

  showDamageNumber(x: number, y: number, amount: number, color: string): void {
    this.addFloatingText(x, y, `-${amount}`, color);
  }

  showHealNumber(x: number, y: number, amount: number): void {
    this.addFloatingText(x, y, `+${amount}`, '#10B981');
  }

  private addFloatingText(x: number, y: number, text: string, color: string): void {
    const textObj = this.scene.add.text(x, y, text, {
      fontSize: this.layout.font(22),
      fontFamily: 'Fredoka',
      color,
      fontStyle: '600',
      stroke: '#000000',
      strokeThickness: this.layout.s(3),
    });
    textObj.setOrigin(0.5);

    const tween = this.scene.tweens.add({
      targets: textObj,
      y: y - this.layout.s(60),
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
    if (this.overlayActive) return;
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
      this.layout.x(400), this.layout.y(240),
      title,
      {
        fontSize: this.layout.font(36),
        fontFamily: 'Fredoka',
        color,
        fontStyle: '600',
        stroke: '#000000',
        strokeThickness: this.layout.s(4),
      },
    );
    titleText.setOrigin(0.5);
    this.outcomeOverlay.add(titleText);

    lines.forEach((line, i) => {
      const lineText = this.scene.add.text(
        this.layout.x(400), this.layout.y(300) + this.layout.s(-10 + i * 24),
        line,
        {
          fontSize: this.layout.font(14),
          fontFamily: 'DM Sans',
          color: '#A5A3C4',
        },
      );
      lineText.setOrigin(0.5);
      this.outcomeOverlay.add(lineText);
    });

    const continueBg = this.scene.add.rectangle(0, 0, this.layout.s(140), this.layout.s(40), C.primary);
    const continueLabel = this.scene.add.text(0, 0, 'Continue', {
      fontSize: this.layout.font(16),
      fontFamily: 'DM Sans',
      color: '#F0EFFF',
    });
    continueLabel.setOrigin(0.5);

    const continueBtn = this.scene.add.container(
      this.layout.x(400), this.layout.y(300) + this.layout.s(80 + lines.length * 12),
      [continueBg, continueLabel],
    );
    continueBtn.setSize(this.layout.s(140), this.layout.s(40));
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
    this.uiOnly = [];

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
