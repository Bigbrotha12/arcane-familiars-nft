import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:workers';
import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { app } from '../src/index';
import type { Bindings } from '../src/types';
import {
  ActionType,
  BattleResult,
  EffectType,
  Outcome,
  RoomType,
  StatName,
  getFamiliar,
  type BattleFamiliar,
  type BattleState,
  type BattleTurnResult,
  type GameState,
  type StatusEffect,
} from '@arcane-familiars/game-logic';

/**
 * Coverage for "item KO-cancellation" (production plan step 15): when the
 * player's slot is KO'd before it acts (a faster enemy one-shots them under
 * speed-ordered turns), the pending item action must be cancelled — the item
 * is NOT consumed and its state-level effects (heal, currency) are NOT applied.
 *
 * Seeded deterministically: shadowLord (speed 255) always acts before
 * aquaSprite (speed 55) and one-shots its 90 HP from any branch of
 * selectEnemyAction (fireball 425+, basic attack 185+, either way >= 90).
 * A speed buff is pre-seeded on the enemy so the AI's 50% buff branch is
 * skipped (hasBuffs = true), leaving only the guaranteed-damage branches.
 */

function makeEnv(environment: string): Bindings {
  return { ...(env as unknown as Bindings), ENVIRONMENT: environment };
}

