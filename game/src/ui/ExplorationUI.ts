import Phaser from 'phaser';
import type { Room, RoomExit, Area } from '@arcane-familiars/game-logic';
import { getFamiliar } from '@arcane-familiars/game-logic';

export interface ExplorationUICallbacks {
  onNavigate: (roomId: string) => void;
  onBattle: (enemyId: string) => void;
  onFlee: () => void;
  onTakeTreasure: (itemId: string) => void;
  onLeaveTreasure: () => void;
  onExitDungeon: () => void;
  onRetreatFromBoss?: () => void;
}

const C = {
  bg: 0x0a0a0f,
  primary: 0x7c5cfc,
  primaryHover: 0x6a4ae8,
  text: '#a0a0b0',
  textLight: '#F0EFFF',
  textMuted: 0x6366A1,
  hpBar: 0x2dd4bf,
  hpBarMid: 0xf59e0b,
  hpBarLow: 0xef4444,
  mpBar: 0x6366a1,
  buttonBg: 0x3b3870,
  panelBg: 0x1e1b4b,
  border: 0x3b3870,
  cardBg: 0x2d2a5e,
  barBg: 0x1a1a2e,
  gold: 0xf59e0b,
  bossRed: 0xfc5c5c,
};

const ROOM_CX = 400;
const ROOM_CY = 200;
const ROOM_W = 460;
const ROOM_H = 290;
const LEFT_CX = 82;
const RIGHT_X = 635;
const RIGHT_W = 155;
const NAV_Y = 530;

export class ExplorationUI {
  private scene: Phaser.Scene;
  private callbacks: ExplorationUICallbacks;
  private gw: number;
  private gh: number;

  private roomBg!: Phaser.GameObjects.Rectangle;
  private roomName!: Phaser.GameObjects.Text;
  private roomTypeIndicator!: Phaser.GameObjects.Text;
  private roomDesc!: Phaser.GameObjects.Text;

  private navPanel!: Phaser.GameObjects.Container;
  private exitButtons: Phaser.GameObjects.Container[] = [];

  private encounterPanel!: Phaser.GameObjects.Container;
  private treasurePanel!: Phaser.GameObjects.Container;
  private bossWarning!: Phaser.GameObjects.Container;

  private partyContainer!: Phaser.GameObjects.Container;
  private partyMemberElements: {
    name: Phaser.GameObjects.Text;
    hpBar: Phaser.GameObjects.Graphics;
    mpBar: Phaser.GameObjects.Graphics;
    hpText: Phaser.GameObjects.Text;
    mpText: Phaser.GameObjects.Text;
  }[] = [];

  private areaProgress!: Phaser.GameObjects.Text;
  private miniMapGfx!: Phaser.GameObjects.Graphics;
  private logText!: Phaser.GameObjects.Text;
  private logMessages: string[] = [];

  private exitBtn!: Phaser.GameObjects.Container;

  constructor(scene: Phaser.Scene, callbacks: ExplorationUICallbacks) {
    this.scene = scene;
    this.callbacks = callbacks;
    this.gw = scene.scale.width;
    this.gh = scene.scale.height;
  }

  init(area: Area): void {
    this.createBackground(area);
    this.createRoomArea();
    this.createPartyStatus();
    this.createAreaProgress();
    this.createMiniMap();
    this.createLogPanel();
    this.createNavPanel();
    this.createEncounterPanel();
    this.createTreasurePanel();
    this.createBossWarning();
    this.createExitButton();
  }

  private createBackground(area: Area): void {
    this.scene.add.rectangle(this.gw / 2, this.gh / 2, this.gw, this.gh, C.bg);

    this.scene.add.rectangle(165, this.gh / 2, 2, this.gh - 20, C.border);
    this.scene.add.rectangle(this.gw - 165, this.gh / 2, 2, this.gh - 20, C.border);
  }

