import Phaser from 'phaser';
import type { GameState } from '@arcane-familiars/game-logic';
import {
  FAMILIARS,
  getAbility,
  abilitiesAtLevel,
  learnSchedule,
  Affinity,
  AREAS,
  validateParty,
  scaleFamiliarStats,
} from '@arcane-familiars/game-logic';
import { gameApiClient } from '../api/client';
import { SCENE_KEYS } from '../constants/scenes';
import { gameEventBus } from '../event-bus';
import { GameEvent } from '../events';
import type { GameStateSnapshot } from '../events';
import { Layout } from '../ui/layout';
import { preloadFamiliarPortraits } from '../sprites/loader';
import { safeFamiliarTextureKey } from '../sprites/registry';
import { audioManager } from '../audio/manager';
import { fadeIn, fadeToScene } from '../ui/transitions';

interface PartySelectData {
  areaId: string;
}

interface FamiliarCard {
  familiarId: string;
  selected: boolean;
  border: Phaser.GameObjects.Rectangle;
  bg: Phaser.GameObjects.Rectangle;
  container: Phaser.GameObjects.Container;
  /** Primary selection ring, shown only while the card is selected. */
  ring: Phaser.GameObjects.Rectangle;
  /** Lead / Backup pill; blank until the card is selected. */
  orderBadge: Phaser.GameObjects.Text;
  orderBadgeBg: Phaser.GameObjects.Rectangle;
}

/** DESIGN.md palette colours per affinity, mirroring the React HUD chips. */
const AFFINITY_COLORS: Record<string, number> = {
  Fire: 0xf59e0b,
  Water: 0x2dd4bf,
  Earth: 0x10b981,
  Wind: 0xa5a3c4,
  Light: 0xfbbf24,
  Dark: 0x7c5cfc,
};

const LAYOUT = {
  TITLE_Y: 30,
  INSTRUCTION_Y: 60,
  CARD_WIDTH: 160,
  CARD_HEIGHT: 360,
  CARD_GAP: 15,
  CARD_Y: 274,
  CONFIRM_BUTTON_WIDTH: 200,
  CONFIRM_BUTTON_HEIGHT: 36,
  CONFIRM_BUTTON_Y_OFFSET: 30,
  BACK_MARGIN: 30,
  NAME_OFFSET_Y: 12,
  AFFINITY_OFFSET_Y: 30,
  STATS_OFFSET_Y: 48,
  ABILITIES_LABEL_OFFSET_Y: 165,
  ABILITIES_TEXT_OFFSET_Y: 180,
  NEXT_ABILITY_OFFSET_Y: 204,
  CARD_BORDER_WIDTH: 2,
  CARD_STROKE_WIDTH: 1,
} as const;

const COLORS = {
  TITLE: '#7C5CFC',
  SUBTITLE: '#A5A3C4',
  LABEL: '#6366A1',
  CARD_BG: 0x1e1b4b,
  CARD_BORDER: 0x3b3870,
  CARD_HOVER: 0x2d2a5e,
  SELECTED_BORDER: 0x7c5cfc,
  BUTTON_DISABLED: 0x3b3870,
  BUTTON_ENABLED: 0x7c5cfc,
  TEXT_DISABLED: '#6366A1',
  TEXT_ENABLED: '#F0EFFF',
  TEXT_HOVER: '#F0EFFF',
  ERROR: '#EF4444',
  NEW_TAG: 0xf472b6,
  NEW_TAG_TEXT: '#F472B6',
} as const;

const MAX_SAVE_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1000;
const MAX_PARTY_SIZE = 2;
const DEFAULT_FALLBACK_FAMILIARS = ['whiteDog', 'yellowFighter'];
const SEEN_FAMILIARS_KEY = 'af_seen_familiars';

/**
 * Seen ids are best-effort; private browsing or disabled storage must not throw.
 * Returns null when nothing has been stored yet (first visit).
 */
