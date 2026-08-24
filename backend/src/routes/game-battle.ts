import { Hono } from 'hono';
import type {
  BattleState,
  BattleFamiliar,
  BattleAction,
  BattleTurnResult,
  BattleRewards,
  GameState,
  ItemData,
} from '@arcane-familiars/game-logic';
import {
  AREAS,
  getFamiliar,
  getItem,
  scaleEnemy,
  selectEnemyAction,
  resolveTurn,
  checkBattleOutcome,
  updateCooldowns,
  validateBattleAction,
  seededRandom,
  BattleResult,
  ActionType,
  Outcome,
} from '@arcane-familiars/game-logic';
import type { Bindings } from '../types';
import { loadGameState } from '../utils/saveManager';
import { generateId } from '../utils/uuid';
import { getErrorMessage, readBody } from '../utils/http';

const gameBattleRouter = new Hono<{ Bindings: Bindings }>();

function cryptoSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0];
}

function createBattleFamiliar(familiarId: string): BattleFamiliar {
  const data = getFamiliar(familiarId);
  if (!data) throw new Error(`Unknown familiar: ${familiarId}`);

  return {
    uid: generateId(),
    familiarData: data,
    currentHp: data.stats.hp,
    currentMp: data.stats.mp,
    statusEffects: [],
    cooldowns: {},
    isAlly: false,
  };
}

// Backfill unique combatant ids for battles persisted before the uid field
// existed. Targeting relies on uid, so a missing uid would make results miss.
function ensureBattleUids(battle: BattleState): void {
  if (!battle.playerFamiliar.uid) battle.playerFamiliar.uid = generateId();
  if (!battle.enemyFamiliar.uid) battle.enemyFamiliar.uid = generateId();
}

function getPersistedResources(
  dungeon: GameState['dungeon'],
  familiarId: string,
  familiar: BattleFamiliar,
): { currentHp: number; currentMp: number } {
  const maxHp = familiar.familiarData.stats.maxHp;
  const maxMp = familiar.familiarData.stats.maxMp;
  const hp = dungeon?.partyHp?.[familiarId];
  const mp = dungeon?.partyMp?.[familiarId];

  return {
    currentHp: typeof hp === 'number' && hp >= 0 ? Math.max(0, Math.min(hp, maxHp)) : familiar.familiarData.stats.hp,
    currentMp: typeof mp === 'number' && mp >= 0 ? Math.max(0, Math.min(mp, maxMp)) : familiar.familiarData.stats.mp,
  };
}

function generateBattleRewards(rng: () => number): BattleRewards {
  const currency = 40 + Math.floor(rng() * 30);
  const items: string[] = [];

  if (rng() < 0.35) {
    items.push('potion_small');
  }

  return { currency, items };
}