  private createRoomArea(): void {
    this.roomBg = this.scene.add.rectangle(ROOM_CX, ROOM_CY, ROOM_W, ROOM_H, C.panelBg, 0.6);
    this.roomBg.setStrokeStyle(1, C.border);

    this.roomName = this.scene.add.text(ROOM_CX, ROOM_CY - ROOM_H / 2 + 20, '', {
      fontSize: '18px',
      fontFamily: 'monospace',
      color: C.textLight,
      fontStyle: 'bold',
    });
    this.roomName.setOrigin(0.5);

    this.roomTypeIndicator = this.scene.add.text(ROOM_CX, ROOM_CY - ROOM_H / 2 + 44, '', {
      fontSize: '11px',
      fontFamily: 'monospace',
    });
    this.roomTypeIndicator.setOrigin(0.5);

    this.roomDesc = this.scene.add.text(ROOM_CX, ROOM_CY + 10, '', {
      fontSize: '13px',
      fontFamily: 'monospace',
      color: C.text,
      wordWrap: { width: ROOM_W - 40 },
      align: 'center',
    });
    this.roomDesc.setOrigin(0.5);
  }

  private createPartyStatus(): void {
    this.partyContainer = this.scene.add.container(0, 0);
  }

  private createAreaProgress(): void {
    this.areaProgress = this.scene.add.text(this.gw - 14, 12, '', {
      fontSize: '12px',
      fontFamily: 'monospace',
      color: C.text,
    });
    this.areaProgress.setOrigin(1, 0);
  }

  private createMiniMap(): void {
    this.miniMapGfx = this.scene.add.graphics();
  }

  private createLogPanel(): void {
    const ly = 46;

    const logBg = this.scene.add.rectangle(RIGHT_X + RIGHT_W / 2, 200, RIGHT_W, 340, C.panelBg, 0.7);
    logBg.setStrokeStyle(1, C.border);

    const logTitle = this.scene.add.text(RIGHT_X, ly, 'Room Log', {
      fontSize: '11px',
      fontFamily: 'monospace',
      color: '#7C5CFC',
    });

    this.logText = this.scene.add.text(RIGHT_X, ly + 18, '', {
      fontSize: '10px',
      fontFamily: 'monospace',
      color: C.text,
      wordWrap: { width: RIGHT_W - 12 },
      lineSpacing: 3,
    });
  }

  private createNavPanel(): void {
    this.navPanel = this.scene.add.container(0, 0);
    this.navPanel.setVisible(false);
  }

  private createEncounterPanel(): void {
    this.encounterPanel = this.scene.add.container(0, 0);
    this.encounterPanel.setVisible(false);
  }

  private createTreasurePanel(): void {
    this.treasurePanel = this.scene.add.container(0, 0);
    this.treasurePanel.setVisible(false);
  }

  private createBossWarning(): void {
    this.bossWarning = this.scene.add.container(0, 0);
    this.bossWarning.setVisible(false);
  }

  private createExitButton(): void {
    const bg = this.scene.add.rectangle(0, 0, 100, 28, 0x3b3870);
    bg.setStrokeStyle(1, C.border);
    const label = this.scene.add.text(0, 0, 'Exit', {
      fontSize: '11px',
      fontFamily: 'monospace',
      color: C.text,
    });
    label.setOrigin(0.5);

    this.exitBtn = this.scene.add.container(82, 18, [bg, label]);
    this.exitBtn.setSize(100, 28);
    this.exitBtn.setInteractive({ useHandCursor: true });

    this.exitBtn.on('pointerover', () => bg.setFillStyle(C.primaryHover));
    this.exitBtn.on('pointerout', () => bg.setFillStyle(0x3b3870));
    this.exitBtn.on('pointerdown', () => this.callbacks.onExitDungeon());
  }

