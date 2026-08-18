import Phaser from 'phaser';
import type { Room, RoomExit, Area } from '@arcane-familiars/game-logic';
import { getFamiliar, Directions, RoomType } from '@arcane-familiars/game-logic';
import { C, getHpColor, drawBar } from './theme';

export interface ExplorationUICallbacks {
  onNavigate: (roomId: string) => void;
  onBattle: (enemyId: string) => void;
  onFlee: () => void;
  onTakeTreasure: (itemId: string) => void;
  onLeaveTreasure: () => void;
  onExitDungeon: () => void;
  onRetreatFromBoss?: () => void;
}

const ROOM_CX = 400;
const ROOM_CY = 200;
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
  private roomBgImage!: Phaser.GameObjects.Image;
  private roomBackdrop!: Phaser.GameObjects.Container;
  private currentAreaId = '';
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
  private mainContainer!: Phaser.GameObjects.Container;
  private destroyed = false;

  constructor(scene: Phaser.Scene, callbacks: ExplorationUICallbacks) {
    this.scene = scene;
    this.callbacks = callbacks;
    this.gw = scene.scale.width;
    this.gh = scene.scale.height;
  }

  init(area: Area): void {
    this.currentAreaId = area.id;
    this.mainContainer = this.scene.add.container(0, 0);
    this.roomBackdrop = this.scene.add.container(0, 0);
    this.scene.add.existing(this.roomBackdrop);
    this.createBackground();
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

  private createBackground(): void {
    // Flat fallback backdrop (covers the full canvas) behind the room image.
    // No dividers here: the room art spans the whole canvas, matching the
    // battle scene's full-canvas background treatment.
    const bg = this.scene.add.rectangle(this.gw / 2, this.gh / 2, this.gw, this.gh, C.bg);
    this.roomBackdrop.add(bg);
  }

  private createRoomArea(): void {
    // Room art fills the entire canvas (like battle backgrounds), instead of
    // the previous small centered panel.
    this.roomBgImage = this.scene.add.image(this.gw / 2, this.gh / 2, `room_${this.currentAreaId}_1`);
    this.roomBgImage.setDisplaySize(this.gw, this.gh);
    this.roomBgImage.setOrigin(0.5);
    this.roomBgImage.setDepth(-1);
    this.roomBackdrop.add(this.roomBgImage);

    this.roomBg = this.scene.add.rectangle(this.gw / 2, this.gh / 2, this.gw, this.gh, C.panelBg, 0.45);
    this.roomBg.setDepth(0);
    this.roomBackdrop.add(this.roomBg);

    this.roomName = this.scene.add.text(this.gw / 2, 60, '', {
      fontSize: '18px',
      fontFamily: 'Fredoka',
      color: C.textLight,
      fontStyle: '600',
    });
    this.roomName.setOrigin(0.5);
    this.mainContainer.add(this.roomName);

    this.roomTypeIndicator = this.scene.add.text(this.gw / 2, 88, '', {
      fontSize: '11px',
      fontFamily: 'DM Sans',
    });
    this.roomTypeIndicator.setOrigin(0.5);
    this.mainContainer.add(this.roomTypeIndicator);

    this.roomDesc = this.scene.add.text(this.gw / 2, 300, '', {
      fontSize: '13px',
      fontFamily: 'DM Sans',
      color: C.text,
      wordWrap: { width: 560 },
      align: 'center',
    });
    this.roomDesc.setOrigin(0.5);
    this.mainContainer.add(this.roomDesc);
  }

  private createPartyStatus(): void {
    this.partyContainer = this.scene.add.container(0, 0);
    this.mainContainer.add(this.partyContainer);
  }

  private createAreaProgress(): void {
    this.areaProgress = this.scene.add.text(this.gw - 14, 12, '', {
      fontSize: '12px',
      fontFamily: 'JetBrains Mono',
      color: C.text,
    });
    this.areaProgress.setOrigin(1, 0);
    this.mainContainer.add(this.areaProgress);
  }

  private createMiniMap(): void {
    this.miniMapGfx = this.scene.add.graphics();
    this.mainContainer.add(this.miniMapGfx);
  }

  private createLogPanel(): void {
    const ly = 46;

    const logBg = this.scene.add.rectangle(RIGHT_X + RIGHT_W / 2, 200, RIGHT_W, 340, C.panelBg, 0.7);
    logBg.setStrokeStyle(1, C.border);
    this.mainContainer.add(logBg);

    const logTitle = this.scene.add.text(RIGHT_X, ly, 'Room Log', {
      fontSize: '11px',
      fontFamily: 'DM Sans',
      color: '#7C5CFC',
    });
    this.mainContainer.add(logTitle);

    this.logText = this.scene.add.text(RIGHT_X, ly + 18, '', {
      fontSize: '10px',
      fontFamily: 'DM Sans',
      color: C.text,
      wordWrap: { width: RIGHT_W - 12 },
      lineSpacing: 3,
    });
    this.mainContainer.add(this.logText);
  }

  private createNavPanel(): void {
    this.navPanel = this.scene.add.container(0, 0);
    this.navPanel.setVisible(false);
    this.mainContainer.add(this.navPanel);
  }

  private createEncounterPanel(): void {
    this.encounterPanel = this.scene.add.container(0, 0);
    this.encounterPanel.setVisible(false);
    this.mainContainer.add(this.encounterPanel);
  }

  private createTreasurePanel(): void {
    this.treasurePanel = this.scene.add.container(0, 0);
    this.treasurePanel.setVisible(false);
    this.mainContainer.add(this.treasurePanel);
  }

  private createBossWarning(): void {
    this.bossWarning = this.scene.add.container(0, 0);
    this.bossWarning.setVisible(false);
    this.mainContainer.add(this.bossWarning);
  }

  private createExitButton(): void {
    const btn = this.makeButton(
      82, 18, 100, 28, 'Exit',
      0x3B3870, C.primaryHover,
      () => this.callbacks.onExitDungeon(),
      {
        borderColor: C.border,
        labelColor: C.text,
        fontSize: '11px',
      },
    );
    this.exitBtn = btn.container;
    this.mainContainer.add(this.exitBtn);
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
    this.roomBg.setFillStyle(color, 0.45);

    const bgKey = `room_${area.id}_${(roomIndex % 3) + 1}`;
    if (this.scene.textures.exists(bgKey)) {
      this.roomBgImage.setTexture(bgKey);
      this.roomBgImage.setDisplaySize(this.gw, this.gh);
    }

    this.roomName.setText(room.name);
    this.roomDesc.setText(room.description);

    const typeStyles: Record<RoomType, { label: string; color: string }> = {
      [RoomType.Start]: { label: 'START', color: '#2DD4BF' },
      [RoomType.Normal]: { label: 'ROOM', color: '#A5A3C4' },
      [RoomType.Deadend]: { label: 'DEAD END', color: '#6366A1' },
      [RoomType.Boss]: { label: 'BOSS', color: '#EF4444' },
    };
    const style = typeStyles[room.type] ?? typeStyles[RoomType.Normal];
    this.roomTypeIndicator.setText(style.label);
    this.roomTypeIndicator.setColor(style.color);
  }

  showExits(exits: RoomExit[]): void {
    this.navPanel.removeAll(true);
    this.exitButtons = [];
    this.navPanel.setVisible(false);

    if (exits.length === 0) return;

    const bw = 100;
    const bh = 34;
    const spacing = 10;
    const totalW = exits.length * bw + (exits.length - 1) * spacing;
    const startX = (this.gw - totalW) / 2 + bw / 2;

    exits.forEach((exit, i) => {
      const btn = this.makeButton(
        startX + i * (bw + spacing), NAV_Y,
        bw, bh,
        exit.label, C.buttonBg, C.primaryHover,
        () => this.callbacks.onNavigate(exit.roomId),
        { labelColor: C.textLight, fontSize: '12px', borderColor: C.border, labelY: -2 },
      );

      const dirLabel = this.scene.add.text(0, -14, (Directions[exit.direction] ?? '').toUpperCase(), {
        fontSize: '9px',
        fontFamily: 'DM Sans',
        color: '#6366A1',
      });
      dirLabel.setOrigin(0.5);
      btn.container.add(dirLabel);

      this.navPanel.add(btn.container);
      this.exitButtons.push(btn.container);
    });

    this.navPanel.setVisible(true);
  }

  showEncounter(enemyId: string): void {
    this.encounterPanel.removeAll(true);
    this.encounterPanel.setVisible(true);
    this.navPanel.setVisible(false);

    const overlay = this.scene.add.rectangle(this.gw / 2, this.gh / 2, this.gw, this.gh, 0x000000, 0.7);
    overlay.setInteractive();
    this.encounterPanel.add(overlay);

    const familiar = getFamiliar(enemyId);
    const enemyName = familiar?.name ?? enemyId;

    const title = this.scene.add.text(ROOM_CX, ROOM_CY - 60, 'A wild familiar appears!', {
      fontSize: '16px',
      fontFamily: 'Fredoka',
      color: '#F59E0B',
      fontStyle: '600',
    });
    title.setOrigin(0.5);
    this.encounterPanel.add(title);

    const nameText = this.scene.add.text(ROOM_CX, ROOM_CY - 25, enemyName, {
      fontSize: '20px',
      fontFamily: 'Fredoka',
      color: '#EF4444',
      fontStyle: '600',
    });
    nameText.setOrigin(0.5);
    this.encounterPanel.add(nameText);

    const enemySprite = this.scene.add.rectangle(ROOM_CX, ROOM_CY + 30, 64, 64, 0x4E2A2A);
    enemySprite.setStrokeStyle(2, 0xEF4444);
    this.encounterPanel.add(enemySprite);

    const battleBtn = this.makeButton(
      ROOM_CX - 70, ROOM_CY + 85,
      120, 36, '[ Battle! ]', C.primary, C.primaryHover,
      () => this.callbacks.onBattle(enemyId),
      { fontStyle: 'bold' },
    );
    this.encounterPanel.add(battleBtn.container);

    const fleeBtn = this.makeButton(
      ROOM_CX + 70, ROOM_CY + 85,
      120, 36, '[ Flee ]', 0x3B3870, C.primaryHover,
      () => this.callbacks.onFlee(),
      { borderColor: C.border, labelColor: C.text },
    );
    this.encounterPanel.add(fleeBtn.container);
  }

  showTreasure(itemId: string): void {
    this.treasurePanel.removeAll(true);
    this.treasurePanel.setVisible(true);
    this.navPanel.setVisible(false);

    const overlay = this.scene.add.rectangle(this.gw / 2, this.gh / 2, this.gw, this.gh, 0x000000, 0.7);
    overlay.setInteractive();
    this.treasurePanel.add(overlay);

    const title = this.scene.add.text(ROOM_CX, ROOM_CY - 50, 'You found a treasure!', {
      fontSize: '18px',
      fontFamily: 'Fredoka',
      color: '#F59E0B',
      fontStyle: '600',
    });
    title.setOrigin(0.5);
    this.treasurePanel.add(title);

    const itemName = this.scene.add.text(ROOM_CX, ROOM_CY - 15, itemId, {
      fontSize: '15px',
      fontFamily: 'DM Sans',
      color: C.textLight,
    });
    itemName.setOrigin(0.5);
    this.treasurePanel.add(itemName);

    const chestIcon = this.scene.add.rectangle(ROOM_CX, ROOM_CY + 30, 48, 40, 0x7C5CFC);
    chestIcon.setStrokeStyle(2, C.gold);
    this.treasurePanel.add(chestIcon);

    const takeBtn = this.makeButton(
      ROOM_CX - 70, ROOM_CY + 85,
      120, 36, '[ Take ]', C.primary, C.primaryHover,
      () => this.callbacks.onTakeTreasure(itemId),
      { fontStyle: 'bold' },
    );
    this.treasurePanel.add(takeBtn.container);

    const leaveBtn = this.makeButton(
      ROOM_CX + 70, ROOM_CY + 85,
      120, 36, '[ Leave ]', 0x3B3870, C.primaryHover,
      () => this.callbacks.onLeaveTreasure(),
      { borderColor: C.border, labelColor: C.text },
    );
    this.treasurePanel.add(leaveBtn.container);
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
        fontFamily: 'DM Sans',
        color: C.textLight,
      });
      nameText.setOrigin(0.5);
      this.partyContainer.add(nameText);

      const hpBar = this.scene.add.graphics();
      const mpBar = this.scene.add.graphics();
      this.partyContainer.add(hpBar);
      this.partyContainer.add(mpBar);

      const hpColor = getHpColor(hp, stats.maxHp);
      drawBar(hpBar, LEFT_CX - 65, y + 32, 130, 10, hp, stats.maxHp, hpColor);

      const hpText = this.scene.add.text(LEFT_CX, y + 44, `HP: ${hp}/${stats.maxHp}`, {
        fontSize: '9px',
        fontFamily: 'JetBrains Mono',
        color: C.text,
      });
      hpText.setOrigin(0.5);
      this.partyContainer.add(hpText);

      drawBar(mpBar, LEFT_CX - 65, y + 58, 130, 8, mp, stats.maxMp, C.mpBar);

      const mpText = this.scene.add.text(LEFT_CX, y + 68, `MP: ${mp}/${stats.maxMp}`, {
        fontSize: '9px',
        fontFamily: 'JetBrains Mono',
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

    const ids = Object.keys(rooms);
    if (ids.length === 0) return;

    // Start room: the Start-typed room, else the numerically-first room id.
    const startId = ids.find((id) => rooms[id].type === RoomType.Start)
      ?? ids.slice().sort((a, b) => {
        const na = parseInt(a, 10);
        const nb = parseInt(b, 10);
        if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
        return a.localeCompare(b);
      })[0];

    // BFS from the start room: depth = column, row = position within the column.
    const depth = new Map<string, number>();
    const levelIds: string[][] = [];
    const queue: string[] = [startId];
    depth.set(startId, 0);
    levelIds[0] = [startId];

    while (queue.length > 0) {
      const id = queue.shift()!;
      const d = depth.get(id)!;
      for (const exit of rooms[id]?.exits ?? []) {
        if (!rooms[exit.roomId] || depth.has(exit.roomId)) continue;
        depth.set(exit.roomId, d + 1);
        if (!levelIds[d + 1]) levelIds[d + 1] = [];
        levelIds[d + 1].push(exit.roomId);
        queue.push(exit.roomId);
      }
    }
    // Any rooms not reachable (shouldn't happen) share the start column.
    for (const id of ids) {
      if (!depth.has(id)) {
        depth.set(id, 0);
        if (!levelIds[0]) levelIds[0] = [];
        levelIds[0].push(id);
      }
    }

    // Layout nodes.
    const originX = LEFT_CX;
    const originY = 44;
    const colW = 18;
    const rowH = 15;
    const radius = 3.5;
    const pos: Record<string, { x: number; y: number }> = {};
    for (let col = 0; col < levelIds.length; col++) {
      levelIds[col].forEach((id, row) => {
        pos[id] = { x: originX + col * colW, y: originY + row * rowH };
      });
    }

    const g = this.miniMapGfx;

    // Edges (deduped undirected).
    const drawn = new Set<string>();
    for (const id of ids) {
      for (const exit of rooms[id]?.exits ?? []) {
        if (!pos[exit.roomId]) continue;
        const key = [id, exit.roomId].sort().join('|');
        if (drawn.has(key)) continue;
        drawn.add(key);
        const a = pos[id];
        const b = pos[exit.roomId];
        const lit = id === currentRoomId || exit.roomId === currentRoomId;
        g.lineStyle(lit ? 1.5 : 1, lit ? C.primary : C.border, lit ? 1 : 0.7);
        g.lineBetween(a.x, a.y, b.x, b.y);
      }
    }

    // Nodes.
    for (const id of ids) {
      const p = pos[id];
      if (!p) continue;
      const isCurrent = id === currentRoomId;
      const isStart = rooms[id].type === RoomType.Start;
      const isBoss = rooms[id].type === RoomType.Boss;
      const isVisited = visitedRoomIds.has(id);

      let fill: number;
      let stroke: number;
      if (isCurrent) {
        fill = C.primary;
        stroke = 0xF0EFFF;
      } else if (isStart) {
        fill = C.hpBar;
        stroke = C.bg;
      } else if (isVisited) {
        fill = C.muted;
        stroke = C.panelBg;
      } else if (isBoss) {
        fill = C.bossRed;
        stroke = C.bg;
      } else {
        fill = C.buttonBg;
        stroke = C.muted;
      }

      g.fillStyle(fill, 1);
      g.fillCircle(p.x, p.y, radius);
      g.lineStyle(1, stroke, 1);
      g.strokeCircle(p.x, p.y, radius);
    }
  }

  addLogMessage(text: string): void {
    this.logMessages.push(text);
    if (this.logMessages.length > 10) {
      this.logMessages.splice(0, this.logMessages.length - 10);
    }
    this.logText.setText(this.logMessages.join('\n'));
  }

  getLog(): string[] {
    return [...this.logMessages];
  }

  setVisible(enabled: boolean): void {
    this.mainContainer.setVisible(enabled);
    this.setContainerInteractive(this.mainContainer, enabled);
  }

  setBackdropVisible(enabled: boolean): void {
    this.roomBackdrop.setVisible(enabled);
    this.setContainerInteractive(this.roomBackdrop, enabled);
  }

  private setContainerInteractive(container: Phaser.GameObjects.Container, enabled: boolean): void {
    if (enabled) {
      container.setInteractive();
    } else {
      container.disableInteractive();
    }
    for (const child of container.list) {
      if (child instanceof Phaser.GameObjects.Container) {
        this.setContainerInteractive(child, enabled);
      } else if (child.input) {
        if (enabled) {
          child.setInteractive();
        } else {
          child.disableInteractive();
        }
      }
    }
  }

  showBossWarning(enemyId: string): void {
    this.bossWarning.removeAll(true);
    this.bossWarning.setVisible(true);

    const overlay = this.scene.add.rectangle(this.gw / 2, this.gh / 2, this.gw, this.gh, 0x000000, 0.85);
    overlay.setInteractive();
    this.bossWarning.add(overlay);

    const icon = this.scene.add.text(ROOM_CX, ROOM_CY - 60, '⚠', {
      fontSize: '32px',
      color: '#EF4444',
    });
    icon.setOrigin(0.5);
    this.bossWarning.add(icon);

    const title = this.scene.add.text(ROOM_CX, ROOM_CY - 25, 'BOSS ROOM AHEAD', {
      fontSize: '20px',
      fontFamily: 'Fredoka',
      color: '#EF4444',
      fontStyle: '600',
    });
    title.setOrigin(0.5);
    this.bossWarning.add(title);

    const desc = this.scene.add.text(ROOM_CX, ROOM_CY + 10, 'A powerful guardian awaits.\nPrepare your party before entering.', {
      fontSize: '13px',
      fontFamily: 'DM Sans',
      color: C.text,
      align: 'center',
    });
    desc.setOrigin(0.5);
    this.bossWarning.add(desc);

    const enterBtn = this.makeButton(
      ROOM_CX - 70, ROOM_CY + 70,
      120, 36, 'Enter', C.bossRed, 0xDC2626,
      () => {
        this.bossWarning.setVisible(false);
        this.callbacks.onBattle(enemyId);
      },
    );
    this.bossWarning.add(enterBtn.container);

    const retreatBtn = this.makeButton(
      ROOM_CX + 70, ROOM_CY + 70,
      120, 36, 'Retreat', 0x3B3870, C.primaryHover,
      () => {
        this.bossWarning.setVisible(false);
        if (this.callbacks.onRetreatFromBoss) {
          this.callbacks.onRetreatFromBoss();
        }
      },
      { borderColor: C.border, labelColor: C.text },
    );
    this.bossWarning.add(retreatBtn.container);
  }

  hideEncounterPanel(): void {
    this.encounterPanel.setVisible(false);
  }

  hideTreasurePanel(): void {
    this.treasurePanel.setVisible(false);
  }

  hideBossWarning(): void {
    this.bossWarning.setVisible(false);
  }

  hideNavPanel(): void {
    this.navPanel.setVisible(false);
  }

  showNavPanel(): void {
    this.navPanel.setVisible(true);
  }

  isDestroyed(): boolean {
    return this.destroyed;
  }

  destroy(): void {
    this.destroyed = true;
    this.exitButtons = [];
    this.partyMemberElements = [];
    this.logMessages = [];
    this.mainContainer.destroy(true);
    if (this.roomBackdrop) {
      this.roomBackdrop.destroy(true);
    }
  }

  private makeButton(
    x: number, y: number,
    w: number, h: number,
    label: string,
    bgColor: number,
    hoverColor: number,
    onClick: () => void,
    options?: {
      borderColor?: number;
      labelColor?: string;
      fontSize?: string;
      fontStyle?: string;
      labelY?: number;
    },
  ): { container: Phaser.GameObjects.Container; bg: Phaser.GameObjects.Rectangle; label: Phaser.GameObjects.Text } {
    const bg = this.scene.add.rectangle(0, 0, w, h, bgColor);
    if (options?.borderColor !== undefined) {
      bg.setStrokeStyle(1, options.borderColor);
    }

    const labelY = options?.labelY ?? 0;
    const labelColor = options?.labelColor ?? '#F0EFFF';
    const fontSize = options?.fontSize ?? '14px';

    const labelText = this.scene.add.text(0, labelY, label, {
      fontSize,
      fontFamily: 'DM Sans',
      color: labelColor,
      ...(options?.fontStyle ? { fontStyle: options.fontStyle } : {}),
    });
    labelText.setOrigin(0.5);

    const container = this.scene.add.container(x, y, [bg, labelText]);
    container.setSize(w, h);
    container.setInteractive({ useHandCursor: true });

    container.on('pointerover', () => bg.setFillStyle(hoverColor));
    container.on('pointerout', () => bg.setFillStyle(bgColor));
    container.on('pointerdown', onClick);

    return { container, bg, label: labelText };
  }
}