function loadSeenFamiliars(): Set<string> | null {
  try {
    const raw = localStorage.getItem(SEEN_FAMILIARS_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === 'string'));
  } catch {
    // Unreadable storage: treat as a first visit so tags never get stuck on.
    return null;
  }
}

function saveSeenFamiliars(seen: Set<string>): void {
  try {
    localStorage.setItem(SEEN_FAMILIARS_KEY, JSON.stringify([...seen]));
  } catch {
    // Storage unavailable: the NEW tag simply reappears next session.
  }
}

export class PartySelectScene extends Phaser.Scene {
  private layout!: Layout;
  private areaId!: string;
  private fullGameState: GameState | null = null;
  private cards: FamiliarCard[] = [];
  private cardMap: Map<string, FamiliarCard> = new Map();
  private selectedIds: string[] = [];
  private allFamiliarIds: string[] = [];
  private seenFamiliars: Set<string> = new Set();
  /** First visit with no stored list: everything owned now is the baseline, not "new". */
  private seenBaselineMissing = false;
  private page = 0;
  private readonly PAGE_SIZE = 4;
  private pageText?: Phaser.GameObjects.Text;
  private pagePrev?: Phaser.GameObjects.Text;
  private pageNext?: Phaser.GameObjects.Text;
  private loadingText!: Phaser.GameObjects.Text;
  private confirmText!: Phaser.GameObjects.Text;
  private confirmBg!: Phaser.GameObjects.Rectangle;
  private backText!: Phaser.GameObjects.Text;
  private instructionText!: Phaser.GameObjects.Text;
  private retryTimer: Phaser.Time.TimerEvent | null = null;
  private isSaving = false;
  private saveRetryCount = 0;
  private _sceneGeneration = 0;
  private _hasShownTerminalError = false;

  constructor() {
    super({ key: SCENE_KEYS.PARTY_SELECT });
  }

  init(data: PartySelectData): void {
    this._sceneGeneration++;
    this._hasShownTerminalError = false;
    this.isSaving = false;
    this.saveRetryCount = 0;
    this.cards = [];
    this.cardMap.clear();
    this.selectedIds = [];
    this.allFamiliarIds = [];
    const storedSeen = loadSeenFamiliars();
    this.seenFamiliars = storedSeen ?? new Set();
    this.seenBaselineMissing = storedSeen === null;
    this.page = 0;
    this.pageText = undefined;
    this.pagePrev = undefined;
    this.pageNext = undefined;
    this.events.off('shutdown', this.onShutdown, this);
    this.events.on('shutdown', this.onShutdown, this);

    if (!data?.areaId || !AREAS[data.areaId]) {
      console.error(`PartySelectScene: invalid areaId "${data?.areaId}"`);
      this.scene.start(SCENE_KEYS.WORLD_MAP);
      return;
    }
    this.areaId = data.areaId;
  }

  preload(): void {
    preloadFamiliarPortraits(this);
  }

