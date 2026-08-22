import Phaser from 'phaser';
import { BattleAction, BattleState, ActionResult, Outcome, BattleResult, ActionType, EffectType, GameState, BattleRewards, getAbility, getItem, getFamiliar, FAMILIARS, Affinity, type FamiliarData, type AbilityData, type ItemData, type BattleFamiliar, type InventoryItem } from '@arcane-familiars/game-logic';
import { gameApiClient } from '../api/client';
import { BattleUI } from '../ui/BattleUI';
import { SceneBackground } from '../ui/SceneBackground';
import { Layout } from '../ui/layout';
import { gameEventBus } from '../event-bus';
import { GameEvent } from '../events';
import { SCENE_KEYS } from '../constants/scenes';
import { toFamiliarStateFromData } from '../utils/familiarState';
import type { GameStateSnapshot, FamiliarState, PlayerActionPayload, BattleStartedPayload, BattleEndedPayload, BattlePhase, AbilityOption, ItemOption } from '../events';

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
  private isLeavingBattle = false;
  private pendingTreasureItemId: string | null = null;
  private roomsExplored = 0;
  private enemiesDefeated = 0;
  private sceneBackground?: SceneBackground;

  constructor() {
    super({ key: SCENE_KEYS.BATTLE });
  }

  init(data: BattleSceneData): void {
    this.enemyId = data.enemyId;
    this.returnScene = data.returnScene ?? SCENE_KEYS.WORLD_MAP;
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
    this.load.image('battle_bg_verdant', '/assets/battle_bg/battle_bg_verdund.png');
    this.load.image('battle_bg_crystal', '/assets/battle_bg/battle_bg_crystal.png');
    this.load.image('battle_bg_shadow', '/assets/battle_bg/battle_bg_shadow.png');
    this.load.image('battle_bg_meadow_guardian', '/assets/battle_bg/battle_bg_meadow_guardian.png');
    this.load.image('battle_bg_cave_warden', '/assets/battle_bg/battle_bg_cave_warden.png');
    this.load.image('battle_bg_shadow_lord', '/assets/battle_bg/battle_bg_shadow_lord.png');
    // Familiar idle sheets (whiteDog only) + ability cast VFX
    this.load.spritesheet('familiar_whiteDog_idle', '/assets/sprites/familiars/whiteDog/idle/whiteDog_idle.png', { frameWidth: 64, frameHeight: 64 });
    this.load.spritesheet('familiar_whiteDog_idle_left', '/assets/sprites/familiars/whiteDog/idle/whiteDog_idle_left.png', { frameWidth: 64, frameHeight: 64 });
    this.load.spritesheet('effect_cast_light', '/assets/sprites/effects/effect_cast_light.png', { frameWidth: 96, frameHeight: 96 });
  }

  private createAnimations(): void {
    const idleSheets: Array<[string, string]> = [
      ['familiar_whiteDog_idle', 'familiar_idle'],
      ['familiar_whiteDog_idle_left', 'familiar_idle_left'],
    ];
    for (const [textureKey, animKey] of idleSheets) {
      if (this.textures.exists(textureKey) && !this.anims.exists(animKey)) {
        this.anims.create({
          key: animKey,
          frames: this.anims.generateFrameNumbers(textureKey, { start: 0, end: 48 }),
          frameRate: 24,
          repeat: -1,
        });
      }
    }
    if (this.textures.exists('effect_cast_light') && !this.anims.exists('effect_cast_light')) {
      this.anims.create({
        key: 'effect_cast_light',
        frames: this.anims.generateFrameNumbers('effect_cast_light', { start: 0, end: 24 }),
        frameRate: 24,
        repeat: 0,
      });
    }
  }

  async create(): Promise<void> {
    this.layout = new Layout(this);

    // Shared design-space background (fallback backdrop + optional art + tint).
    this.sceneBackground = new SceneBackground(this, this.layout);

    // Boss battles are identified by the enemy familiar id passed in scene data
    // (battleState is not yet resolved at create() time).
    const areaBgMap: Record<string, string> = {
      verdantMeadow: 'battle_bg_verdant',
      crystalCaves: 'battle_bg_crystal',
      shadowForest: 'battle_bg_shadow',
    };
    const bossBgMap: Record<string, string> = {
      meadowGuardian: 'battle_bg_meadow_guardian',
      caveWarden: 'battle_bg_cave_warden',
      shadowLord: 'battle_bg_shadow_lord',
    };

    let bgKey: string | undefined;
    if (this.enemyId in bossBgMap) {
      bgKey = bossBgMap[this.enemyId];
    } else if (this.areaId && this.areaId in areaBgMap) {
      bgKey = areaBgMap[this.areaId];
    }

    if (bgKey) {
      this.sceneBackground.setImage(bgKey);
      this.sceneBackground.setOverlay(0x000000, 0.4);
    }

    this.createAnimations();

    this.battleUI = new BattleUI(this);
    this.battleUI.init();

    this.events.on('shutdown', this.onShutdown, this);

    // Wire EventBus for save/exit
    gameEventBus.on(GameEvent.SAVE_GAME, this.handleSave);
    gameEventBus.on(GameEvent.EXIT_GAME, this.handleExit);
    gameEventBus.on(GameEvent.PLAYER_ACTION, this.handlePlayerAction);
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
    this.timers.push(this.time.delayedCall(1800, () => {
      this.battleUI.destroy();
      this.scene.start(SCENE_KEYS.WORLD_MAP);
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

      // NEW: full battle-start contract for React HUD
      const enemy = result.battle.enemyFamiliar
      const partyIds = (this.gameState?.activeParty?.length ? this.gameState.activeParty : this.gameState?.playerFamiliars) ?? []
      const playerFamiliars: FamiliarState[] = partyIds
        .map((id) => getFamiliar(id))
        .filter((fd): fd is FamiliarData => Boolean(fd))
        .map((fd) => {
          const state = toFamiliarStateFromData(fd);
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

    try {
      const result = await gameApiClient.battleAction(this.battleState.id, action, this.battleState.turnCount);
      if (action.type === ActionType.Ability) {
        const abilityName = getAbility(action.abilityId ?? '')?.name ?? action.abilityId;
        this.battleUI.addLogMessage(`You use ${abilityName}!`);
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
      if (
        action.type === ActionType.Ability &&
        this.battleState.playerFamiliar.familiarData.id === 'whiteDog'
      ) {
        this.battleUI.playAbilityEffect('effect_cast_light');
      }

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
        }
        this.isProcessingAction = false;
        this.emitStateUpdate();
      }));
    } catch (err) {
      const recovered = await this.recoverFromStaleBattle(err as Error & { status?: number });
      if (recovered) return;
      const message = err instanceof Error ? err.message : 'Action failed';
      this.battleUI.addLogMessage(message);
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

    this.battleUI.addLogMessage('Attempting to flee...');

    try {
      const result = await gameApiClient.fleeBattle(this.battleState.id, this.battleState.turnCount);
      this.battleState = result.battle;

      this.timers.push(this.time.delayedCall(this.FLEE_DELAY_MS, () => {
        this.battleOutcome = { outcome: 'fled' };
        this.phase = 'outcome';
        gameEventBus.emit(GameEvent.BATTLE_ENDED, this.battleOutcome);
        this.isProcessingAction = false;
      }));
    } catch (err) {
      const recovered = await this.recoverFromStaleBattle(err as Error & { status?: number });
      if (recovered) return;
      const message = err instanceof Error ? err.message : 'Failed to flee';
      this.battleUI.addLogMessage(message);
      this.isProcessingAction = false;
      this.phase = 'menu';
      this.emitStateUpdate();
    }
  }

  private async handleSwap(targetFamiliarId?: string): Promise<void> {
    if (this.isProcessingAction || !this.battleState || !this.gameState) return;

    const rawParty = this.gameState.activeParty?.length
      ? this.gameState.activeParty
      : (this.gameState.playerFamiliars ?? []);
    if (!rawParty || rawParty.length < 2) {
      this.battleUI.addLogMessage('No other familiars to swap with.');
      return;
    }

    const nextIndex = targetFamiliarId
      ? rawParty.indexOf(targetFamiliarId)
      : (this.activeFamiliarIndex + 1) % rawParty.length;

    if (nextIndex === -1) {
      this.battleUI.addLogMessage('That familiar is not in your party.');
      return;
    }

    if (nextIndex === this.activeFamiliarIndex) {
      this.battleUI.addLogMessage('That familiar is already in battle.');
      return;
    }

    this.isProcessingAction = true;
    this.phase = 'acting';
    this.emitStateUpdate();

    const newFamiliarId = rawParty[nextIndex];

    try {
      const result = await gameApiClient.swapFamiliar(this.battleState.id, newFamiliarId, this.battleState.turnCount);
      this.battleState = result.battle;
      this.activeFamiliarIndex = nextIndex;

      this.battleUI.updatePlayerDisplay(result.battle.playerFamiliar);
      this.battleUI.addLogMessage(`Switched to ${result.battle.playerFamiliar.familiarData.name}!`);

      this.isProcessingAction = false;
      this.phase = 'menu';
      this.emitStateUpdate();
    } catch (err) {
      const recovered = await this.recoverFromStaleBattle(err as Error & { status?: number });
      if (recovered) return;
      const message = err instanceof Error ? err.message : 'Failed to swap familiar';
      this.battleUI.addLogMessage(message);
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
    this.battleUI.destroy();
    this.sceneBackground?.destroy();
    this.sceneBackground = undefined;
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
        this.handleSwap(payload.payload?.targetId).catch((err) => {
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

  private showActionResultVisual(result: ActionResult): void {
    const isDamage = result.effectType === EffectType.Damage
      || result.effectType === EffectType.Debuff
      || result.effectType === EffectType.Dot;
    const isHeal = result.effectType === EffectType.Heal || result.effectType === EffectType.Hot;
    if (!isDamage && !isHeal) return;
    if (!this.battleState) return;

    const enemyUid = this.battleState.enemyFamiliar.uid;
    if (!result.targetId || !enemyUid) return;
    const targetIsEnemy = result.targetId === enemyUid;
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
  }

  private handleDefeat(): void {
    this.battleUI.addLogMessage('You were defeated...');
    this.battleOutcome = { outcome: 'defeat' };
    this.phase = 'outcome';
    gameEventBus.emit(GameEvent.BATTLE_ENDED, this.battleOutcome);
  }

  private handleContinue = (): void => {
    if (this.isLeavingBattle) return;
    this.isLeavingBattle = true;
    this.phase = 'connecting';
    // Emit a final state update so the React HUD drops the stale battle snapshot
    // (phase 'connecting' renders no HUD) before the return scene takes over.
    this.emitStateUpdate();
    this.battleUI.destroy();
    // Clean up battle background
    this.sceneBackground?.destroy();
    this.sceneBackground = undefined;

    if (this.battleOutcome?.outcome === 'defeat') {
      this.scene.start(SCENE_KEYS.DUNGEON_FAIL, {
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
        const state = toFamiliarStateFromData(fd);
        const hp = this.gameState?.dungeon?.partyHp?.[fd.id];
        const mp = this.gameState?.dungeon?.partyMp?.[fd.id];
        if (typeof hp === 'number') state.hp = hp;
        if (typeof mp === 'number') state.mp = mp;
        return state;
      });
    if (party.length > 0) {
      // Reflect the active familiar at its actual party position so the HUD
      // highlights the right member after a swap.
      const activeIdx = Math.min(this.activeFamiliarIndex, party.length - 1);
      party[activeIdx] = this.toFamiliarState(player);
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
    this.battleUI.destroy();
    // Clean up battle background
    this.sceneBackground?.destroy();
    this.sceneBackground = undefined;
    this.scene.start(SCENE_KEYS.WORLD_MAP);
  };

  private onShutdown(): void {
    this.cleanupTimers();
    this.sceneBackground?.destroy();
    this.sceneBackground = undefined;
    gameEventBus.off(GameEvent.SAVE_GAME, this.handleSave);
    gameEventBus.off(GameEvent.EXIT_GAME, this.handleExit);
    gameEventBus.off(GameEvent.PLAYER_ACTION, this.handlePlayerAction);
    gameEventBus.off(GameEvent.BATTLE_CONTINUE, this.handleContinue);
  }

  private cleanupTimers(): void {
    for (const timer of this.timers) {
      timer.destroy();
    }
    this.timers = [];
  }
}
