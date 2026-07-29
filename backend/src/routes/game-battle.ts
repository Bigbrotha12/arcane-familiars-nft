import { Hono } from 'hono';
import type {
  BattleState,
  BattleFamiliar,
  BattleAction,
  BattleTurnResult,
  BattleRewards,
} from '@arcane-familiars/game-logic';
import {
  getFamiliar,
  selectEnemyAction,
  resolveTurn,
  applyStatusEffects,
  applyDefend,
  checkBattleOutcome,
} from '@arcane-familiars/game-logic';

const gameBattleRouter = new Hono<{ Bindings: { DB: D1Database } }>();

function createBattleFamiliar(familiarId: string): BattleFamiliar {
  const data = getFamiliar(familiarId);
  if (!data) throw new Error(`Unknown familiar: ${familiarId}`);

  return {
    familiarData: data,
    currentHp: data.stats.hp,
    currentMp: data.stats.mp,
    statusEffects: [],
    cooldowns: {},
    isAlly: false,
  };
}

function seededRandom(): number {
  return Math.random();
}

function generateBattleRewards(isBoss: boolean): BattleRewards {
  const baseCurrency = isBoss ? 150 : 40;
  const currency = baseCurrency + Math.floor(Math.random() * 30);
  const items: string[] = [];

  if (isBoss) {
    items.push('rare-fragment');
  } else if (Math.random() < 0.35) {
    items.push('health-potion');
  }

  return { currency, items };
}

gameBattleRouter.post('/game/battle/start', async (c) => {
  try {
    const { anonymousId, playerFamiliarId, enemyFamiliarId } = await c.req.json<{
      anonymousId: string;
      playerFamiliarId: string;
      enemyFamiliarId: string;
    }>();

    if (!anonymousId || !playerFamiliarId || !enemyFamiliarId) {
      return c.json({ error: 'Missing required fields: anonymousId, playerFamiliarId, enemyFamiliarId' }, 400);
    }

    const playerFamiliar = createBattleFamiliar(playerFamiliarId);
    playerFamiliar.isAlly = true;

    const enemyFamiliar = createBattleFamiliar(enemyFamiliarId);
    const enemyData = getFamiliar(enemyFamiliarId);

    const battle: BattleState = {
      id: crypto.randomUUID(),
      playerFamiliar,
      enemyFamiliar,
      isBoss: enemyData?.isBoss ?? false,
      turnCount: 0,
      status: 'active',
    };

    await c.env.DB
      .prepare(
        `INSERT INTO active_battles (battle_id, anonymous_id, battle_json, created_at)
         VALUES (?, ?, ?, datetime('now'))`
      )
      .bind(battle.id, anonymousId, JSON.stringify(battle))
      .run();

    return c.json({ battle });
  } catch (error: any) {
    console.error('Start battle error:', error.message);
    return c.json({ error: 'Failed to start battle' }, 500);
  }
});