  async create(): Promise<void> {
    if (!this.areaId) return;
    audioManager.playMusic('main');
    audioManager.stopAmbience();
    this.layout = new Layout(this);
    fadeIn(this);

    // Wire EventBus for save, exit, and scene change notification
    gameEventBus.on(GameEvent.SAVE_GAME, this.handleSave);
    gameEventBus.on(GameEvent.EXIT_GAME, this.handleExit);
    gameEventBus.emit(GameEvent.SCENE_CHANGED, { scene: 'party_select' });

    const gen = this._sceneGeneration;

    this.add
      .text(this.layout.x(400), this.layout.y(30), 'Select Your Party', {
        fontSize: this.layout.font(28),
        fontFamily: 'Fredoka',
        fontStyle: '600',
        color: COLORS.TITLE,
      })
      .setOrigin(0.5);

    this.instructionText = this.add
      .text(this.layout.x(400), this.layout.y(60), 'Choose 2 Familiars', {
        fontSize: this.layout.font(14),
        fontFamily: 'DM Sans',
        color: COLORS.SUBTITLE,
      })
      .setOrigin(0.5);

    this.loadingText = this.add
      .text(this.layout.x(400), this.layout.y(300), 'Loading...', {
        fontSize: this.layout.font(18),
        fontFamily: 'DM Sans',
        color: COLORS.SUBTITLE,
      })
      .setOrigin(0.5);

    const confirmY = this.layout.y(600 - LAYOUT.CONFIRM_BUTTON_Y_OFFSET);

    this.confirmBg = this.add.rectangle(
      this.layout.x(400),
      confirmY,
      this.layout.s(LAYOUT.CONFIRM_BUTTON_WIDTH),
      this.layout.s(LAYOUT.CONFIRM_BUTTON_HEIGHT),
      COLORS.BUTTON_DISABLED
    );
    this.confirmBg.setStrokeStyle(this.layout.s(LAYOUT.CARD_STROKE_WIDTH), COLORS.BUTTON_DISABLED);

    this.confirmText = this.add
      .text(this.layout.x(400), confirmY, 'Confirm Party', {
        fontSize: this.layout.font(14),
        fontFamily: 'DM Sans',
        color: COLORS.TEXT_DISABLED,
      })
      .setOrigin(0.5);

    this.backText = this.add
      .text(this.layout.x(LAYOUT.BACK_MARGIN), confirmY, '< Back', {
        fontSize: this.layout.font(14),
        fontFamily: 'DM Sans',
        color: COLORS.SUBTITLE,
      })
      .setInteractive({ useHandCursor: true });

    this.backText.on('pointerdown', () => {
      audioManager.playSfx('ui_cancel');
      fadeToScene(this, SCENE_KEYS.WORLD_MAP);
    });
    this.backText.on('pointerover', () => this.backText.setColor(COLORS.TEXT_HOVER));
    this.backText.on('pointerout', () => this.backText.setColor(COLORS.SUBTITLE));

    try {
      const result = await gameApiClient.loadGameState();
      if (this._sceneGeneration !== gen) return;

      const state = result.state;
      this.fullGameState = state;
      if (this.seenBaselineMissing) {
        // Starters (or a save from before NEW tags existed) are not news.
        for (const id of state.playerFamiliars ?? []) this.seenFamiliars.add(id);
        saveSeenFamiliars(this.seenFamiliars);
        this.seenBaselineMissing = false;
      }
      const savedFamiliars = state.playerFamiliars || [];
      const validSavedFamiliars = savedFamiliars.filter((id) => FAMILIARS[id]);

      const familiarIds =
        validSavedFamiliars.length >= MAX_PARTY_SIZE ? validSavedFamiliars : DEFAULT_FALLBACK_FAMILIARS;

      this.loadingText.setAlpha(0);
      this.createFamiliarCards(familiarIds);

      if (this._sceneGeneration !== gen) return;

      if (state.activeParty?.length) {
        this.selectedIds = state.activeParty.filter((id) => this.allFamiliarIds.includes(id)).slice(0, MAX_PARTY_SIZE);
        this.renderPage();
        this.updateConfirmButton();
      }
    } catch (err) {
      if (this._sceneGeneration !== gen) return;

      const message = err instanceof Error ? err.message : 'Could not load party data';
      this.loadingText.setText(message);
      this.loadingText.setAlpha(1);

      this.retryTimer = this.time.delayedCall(RETRY_DELAY_MS, () => {
        this.retryTimer = null;
        if (this._sceneGeneration !== gen) return;
        this.loadingText.setAlpha(0);
        this.createFamiliarCards(DEFAULT_FALLBACK_FAMILIARS);
      });
    }
  }

