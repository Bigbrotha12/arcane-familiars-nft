import Phaser from 'phaser';
import type { GameState } from '@arcane-familiars/game-logic';
import { FAMILIARS, getAbility, Affinity, AREAS, validateParty } from '@arcane-familiars/game-logic';
import { gameApiClient } from '../api/client';
import { SCENE_KEYS } from '../constants/scenes';
import { gameEventBus } from '../event-bus';
import { GameEvent } from '../events';
import type { GameStateSnapshot } from '../events';
import { Layout } from '../ui/layout';
import { preloadFamiliarPortraits } from '../sprites/loader';
import { familiarTextureKey } from '../sprites/registry';

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
  AFFINITY_OFFSET_Y: 24,
  STATS_OFFSET_Y: 48,
  ABILITIES_LABEL_OFFSET_Y: 165,
  ABILITIES_TEXT_OFFSET_Y: 180,
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
} as const;

const MAX_SAVE_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1000;
const MAX_PARTY_SIZE = 2;
const DEFAULT_FALLBACK_FAMILIARS = ['whiteDog', 'yellowFighter'];

export class PartySelectScene extends Phaser.Scene {
  private layout!: Layout;
  private areaId!: string;
  private fullGameState: GameState | null = null;
  private cards: FamiliarCard[] = [];
  private cardMap: Map<string, FamiliarCard> = new Map();
  private selectedIds: string[] = [];
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