  showRoomInfo(room: Room, roomIndex: number, totalRooms: number, area: Area): void {
    const depthRatio = roomIndex / Math.max(totalRooms - 1, 1);
    const r = ((area.bgColor >> 16) & 0xff);
    const g = ((area.bgColor >> 8) & 0xff);
    const b = (area.bgColor & 0xff);
    const darkR = Math.floor(r * (0.3 + depthRatio * 0.3));
    const darkG = Math.floor(g * (0.3 + depthRatio * 0.3));
    const darkB = Math.floor(b * (0.3 + depthRatio * 0.3));
    const color = (Math.min(darkR, 255) << 16) | (Math.min(darkG, 255) << 8) | Math.min(darkB, 255);
    this.roomBg.setFillStyle(color, 0.8);

    this.roomName.setText(room.name);
    this.roomDesc.setText(room.description);

    const typeStyles: Record<string, { label: string; color: string }> = {
      start: { label: 'START', color: '#2DD4BF' },
      normal: { label: 'ROOM', color: '#a0a0b0' },
      deadend: { label: 'DEAD END', color: '#6366A1' },
      boss: { label: 'BOSS', color: '#FC5C5C' },
    };
    const style = typeStyles[room.type] || typeStyles.normal;
    this.roomTypeIndicator.setText(style.label);
    this.roomTypeIndicator.setColor(style.color);
  }

  showExits(exits: RoomExit[]): void {
    this.navPanel.removeAll(true);
    this.exitButtons = [];
    this.navPanel.setVisible(true);

    if (exits.length === 0) return;

    const bw = 100;
    const bh = 34;
    const spacing = 10;
    const totalW = exits.length * bw + (exits.length - 1) * spacing;
    const startX = (this.gw - totalW) / 2 + bw / 2;

    exits.forEach((exit, i) => {
      const bg = this.scene.add.rectangle(0, 0, bw, bh, C.buttonBg);
      bg.setStrokeStyle(1, C.border);

      const label = this.scene.add.text(0, -2, exit.label, {
        fontSize: '12px',
        fontFamily: 'monospace',
        color: C.textLight,
      });
      label.setOrigin(0.5);

      const dirLabel = this.scene.add.text(0, -14, exit.direction.toUpperCase(), {
        fontSize: '9px',
        fontFamily: 'monospace',
        color: '#6366A1',
      });
      dirLabel.setOrigin(0.5);

      const container = this.scene.add.container(startX + i * (bw + spacing), NAV_Y, [bg, label, dirLabel]);
      container.setSize(bw, bh);
      container.setInteractive({ useHandCursor: true });

      container.on('pointerover', () => bg.setFillStyle(C.primaryHover));
      container.on('pointerout', () => bg.setFillStyle(C.buttonBg));
      container.on('pointerdown', () => this.callbacks.onNavigate(exit.roomId));

      this.navPanel.add(container);
      this.exitButtons.push(container);
    });
  }

  showEncounter(enemyId: string): void {
    this.encounterPanel.removeAll(true);
    this.encounterPanel.setVisible(true);
    this.navPanel.setVisible(false);

    const overlay = this.scene.add.rectangle(ROOM_CX, ROOM_CY, ROOM_W, ROOM_H, 0x000000, 0.7);
    overlay.setInteractive();
    this.encounterPanel.add(overlay);

    const familiar = getFamiliar(enemyId);
    const enemyName = familiar?.name ?? enemyId;

    const title = this.scene.add.text(ROOM_CX, ROOM_CY - 60, 'A wild familiar appears!', {
      fontSize: '16px',
      fontFamily: 'monospace',
      color: '#F97316',
      fontStyle: 'bold',
    });
    title.setOrigin(0.5);
    this.encounterPanel.add(title);

    const nameText = this.scene.add.text(ROOM_CX, ROOM_CY - 25, enemyName, {
      fontSize: '20px',
      fontFamily: 'monospace',
      color: '#FC5C5C',
      fontStyle: 'bold',
    });
    nameText.setOrigin(0.5);
    this.encounterPanel.add(nameText);

    const enemySprite = this.scene.add.rectangle(ROOM_CX, ROOM_CY + 30, 64, 64, 0x4e2a2a);
    enemySprite.setStrokeStyle(2, 0xfc5c5c);
    this.encounterPanel.add(enemySprite);

    const battleBg = this.scene.add.rectangle(0, 0, 120, 36, C.primary);
    const battleLabel = this.scene.add.text(0, 0, '[ Battle! ]', {
      fontSize: '14px',
      fontFamily: 'monospace',
      color: '#FFFFFF',
      fontStyle: 'bold',
    });
    battleLabel.setOrigin(0.5);
    const battleBtn = this.scene.add.container(ROOM_CX - 70, ROOM_CY + 85, [battleBg, battleLabel]);
    battleBtn.setSize(120, 36);
    battleBtn.setInteractive({ useHandCursor: true });
    battleBtn.on('pointerover', () => battleBg.setFillStyle(C.primaryHover));
    battleBtn.on('pointerout', () => battleBg.setFillStyle(C.primary));
    battleBtn.on('pointerdown', () => this.callbacks.onBattle(enemyId));
    this.encounterPanel.add(battleBtn);

    const fleeBg = this.scene.add.rectangle(0, 0, 120, 36, 0x3b3870);
    fleeBg.setStrokeStyle(1, C.border);
    const fleeLabel = this.scene.add.text(0, 0, '[ Flee ]', {
      fontSize: '14px',
      fontFamily: 'monospace',
      color: C.text,
    });
    fleeLabel.setOrigin(0.5);
    const fleeBtn = this.scene.add.container(ROOM_CX + 70, ROOM_CY + 85, [fleeBg, fleeLabel]);
    fleeBtn.setSize(120, 36);
    fleeBtn.setInteractive({ useHandCursor: true });
    fleeBtn.on('pointerover', () => fleeBg.setFillStyle(C.primaryHover));
    fleeBtn.on('pointerout', () => fleeBg.setFillStyle(0x3b3870));
    fleeBtn.on('pointerdown', () => this.callbacks.onFlee());
    this.encounterPanel.add(fleeBtn);
  }

