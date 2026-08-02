import Phaser from 'phaser';
import { BattleAction, BattleState, ActionResult, Outcome, BattleResult, ActionType, EffectType, GameState, BattleRewards, getAbility, getItem, getFamiliar, Affinity, type FamiliarData, type AbilityData, type ItemData, type BattleFamiliar, type InventoryItem } from '@arcane-familiars/game-logic';
import { gameApiClient } from '../api/client';
import { BattleUI, BATTLE_CONTINUE_EVENT, BattleUICallbacks } from '../ui/BattleUI';
import { gameEventBus } from '../event-bus';
import { GameEvent } from '../events';
import type { GameStateSnapshot, FamiliarState, PlayerActionPayload, BattleStartedPayload, BattleEndedPayload, OverlayModePayload, BattlePhase, AbilityOption, ItemOption } from '../events';

interface BattleSceneData {
  enemyId: string;
  returnScene?: string;
  areaId?: string;
}

export class BattleScene extends Phaser.Scene {
  private readonly ENEMY_ACTION_DELAY_MS = 400;
  private readonly OUTCOME_DELAY_MS = 800;
  private readonly FLEE_DELAY_MS = 600;
  private static readonly ACTION_TYPE_LABELS: Record<ActionType, string> = {
    [ActionType.Attack]: 'attack',
    [ActionType.Ability]: 'use an ability',
    [ActionType.Defend]: 'defend',
    [ActionType.Item]: 'use an item',
    [ActionType.Run]: 'try to run',
  };
  private static readonly OUTCOME_TO_STATUS: Record<Outcome, BattleResult> = {
    [Outcome.Win]: BattleResult.Won,
    [Outcome.Loss]: BattleResult.Lost,
    [Outcome.Continue]: BattleResult.Active,
  };
  private gameState: GameState | null = null;
  private timers: Phaser.Time.TimerEvent[] = [];
  private battleUI!: BattleUI;
  private battleState: BattleState | null = null;
  private isProcessingAction = false;
  private enemyId!: string;
  private returnScene!: string;
  private areaId?: string;
  private activeFamiliarIndex = 0;
  private battleLog: string[] = [];
  private phase: BattlePhase = 'connecting';
  private battleOutcome: BattleEndedPayload | null = null;
  private overlayActive = false;

  constructor() {
    super({ key: 'BattleScene' });
  }

  init(data: BattleSceneData): void {
    this.enemyId = data.enemyId;
    this.returnScene = data.returnScene ?? 'WorldMapScene';
    this.areaId = data.areaId;
    this.isProcessingAction = false;
    this.battleState = null;
    this.activeFamiliarIndex = 0;
  }

  async create(): Promise<void> {
    const callbacks: BattleUICallbacks = {
      onAction: (action) => this.handleAction(action).catch((err) => {
        console.error('Action handler error:', err);
      }),
      onFlee: () => this.handleFlee().catch((err) => {
        console.error('Flee handler error:', err);
      }),
      onShowAbility: () => {
        if (this.battleState) {
          this.battleUI.showAbilityPanel(this.battleState.playerFamiliar);
        }
      },
      onShowItem: () => {
        if (this.battleState && this.gameState) {
          this.battleUI.showItemPanel(this.gameState.inventory.items);
        }
      },
      onSwap: () => this.handleSwap().catch((err) => {
        console.error('Swap handler error:', err);
      }),
    };

    this.battleUI = new BattleUI(this, callbacks);
    this.battleUI.init();

    this.events.on(BATTLE_CONTINUE_EVENT, () => this.handleContinue());
    this.events.on('shutdown', this.onShutdown, this);

    // Wire EventBus for save/exit
    gameEventBus.on(GameEvent.SAVE_GAME, this.handleSave);
    gameEventBus.on(GameEvent.EXIT_GAME, this.handleExit);
    gameEventBus.on(GameEvent.PLAYER_ACTION, this.handlePlayerAction);
    gameEventBus.on(GameEvent.OVERLAY_MODE_CHANGED, this.handleOverlayModeChanged);
    gameEventBus.on(GameEvent.BATTLE_CONTINUE, this.handleContinue);

    gameEventBus.emit(GameEvent.SCENE_CHANGED, { scene: 'battle' });
    this.emitStateUpdate();

    try {
      const { state } = await gameApiClient.loadGameState();
      this.gameState = state;
      await this.startBattle();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load game';
      this.battleUI.hideConnecting();
      this.battleUI.addLogMessage(message);
    }
  }