    this.layout = new Layout(this);

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
      this.scene.start(SCENE_KEYS.WORLD_MAP);
    });
    this.backText.on('pointerover', () => this.backText.setColor(COLORS.TEXT_HOVER));
    this.backText.on('pointerout', () => this.backText.setColor(COLORS.SUBTITLE));

    try {
      const result = await gameApiClient.loadGameState();
      if (this._sceneGeneration !== gen) return;

      const state = result.state;
      this.fullGameState = state;
      const savedFamiliars = state.playerFamiliars || [];
      const validSavedFamiliars = savedFamiliars.filter((id) => FAMILIARS[id]);

      // If signed in, merge on-chain owned familiars into the selectable pool
      let availableFamiliars = validSavedFamiliars;
      try {
        const ownedFamiliars = await gameApiClient.getOwnedFamiliars();
        if (ownedFamiliars.length > 0) {
          const ownedValid = ownedFamiliars.filter((id) => FAMILIARS[id]);
          const merged = new Set([...availableFamiliars, ...ownedValid]);
          availableFamiliars = [...merged];
        }
      } catch {
        // Non-fatal — proceed with state familiars only
      }

      const familiarIds = availableFamiliars.length >= MAX_PARTY_SIZE ? availableFamiliars : DEFAULT_FALLBACK_FAMILIARS;

      this.loadingText.setAlpha(0);
      this.createFamiliarCards(familiarIds);

      if (this._sceneGeneration !== gen) return;

      if (state.activeParty?.length) {
        state.activeParty.forEach((id) => {
          const card = this.cardMap.get(id);
          if (card) this.toggleCard(card);
        });
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
        this.scene.start(SCENE_KEYS.WORLD_MAP);
      });
      goBackText.on('pointerover', () => goBackText.setColor(COLORS.TEXT_HOVER));
      goBackText.on('pointerout', () => goBackText.setColor(COLORS.SUBTITLE));
      return;
    }

    const totalWidth = validFamiliars.length * LAYOUT.CARD_WIDTH + (validFamiliars.length - 1) * LAYOUT.CARD_GAP;
    const startX = this.layout.x((800 - totalWidth) / 2 + LAYOUT.CARD_WIDTH / 2);

    validFamiliars.forEach((id, index) => {
      const familiar = FAMILIARS[id];
      const x = startX + index * this.layout.s(LAYOUT.CARD_WIDTH + LAYOUT.CARD_GAP);

      const bg = this.add.rectangle(
        0,
        0,
        this.layout.s(LAYOUT.CARD_WIDTH),
        this.layout.s(LAYOUT.CARD_HEIGHT),
        COLORS.CARD_BG
      );
      const border = this.add.rectangle(0, 0, this.layout.s(LAYOUT.CARD_WIDTH), this.layout.s(LAYOUT.CARD_HEIGHT));
      border.setStrokeStyle(this.layout.s(LAYOUT.CARD_BORDER_WIDTH), COLORS.CARD_BORDER);
      border.setFillStyle(COLORS.CARD_BG);

      const container = this.add.container(x, this.layout.y(LAYOUT.CARD_Y), [border, bg]);

      const portrait = this.add.image(
        0,
        -this.layout.s(LAYOUT.CARD_HEIGHT / 2) + this.layout.s(70),
        familiarTextureKey(id)
      );
      portrait.setDisplaySize(this.layout.s(110), this.layout.s(110));
      portrait.setDepth(1);

      const offsetY = -this.layout.s(LAYOUT.CARD_HEIGHT / 2) + this.layout.s(LAYOUT.NAME_OFFSET_Y) + this.layout.s(120);

      const nameText = this.add
        .text(0, offsetY, familiar.name, {
          fontSize: this.layout.font(16),
          fontFamily: 'Fredoka',
          fontStyle: '600',
          color: COLORS.TITLE,
        })
        .setOrigin(0.5, 0);

      const affinityText = this.add
        .text(
          0,
          offsetY + this.layout.s(LAYOUT.AFFINITY_OFFSET_Y),
          Affinity[familiar.affinity] ?? String(familiar.affinity),
          {
            fontSize: this.layout.font(11),
            fontFamily: 'DM Sans',
            color: COLORS.SUBTITLE,
          }
        )
        .setOrigin(0.5, 0);

      const statsStr =
        `HP: ${familiar.stats.hp}\n` +
        `ATK: ${familiar.stats.attack}\n` +
        `DEF: ${familiar.stats.defense}\n` +
        `SPD: ${familiar.stats.speed}\n` +
        `ARC: ${familiar.stats.arcane}`;

      const statsText = this.add
        .text(0, offsetY + this.layout.s(LAYOUT.STATS_OFFSET_Y), statsStr, {
          fontSize: this.layout.font(11),
          fontFamily: 'JetBrains Mono',
          fontStyle: '500',
          color: COLORS.SUBTITLE,
          align: 'left',
        })
        .setOrigin(0.5, 0);

      const abilityNames = familiar.abilities
        .map((aId) => {
          const ability = getAbility(aId);
          return ability?.name || aId;
        })
        .join(', ');

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

      container.add([portrait, nameText, affinityText, statsText, abilitiesLabel, abilitiesText]);

      const card: FamiliarCard = { familiarId: id, selected: false, border, bg, container };
      this.cards.push(card);
      this.cardMap.set(id, card);

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

    this.setupConfirmButton();
  }

  private setupConfirmButton(): void {
    this.confirmBg.setInteractive({ useHandCursor: true });
    this.confirmBg.on('pointerdown', () => {
      if (this.selectedIds.length === MAX_PARTY_SIZE && !this.isSaving && !this._hasShownTerminalError) {
        this.confirmParty();
      }
    });
  }

  private toggleCard(card: FamiliarCard): void {
    if (card.selected) {
      card.selected = false;
      card.border.setStrokeStyle(this.layout.s(LAYOUT.CARD_BORDER_WIDTH), COLORS.CARD_BORDER);
      card.border.setFillStyle(COLORS.CARD_BG);
      this.selectedIds = this.selectedIds.filter((id) => id !== card.familiarId);
    } else {
      if (this.selectedIds.length >= MAX_PARTY_SIZE) return;
      card.selected = true;
      card.border.setStrokeStyle(this.layout.s(LAYOUT.CARD_BORDER_WIDTH), COLORS.SELECTED_BORDER);
      card.border.setFillStyle(COLORS.CARD_BG);
      this.selectedIds.push(card.familiarId);
    }

    this.updateConfirmButton();
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
      const allFamiliarIds = this.cards.map((c) => c.familiarId);
      const validation = validateParty(this.selectedIds, allFamiliarIds);
      if (!validation.valid) {
        throw new Error(validation.error);
      }

      await gameApiClient.setParty(this.selectedIds);
      if (this._sceneGeneration !== gen) return;

      this.scene.start(SCENE_KEYS.EXPLORATION, { areaId: this.areaId });
    } catch (err) {
      if (this._sceneGeneration !== gen) return;

      this.saveRetryCount++;
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
      this.scene.start(SCENE_KEYS.WORLD_MAP);
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
    this.scene.start(SCENE_KEYS.WORLD_MAP);
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
