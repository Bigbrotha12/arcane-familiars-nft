import { Hono } from 'hono';
import type {
  BattleState,
  BattleFamiliar,
  BattleAction,
  BattleTurnResult,
  BattleRewards,
  GameState,
  DungeonState,
} from '@arcane-familiars/game-logic';
import {
  getFamiliar,
  selectEnemyAction,
  resolveTurn,
  checkBattleOutcome,
  BattleResult,
  ActionType,
  Outcome,
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
    items.push('potion_medium');
  } else if (Math.random() < 0.35) {
    items.push('potion_small');
  }

  return { currency, items };
}

async function loadGameState(db: D1Database, anonymousId: string): Promise<GameState | null> {
  const row = await db
    .prepare('SELECT state_json FROM game_states WHERE anonymous_id = ?')
    .bind(anonymousId)
    .first<{ state_json: string }>();

  if (!row) return null;
  return JSON.parse(row.state_json) as GameState;
}

async function saveGameState(db: D1Database, anonymousId: string, state: GameState): Promise<void> {
  state.lastSaved = Date.now();
  const stateJson = JSON.stringify(state);
  await db
    .prepare(
      `INSERT INTO game_states (anonymous_id, state_json, updated_at)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(anonymous_id)
       DO UPDATE SET state_json = ?, updated_at = datetime('now')`
    )
    .bind(anonymousId, stateJson, stateJson)
    .run();
}

function persistPartyResources(
  dungeon: DungeonState | null | undefined,
  familiarId: string,
  currentHp: number,
  currentMp: number,
): void {
  if (!dungeon) return;
  dungeon.partyHp[familiarId] = Math.max(0, currentHp);
  dungeon.partyMp[familiarId] = Math.max(0, currentMp);
}

function getPersistedResources(
  dungeon: DungeonState | null | undefined,
  familiarId: string,
  familiar: BattleFamiliar,
): { currentHp: number; currentMp: number } {
  const maxHp = familiar.familiarData.stats.maxHp;
  const maxMp = familiar.familiarData.stats.maxMp;
  const hp = dungeon?.partyHp?.[familiarId];
  const mp = dungeon?.partyMp?.[familiarId];

  return {
    currentHp: typeof hp === 'number' ? Math.min(hp, maxHp) : familiar.familiarData.stats.hp,
    currentMp: typeof mp === 'number' ? Math.min(mp, maxMp) : familiar.familiarData.stats.mp,
  };
}

function applyRewards(state: GameState, rewards: BattleRewards): void {
  state.inventory = state.inventory ?? { currency: 0, items: [] };
  state.inventory.currency += rewards.currency;
  for (const itemId of rewards.items) {
    const existing = state.inventory.items.find((i) => i.itemId === itemId);
    if (existing) {
      existing.quantity += 1;
    } else {
      state.inventory.items.push({ itemId, quantity: 1 });
    }
  }
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

    const state = await loadGameState(c.env.DB, anonymousId);
    if (!state) {
      return c.json({ error: 'Game state not found' }, 404);
    }

    const existingBattle = await c.env.DB
      .prepare('SELECT battle_id FROM active_battles WHERE anonymous_id = ?')
      .bind(anonymousId)
      .first<{ battle_id: string }>();
    if (existingBattle) {
      return c.json({ error: 'A battle is already in progress' }, 409);
    }

    const party = state.activeParty ?? [];
    if (!party.includes(playerFamiliarId)) {
      return c.json({ error: 'Familiar is not in your active party' }, 400);
    }

    const pendingEncounter = state.dungeon?.pendingEncounter;
    if (!pendingEncounter) {
      return c.json({ error: 'No encounter to fight. Explore a room first.' }, 409);
    }

    if (state.dungeon && pendingEncounter.roomId !== state.dungeon.currentRoomId) {
      return c.json({ error: 'Encounter is not in your current room' }, 409);
    }

    if (enemyFamiliarId !== pendingEncounter.enemyId) {
      return c.json({ error: 'Enemy does not match the rolled encounter' }, 400);
    }

    const playerFamiliar = createBattleFamiliar(playerFamiliarId);
    const resources = getPersistedResources(state.dungeon, playerFamiliarId, playerFamiliar);
    playerFamiliar.currentHp = resources.currentHp;
    playerFamiliar.currentMp = resources.currentMp;
    playerFamiliar.isAlly = true;

    if (playerFamiliar.currentHp <= 0) {
      return c.json({ error: 'Familiar has fainted and cannot battle' }, 400);
    }

    // Consume the pending encounter so it cannot be farmed.
    state.dungeon!.pendingEncounter = null;
    await saveGameState(c.env.DB, anonymousId, state);

    const enemyFamiliar = createBattleFamiliar(enemyFamiliarId);
    const enemyData = getFamiliar(enemyFamiliarId);

    const battle: BattleState = {
      id: crypto.randomUUID(),
      playerFamiliar,
      enemyFamiliar,
      isBoss: enemyData?.isBoss ?? false,
      turnCount: 0,
      status: BattleResult.Active,
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

    if (battle.status !== BattleResult.Active) {
      return c.json({ error: 'Battle is not active' }, 400);
    }

    if (action.type === ActionType.Ability && action.abilityId) {
      const ability = battle.playerFamiliar.familiarData.abilities.includes(action.abilityId);
      if (!ability) {
        return c.json({ error: 'Player familiar does not know this ability' }, 400);
      }
    }

    const enemyAction = selectEnemyAction(battle.enemyFamiliar, battle.playerFamiliar, seededRandom);

    const { playerResult, enemyResult, updatedPlayerFamiliar, updatedEnemyFamiliar } = resolveTurn(
      action,
      battle.playerFamiliar,
      battle.enemyFamiliar,
      enemyAction,
      seededRandom,
    );

    battle.playerFamiliar = updatedPlayerFamiliar;
    battle.enemyFamiliar = updatedEnemyFamiliar;

    battle.turnCount += 1;

    const outcome = checkBattleOutcome(battle.playerFamiliar, battle.enemyFamiliar);

    let rewards: BattleRewards | undefined;
    if (outcome === Outcome.Win) {
      battle.status = BattleResult.Won;
      rewards = generateBattleRewards(battle.isBoss);
    } else if (outcome === Outcome.Loss) {
      battle.status = BattleResult.Lost;
    }

    const state = await loadGameState(c.env.DB, anonymousId);

    if (state) {
      if (outcome === Outcome.Win) {
        state.battleCount = (state.battleCount ?? 0) + 1;
        state.winCount = (state.winCount ?? 0) + 1;
        if (rewards) applyRewards(state, rewards);
        persistPartyResources(
          state.dungeon,
          battle.playerFamiliar.familiarData.id,
          battle.playerFamiliar.currentHp,
          battle.playerFamiliar.currentMp,
        );
      } else if (outcome === Outcome.Loss) {
        state.battleCount = (state.battleCount ?? 0) + 1;
        state.dungeon = null;
      } else {
        persistPartyResources(
          state.dungeon,
          battle.playerFamiliar.familiarData.id,
          battle.playerFamiliar.currentHp,
          battle.playerFamiliar.currentMp,
        );
      }
      await saveGameState(c.env.DB, anonymousId, state);
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

    if (outcome !== Outcome.Continue) {
      await c.env.DB
        .prepare(
          `DELETE FROM active_battles WHERE battle_id = ? AND anonymous_id = ?`
        )
        .bind(battleId, anonymousId)
        .run();
    }

    return c.json({ turnResult, state, turnCount: battle.turnCount });
  } catch (error: any) {
    console.error('Battle action error:', error.message);
    return c.json({ error: 'Failed to process battle action' }, 500);
  }
});

