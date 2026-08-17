import Phaser from 'phaser';
import type { GameState } from '@arcane-familiars/game-logic';
import { FAMILIARS, getAbility, Affinity, AREAS, validateParty } from '@arcane-familiars/game-logic';
import { gameApiClient } from '../api/client';
import { SCENE_KEYS } from '../constants/scenes';
import { gameEventBus } from '../event-bus';
import { GameEvent } from '../events';
import type { GameStateSnapshot } from '../events';

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
  CARD_Y: 250,
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
  CARD_BG: 0x1E1B4B,
  CARD_BORDER: 0x3B3870,
  CARD_HOVER: 0x2D2A5E,
  SELECTED_BORDER: 0x7C5CFC,
  BUTTON_DISABLED: 0x3B3870,
  BUTTON_ENABLED: 0x7C5CFC,
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
    for (const id of Object.keys(FAMILIARS)) {
      this.load.image(`familiar_${id}`, `/assets/sprites/familiars/${id}/${id}_portrait.png`);
    }
  }

  async create(): Promise<void> {
    if (!this.areaId) return;

    // Wire EventBus for save, exit, and scene change notification
    gameEventBus.on(GameEvent.SAVE_GAME, this.handleSave);
    gameEventBus.on(GameEvent.EXIT_GAME, this.handleExit);
    gameEventBus.emit(GameEvent.SCENE_CHANGED, { scene: 'party_select' });

    const gen = this._sceneGeneration;
    const { width, height } = this.scale;

    this.add.text(width / 2, LAYOUT.TITLE_Y, 'Select Your Party', {
      fontSize: '28px',
      fontFamily: 'Fredoka',
      fontStyle: '600',
      color: COLORS.TITLE,
    }).setOrigin(0.5);

    this.instructionText = this.add.text(width / 2, LAYOUT.INSTRUCTION_Y, 'Choose 2 Familiars', {
      fontSize: '14px',
      fontFamily: 'DM Sans',
      color: COLORS.SUBTITLE,
    }).setOrigin(0.5);

    this.loadingText = this.add.text(width / 2, height / 2, 'Loading...', {
      fontSize: '18px',
      fontFamily: 'DM Sans',
      color: COLORS.SUBTITLE,
    }).setOrigin(0.5);

    const confirmY = height - LAYOUT.CONFIRM_BUTTON_Y_OFFSET;

    this.confirmBg = this.add.rectangle(width / 2, confirmY, LAYOUT.CONFIRM_BUTTON_WIDTH, LAYOUT.CONFIRM_BUTTON_HEIGHT, COLORS.BUTTON_DISABLED);
    this.confirmBg.setStrokeStyle(LAYOUT.CARD_STROKE_WIDTH, COLORS.BUTTON_DISABLED);

    this.confirmText = this.add.text(width / 2, confirmY, 'Confirm Party', {
      fontSize: '14px',
      fontFamily: 'DM Sans',
      color: COLORS.TEXT_DISABLED,
    }).setOrigin(0.5);

    this.backText = this.add.text(LAYOUT.BACK_MARGIN, confirmY, '< Back', {
      fontSize: '14px',
      fontFamily: 'DM Sans',
      color: COLORS.SUBTITLE,
    }).setInteractive({ useHandCursor: true });

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
      const familiarIds = validSavedFamiliars.length >= MAX_PARTY_SIZE ? validSavedFamiliars : DEFAULT_FALLBACK_FAMILIARS;

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
    const { width, height } = this.scale;
    const validFamiliars = familiarIds.filter((id) => FAMILIARS[id]);

    if (validFamiliars.length < MAX_PARTY_SIZE) {
      this.loadingText.setText('Not enough familiars available');
      this.loadingText.setColor(COLORS.ERROR);
      this.loadingText.setAlpha(1);

      const goBackText = this.add.text(width / 2, height / 2 + 40, '< Go Back', {
        fontSize: '16px',
        fontFamily: 'DM Sans',
        color: COLORS.SUBTITLE,
      }).setOrigin(0.5).setInteractive({ useHandCursor: true });

      goBackText.on('pointerdown', () => {
        this.scene.start(SCENE_KEYS.WORLD_MAP);
      });
      goBackText.on('pointerover', () => goBackText.setColor(COLORS.TEXT_HOVER));
      goBackText.on('pointerout', () => goBackText.setColor(COLORS.SUBTITLE));
      return;
    }

    const totalWidth = validFamiliars.length * LAYOUT.CARD_WIDTH + (validFamiliars.length - 1) * LAYOUT.CARD_GAP;
    const startX = (width - totalWidth) / 2 + LAYOUT.CARD_WIDTH / 2;

    validFamiliars.forEach((id, index) => {
      const familiar = FAMILIARS[id];
      const x = startX + index * (LAYOUT.CARD_WIDTH + LAYOUT.CARD_GAP);

      const bg = this.add.rectangle(0, 0, LAYOUT.CARD_WIDTH, LAYOUT.CARD_HEIGHT, COLORS.CARD_BG);
      const border = this.add.rectangle(0, 0, LAYOUT.CARD_WIDTH, LAYOUT.CARD_HEIGHT);
      border.setStrokeStyle(LAYOUT.CARD_BORDER_WIDTH, COLORS.CARD_BORDER);
      border.setFillStyle(COLORS.CARD_BG);

      const container = this.add.container(x, LAYOUT.CARD_Y, [border, bg]);

      const portrait = this.add.image(0, -LAYOUT.CARD_HEIGHT / 2 + 70, `familiar_${id}`);
      portrait.setDisplaySize(110, 110);
      portrait.setDepth(1);

      const offsetY = -LAYOUT.CARD_HEIGHT / 2 + LAYOUT.NAME_OFFSET_Y + 120;

      const nameText = this.add.text(0, offsetY, familiar.name, {
        fontSize: '16px',
        fontFamily: 'Fredoka',
        fontStyle: '600',
        color: COLORS.TITLE,
      }).setOrigin(0.5, 0);

      const affinityText = this.add.text(0, offsetY + LAYOUT.AFFINITY_OFFSET_Y, Affinity[familiar.affinity] ?? String(familiar.affinity), {
        fontSize: '11px',
        fontFamily: 'DM Sans',
        color: COLORS.SUBTITLE,
      }).setOrigin(0.5, 0);

      const statsStr =
        `HP: ${familiar.stats.hp}\n` +
        `ATK: ${familiar.stats.attack}\n` +
        `DEF: ${familiar.stats.defense}\n` +
        `SPD: ${familiar.stats.speed}\n` +
        `ARC: ${familiar.stats.arcane}`;

      const statsText = this.add.text(0, offsetY + LAYOUT.STATS_OFFSET_Y, statsStr, {
        fontSize: '11px',
        fontFamily: 'JetBrains Mono',
        fontStyle: '500',
        color: COLORS.SUBTITLE,
        align: 'left',
      }).setOrigin(0.5, 0);

      const abilityNames = familiar.abilities
        .map((aId) => {
          const ability = getAbility(aId);
          return ability?.name || aId;
        })
        .join(', ');

      const abilitiesLabel = this.add.text(0, offsetY + LAYOUT.ABILITIES_LABEL_OFFSET_Y, 'Abilities:', {
        fontSize: '11px',
        fontFamily: 'DM Sans',
        color: COLORS.LABEL,
      }).setOrigin(0.5, 0);

      const abilitiesText = this.add.text(0, offsetY + LAYOUT.ABILITIES_TEXT_OFFSET_Y, abilityNames, {
        fontSize: '10px',
        fontFamily: 'DM Sans',
        color: COLORS.SUBTITLE,
        wordWrap: { width: LAYOUT.CARD_WIDTH - 20 },
        align: 'center',
      }).setOrigin(0.5, 0);

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
      card.border.setStrokeStyle(LAYOUT.CARD_BORDER_WIDTH, COLORS.CARD_BORDER);
      card.border.setFillStyle(COLORS.CARD_BG);
      this.selectedIds = this.selectedIds.filter((id) => id !== card.familiarId);
    } else {
      if (this.selectedIds.length >= MAX_PARTY_SIZE) return;
      card.selected = true;
      card.border.setStrokeStyle(LAYOUT.CARD_BORDER_WIDTH, COLORS.SELECTED_BORDER);
      card.border.setFillStyle(COLORS.CARD_BG);
      this.selectedIds.push(card.familiarId);
    }

    this.updateConfirmButton();
  }

  private updateConfirmButton(): void {
    const ready = this.selectedIds.length === MAX_PARTY_SIZE;
    this.confirmBg.setFillStyle(ready ? COLORS.BUTTON_ENABLED : COLORS.BUTTON_DISABLED);
    this.confirmBg.setStrokeStyle(LAYOUT.CARD_STROKE_WIDTH, ready ? COLORS.BUTTON_ENABLED : COLORS.BUTTON_DISABLED);
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
    const { width, height } = this.scale;
    const errorText = this.add.text(width / 2, height / 2 + 60, 'Could not save party', {
      fontSize: '14px',
      fontFamily: 'DM Sans',
      color: COLORS.ERROR,
    }).setOrigin(0.5);

    const goBackText = this.add.text(width / 2, height / 2 + 90, '< Go Back', {
      fontSize: '14px',
      fontFamily: 'DM Sans',
      color: COLORS.SUBTITLE,
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

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
    }
    gameEventBus.emit(GameEvent.STATE_UPDATED, snapshot)
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
