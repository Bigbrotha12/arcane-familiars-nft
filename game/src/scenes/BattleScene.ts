import Phaser from 'phaser';
import { BattleAction, BattleState, ActionResult, Outcome, BattleResult, ActionType, EffectType, GameState, BattleRewards, getAbility, getItem, getFamiliar, FAMILIARS, Affinity, type FamiliarData, type AbilityData, type ItemData, type BattleFamiliar, type InventoryItem } from '@arcane-familiars/game-logic';
import { gameApiClient } from '../api/client';
import { BattleUI, BATTLE_CONTINUE_EVENT, BattleUICallbacks } from '../ui/BattleUI';
import { Layout } from '../ui/layout';
import { gameEventBus } from '../event-bus';
import { GameEvent } from '../events';
import type { GameStateSnapshot, FamiliarState, PlayerActionPayload, BattleStartedPayload, BattleEndedPayload, OverlayModePayload, BattlePhase, AbilityOption, ItemOption } from '../events';

interface BattleSceneData {
  enemyId: string;
  returnScene?: string;
  areaId?: string;
  activeIndex?: number;
  pendingTreasureItemId?: string | null;
  roomsExplored?: number;
  enemiesDefeated?: number;
}

export class BattleScene extends Phaser.Scene {
  private readonly ENEMY_ACTION_DELAY_MS = 400;
  private readonly OUTCOME_DELAY_MS = 800;
  private readonly FLEE_DELAY_MS = 600;
  private layout!: Layout;
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
  private isLeavingBattle = false;
  private pendingTreasureItemId: string | null = null;
  private roomsExplored = 0;
  private enemiesDefeated = 0;
  private battleBackground?: Phaser.GameObjects.Image;
  private battleBackgroundOverlay?: Phaser.GameObjects.Rectangle;

  constructor() {
    super({ key: 'BattleScene' });
  }

  init(data: BattleSceneData): void {
    this.enemyId = data.enemyId;
    this.returnScene = data.returnScene ?? 'WorldMapScene';
    this.areaId = data.areaId;
    this.isProcessingAction = false;
    this.battleState = null;
    this.activeFamiliarIndex = data.activeIndex ?? 0;
    this.isLeavingBattle = false;
    this.pendingTreasureItemId = data.pendingTreasureItemId ?? null;
    this.roomsExplored = data.roomsExplored ?? 0;
    this.enemiesDefeated = data.enemiesDefeated ?? 0;
  }

preload(): void {
    for (const id of Object.keys(FAMILIARS)) {
      this.load.image(`familiar_${id}`, `/assets/sprites/familiars/${id}/${id}_portrait.png`);
    }
    // Load battle background images
    this.load.image('battle_bg_verdund', '/assets/battle_bg/battle_bg_verdund.png');
    this.load.image('battle_bg_crystal', '/assets/battle_bg/battle_bg_crystal.png');
    this.load.image('battle_bg_shadow', '/assets/battle_bg/battle_bg_shadow.png');
    this.load.image('battle_bg_meadow_guardian', '/assets/battle_bg/battle_bg_meadow_guardian.png');
    this.load.image('battle_bg_cave_warden', '/assets/battle_bg/battle_bg_cave_warden.png');
    this.load.image('battle_bg_shadow_lord', '/assets/battle_bg/battle_bg_shadow_lord.png');
  }