  showTreasure(itemId: string): void {
    this.treasurePanel.removeAll(true);
    this.treasurePanel.setVisible(true);
    this.navPanel.setVisible(false);

    const overlay = this.scene.add.rectangle(ROOM_CX, ROOM_CY, ROOM_W, ROOM_H, 0x000000, 0.7);
    overlay.setInteractive();
    this.treasurePanel.add(overlay);

    const title = this.scene.add.text(ROOM_CX, ROOM_CY - 50, 'You found a treasure!', {
      fontSize: '18px',
      fontFamily: 'monospace',
      color: '#F59E0B',
      fontStyle: 'bold',
    });
    title.setOrigin(0.5);
    this.treasurePanel.add(title);

    const itemName = this.scene.add.text(ROOM_CX, ROOM_CY - 15, itemId, {
      fontSize: '15px',
      fontFamily: 'monospace',
      color: C.textLight,
    });
    itemName.setOrigin(0.5);
    this.treasurePanel.add(itemName);

    const chestIcon = this.scene.add.rectangle(ROOM_CX, ROOM_CY + 30, 48, 40, 0x7c5cfc);
    chestIcon.setStrokeStyle(2, C.gold);
    this.treasurePanel.add(chestIcon);

    const takeBg = this.scene.add.rectangle(0, 0, 120, 36, C.primary);
    const takeLabel = this.scene.add.text(0, 0, '[ Take ]', {
      fontSize: '14px',
      fontFamily: 'monospace',
      color: '#FFFFFF',
      fontStyle: 'bold',
    });
    takeLabel.setOrigin(0.5);
    const takeBtn = this.scene.add.container(ROOM_CX - 70, ROOM_CY + 85, [takeBg, takeLabel]);
    takeBtn.setSize(120, 36);
    takeBtn.setInteractive({ useHandCursor: true });
    takeBtn.on('pointerover', () => takeBg.setFillStyle(C.primaryHover));
    takeBtn.on('pointerout', () => takeBg.setFillStyle(C.primary));
    takeBtn.on('pointerdown', () => this.callbacks.onTakeTreasure(itemId));
    this.treasurePanel.add(takeBtn);

    const leaveBg = this.scene.add.rectangle(0, 0, 120, 36, 0x3b3870);
    leaveBg.setStrokeStyle(1, C.border);
    const leaveLabel = this.scene.add.text(0, 0, '[ Leave ]', {
      fontSize: '14px',
      fontFamily: 'monospace',
      color: C.text,
    });
    leaveLabel.setOrigin(0.5);
    const leaveBtn = this.scene.add.container(ROOM_CX + 70, ROOM_CY + 85, [leaveBg, leaveLabel]);
    leaveBtn.setSize(120, 36);
    leaveBtn.setInteractive({ useHandCursor: true });
    leaveBtn.on('pointerover', () => leaveBg.setFillStyle(C.primaryHover));
    leaveBtn.on('pointerout', () => leaveBg.setFillStyle(0x3b3870));
    leaveBtn.on('pointerdown', () => this.callbacks.onLeaveTreasure());
    this.treasurePanel.add(leaveBtn);
  }