gameBattleRouter.post('/game/battle/start', async (c) => {
  try {
    const body = await readBody<{ anonymousId: string; playerFamiliarId: string }>(c);
    if (!body) {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }

    const { anonymousId, playerFamiliarId } = body;
    if (!anonymousId || !playerFamiliarId) {
      return c.json({ error: 'Missing required fields: anonymousId, playerFamiliarId' }, 400);
    }

    const loaded = await loadGameState(c.env.DB, anonymousId);
    if (!loaded) {
      return c.json({ error: 'Game state not found' }, 404);
    }

    const state = loaded.state;

    const party = state.activeParty ?? [];
    if (!party.includes(playerFamiliarId)) {
      return c.json({ error: 'Familiar is not in your active party' }, 400);
    }

    const dungeon = state.dungeon;
    if (!dungeon) {
      return c.json({ error: 'No active dungeon' }, 409);
    }

    const room = dungeon.rooms[dungeon.currentRoomId];
    const pending = room?.pendingEncounter;

    if (!room || !pending || pending.resolved) {
      return c.json({ error: 'No enemy to fight in this room' }, 409);
    }

    const area = AREAS[dungeon.areaId];
    if (!area) {
      return c.json({ error: 'Invalid area' }, 500);
    }

    const playerFamiliar = createBattleFamiliar(playerFamiliarId);
    const resources = getPersistedResources(dungeon, playerFamiliarId, playerFamiliar);
    playerFamiliar.currentHp = resources.currentHp;
    playerFamiliar.currentMp = resources.currentMp;
    playerFamiliar.isAlly = true;

    // Enemy identity is derived from the persisted room encounter, never from the client.
    const enemyId = pending.enemyId;
    const baseEnemy = getFamiliar(enemyId);
    if (!baseEnemy) {
      return c.json({ error: 'Encounter references an unknown familiar' }, 500);
    }

    const battleSeed = cryptoSeed();
    const rng = seededRandom(battleSeed);

    let enemyFamiliar: BattleFamiliar;
    if (baseEnemy.isBoss) {
      enemyFamiliar = createBattleFamiliar(enemyId);
    } else {
      // The level was fixed when the encounter was rolled (explore), so fleeing
      // and re-starting cannot reroll enemy strength.
      const level = pending.level ?? area.levelRange[0];
      enemyFamiliar = {
        uid: generateId(),
        familiarData: scaleEnemy(baseEnemy, level),
        currentHp: Math.round(baseEnemy.stats.hp * (1 + 0.1 * (level - 1))),
        currentMp: Math.round(baseEnemy.stats.mp * (1 + 0.1 * (level - 1))),
        statusEffects: [],
        cooldowns: {},
        isAlly: false,
      };
    }

    const battle: BattleState = {
      id: generateId(),
      playerFamiliar,
      enemyFamiliar,
      isBoss: baseEnemy.isBoss ?? false,
      turnCount: 0,
      status: BattleResult.Active,
      swapsThisTurn: 0,
      seed: battleSeed,
    };

    // Supersede any leftover battle row: rows are only removed when a battle
    // ends (win/loss/flee), so an abandoned session (closed tab, kicked out
    // mid-battle) leaves a row behind that violates the one-battle-per-user
    // unique index and would 500 every future start. There is no
    // battle-resume path, so deleting it here is safe.
    await c.env.DB.batch([
      c.env.DB.prepare('DELETE FROM active_battles WHERE anonymous_id = ?').bind(anonymousId),
      c.env.DB.prepare(
        `INSERT INTO active_battles (battle_id, anonymous_id, battle_json, created_at)
         VALUES (?, ?, ?, datetime('now'))`
      ).bind(battle.id, anonymousId, JSON.stringify(battle)),
    ]);

    return c.json({ battle });
  } catch (error: unknown) {
    console.error('Start battle error:', getErrorMessage(error));
    return c.json({ error: 'Failed to start battle' }, 500);
  }
});