gameBattleRouter.post('/game/battle/action', async (c) => {
  try {
    const { anonymousId, battleId, action } = await c.req.json<{
      anonymousId: string;
      battleId: string;
      action: BattleAction;
    }>();

    if (!anonymousId || !battleId || !action) {
      return c.json({ error: 'Missing required fields: anonymousId, battleId, action' }, 400);
    }

    const row = await c.env.DB
      .prepare('SELECT battle_json FROM active_battles WHERE battle_id = ? AND anonymous_id = ?')
      .bind(battleId, anonymousId)
      .first<{ battle_json: string }>();

    if (!row) {
      return c.json({ error: 'Battle not found' }, 404);
    }

    const battle: BattleState = JSON.parse(row.battle_json);

    if (battle.status !== 'active') {
      return c.json({ error: 'Battle is not active' }, 400);
    }

    if (action.type === 'ability' && action.abilityId) {
      const ability = battle.playerFamiliar.familiarData.abilities.includes(action.abilityId);
      if (!ability) {
        return c.json({ error: 'Player familiar does not know this ability' }, 400);
      }
    }

    battle.playerFamiliar = applyStatusEffects(battle.playerFamiliar);
    battle.enemyFamiliar = applyStatusEffects(battle.enemyFamiliar);

    if (action.type === 'defend') {
      battle.playerFamiliar = applyDefend(battle.playerFamiliar);
    }

    const enemyAction = selectEnemyAction(battle.enemyFamiliar, battle.playerFamiliar, seededRandom);

    const { playerResult, enemyResult } = resolveTurn(
      action,
      battle.playerFamiliar,
      battle.enemyFamiliar,
      enemyAction,
      seededRandom,
    );

    if (playerResult.effectType === 'damage') {
      battle.enemyFamiliar.currentHp = Math.max(
        0,
        battle.enemyFamiliar.currentHp - playerResult.value,
      );
    } else if (playerResult.effectType === 'heal') {
      battle.enemyFamiliar.currentHp = Math.min(
        battle.enemyFamiliar.familiarData.stats.maxHp,
        battle.enemyFamiliar.currentHp + playerResult.value,
      );
    }

    if (enemyResult.effectType === 'damage') {
      battle.playerFamiliar.currentHp = Math.max(
        0,
        battle.playerFamiliar.currentHp - enemyResult.value,
      );
    } else if (enemyResult.effectType === 'heal') {
      battle.playerFamiliar.currentHp = Math.min(
        battle.playerFamiliar.familiarData.stats.maxHp,
        battle.playerFamiliar.currentHp + enemyResult.value,
      );
    }

    battle.turnCount += 1;

    const outcome = checkBattleOutcome(battle.playerFamiliar, battle.enemyFamiliar);

    let rewards: BattleRewards | undefined;
    if (outcome === 'win') {
      battle.status = 'won';
      rewards = generateBattleRewards(battle.isBoss);
    } else if (outcome === 'lose') {
      battle.status = 'lost';
    }

    const turnResult: BattleTurnResult = {
      playerAction: playerResult,
      enemyAction: enemyResult,
      playerFamiliar: battle.playerFamiliar,
      enemyFamiliar: battle.enemyFamiliar,
      battleOutcome: outcome,
      rewards,
    };

    await c.env.DB
      .prepare(
        `UPDATE active_battles
         SET battle_json = ?, updated_at = datetime('now')
         WHERE battle_id = ? AND anonymous_id = ?`
      )
      .bind(JSON.stringify(battle), battleId, anonymousId)
      .run();

    if (outcome !== 'continue') {
      await c.env.DB
        .prepare(
          `DELETE FROM active_battles WHERE battle_id = ? AND anonymous_id = ?`
        )
        .bind(battleId, anonymousId)
        .run();
    }

    return c.json({ turnResult });
  } catch (error: any) {
    console.error('Battle action error:', error.message);
    return c.json({ error: 'Failed to process battle action' }, 500);
  }
});

gameBattleRouter.post('/game/battle/flee', async (c) => {
  try {
    const { anonymousId, battleId } = await c.req.json<{
      anonymousId: string;
      battleId: string;
    }>();

    if (!anonymousId || !battleId) {
      return c.json({ error: 'Missing required fields: anonymousId, battleId' }, 400);
    }

    const row = await c.env.DB
      .prepare('SELECT battle_json FROM active_battles WHERE battle_id = ? AND anonymous_id = ?')
      .bind(battleId, anonymousId)
      .first<{ battle_json: string }>();

    if (!row) {
      return c.json({ error: 'Battle not found' }, 404);
    }

    const battle: BattleState = JSON.parse(row.battle_json);

    if (battle.status !== 'active') {
      return c.json({ error: 'Battle is not active' }, 400);
    }

    if (battle.isBoss) {
      return c.json({ error: 'Cannot flee from a boss battle' }, 400);
    }

    battle.status = 'fled';

    await c.env.DB
      .prepare(
        `DELETE FROM active_battles WHERE battle_id = ? AND anonymous_id = ?`
      )
      .bind(battleId, anonymousId)
      .run();

    return c.json({
      success: true,
      message: 'Successfully fled from battle',
      battle,
    });
  } catch (error: any) {
    console.error('Flee battle error:', error.message);
    return c.json({ error: 'Failed to flee from battle' }, 500);
  }
});

export default gameBattleRouter;