  async create(): Promise<void> {
    this.layout = new Layout(this);
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

    // Add the battle background BEFORE battleUI.init() so the UI (added later at
    // the same depth) renders on top of it via insertion order. The camera clear
    // color (#0A0A0F) is the fallback backdrop when no area/boss bg matches.
    const areaBgMap: Record<string, string> = {
      verdantMeadow: 'battle_bg_verdund',
      crystalCaves: 'battle_bg_crystal',
      shadowForest: 'battle_bg_shadow',
    };
    const bossBgMap: Record<string, string> = {
      meadowGuardian: 'battle_bg_meadow_guardian',
      caveWarden: 'battle_bg_cave_warden',
      shadowLord: 'battle_bg_shadow_lord',
    };

    // Boss battles are identified by the enemy familiar id passed in scene data
    // (battleState is not yet resolved at create() time).
    let bgKey: string | undefined;
    if (this.enemyId in bossBgMap) {
      bgKey = bossBgMap[this.enemyId];
    } else if (this.areaId && this.areaId in areaBgMap) {
      bgKey = areaBgMap[this.areaId];
    }

    if (bgKey) {
      const bg = this.add.image(this.layout.x(400), this.layout.y(300), bgKey);
      bg.setDisplaySize(this.layout.s(800), this.layout.s(600));
      bg.setOrigin(0.5);
      const overlay = this.add.rectangle(this.layout.x(400), this.layout.y(300), this.layout.s(800), this.layout.s(600), 0x000000, 0.4);
      overlay.setOrigin(0.5);
      this.battleBackground = bg;
      this.battleBackgroundOverlay = overlay;
    }

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
      this.handleBattleSetupError(message);
    }
  }

  private handleBattleSetupError(message: string): void {
    this.battleUI.hideConnecting();
    this.battleUI.addLogMessage(message);
    this.battleUI.addLogMessage('Returning to the world map...');
    gameEventBus.emit(GameEvent.OVERLAY_MODE_CHANGED, { mode: 'battle', enabled: false });
    this.timers.push(this.time.delayedCall(1800, () => {
      this.battleUI.destroy();
      this.scene.start('WorldMapScene');
    }));
  }

  private async startBattle(): Promise<void> {
    try {
      const party = (this.gameState?.activeParty?.length ? this.gameState.activeParty : this.gameState?.playerFamiliars) ?? [];
      const playerFamiliarId = party[this.activeFamiliarIndex] ?? party[0];
      if (!playerFamiliarId) throw new Error('No active party member');
      const result = await gameApiClient.startBattle(playerFamiliarId);
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
        .map((fd) => {
          const state = this.toFamiliarStateFromData(fd);
          const hp = this.gameState?.dungeon?.partyHp?.[fd.id];
          const mp = this.gameState?.dungeon?.partyMp?.[fd.id];
          if (typeof hp === 'number') state.hp = hp;
          if (typeof mp === 'number') state.mp = mp;
          return state;
        })
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
      this.handleBattleSetupError(message);
    }
  }

  private async handleAction(action: BattleAction): Promise<void> {
    if (this.isProcessingAction || !this.battleState) return;
    this.isProcessingAction = true;
    this.phase = 'acting';
    this.emitStateUpdate();

    this.battleUI.hideActionPanels();

    try {
      const result = await gameApiClient.battleAction(this.battleState.id, action, this.battleState.turnCount);
      if (action.type === ActionType.Ability) {
        this.battleUI.addLogMessage(`You use ${action.abilityId}!`);
      } else {
        this.battleUI.addLogMessage(`You ${BattleScene.ACTION_TYPE_LABELS[action.type]}!`);
      }

      const { turnResult, state, turnCount } = result;
      const rewards = turnResult.rewards;
      if (state) this.gameState = state;
      this.battleState = {
        ...this.battleState!,
        playerFamiliar: turnResult.playerFamiliar,
        enemyFamiliar: turnResult.enemyFamiliar,
        turnCount: turnCount ?? this.battleState!.turnCount + 1,
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
        this.emitStateUpdate();
      }));
    } catch (err) {
      const recovered = await this.recoverFromStaleBattle(err as Error & { status?: number });
      if (recovered) return;
      const message = err instanceof Error ? err.message : 'Action failed';
      this.battleUI.addLogMessage(message);
      this.battleUI.showMainActions();
      this.phase = 'menu';
      this.isProcessingAction = false;
      this.emitStateUpdate();
    }
  }

  private async handleFlee(): Promise<void> {
    if (this.isProcessingAction || !this.battleState) return;
    this.isProcessingAction = true;
    this.phase = 'acting';
    this.emitStateUpdate();

    this.battleUI.hideActionPanels();
    this.battleUI.addLogMessage('Attempting to flee...');

    try {
      const result = await gameApiClient.fleeBattle(this.battleState.id, this.battleState.turnCount);
      this.battleState = result.battle;

      this.timers.push(this.time.delayedCall(this.FLEE_DELAY_MS, () => {
        this.battleOutcome = { outcome: 'fled' };
        this.phase = 'outcome';
        gameEventBus.emit(GameEvent.BATTLE_ENDED, this.battleOutcome);
        this.battleUI.showFled();
        this.isProcessingAction = false;
      }));
    } catch (err) {
      const recovered = await this.recoverFromStaleBattle(err as Error & { status?: number });
      if (recovered) return;
      const message = err instanceof Error ? err.message : 'Failed to flee';
      this.battleUI.addLogMessage(message);
      this.battleUI.showMainActions();
      this.isProcessingAction = false;
      this.phase = 'menu';
      this.emitStateUpdate();
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
    this.phase = 'acting';
    this.emitStateUpdate();
    this.battleUI.hideActionPanels();

    const nextIndex = (this.activeFamiliarIndex + 1) % party.length;
    const newFamiliarId = party[nextIndex];

    try {
      const result = await gameApiClient.swapFamiliar(this.battleState.id, newFamiliarId, this.battleState.turnCount);
      this.battleState = result.battle;
      this.activeFamiliarIndex = nextIndex;

      this.battleUI.updatePlayerDisplay(result.battle.playerFamiliar);
      this.battleUI.addLogMessage(`Switched to ${result.battle.playerFamiliar.familiarData.name}!`);

      this.battleUI.showMainActions();
      this.isProcessingAction = false;
      this.phase = 'menu';
      this.emitStateUpdate();
    } catch (err) {
      const recovered = await this.recoverFromStaleBattle(err as Error & { status?: number });
      if (recovered) return;
      const message = err instanceof Error ? err.message : 'Failed to swap familiar';
      this.battleUI.addLogMessage(message);
      this.battleUI.showMainActions();
      this.isProcessingAction = false;
      this.phase = 'menu';
      this.emitStateUpdate();
    }
  }

  private recoverFromStaleBattle = async (err: Error & { status?: number }): Promise<boolean> => {
    if (err.status !== 409 && err.status !== 404) return false;

    let state: GameState;
    try {
      ({ state } = await gameApiClient.loadGameState());
    } catch {
      return false;
    }
    this.gameState = state;

    const dungeon = state.dungeon;
    const room = dungeon?.rooms[dungeon.currentRoomId];
    const pending = room?.pendingEncounter;

    if (!dungeon) {
      // The battle already ended on the server (win or loss cleared the dungeon).
      this.battleUI.addLogMessage('The battle has ended on the server.');
      this.leaveBattle(true);
      return true;
    }
    if (!room || !pending || pending.resolved) {
      this.battleUI.addLogMessage('No active encounter remains in this room.');
      this.leaveBattle(false);
      return true;
    }
    this.battleUI.addLogMessage('Battle state changed; restarting the battle.');
    this.isProcessingAction = false;
    this.phase = 'connecting';
    await this.startBattle();
    return true;
  };

  private leaveBattle(toWorldMap: boolean): void {
    if (this.isLeavingBattle) return;
    this.isLeavingBattle = true;
    this.phase = 'connecting';
    gameEventBus.emit(GameEvent.OVERLAY_MODE_CHANGED, { mode: 'battle', enabled: false });
    this.battleUI.destroy();
    this.battleBackground?.destroy();
    this.battleBackgroundOverlay?.destroy();
    this.battleBackground = undefined;
    this.battleBackgroundOverlay = undefined;
    if (toWorldMap) {
      this.scene.start('WorldMapScene');
    } else {
      this.scene.start(this.returnScene, {
        areaId: this.areaId,
        pendingTreasureItemId: this.pendingTreasureItemId,
        activeIndex: this.activeFamiliarIndex,
        enemiesDefeated: this.enemiesDefeated,
        roomsExplored: this.roomsExplored,
      });
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
    if (this.isLeavingBattle) return;
    this.isLeavingBattle = true;
    this.phase = 'connecting';
    // Emit a final state update so the React HUD drops the stale battle snapshot
    // (phase 'connecting' renders no HUD) before the return scene takes over.
    this.emitStateUpdate();
    gameEventBus.emit(GameEvent.OVERLAY_MODE_CHANGED, { mode: 'battle', enabled: false });
    this.battleUI.destroy();
    // Clean up battle background
    this.battleBackground?.destroy();
    this.battleBackgroundOverlay?.destroy();
    this.battleBackground = undefined;
    this.battleBackgroundOverlay = undefined;

    if (this.battleOutcome?.outcome === 'defeat') {
      this.scene.start('DungeonFailScene', {
        roomsExplored: this.roomsExplored,
        enemiesDefeated: this.enemiesDefeated,
      });
      return;
    }

    // Boss victory clears the dungeon server-side; return to the world map
    // instead of re-entering exploration (which would start a fresh dungeon).
    if (this.battleOutcome?.outcome === 'victory' && this.battleState?.isBoss) {
      this.scene.start('WorldMapScene');
      return;
    }

    this.scene.start(this.returnScene, {
      areaId: this.areaId,
      lastBattleOutcome: this.battleOutcome?.outcome,
      pendingTreasureItemId: this.pendingTreasureItemId,
      activeIndex: this.activeFamiliarIndex,
      enemiesDefeated: this.enemiesDefeated,
      roomsExplored: this.roomsExplored,
    });
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
    // Rotate the party so the active familiar is first. activeFamiliarIndex tracks
    // the active slot and drifts on swap while activeParty order stays unchanged;
    // without this rotation the active familiar gets duplicated (shown twice).
    let orderedIds = partyIds;
    if (partyIds.length > 0) {
      const activeIndex = Math.min(Math.max(this.activeFamiliarIndex, 0), partyIds.length - 1);
      orderedIds = [...partyIds.slice(activeIndex), ...partyIds.slice(0, activeIndex)];
    }
    const party: FamiliarState[] = orderedIds
      .map((id) => getFamiliar(id))
      .filter((fd): fd is FamiliarData => Boolean(fd))
      .map((fd) => {
        const state = this.toFamiliarStateFromData(fd);
        const hp = this.gameState?.dungeon?.partyHp?.[fd.id];
        const mp = this.gameState?.dungeon?.partyMp?.[fd.id];
        if (typeof hp === 'number') state.hp = hp;
        if (typeof mp === 'number') state.mp = mp;
        return state;
      });
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
    // The server owns game state; every action is persisted atomically by the
    // backend, so there is nothing to write here. Emit success to keep the HUD
    // in sync.
    gameEventBus.emit(GameEvent.SAVE_COMPLETE, { success: true });
  };

  private handleExit = (): void => {
    if (this.isLeavingBattle) return;
    this.isLeavingBattle = true;
    gameEventBus.emit(GameEvent.OVERLAY_MODE_CHANGED, { mode: 'battle', enabled: false });
    this.battleUI.destroy();
    // Clean up battle background
    this.battleBackground?.destroy();
    this.battleBackgroundOverlay?.destroy();
    this.battleBackground = undefined;
    this.battleBackgroundOverlay = undefined;
    this.scene.start('WorldMapScene');
  };

  private onShutdown(): void {
    this.cleanupTimers();
    this.battleBackground?.destroy();
    this.battleBackgroundOverlay?.destroy();
    this.battleBackground = undefined;
    this.battleBackgroundOverlay = undefined;
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