gameBattleRouter.post('/game/battle/action', async (c) => {
  try {
    const body = await readBody<{ anonymousId: string; battleId: string; action: BattleAction; expectedTurnCount?: number }>(c);
    if (!body) {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }

    const { anonymousId, battleId, action, expectedTurnCount } = body;
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
    ensureBattleUids(battle);

    if (battle.status !== BattleResult.Active) {
      return c.json({ error: 'Battle is not active' }, 400);
    }

    if (expectedTurnCount !== undefined && expectedTurnCount !== battle.turnCount) {
      return c.json({ error: 'Battle state is stale; please refresh and retry' }, 409);
    }

    const validation = validateBattleAction(action, battle);
    if (!validation.valid) {
      return c.json({ error: validation.error ?? 'Invalid action' }, 400);
    }

    if (action.type === ActionType.Run) {
      return c.json({ error: 'Use the flee endpoint to run from battle' }, 400);
    }

    if (action.type === ActionType.Ability && action.abilityId) {
      if (!battle.playerFamiliar.familiarData.abilities.includes(action.abilityId)) {
        return c.json({ error: 'Player familiar does not know this ability' }, 400);
      }
    }

    const loaded = await loadGameState(c.env.DB, anonymousId);
    if (!loaded) {
      return c.json({ error: 'Game state not found' }, 404);
    }
    const state = loaded.state;

    // Validate items BEFORE resolution; actual consumption and state effects
    // happen after resolveTurn, only if the player's slot executed (a slower
    // actor can be KO'd before acting under speed-ordered turns).
    let stateEffectNote: string | undefined;
    let consumedItem: ItemData | undefined;
    let faintedPartyIds: string[] = [];
    if (action.type === ActionType.Item && action.itemId) {
      const itemEntry = state.inventory.items.find((i) => i.itemId === action.itemId);
      if (!itemEntry || typeof itemEntry.quantity !== 'number' || itemEntry.quantity < 1) {
        return c.json({ error: 'You do not own this item' }, 400);
      }
      const item = getItem(action.itemId);
      if (!item) {
        return c.json({ error: 'Unknown item' }, 400);
      }

      // Validate state-level effects BEFORE consuming, so a failed use does
      // not eat the item.
      const revive = item.effects.find((e) => e.kind === 'revive_party');
      const fainted = revive && state.dungeon
        ? state.dungeon.party.filter((id) => (state.dungeon?.partyHp[id] ?? 0) <= 0)
        : [];
      if (revive && fainted.length === 0) {
        return c.json({ error: 'No fainted party members to revive' }, 400);
      }

      consumedItem = item;
      faintedPartyIds = fainted;
    }

    // Derive a per-turn RNG from the battle seed so each turn gets a distinct,
    // reproducible sequence (a fresh generator from the raw seed would repeat
    // the same rolls every turn).
    const rng = seededRandom((battle.seed ?? cryptoSeed()) ^ (battle.turnCount + 1));
    const enemyAction = selectEnemyAction(battle.enemyFamiliar, battle.playerFamiliar, rng);

    const { playerResult, enemyResult, updatedPlayerFamiliar, updatedEnemyFamiliar, steps: turnSteps, canceledActions } = resolveTurn(
      action,
      battle.playerFamiliar,
      battle.enemyFamiliar,
      enemyAction,
      rng,
    );

    const playerActed = turnSteps.some((s) => s.actorUid === battle.playerFamiliar.uid);
    const enemyActed = turnSteps.some((s) => s.actorUid === battle.enemyFamiliar.uid);

    // Consume the item and apply its state-level effects only if the player's
    // slot executed: a KO-canceled actor never used the item, so it must not
    // be eaten nor trigger revive_party/grant_currency. State-level effects:
    // applied here rather than in the battle engine, which only sees the two
    // active combatants.
    if (action.type === ActionType.Item && action.itemId && playerActed && consumedItem) {
      const itemEntry = state.inventory.items.find((i) => i.itemId === action.itemId);
      if (itemEntry) {
        itemEntry.quantity -= 1;
      }

      for (const effect of consumedItem.effects) {
        if (effect.kind === 'grant_currency') {
          state.inventory.currency += effect.value;
          stateEffectNote = `gains ${effect.value} currency`;
        }
        if (effect.kind === 'revive_party' && state.dungeon) {
          for (const id of faintedPartyIds) {
            const data = getFamiliar(id);
            if (data) {
              state.dungeon.partyHp[id] = Math.max(1, Math.floor((data.stats.maxHp * effect.percentage) / 100));
            }
          }
          stateEffectNote = `revives ${faintedPartyIds.length} party member${faintedPartyIds.length === 1 ? '' : 's'}`;
        }
      }
    }

    battle.playerFamiliar = updateCooldowns(updatedPlayerFamiliar, playerActed && action.type === ActionType.Ability ? action.abilityId : undefined);
    battle.enemyFamiliar = updateCooldowns(updatedEnemyFamiliar, enemyActed && enemyAction.type === ActionType.Ability ? enemyAction.abilityId : undefined);

    // Snapshot the turn count before mutating so the battle write below is
    // conditional on the exact row this turn was computed from.
    const turnBefore = battle.turnCount;
    battle.turnCount += 1;
    // A new turn begins: allow one free swap again (#10).
    battle.swapsThisTurn = 0;

    const outcome = checkBattleOutcome(battle.playerFamiliar, battle.enemyFamiliar);

    if (outcome === Outcome.Win) {
      battle.status = BattleResult.Won;
    } else if (outcome === Outcome.Loss) {
      battle.status = BattleResult.Lost;
    }

    let rewards: BattleRewards | undefined;
    if (outcome === Outcome.Win) {
      state.battleCount = (state.battleCount ?? 0) + 1;
      state.winCount = (state.winCount ?? 0) + 1;

      const room = state.dungeon?.rooms[state.dungeon.currentRoomId];
      if (room?.pendingEncounter) {
        room.pendingEncounter.resolved = true;
      }

      if (battle.isBoss) {
        const area = AREAS[state.dungeon?.areaId ?? ''];
        if (area) {
          const isFirstDefeat = !state.defeatedBosses.includes(area.bossId);
          if (isFirstDefeat) {
            state.defeatedBosses.push(area.bossId);
            // One-time reward: re-fighting a defeated boss does not farm
            // currency or items (the encounter can otherwise be re-entered).
            state.inventory.currency += area.bossReward.currency;
            for (const itemId of area.bossReward.items) {
              const existing = state.inventory.items.find((i) => i.itemId === itemId);
              if (existing) {
                existing.quantity += 1;
              } else {
                state.inventory.items.push({ itemId, quantity: 1 });
              }
            }
            rewards = { currency: area.bossReward.currency, items: [...area.bossReward.items] };
          }
          if (!state.playerFamiliars.includes(area.baseFamiliar)) {
            state.playerFamiliars.push(area.baseFamiliar);
          }
          if (area.unlocks && !state.unlockedAreas.includes(area.unlocks)) {
            state.unlockedAreas.push(area.unlocks);
          }
        }
        state.dungeon = null;
      } else {
        rewards = generateBattleRewards(rng);
        state.inventory.currency += rewards.currency;
        for (const itemId of rewards.items) {
          const existing = state.inventory.items.find((i) => i.itemId === itemId);
          if (existing) {
            existing.quantity += 1;
          } else {
            state.inventory.items.push({ itemId, quantity: 1 });
          }
        }
        if (state.dungeon) {
          state.dungeon.partyHp[battle.playerFamiliar.familiarData.id] = Math.max(0, battle.playerFamiliar.currentHp);
          state.dungeon.partyMp[battle.playerFamiliar.familiarData.id] = Math.max(0, battle.playerFamiliar.currentMp);
        }
      }
    } else if (outcome === Outcome.Loss) {
      state.battleCount = (state.battleCount ?? 0) + 1;
      state.dungeon = null;
    } else {
      if (state.dungeon) {
        state.dungeon.partyHp[battle.playerFamiliar.familiarData.id] = Math.max(0, battle.playerFamiliar.currentHp);
        state.dungeon.partyMp[battle.playerFamiliar.familiarData.id] = Math.max(0, battle.playerFamiliar.currentMp);
      }
    }

    const turnResult: BattleTurnResult = {
      playerAction: playerResult,
      enemyAction: enemyResult,
      playerFamiliar: battle.playerFamiliar,
      enemyFamiliar: battle.enemyFamiliar,
      battleOutcome: outcome,
      rewards,
      steps: turnSteps,
      canceledActions,
    };

    // State-level item effects resolve outside the engine; surface them in
    // the same log line the player already reads. Appending via the step's
    // result also updates the compat field, which references the same object
    // when the player executed.
    if (stateEffectNote) {
      const playerStep = turnResult.steps.find((s) => s.actorUid === battle.playerFamiliar.uid);
      if (playerStep) {
        playerStep.result.description += ` (${stateEffectNote})`;
      }
    }

    // Atomic: state + battle writes must succeed or fail together. Both
    // statements are conditional on the rows read above, so a stale writer
    // matches 0 rows and neither commit (D1 batch does not roll back a
    // 0-row match on its own).
    const stateStmt = c.env.DB
      .prepare(
        `UPDATE game_states
         SET state_json = ?, version = version + 1, updated_at = datetime('now')
         WHERE anonymous_id = ? AND version = ?`
      )
      .bind(JSON.stringify(state), anonymousId, loaded.version);

    const battleStmt =
      outcome !== Outcome.Continue
        ? c.env.DB
            .prepare(
              `DELETE FROM active_battles
               WHERE battle_id = ? AND anonymous_id = ?
                 AND json_extract(battle_json, '$.turnCount') = ?`
            )
            .bind(battleId, anonymousId, turnBefore)
        : c.env.DB
            .prepare(
              `UPDATE active_battles
               SET battle_json = ?, updated_at = datetime('now')
               WHERE battle_id = ? AND anonymous_id = ?
                 AND json_extract(battle_json, '$.turnCount') = ?`
            )
            .bind(JSON.stringify(battle), battleId, anonymousId, turnBefore);

    const results = await c.env.DB.batch([stateStmt, battleStmt]);
    if (results[0].meta.changes !== 1 || results[1].meta.changes !== 1) {
      return c.json({ error: 'Game state changed concurrently; please retry' }, 409);
    }

    return c.json({ turnResult, state, turnCount: battle.turnCount });
  } catch (error: unknown) {
    console.error('Battle action error:', getErrorMessage(error));
    return c.json({ error: 'Failed to process battle action' }, 500);
  }
});