  private async startBattle(): Promise<void> {
    try {
      const playerFamiliarId = this.gameState!.activeParty[0];
      if (!playerFamiliarId) throw new Error('No active party member');
      const result = await gameApiClient.startBattle(playerFamiliarId, this.enemyId);
      this.battleState = result.battle;

      this.battleUI.hideConnecting();
      this.battleUI.updatePlayerDisplay(result.battle.playerFamiliar);
      this.battleUI.updateEnemyDisplay(result.battle.enemyFamiliar);
      this.battleUI.addLogMessage(`Battle begins against ${result.battle.enemyFamiliar.familiarData.name}!`);
      this.battleUI.addLogMessage('Choose your action.');
      this.battleUI.enableMainActions();

      // NEW: full battle-start contract for React HUD
      const enemy = result.battle.enemyFamiliar
      const partyIds = (this.gameState?.activeParty?.length ? this.gameState.activeParty : this.gameState?.playerFamiliars) ?? []
      const playerFamiliars: FamiliarState[] = partyIds
        .map((id) => getFamiliar(id))
        .filter((fd): fd is FamiliarData => Boolean(fd))
        .map((fd) => this.toFamiliarStateFromData(fd))
      if (playerFamiliars.length > 0) {
        playerFamiliars[0] = this.toFamiliarState(result.battle.playerFamiliar)
      }
      gameEventBus.emit(GameEvent.BATTLE_STARTED, {
        enemyId: enemy.familiarData.id,
        enemyName: enemy.familiarData.name,
        enemyHp: enemy.currentHp,
        enemyMaxHp: enemy.familiarData.stats.maxHp || enemy.currentHp,
        isBoss: result.battle.isBoss,
        playerFamiliars,
      } satisfies BattleStartedPayload)
      this.phase = 'menu'
      this.emitStateUpdate()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start battle';
      this.battleUI.hideConnecting();
      this.battleUI.addLogMessage(message);
      this.battleUI.showMainActions();
      this.isProcessingAction = false;
    }
  }