  updatePartyStatus(partyHp: Record<string, number>, partyMp: Record<string, number>, familiars: string[]): void {
    this.partyContainer.removeAll(true);
    this.partyMemberElements = [];

    const startY = 80;

    familiars.forEach((familiarId, i) => {
      const y = startY + i * 100;
      const familiar = getFamiliar(familiarId);
      if (!familiar) return;

      const stats = familiar.stats;
      const hp = partyHp[familiarId] ?? stats.maxHp;
      const mp = partyMp[familiarId] ?? stats.maxMp;

      const card = this.scene.add.rectangle(LEFT_CX, y + 20, 148, 90, C.cardBg, 0.8);
      card.setStrokeStyle(1, C.border);
      this.partyContainer.add(card);

      const nameText = this.scene.add.text(LEFT_CX, y, familiar.name, {
        fontSize: '12px',
        fontFamily: 'monospace',
        color: C.textLight,
      });
      nameText.setOrigin(0.5);
      this.partyContainer.add(nameText);

      const hpBar = this.scene.add.graphics();
      const mpBar = this.scene.add.graphics();
      this.partyContainer.add(hpBar);
      this.partyContainer.add(mpBar);

      const hpColor = this.getHpColor(hp, stats.maxHp);
      this.drawBar(hpBar, LEFT_CX - 65, y + 32, 130, 10, hp, stats.maxHp, hpColor);

      const hpText = this.scene.add.text(LEFT_CX, y + 44, `HP: ${hp}/${stats.maxHp}`, {
        fontSize: '9px',
        fontFamily: 'monospace',
        color: C.text,
      });
      hpText.setOrigin(0.5);
      this.partyContainer.add(hpText);

      this.drawBar(mpBar, LEFT_CX - 65, y + 58, 130, 8, mp, stats.maxMp, C.mpBar);

      const mpText = this.scene.add.text(LEFT_CX, y + 68, `MP: ${mp}/${stats.maxMp}`, {
        fontSize: '9px',
        fontFamily: 'monospace',
        color: C.text,
      });
      mpText.setOrigin(0.5);
      this.partyContainer.add(mpText);

      this.partyMemberElements.push({ name: nameText, hpBar, mpBar, hpText, mpText });
    });
  }

  showAreaProgress(roomIndex: number, totalRooms: number): void {
    this.areaProgress.setText(`Room ${roomIndex}/${totalRooms}`);
  }

  updateMiniMap(rooms: Record<string, Room>, currentRoomId: string, visitedRoomIds: Set<string>): void {
    this.miniMapGfx.clear();

    const mx = LEFT_CX;
    const my = 44;
    const dotSpacing = 14;
    const maxDots = 8;

    const roomIds = Object.keys(rooms).slice(0, maxDots);

    roomIds.forEach((roomId, i) => {
      const x = mx + (i % 4) * dotSpacing - dotSpacing * 1.5;
      const y = my + Math.floor(i / 4) * dotSpacing;

      let color: number;
      if (roomId === currentRoomId) {
        color = C.primary;
      } else if (visitedRoomIds.has(roomId)) {
        color = C.textMuted;
      } else if (rooms[roomId]?.type === 'boss') {
        color = C.bossRed;
      } else {
        color = C.barBg;
      }

      this.miniMapGfx.fillStyle(color, 1);
      this.miniMapGfx.fillCircle(x, y, 4);
    });
  }