gameBattleRouter.post('/game/battle/swap', async (c) => {
  try {
    const { anonymousId, battleId, newFamiliarId } = await c.req.json<{
      anonymousId: string;
      battleId: string;
      newFamiliarId: string;
    }>();

    if (!anonymousId || !battleId || !newFamiliarId) {
      return c.json({ error: 'Missing required fields: anonymousId, battleId, newFamiliarId' }, 400);
    }

    const row = await c.env.DB
      .prepare('SELECT battle_json FROM active_battles WHERE battle_id = ? AND anonymous_id = ?')
      .bind(battleId, anonymousId)
      .first<{ battle_json: string }>();

    if (!row) {
      return c.json({ error: 'Battle not found' }, 404);
    }

    const battle: BattleState = JSON.parse(row.battle_json);

    if (battle.status !== BattleResult.Active) {
      return c.json({ error: 'Battle is not active' }, 400);
    }

    if (newFamiliarId === battle.playerFamiliar.familiarData.id) {
      return c.json({ error: 'Already using this familiar' }, 400);
    }

    const state = await loadGameState(c.env.DB, anonymousId);
    const party = state?.activeParty ?? [];
    if (!state || !party.includes(newFamiliarId)) {
      return c.json({ error: 'Familiar is not in your active party' }, 400);
    }

    if (state.dungeon) {
      persistPartyResources(
        state.dungeon,
        battle.playerFamiliar.familiarData.id,
        battle.playerFamiliar.currentHp,
        battle.playerFamiliar.currentMp,
      );
      await saveGameState(c.env.DB, anonymousId, state);
    }

    const newFamiliar = createBattleFamiliar(newFamiliarId);
    const resources = getPersistedResources(state.dungeon, newFamiliarId, newFamiliar);
    newFamiliar.currentHp = resources.currentHp;
    newFamiliar.currentMp = resources.currentMp;
    newFamiliar.isAlly = true;

    if (newFamiliar.currentHp <= 0) {
      return c.json({ error: 'Familiar has fainted and cannot battle' }, 400);
    }

    battle.playerFamiliar = newFamiliar;

    await c.env.DB
      .prepare(
        `UPDATE active_battles
         SET battle_json = ?, updated_at = datetime('now')
         WHERE battle_id = ? AND anonymous_id = ?`
      )
      .bind(JSON.stringify(battle), battleId, anonymousId)
      .run();

    return c.json({ battle });
  } catch (error: any) {
    console.error('Swap familiar error:', error.message);
    return c.json({ error: 'Failed to swap familiar' }, 500);
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

    if (battle.status !== BattleResult.Active) {
      return c.json({ error: 'Battle is not active' }, 400);
    }

    if (battle.isBoss) {
      return c.json({ error: 'Cannot flee from a boss battle' }, 400);
    }

    battle.status = BattleResult.Fled;

    const state = await loadGameState(c.env.DB, anonymousId);
    if (state?.dungeon) {
      persistPartyResources(
        state.dungeon,
        battle.playerFamiliar.familiarData.id,
        battle.playerFamiliar.currentHp,
        battle.playerFamiliar.currentMp,
      );
      await saveGameState(c.env.DB, anonymousId, state);
    }

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