gameBattleRouter.post('/game/battle/swap', async (c) => {
  try {
    const body = await readBody<{ anonymousId: string; battleId: string; newFamiliarId: string; expectedTurnCount?: number }>(c);
    if (!body) {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }

    const { anonymousId, battleId, newFamiliarId, expectedTurnCount } = body;
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
    ensureBattleUids(battle);

    if (battle.status !== BattleResult.Active) {
      return c.json({ error: 'Battle is not active' }, 400);
    }

    if (expectedTurnCount !== undefined && expectedTurnCount !== battle.turnCount) {
      return c.json({ error: 'Battle state is stale; please refresh and retry' }, 409);
    }

    if (newFamiliarId === battle.playerFamiliar.familiarData.id) {
      return c.json({ error: 'Already using this familiar' }, 400);
    }

    // Only one free swap per turn (#10).
    if ((battle.swapsThisTurn ?? 0) >= 1) {
      return c.json({ error: 'You can only swap once per turn' }, 400);
    }

    const loaded = await loadGameState(c.env.DB, anonymousId);
    if (!loaded) {
      return c.json({ error: 'Game state not found' }, 404);
    }
    const state = loaded.state;

    const party = state.activeParty ?? [];
    if (!party.includes(newFamiliarId)) {
      return c.json({ error: 'Familiar is not in your active party' }, 400);
    }

    if (state.dungeon) {
      state.dungeon.partyHp[battle.playerFamiliar.familiarData.id] = Math.max(0, battle.playerFamiliar.currentHp);
      state.dungeon.partyMp[battle.playerFamiliar.familiarData.id] = Math.max(0, battle.playerFamiliar.currentMp);
    }

    const newFamiliar = createBattleFamiliar(newFamiliarId);
    const resources = getPersistedResources(state.dungeon, newFamiliarId, newFamiliar);
    newFamiliar.currentHp = resources.currentHp;
    newFamiliar.currentMp = resources.currentMp;
    newFamiliar.isAlly = true;

    battle.playerFamiliar = newFamiliar;
    battle.swapsThisTurn = (battle.swapsThisTurn ?? 0) + 1;

    const stateStmt = c.env.DB
      .prepare(
        `UPDATE game_states
         SET state_json = ?, version = version + 1, updated_at = datetime('now')
         WHERE anonymous_id = ? AND version = ?`
      )
      .bind(JSON.stringify(state), anonymousId, loaded.version);

    const battleStmt = c.env.DB
      .prepare(
        `UPDATE active_battles
         SET battle_json = ?, updated_at = datetime('now')
         WHERE battle_id = ? AND anonymous_id = ?
           AND json_extract(battle_json, '$.turnCount') = ?`
      )
      .bind(JSON.stringify(battle), battleId, anonymousId, battle.turnCount);

    const results = await c.env.DB.batch([stateStmt, battleStmt]);
    if (results[0].meta.changes !== 1 || results[1].meta.changes !== 1) {
      return c.json({ error: 'Game state changed concurrently; please retry' }, 409);
    }

    return c.json({ battle });
  } catch (error: unknown) {
    console.error('Swap familiar error:', getErrorMessage(error));
    return c.json({ error: 'Failed to swap familiar' }, 500);
  }
});