async function fetchApp(request: Request, environment = 'production'): Promise<Response> {
  const ctx = createExecutionContext();
  const response = await app.fetch(request, makeEnv(environment), ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

function post(path: string, body: Record<string, unknown>): Request {
  return new Request(`https://example.com${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeCombatant(
  familiarId: string,
  hp: number,
  mp: number,
  isAlly: boolean,
  statusEffects: StatusEffect[] = []
): BattleFamiliar {
  const data = getFamiliar(familiarId);
  if (!data) throw new Error(`Unknown familiar: ${familiarId}`);
  return {
    uid: `u-${familiarId}`,
    familiarData: data,
    currentHp: hp,
    currentMp: mp,
    statusEffects,
    cooldowns: {},
    isAlly,
  };
}

async function seedState(anonId: string, state: GameState): Promise<void> {
  await (env as unknown as Bindings).DB.prepare(
    `INSERT INTO game_states (anonymous_id, state_json, version, updated_at, is_anonymous)
       VALUES (?, ?, 1, datetime('now'), 1)`
  )
    .bind(anonId, JSON.stringify(state))
    .run();
}

async function seedBattle(battleId: string, anonId: string, battle: BattleState): Promise<void> {
  await (env as unknown as Bindings).DB.prepare(
    `INSERT INTO active_battles (battle_id, anonymous_id, battle_json, created_at, updated_at)
       VALUES (?, ?, ?, datetime('now'), datetime('now'))`
  )
    .bind(battleId, anonId, JSON.stringify(battle))
    .run();
}

function makeState(
  anonId: string,
  opts: {
    inventory: GameState['inventory'];
    activeParty: string[];
    partyHp: Record<string, number>;
    partyMp: Record<string, number>;
  }
): GameState {
  return {
    version: 1,
    id: `state-${anonId}`,
    anonymousId: anonId,
    playerFamiliars: [...opts.activeParty],
    activeParty: [...opts.activeParty],
    inventory: opts.inventory,
    dungeon: {
      areaId: 'verdantMeadow',
      currentRoomId: 'room-1',
      party: [...opts.activeParty],
      partyHp: { ...opts.partyHp },
      partyMp: { ...opts.partyMp },
      rooms: {
        'room-1': {
          id: 'room-1',
          name: 'Room 1',
          description: 'Test room',
          type: RoomType.Normal,
          exits: [],
          encounterChance: 0,
          treasureChance: 0,
          treasurePool: [],
          cleared: true,
        },
      },
      seed: 1,
    },
    unlockedAreas: ['verdantMeadow'],
    defeatedBosses: [],
    battleCount: 0,
    winCount: 0,
    lastSaved: 0,
  };
}

function makeKoBattle(battleId: string): BattleState {
  const speedBuff: StatusEffect = {
    abilityId: 'quickstep',
    type: EffectType.Buff,
    stat: StatName.Speed,
    value: 1.5,
    turnsRemaining: 2,
  };
  return {
    id: battleId,
    playerFamiliar: makeCombatant('aquaSprite', 90, 100, true),
    enemyFamiliar: makeCombatant('shadowLord', 300, 270, false, [speedBuff]),
    isBoss: true,
    turnCount: 0,
    status: BattleResult.Active,
    swapsThisTurn: 0,
    seed: 42,
  };
}

describe('battle action: item KO-cancellation', () => {
  it("does not consume the item when the user is KO'd before acting", async () => {
    const anonId = 'anon-item-ko-potion';
    await seedState(
      anonId,
      makeState(anonId, {
        inventory: { currency: 100, items: [{ itemId: 'potion_small', quantity: 1 }] },
        activeParty: ['aquaSprite', 'yellowFighter'],
        partyHp: { aquaSprite: 90, yellowFighter: 140 },
        partyMp: { aquaSprite: 100, yellowFighter: 60 },
      })
    );
    const battleId = 'battle-item-ko-potion';
    await seedBattle(battleId, anonId, makeKoBattle(battleId));

    const res = await fetchApp(
      post('/api/game/battle/action', {
        anonymousId: anonId,
        battleId,
        action: { type: ActionType.Item, itemId: 'potion_small' },
      })
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      turnResult: BattleTurnResult;
      state: GameState;
      turnCount: number;
    };

    // The faster enemy (speed 255) acted first and one-shotted the 90 HP
    // sprite, so the player's item slot was cancelled.
    expect(body.turnResult.canceledActions).toEqual([
      { uid: 'u-aquaSprite', reason: 'Aqua Sprite was knocked out before it could act!' },
    ]);
    expect(body.turnResult.battleOutcome).toBe(Outcome.Continue);
    expect(body.turnResult.forcedSwap).toEqual({
      fallenName: 'Aqua Sprite',
      incomingName: 'Yellow Fighter',
    });
    expect(body.turnResult.playerFamiliar.familiarData.id).toBe('yellowFighter');
    expect(body.turnCount).toBe(1);

    // The KO-cancelled actor never used the item: quantity is untouched and no
    // heal was applied. The fallen combatant's 0 HP is persisted into the run.
    expect(body.state.inventory.items).toEqual([{ itemId: 'potion_small', quantity: 1 }]);
    expect(body.state.inventory.currency).toBe(100);
    expect(body.state.dungeon?.partyHp['aquaSprite']).toBe(0);

    // The relayed battle row persists with the new combatant, still active.
    const row = await (env as unknown as Bindings).DB.prepare(
      'SELECT battle_json FROM active_battles WHERE battle_id = ?'
    )
      .bind(battleId)
      .first<{ battle_json: string }>();
    const persisted = JSON.parse(row!.battle_json) as BattleState;
    expect(persisted.turnCount).toBe(1);
    expect(persisted.playerFamiliar.familiarData.id).toBe('yellowFighter');
    expect(persisted.status).toBe(BattleResult.Active);
  });

  it('does not grant state-level currency when a lucky_coin use is KO-cancelled', async () => {
    const anonId = 'anon-item-ko-coin';
    await seedState(
      anonId,
      makeState(anonId, {
        inventory: { currency: 100, items: [{ itemId: 'lucky_coin', quantity: 1 }] },
        activeParty: ['aquaSprite', 'yellowFighter'],
        partyHp: { aquaSprite: 90, yellowFighter: 140 },
        partyMp: { aquaSprite: 100, yellowFighter: 60 },
      })
    );
    const battleId = 'battle-item-ko-coin';
    await seedBattle(battleId, anonId, makeKoBattle(battleId));

    const res = await fetchApp(
      post('/api/game/battle/action', {
        anonymousId: anonId,
        battleId,
        action: { type: ActionType.Item, itemId: 'lucky_coin' },
      })
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { turnResult: BattleTurnResult; state: GameState };
    expect(body.turnResult.canceledActions.length).toBe(1);
    expect(body.state.inventory.items).toEqual([{ itemId: 'lucky_coin', quantity: 1 }]);
    // grant_currency (+50) must NOT have fired for a cancelled action.
    expect(body.state.inventory.currency).toBe(100);
  });

  it('consumes the item when the user survives the turn', async () => {
    const anonId = 'anon-item-survives';
    await seedState(
      anonId,
      makeState(anonId, {
        inventory: { currency: 100, items: [{ itemId: 'potion_small', quantity: 1 }] },
        activeParty: ['yellowFighter', 'whiteDog'],
        partyHp: { yellowFighter: 140, whiteDog: 120 },
        partyMp: { yellowFighter: 60, whiteDog: 80 },
      })
    );

    // Player acts first (speed 75 > 40) and survives any tideTurtle retaliation
    // (max ~41 damage), so the item must be consumed.
    const battleId = 'battle-item-survives';
    const battle: BattleState = {
      id: battleId,
      playerFamiliar: makeCombatant('yellowFighter', 140, 60, true),
      enemyFamiliar: makeCombatant('tideTurtle', 130, 70, false),
      isBoss: false,
      turnCount: 0,
      status: BattleResult.Active,
      swapsThisTurn: 0,
      seed: 7,
    };
    await seedBattle(battleId, anonId, battle);

    const res = await fetchApp(
      post('/api/game/battle/action', {
        anonymousId: anonId,
        battleId,
        action: { type: ActionType.Item, itemId: 'potion_small' },
      })
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { turnResult: BattleTurnResult; state: GameState; turnCount: number };
    expect(body.turnResult.canceledActions).toEqual([]);
    expect(body.turnResult.battleOutcome).toBe(Outcome.Continue);
    expect(body.turnResult.forcedSwap).toBeUndefined();
    expect(body.turnCount).toBe(1);
    expect(body.state.inventory.items).toEqual([{ itemId: 'potion_small', quantity: 0 }]);
  });
});
