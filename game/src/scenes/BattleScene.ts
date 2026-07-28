import Phaser from 'phaser';
import { BattleAction, BattleState, ActionResult } from '@arcane-familiars/game-logic';
import { GameApiClient } from '../api/client';
import { BattleUI, BattleUICallbacks } from '../ui/BattleUI';

interface BattleSceneData {
  enemyId: string;
  isBoss: boolean;
  areaId?: string;
}

export class BattleScene extends Phaser.Scene {
  private gameApi!: GameApiClient;
  private battleUI!: BattleUI;
  private battleState: BattleState | null = null;
  private isProcessingAction = false;
  private enemyId!: string;
  private isBoss!: boolean;

  constructor() {
    super({ key: 'BattleScene' });
  }

  init(data: BattleSceneData): void {
    this.enemyId = data.enemyId;
    this.isBoss = data.isBoss;
    this.isProcessingAction = false;
    this.battleState = null;
  }

  async create(): Promise<void> {
    this.gameApi = new GameApiClient();

    const callbacks: BattleUICallbacks = {
      onAction: (action) => this.handleAction(action),
      onFlee: () => this.handleFlee(),
      onShowAbility: () => {
        if (this.battleState) {
          this.battleUI.showAbilityPanel(this.battleState.playerFamiliar);
        }
      },
      onShowItem: () => {
        if (this.battleState) {
          this.battleUI.showItemPanel([]);
        }
      },
    };

    this.battleUI = new BattleUI(this, callbacks);
    this.battleUI.init();

    this.events.on('continue-after-battle', () => this.handleContinue());

    await this.startBattle();
  }

  private async startBattle(): Promise<void> {
    try {
      const result = await this.gameApi.startBattle(this.enemyId, this.isBoss);
      this.battleState = result.battle;

      this.battleUI.hideConnecting();
      this.battleUI.updatePlayerDisplay(result.battle.playerFamiliar);
      this.battleUI.updateEnemyDisplay(result.battle.enemyFamiliar);
      this.battleUI.addLogMessage(`Battle begins against ${result.battle.enemyFamiliar.familiarData.name}!`);
      this.battleUI.addLogMessage('Choose your action.');
      this.battleUI.enableMainActions();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start battle';
      this.battleUI.addLogMessage(`Error: ${message}`);
    }
  }

  private async handleAction(action: BattleAction): Promise<void> {
    if (this.isProcessingAction || !this.battleState) return;
    this.isProcessingAction = true;

    this.battleUI.hideActionPanels();

    try {
      const result = await this.gameApi.battleAction(this.battleState.id, action);

      if (action.type === 'ability') {
        this.battleUI.addLogMessage(`You use ${action.abilityId}!`);
      } else {
        this.battleUI.addLogMessage(`You ${action.type}!`);
      }

      this.battleState = result.battle;
      this.battleUI.updatePlayerDisplay(result.battle.playerFamiliar);
      this.battleUI.updateEnemyDisplay(result.battle.enemyFamiliar);

      this.battleUI.addLogMessage(result.playerResult.description);
      this.showActionResultVisual(result.playerResult);

      this.time.delayedCall(400, () => {
        this.battleUI.addLogMessage(result.enemyResult.description);
        this.showActionResultVisual(result.enemyResult);
      });

      const status = result.battle.status;
      this.time.delayedCall(800, () => {
        if (status === 'won') {
          this.handleVictory(result.battle);
        } else if (status === 'lost') {
          this.handleDefeat();
        } else if (status === 'fled') {
          this.battleUI.showFled();
        } else {
          this.battleUI.showMainActions();
        }
        this.isProcessingAction = false;
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Action failed';
      this.battleUI.addLogMessage(`Error: ${message}`);
      this.battleUI.showMainActions();
      this.isProcessingAction = false;
    }
  }

  private async handleFlee(): Promise<void> {
    if (this.isProcessingAction || !this.battleState) return;
    this.isProcessingAction = true;

    this.battleUI.hideActionPanels();
    this.battleUI.addLogMessage('Attempting to flee...');

    try {
      const result = await this.gameApi.fleeBattle(this.battleState.id);
      this.battleState = result.battle;

      this.time.delayedCall(600, () => {
        this.battleUI.showFled();
        this.isProcessingAction = false;
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to flee';
      this.battleUI.addLogMessage(`Error: ${message}`);
      this.battleUI.showMainActions();
      this.isProcessingAction = false;
    }
  }

  private showActionResultVisual(result: ActionResult): void {
    const isDamage = result.effectType === 'damage'
      || result.effectType === 'damage_debuff'
      || result.effectType === 'dot';
    const isHeal = result.effectType === 'heal' || result.effectType === 'hot';
    if (!isDamage && !isHeal) return;
    if (!this.battleState) return;

    const targetIsEnemy = result.targetId === this.battleState.enemyFamiliar.familiarData.id;
    const x = targetIsEnemy ? 480 : 180;
    const y = targetIsEnemy ? 110 : 370;

    if (isDamage) {
      this.battleUI.showDamageNumber(x, y, -Math.abs(result.value), '#EF4444');
      if (result.isCritical) {
        this.battleUI.addLogMessage('Critical hit!');
      }
    } else {
      this.battleUI.showDamageNumber(x, y, result.value, '#10B981');
    }
  }

  private handleVictory(_battle: BattleState): void {
    this.battleUI.addLogMessage('Battle won!');
    this.battleUI.showVictory();
  }

  private handleDefeat(): void {
    this.battleUI.addLogMessage('You were defeated...');
    this.battleUI.showDefeat();
  }

  private handleContinue(): void {
    this.battleUI.destroy();
    this.scene.start('OverworldScene');
  }

  update(): void {
  }
}