  addLogMessage(text: string): void {
    this.logMessages.push(text);
    if (this.logMessages.length > 5) {
      this.logMessages.splice(0, this.logMessages.length - 5);
    }
    this.logText.setText(this.logMessages.join('\n'));
  }

  showBossWarning(enemyId: string): void {
    this.bossWarning.removeAll(true);
    this.bossWarning.setVisible(true);

    const overlay = this.scene.add.rectangle(ROOM_CX, ROOM_CY, ROOM_W, ROOM_H, 0x000000, 0.85);
    overlay.setInteractive();
    this.bossWarning.add(overlay);

    const icon = this.scene.add.text(ROOM_CX, ROOM_CY - 60, '⚠', {
      fontSize: '32px',
      color: '#FC5C5C',
    });
    icon.setOrigin(0.5);
    this.bossWarning.add(icon);

    const title = this.scene.add.text(ROOM_CX, ROOM_CY - 25, 'BOSS ROOM AHEAD', {
      fontSize: '20px',
      fontFamily: 'monospace',
      color: '#FC5C5C',
      fontStyle: 'bold',
    });
    title.setOrigin(0.5);
    this.bossWarning.add(title);

    const desc = this.scene.add.text(ROOM_CX, ROOM_CY + 10, 'A powerful guardian awaits.\nPrepare your party before entering.', {
      fontSize: '13px',
      fontFamily: 'monospace',
      color: C.text,
      align: 'center',
    });
    desc.setOrigin(0.5);
    this.bossWarning.add(desc);

    const enterBg = this.scene.add.rectangle(0, 0, 120, 36, C.bossRed);
    const enterLabel = this.scene.add.text(0, 0, 'Enter', {
      fontSize: '15px',
      fontFamily: 'monospace',
      color: '#FFFFFF',
    });
    enterLabel.setOrigin(0.5);
    const enterBtn = this.scene.add.container(ROOM_CX - 70, ROOM_CY + 70, [enterBg, enterLabel]);
    enterBtn.setSize(120, 36);
    enterBtn.setInteractive({ useHandCursor: true });
    enterBtn.on('pointerover', () => enterBg.setFillStyle(0xef4444));
    enterBtn.on('pointerout', () => enterBg.setFillStyle(C.bossRed));
    enterBtn.on('pointerdown', () => {
      this.bossWarning.setVisible(false);
      this.callbacks.onBattle(enemyId);
    });
    this.bossWarning.add(enterBtn);

    const retreatBg = this.scene.add.rectangle(0, 0, 120, 36, 0x3b3870);
    retreatBg.setStrokeStyle(1, C.border);
    const retreatLabel = this.scene.add.text(0, 0, 'Retreat', {
      fontSize: '15px',
      fontFamily: 'monospace',
      color: C.text,
    });
    retreatLabel.setOrigin(0.5);
    const retreatBtn = this.scene.add.container(ROOM_CX + 70, ROOM_CY + 70, [retreatBg, retreatLabel]);
    retreatBtn.setSize(120, 36);
    retreatBtn.setInteractive({ useHandCursor: true });
    retreatBtn.on('pointerover', () => retreatBg.setFillStyle(C.primaryHover));
    retreatBtn.on('pointerout', () => retreatBg.setFillStyle(0x3b3870));
    retreatBtn.on('pointerdown', () => {
      this.bossWarning.setVisible(false);
      if (this.callbacks.onRetreatFromBoss) {
        this.callbacks.onRetreatFromBoss();
      }
    });
    this.bossWarning.add(retreatBtn);
  }

  showNewGameArea(): void {
    this.addLogMessage('Entered a new dungeon area.');
  }

  hideEncounterPanel(): void {
    this.encounterPanel.setVisible(false);
  }

  hideTreasurePanel(): void {
    this.treasurePanel.setVisible(false);
  }

  hideNavPanel(): void {
    this.navPanel.setVisible(false);
  }

  showNavPanel(): void {
    this.navPanel.setVisible(true);
  }

  destroy(): void {
    this.scene.children.removeAll();
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
}