  private async handleAction(action: BattleAction): Promise<void> {
    if (this.isProcessingAction || !this.battleState) return;
    this.isProcessingAction = true;
    this.phase = 'acting';

    this.battleUI.hideActionPanels();

    try {
      const result = await gameApiClient.battleAction(this.battleState.id, action);

      if (action.type === ActionType.Ability) {
        this.battleUI.addLogMessage(`You use ${action.abilityId}!`);
      } else {
        this.battleUI.addLogMessage(`You ${BattleScene.ACTION_TYPE_LABELS[action.type]}!`);
      }

      const { turnResult } = result;
      const rewards = turnResult.rewards;
      this.battleState = {
        ...this.battleState!,
        playerFamiliar: turnResult.playerFamiliar,
        enemyFamiliar: turnResult.enemyFamiliar,
        turnCount: this.battleState!.turnCount + 1,
        status: BattleScene.OUTCOME_TO_STATUS[turnResult.battleOutcome],
      };
      this.battleUI.updatePlayerDisplay(turnResult.playerFamiliar);
      this.battleUI.updateEnemyDisplay(turnResult.enemyFamiliar);

      this.battleUI.addLogMessage(turnResult.playerAction.description);
      this.showActionResultVisual(turnResult.playerAction);

      this.timers.push(this.time.delayedCall(this.ENEMY_ACTION_DELAY_MS, () => {
        this.battleUI.addLogMessage(turnResult.enemyAction.description);
        this.showActionResultVisual(turnResult.enemyAction);
      }));

      const outcome = turnResult.battleOutcome;
      this.emitStateUpdate();

      this.timers.push(this.time.delayedCall(this.OUTCOME_DELAY_MS, () => {
        if (outcome === Outcome.Win) {
          this.handleVictory(rewards);
        } else if (outcome === Outcome.Loss) {
          this.handleDefeat();
        } else {
          this.phase = 'menu';
          this.battleUI.showMainActions();
        }
        this.isProcessingAction = false;
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Action failed';
      this.battleUI.addLogMessage(message);
      this.battleUI.showMainActions();
      this.phase = 'menu';
      this.isProcessingAction = false;
    }
  }

  private async handleFlee(): Promise<void> {
    if (this.isProcessingAction || !this.battleState) return;
    this.isProcessingAction = true;

    this.battleUI.hideActionPanels();
    this.battleUI.addLogMessage('Attempting to flee...');

    try {
      const result = await gameApiClient.fleeBattle(this.battleState.id);
      this.battleState = result.battle;

      this.timers.push(this.time.delayedCall(this.FLEE_DELAY_MS, () => {
        this.battleOutcome = { outcome: 'fled' };
        this.phase = 'outcome';
        gameEventBus.emit(GameEvent.BATTLE_ENDED, this.battleOutcome);
        this.battleUI.showFled();
        this.isProcessingAction = false;
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to flee';
      this.battleUI.addLogMessage(message);
      this.battleUI.showMainActions();
      this.isProcessingAction = false;
    }
  }

  private async handleSwap(): Promise<void> {
    if (this.isProcessingAction || !this.battleState || !this.gameState) return;
    
    const party = this.gameState.activeParty || this.gameState.playerFamiliars;
    if (!party || party.length < 2) {
      this.battleUI.addLogMessage('No other familiars to swap with.');
      return;
    }

    this.isProcessingAction = true;
    this.battleUI.hideActionPanels();

    const nextIndex = (this.activeFamiliarIndex + 1) % party.length;
    const newFamiliarId = party[nextIndex];

    try {
      const result = await gameApiClient.swapFamiliar(this.battleState.id, newFamiliarId);
      this.battleState = result.battle;
      this.activeFamiliarIndex = nextIndex;

      this.battleUI.updatePlayerDisplay(result.battle.playerFamiliar);
      this.battleUI.addLogMessage(`Switched to ${result.battle.playerFamiliar.familiarData.name}!`);

      this.battleUI.showMainActions();
      this.isProcessingAction = false;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to swap familiar';
      this.battleUI.addLogMessage(message);
      this.battleUI.showMainActions();
      this.isProcessingAction = false;
    }
  }

  private handlePlayerAction = (payload: PlayerActionPayload): void => {
    if (this.isProcessingAction) return;
    switch (payload.action) {
      case 'attack':
        this.handleAction({ type: ActionType.Attack }).catch((err) => {
          console.error('Action handler error:', err);
        });
        break;
      case 'defend':
        this.handleAction({ type: ActionType.Defend }).catch((err) => {
          console.error('Action handler error:', err);
        });
        break;
      case 'ability':
        if (payload.payload?.abilityId) {
          this.handleAction({ type: ActionType.Ability, abilityId: payload.payload.abilityId }).catch((err) => {
            console.error('Action handler error:', err);
          });
        }
        break;
      case 'item':
        if (payload.payload?.itemId) {
          this.handleAction({ type: ActionType.Item, itemId: payload.payload.itemId }).catch((err) => {
            console.error('Action handler error:', err);
          });
        }
        break;
      case 'swap':
        this.handleSwap().catch((err) => {
          console.error('Swap handler error:', err);
        });
        break;
      case 'run':
        this.handleFlee().catch((err) => {
          console.error('Flee handler error:', err);
        });
        break;
    }
  };

  private handleOverlayModeChanged = (payload: OverlayModePayload): void => {
    if (payload.mode !== 'battle') return;
    this.overlayActive = payload.enabled;
    this.battleUI.setOverlayActive(payload.enabled);
  };

  private showActionResultVisual(result: ActionResult): void {
    const isDamage = result.effectType === EffectType.Damage
      || result.effectType === EffectType.Debuff
      || result.effectType === EffectType.Dot;
    const isHeal = result.effectType === EffectType.Heal || result.effectType === EffectType.Hot;
    if (!isDamage && !isHeal) return;
    if (!this.battleState) return;

    const enemyId = this.battleState.enemyFamiliar.familiarData.id;
    if (!result.targetId || !enemyId) return;
    const targetIsEnemy = result.targetId === enemyId;
    const pos = targetIsEnemy
      ? this.battleUI.getEnemyDamagePosition()
      : this.battleUI.getPlayerDamagePosition();
    const { x, y } = pos;

    if (isDamage) {
      this.battleUI.showDamageNumber(x, y, Math.abs(result.value), '#EF4444');
      if (result.isCritical) {
        this.battleUI.addLogMessage('Critical hit!');
      }
    } else {
      this.battleUI.showHealNumber(x, y, result.value);
    }
  }

  private handleVictory(rewards?: BattleRewards): void {
    this.battleUI.addLogMessage('Battle won!');
    this.battleOutcome = {
      outcome: 'victory',
      rewards: rewards ? { currency: rewards.currency, items: rewards.items } : undefined,
    };
    this.phase = 'outcome';
    gameEventBus.emit(GameEvent.BATTLE_ENDED, this.battleOutcome);
    this.battleUI.showVictory(rewards);
  }

  private handleDefeat(): void {
    this.battleUI.addLogMessage('You were defeated...');
    this.battleOutcome = { outcome: 'defeat' };
    this.phase = 'outcome';
    gameEventBus.emit(GameEvent.BATTLE_ENDED, this.battleOutcome);
    this.battleUI.showDefeat();
  }

  private handleContinue = (): void => {
    this.phase = 'connecting';
    gameEventBus.emit(GameEvent.OVERLAY_MODE_CHANGED, { mode: 'battle', enabled: false });
    this.battleUI.destroy();
    this.scene.start(this.returnScene, { areaId: this.areaId });
  }

  private toFamiliarState(f: BattleFamiliar): FamiliarState {
    return {
      id: f.familiarData.id,
      name: f.familiarData.name,
      hp: f.currentHp,
      maxHp: f.familiarData.stats.maxHp || f.currentHp,
      mp: f.currentMp,
      maxMp: f.familiarData.stats.maxMp || f.currentMp,
      attack: f.familiarData.stats.attack,
      defense: f.familiarData.stats.defense,
      speed: f.familiarData.stats.speed,
      arcane: f.familiarData.stats.arcane,
      affinity: Affinity[f.familiarData.affinity] ?? String(f.familiarData.affinity),
    };
  }

  private toFamiliarStateFromData(fd: FamiliarData): FamiliarState {
    return {
      id: fd.id,
      name: fd.name,
      hp: fd.stats.hp,
      maxHp: fd.stats.maxHp,
      mp: fd.stats.mp,
      maxMp: fd.stats.maxMp,
      attack: fd.stats.attack,
      defense: fd.stats.defense,
      speed: fd.stats.speed,
      arcane: fd.stats.arcane,
      affinity: Affinity[fd.affinity] ?? String(fd.affinity),
    };
  }

  private emitStateUpdate(): void {
    if (!this.battleState) return;
    const player = this.battleState.playerFamiliar;
    const partyIds = (this.gameState?.activeParty?.length ? this.gameState.activeParty : this.gameState?.playerFamiliars) ?? [];
    const party: FamiliarState[] = partyIds
      .map((id) => getFamiliar(id))
      .filter((fd): fd is FamiliarData => Boolean(fd))
      .map((fd) => this.toFamiliarStateFromData(fd));
    if (party.length > 0) {
      party[0] = this.toFamiliarState(player);
    }
    const abilities: AbilityOption[] = player.familiarData.abilities
      .map((id) => getAbility(id))
      .filter((a): a is AbilityData => Boolean(a))
      .map((ability) => ({
        id: ability.id,
        name: ability.name,
        description: ability.description,
        mpCost: ability.mpCost,
        usable: player.currentMp >= ability.mpCost,
      }));
    const items: ItemOption[] = (this.gameState?.inventory?.items ?? [])
      .map((item) => ({ item, itemData: getItem(item.itemId) }))
      .filter((entry): entry is { item: InventoryItem; itemData: ItemData } => Boolean(entry.itemData))
      .map(({ item, itemData }) => ({
        id: item.itemId,
        name: itemData.name,
        description: itemData.description,
        quantity: item.quantity,
        usable: item.quantity > 0,
      }));
    const snapshot: GameStateSnapshot = {
      familiars: [this.toFamiliarState(player)],
      currency: this.gameState?.inventory?.currency ?? 0,
      battleCount: this.gameState?.battleCount ?? 0,
      wins: this.gameState?.winCount ?? 0,
      currentScene: 'battle',
      enemy: this.toFamiliarState(this.battleState.enemyFamiliar),
      phase: this.phase,
      battleLog: [...this.battleUI.getLog()],
      abilities,
      items,
      canSwap: partyIds.length >= 2,
      party,
      isBoss: this.battleState.isBoss,
    };
    gameEventBus.emit(GameEvent.STATE_UPDATED, snapshot);
  }

  private handleSave = async (): Promise<void> => {
    try {
      if (this.gameState) {
        await gameApiClient.saveGameState(this.gameState);
      }
      gameEventBus.emit(GameEvent.SAVE_COMPLETE, { success: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Save failed';
      gameEventBus.emit(GameEvent.SAVE_COMPLETE, { success: false, error: message });
    }
  };

  private handleExit = (): void => {
    gameEventBus.emit(GameEvent.OVERLAY_MODE_CHANGED, { mode: 'battle', enabled: false });
    this.battleUI.destroy();
    this.scene.start('WorldMapScene');
  };

  private onShutdown(): void {
    this.cleanupTimers();
    gameEventBus.off(GameEvent.SAVE_GAME, this.handleSave);
    gameEventBus.off(GameEvent.EXIT_GAME, this.handleExit);
    gameEventBus.off(GameEvent.PLAYER_ACTION, this.handlePlayerAction);
    gameEventBus.off(GameEvent.OVERLAY_MODE_CHANGED, this.handleOverlayModeChanged);
    gameEventBus.off(GameEvent.BATTLE_CONTINUE, this.handleContinue);
  }

  private cleanupTimers(): void {
    for (const timer of this.timers) {
      timer.destroy();
    }
    this.timers = [];
  }
}