gameBattleRouter.post('/game/battle/flee', async (c) => {
  try {
    const body = await readBody<{ anonymousId: string; battleId: string; expectedTurnCount?: number }>(c);
    if (!body) {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }

    const { anonymousId, battleId, expectedTurnCount } = body;
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

    if (expectedTurnCount !== undefined && expectedTurnCount !== battle.turnCount) {
      return c.json({ error: 'Battle state is stale; please refresh and retry' }, 409);
    }

    if (battle.isBoss) {
      return c.json({ error: 'Cannot flee from a boss battle' }, 400);
    }

    battle.status = BattleResult.Fled;

    const loaded = await loadGameState(c.env.DB, anonymousId);
    if (!loaded) {
      return c.json({ error: 'Game state not found' }, 404);
    }
    const state = loaded.state;

    if (state.dungeon) {
      state.dungeon.partyHp[battle.playerFamiliar.familiarData.id] = Math.max(0, battle.playerFamiliar.currentHp);
      state.dungeon.partyMp[battle.playerFamiliar.familiarData.id] = Math.max(0, battle.playerFamiliar.currentMp);
    }

    const stateStmt = c.env.DB
      .prepare(
        `UPDATE game_states
         SET state_json = ?, version = version + 1, updated_at = datetime('now')
         WHERE anonymous_id = ? AND version = ?`
      )
      .bind(JSON.stringify(state), anonymousId, loaded.version);

    const battleStmt = c.env.DB
      .prepare(
        `DELETE FROM active_battles
         WHERE battle_id = ? AND anonymous_id = ?
           AND json_extract(battle_json, '$.turnCount') = ?`
      )
      .bind(battleId, anonymousId, battle.turnCount);

    const results = await c.env.DB.batch([stateStmt, battleStmt]);
    if (results[0].meta.changes !== 1 || results[1].meta.changes !== 1) {
      return c.json({ error: 'Game state changed concurrently; please retry' }, 409);
    }

    return c.json({ success: true, message: 'Successfully fled from battle', battle });
  } catch (error: unknown) {
    console.error('Flee battle error:', getErrorMessage(error));
    return c.json({ error: 'Failed to flee from battle' }, 500);
  }
});

export default gameBattleRouter;