  private createFamiliarCards(familiarIds: string[]): void {
    const validFamiliars = familiarIds.filter((id) => FAMILIARS[id]);

    if (validFamiliars.length < MAX_PARTY_SIZE) {
      this.loadingText.setText('Not enough familiars available');
      this.loadingText.setColor(COLORS.ERROR);
      this.loadingText.setAlpha(1);

      const goBackText = this.add
        .text(this.layout.x(400), this.layout.y(300) + this.layout.s(40), '< Go Back', {
          fontSize: this.layout.font(16),
          fontFamily: 'DM Sans',
          color: COLORS.SUBTITLE,
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });

      goBackText.on('pointerdown', () => {
        audioManager.playSfx('ui_cancel');
        fadeToScene(this, SCENE_KEYS.WORLD_MAP);
      });
      goBackText.on('pointerover', () => goBackText.setColor(COLORS.TEXT_HOVER));
      goBackText.on('pointerout', () => goBackText.setColor(COLORS.SUBTITLE));
      return;
    }

    this.allFamiliarIds = validFamiliars;
    this.page = 0;

    this.pagePrev = this.add
      .text(this.layout.x(320), this.layout.y(530), '< Prev', {
        fontSize: this.layout.font(13),
        fontFamily: 'DM Sans',
        color: COLORS.SUBTITLE,
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    this.pagePrev.on('pointerdown', () => {
      audioManager.playSfx('ui_click');
      this.changePage(-1);
    });

    this.pageText = this.add
      .text(this.layout.x(400), this.layout.y(530), '', {
        fontSize: this.layout.font(12),
        fontFamily: 'JetBrains Mono',
        color: COLORS.SUBTITLE,
      })
      .setOrigin(0.5);

    this.pageNext = this.add
      .text(this.layout.x(480), this.layout.y(530), 'Next >', {
        fontSize: this.layout.font(13),
        fontFamily: 'DM Sans',
        color: COLORS.SUBTITLE,
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    this.pageNext.on('pointerdown', () => {
      audioManager.playSfx('ui_click');
      this.changePage(1);
    });

    this.renderPage();
    this.setupConfirmButton();
  }

  private changePage(delta: number): void {
    const maxPage = Math.max(0, Math.ceil(this.allFamiliarIds.length / this.PAGE_SIZE) - 1);
    this.page = Math.min(maxPage, Math.max(0, this.page + delta));
    this.renderPage();
  }

  private renderPage(): void {
    for (const card of this.cards) {
      card.container.destroy(true);
    }
    this.cards = [];
    this.cardMap.clear();

    const pageIds = this.allFamiliarIds.slice(this.page * this.PAGE_SIZE, (this.page + 1) * this.PAGE_SIZE);
    const totalPages = Math.max(1, Math.ceil(this.allFamiliarIds.length / this.PAGE_SIZE));
    this.pageText?.setText(`Page ${this.page + 1}/${totalPages}`);
    this.pagePrev?.setAlpha(this.page > 0 ? 1 : 0.35);
    this.pageNext?.setAlpha(this.page < totalPages - 1 ? 1 : 0.35);

    const totalWidth = pageIds.length * LAYOUT.CARD_WIDTH + (pageIds.length - 1) * LAYOUT.CARD_GAP;
    const startX = this.layout.x((800 - totalWidth) / 2 + LAYOUT.CARD_WIDTH / 2);

    pageIds.forEach((id, index) => {
      const familiar = FAMILIARS[id];
      const selected = this.selectedIds.includes(id);
      const x = startX + index * this.layout.s(LAYOUT.CARD_WIDTH + LAYOUT.CARD_GAP);

      const bg = this.add.rectangle(
        0,
        0,
        this.layout.s(LAYOUT.CARD_WIDTH),
        this.layout.s(LAYOUT.CARD_HEIGHT),
        COLORS.CARD_BG
      );
      const border = this.add.rectangle(0, 0, this.layout.s(LAYOUT.CARD_WIDTH), this.layout.s(LAYOUT.CARD_HEIGHT));
      border.setStrokeStyle(
        this.layout.s(LAYOUT.CARD_BORDER_WIDTH),
        selected ? COLORS.SELECTED_BORDER : COLORS.CARD_BORDER
      );
      border.setFillStyle(COLORS.CARD_BG);

      // Primary selection ring: a thicker overlay stroke so the picked cards are
      // unmistakable at a glance (the base border stays as the resting state).
      const ring = this.add.rectangle(0, 0, this.layout.s(LAYOUT.CARD_WIDTH), this.layout.s(LAYOUT.CARD_HEIGHT));
      ring.setStrokeStyle(this.layout.s(4), COLORS.SELECTED_BORDER);
      ring.setVisible(selected);

      const container = this.add.container(x, this.layout.y(LAYOUT.CARD_Y), [border, bg]);

      const portrait = this.add.image(
        0,
        -this.layout.s(LAYOUT.CARD_HEIGHT / 2) + this.layout.s(70),
        safeFamiliarTextureKey(this, id)
      );
      portrait.setDisplaySize(this.layout.s(110), this.layout.s(110));
      portrait.setDepth(1);

      const offsetY = -this.layout.s(LAYOUT.CARD_HEIGHT / 2) + this.layout.s(LAYOUT.NAME_OFFSET_Y) + this.layout.s(120);

      const level = this.fullGameState?.familiarLevels?.[id] ?? 1;
      const stats = scaleFamiliarStats(familiar.stats, level);

      const nameText = this.add
        .text(0, offsetY, familiar.name, {
          fontSize: this.layout.font(15),
          fontFamily: 'Fredoka',
          fontStyle: '600',
          color: COLORS.TITLE,
        })
        .setOrigin(0.5, 0);

      // Level badge pinned to the portrait corner: prominent, monospaced data.
      const cardRight = this.layout.s(LAYOUT.CARD_WIDTH / 2);
      const cardTop = -this.layout.s(LAYOUT.CARD_HEIGHT / 2);
      const levelBadgeText = this.add
        .text(cardRight - this.layout.s(14), cardTop + this.layout.s(13), `Lv ${level}`, {
          fontSize: this.layout.font(12),
          fontFamily: 'JetBrains Mono',
          fontStyle: '500',
          color: COLORS.TEXT_ENABLED,
        })
        .setOrigin(1, 0);
      const levelBadgeBg = this.add
        .rectangle(
          cardRight - this.layout.s(8),
          cardTop + this.layout.s(9),
          levelBadgeText.width + this.layout.s(12),
          this.layout.s(20),
          COLORS.SELECTED_BORDER
        )
        .setOrigin(1, 0);

      // NEW tag: owned but not yet seen on this screen. Pink accent matches the
      // recruit callout from the old victory screen (DESIGN.md rarity colour).
      const isNew = Boolean(this.fullGameState?.playerFamiliars?.includes(id)) && !this.seenFamiliars.has(id);
      const newTagText = isNew
        ? this.add
            .text(-cardRight + this.layout.s(8), cardTop + this.layout.s(13), 'NEW', {
              fontSize: this.layout.font(9),
              fontFamily: 'DM Sans',
              fontStyle: '600',
              color: COLORS.NEW_TAG_TEXT,
            })
            .setOrigin(0, 0)
        : undefined;
      const newTagBg = newTagText
        ? this.add
            .rectangle(
              newTagText.x - this.layout.s(4),
              newTagText.y - this.layout.s(2),
              newTagText.width + this.layout.s(8),
              this.layout.s(16),
              COLORS.NEW_TAG,
              0.22
            )
            .setOrigin(0, 0)
            .setStrokeStyle(this.layout.s(1), COLORS.NEW_TAG, 0.9)
        : undefined;

      // Affinity chip: code-drawn pill + glyph dot in the affinity's palette colour.
      const affinityName = Affinity[familiar.affinity] ?? String(familiar.affinity);
      const affinityColor = AFFINITY_COLORS[affinityName] ?? 0xa5a3c4;
      const chipY = offsetY + this.layout.s(LAYOUT.AFFINITY_OFFSET_Y);
      const affinityLabel = this.add
        .text(0, chipY, affinityName, {
          fontSize: this.layout.font(11),
          fontFamily: 'DM Sans',
          fontStyle: '500',
          color: COLORS.TEXT_ENABLED,
        })
        .setOrigin(0, 0.5);
      const chipWidth = affinityLabel.width + this.layout.s(26);
      const chipBg = this.add
        .rectangle(0, chipY, chipWidth, this.layout.s(18), affinityColor, 0.22)
        .setStrokeStyle(this.layout.s(1), affinityColor, 0.9);
      const chipGlyph = this.add.circle(-chipWidth / 2 + this.layout.s(9), chipY, this.layout.s(3), affinityColor);
      affinityLabel.setPosition(chipGlyph.x + this.layout.s(7), chipY);

      // Lead / Backup order badge: only visible once the card is selected.
      const badgeTop = cardTop + this.layout.s(10);
      const orderBadgeBg = this.add
        .rectangle(0, badgeTop, this.layout.s(58), this.layout.s(20), COLORS.SELECTED_BORDER)
        .setOrigin(0.5, 0)
        .setVisible(selected);
      const orderBadge = this.add
        .text(0, badgeTop + this.layout.s(10), '', {
          fontSize: this.layout.font(10),
          fontFamily: 'DM Sans',
          fontStyle: '500',
          color: COLORS.TEXT_ENABLED,
        })
        .setOrigin(0.5, 0.5)
        .setVisible(selected);

      const statsStr =
        `HP: ${stats.hp}\n` +
        `ATK: ${stats.attack}\n` +
        `DEF: ${stats.defense}\n` +
        `SPD: ${stats.speed}\n` +
        `ARC: ${stats.arcane}`;

      const statsText = this.add
        .text(0, offsetY + this.layout.s(LAYOUT.STATS_OFFSET_Y), statsStr, {
          fontSize: this.layout.font(11),
          fontFamily: 'JetBrains Mono',
          fontStyle: '500',
          color: COLORS.SUBTITLE,
          align: 'left',
        })
        .setOrigin(0.5, 0);

      const abilityNames = abilitiesAtLevel(familiar, level)
        .map((aId) => {
          const ability = getAbility(aId);
          return ability?.name || aId;
        })
        .join(', ');

      const nextUnlock = learnSchedule(familiar).find((entry) => entry.level > level);
      const nextAbilityName = nextUnlock ? (getAbility(nextUnlock.abilityId)?.name ?? nextUnlock.abilityId) : undefined;
      const nextUnlockLabel =
        nextUnlock && nextAbilityName ? `Next: ${nextAbilityName} at Lv ${nextUnlock.level}` : undefined;

      const abilitiesLabel = this.add
        .text(0, offsetY + this.layout.s(LAYOUT.ABILITIES_LABEL_OFFSET_Y), 'Abilities:', {
          fontSize: this.layout.font(11),
          fontFamily: 'DM Sans',
          color: COLORS.LABEL,
        })
        .setOrigin(0.5, 0);

      const abilitiesText = this.add
        .text(0, offsetY + this.layout.s(LAYOUT.ABILITIES_TEXT_OFFSET_Y), abilityNames, {
          fontSize: this.layout.font(10),
          fontFamily: 'DM Sans',
          color: COLORS.SUBTITLE,
          wordWrap: { width: this.layout.s(LAYOUT.CARD_WIDTH - 20) },
          align: 'center',
        })
        .setOrigin(0.5, 0);

      const nextAbilityText = nextUnlockLabel
        ? this.add
            .text(0, offsetY + this.layout.s(LAYOUT.NEXT_ABILITY_OFFSET_Y), nextUnlockLabel, {
              fontSize: this.layout.font(9),
              fontFamily: 'DM Sans',
              color: COLORS.LABEL,
              wordWrap: { width: this.layout.s(LAYOUT.CARD_WIDTH - 20) },
              align: 'center',
            })
            .setOrigin(0.5, 0)
        : undefined;

      container.add([
        portrait,
        levelBadgeBg,
        levelBadgeText,
        nameText,
        chipBg,
        chipGlyph,
        affinityLabel,
        statsText,
        abilitiesLabel,
        abilitiesText,
        ...(nextAbilityText ? [nextAbilityText] : []),
        ring,
        orderBadgeBg,
        orderBadge,
        ...(newTagBg ? [newTagBg] : []),
        ...(newTagText ? [newTagText] : []),
      ]);

      const card: FamiliarCard = {
        familiarId: id,
        selected,
        border,
        bg,
        container,
        ring,
        orderBadge,
        orderBadgeBg,
      };
      this.cards.push(card);
      this.cardMap.set(id, card);
      this.updateSelectionVisual(card);

      border.setInteractive({ useHandCursor: true });
      border.on('pointerdown', () => {
        this.toggleCard(card);
      });
      border.on('pointerover', () => {
        if (!card.selected) {
          border.setFillStyle(COLORS.CARD_HOVER);
        }
      });
      border.on('pointerout', () => {
        if (!card.selected) {
          border.setFillStyle(COLORS.CARD_BG);
        }
      });
    });
  }

  private setupConfirmButton(): void {
    this.confirmBg.setInteractive({ useHandCursor: true });
    this.confirmBg.on('pointerdown', () => {
      if (this.selectedIds.length === MAX_PARTY_SIZE && !this.isSaving && !this._hasShownTerminalError) {
        audioManager.playSfx('ui_confirm');
        this.confirmParty();
      }
    });
  }

  private toggleCard(card: FamiliarCard): void {
    if (card.selected) {
      audioManager.playSfx('ui_cancel', { volume: 0.7 });
      this.selectedIds = this.selectedIds.filter((id) => id !== card.familiarId);
    } else {
      if (this.selectedIds.length >= MAX_PARTY_SIZE) {
        audioManager.playSfx('ui_error', { volume: 0.5 });
        return;
      }
      audioManager.playSfx('ui_confirm', { volume: 0.7 });
      this.selectedIds.push(card.familiarId);
    }

    // Re-derive every visible card: removing the lead promotes the backup, so
    // the Lead / Backup badges must shift with the selection order.
    for (const visible of this.cards) this.updateSelectionVisual(visible);
    this.updateConfirmButton();
  }

  /** Ring + order badge reflect this card's position in the selection order. */
  private updateSelectionVisual(card: FamiliarCard): void {
    const order = this.selectedIds.indexOf(card.familiarId);
    const selected = order !== -1;
    card.selected = selected;

    card.ring.setVisible(selected);
    card.orderBadgeBg.setVisible(selected);
    card.orderBadge.setVisible(selected);
    if (selected) {
      card.orderBadge.setText(order === 0 ? 'LEAD' : order === 1 ? 'BACKUP' : '');
    }
    card.border.setStrokeStyle(
      this.layout.s(selected ? 2 : LAYOUT.CARD_BORDER_WIDTH),
      selected ? COLORS.SELECTED_BORDER : COLORS.CARD_BORDER
    );
    card.border.setFillStyle(COLORS.CARD_BG);
  }

  private updateConfirmButton(): void {
    const ready = this.selectedIds.length === MAX_PARTY_SIZE;
    this.confirmBg.setFillStyle(ready ? COLORS.BUTTON_ENABLED : COLORS.BUTTON_DISABLED);
    this.confirmBg.setStrokeStyle(
      this.layout.s(LAYOUT.CARD_STROKE_WIDTH),
      ready ? COLORS.BUTTON_ENABLED : COLORS.BUTTON_DISABLED
    );
    this.confirmText.setColor(ready ? COLORS.TEXT_ENABLED : COLORS.TEXT_DISABLED);

    if (this.confirmBg.input) {
      this.confirmBg.input.enabled = ready;
    }
  }

  private async confirmParty(): Promise<void> {
    if (this.isSaving) return;
    this.isSaving = true;
    const gen = this._sceneGeneration;

    this.confirmText.setText('Saving...');
    if (this.confirmBg.input) {
      this.confirmBg.input.enabled = false;
    }

    try {
      const validation = validateParty(this.selectedIds, this.allFamiliarIds);
      if (!validation.valid) {
        throw new Error(validation.error);
      }

      await gameApiClient.setParty(this.selectedIds);
      if (this._sceneGeneration !== gen) return;

      this.markOwnedFamiliarsSeen();
      fadeToScene(this, SCENE_KEYS.EXPLORATION, { areaId: this.areaId });
    } catch (err) {
      if (this._sceneGeneration !== gen) return;

      this.saveRetryCount++;
      audioManager.playSfx('ui_error');
      const message = err instanceof Error ? err.message : 'Failed to save';

      if (this.saveRetryCount >= MAX_SAVE_ATTEMPTS) {
        this.isSaving = false;
        this.confirmText.setText(message);
        this.showSaveErrorWithGoBack();
        return;
      }

      this.confirmText.setText(`Failed to save (${this.saveRetryCount}/${MAX_SAVE_ATTEMPTS})`);
      this.retryTimer = this.time.delayedCall(RETRY_DELAY_MS, () => {
        this.retryTimer = null;
        this.isSaving = false;
        this.confirmParty();
      });
    }
  }

  /** Confirming the party counts as seeing every owned familiar. */
  private markOwnedFamiliarsSeen(): void {
    const owned = this.fullGameState?.playerFamiliars ?? [];
    let changed = false;
    for (const id of owned) {
      if (!this.seenFamiliars.has(id)) {
        this.seenFamiliars.add(id);
        changed = true;
      }
    }
    if (changed) saveSeenFamiliars(this.seenFamiliars);
  }

  private showSaveErrorWithGoBack(): void {
    this._hasShownTerminalError = true;
    this.add
      .text(this.layout.x(400), this.layout.y(300) + this.layout.s(60), 'Could not save party', {
        fontSize: this.layout.font(14),
        fontFamily: 'DM Sans',
        color: COLORS.ERROR,
      })
      .setOrigin(0.5);

    const goBackText = this.add
      .text(this.layout.x(400), this.layout.y(300) + this.layout.s(90), '< Go Back', {
        fontSize: this.layout.font(14),
        fontFamily: 'DM Sans',
        color: COLORS.SUBTITLE,
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    goBackText.on('pointerdown', () => {
      fadeToScene(this, SCENE_KEYS.WORLD_MAP);
    });
    goBackText.on('pointerover', () => goBackText.setColor(COLORS.TEXT_HOVER));
    goBackText.on('pointerout', () => goBackText.setColor(COLORS.SUBTITLE));
  }

  private emitStateUpdate(): void {
    const snapshot: GameStateSnapshot = {
      familiars: [],
      currency: this.fullGameState?.inventory?.currency ?? 0,
      battleCount: this.fullGameState?.battleCount ?? 0,
      wins: this.fullGameState?.winCount ?? 0,
      currentScene: 'party_select',
    };
    gameEventBus.emit(GameEvent.STATE_UPDATED, snapshot);
  }

  private handleSave = async (): Promise<void> => {
    // The server owns game state; nothing client-side to persist here.
    gameEventBus.emit(GameEvent.SAVE_COMPLETE, { success: true });
  };

  private handleExit = (): void => {
    this.cleanupTimers();
    fadeToScene(this, SCENE_KEYS.WORLD_MAP);
  };

  private onShutdown(): void {
    this.cleanupTimers();
    gameEventBus.off(GameEvent.SAVE_GAME, this.handleSave);
    gameEventBus.off(GameEvent.EXIT_GAME, this.handleExit);
  }

  private cleanupTimers(): void {
    if (this.retryTimer) {
      this.retryTimer.destroy();
      this.retryTimer = null;
    }
  }
}
