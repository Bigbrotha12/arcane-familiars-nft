import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:workers';
import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { app } from '../src/index';
import type { Bindings } from '../src/types';
import {
  BattleResult,
  type ActivePassive,
  RoomType,
  getFamiliar,
  type BattleFamiliar,
  type BattleState,
  type GameState,
} from '@arcane-familiars/game-logic';

/**
 * Once-per-battle passive effects must survive swapping. Swapping is free once
 * a turn, so if swapping out and back in reset Second Wind or re-granted the
 * Relay Instinct discount, a player could heal or cast for free every turn.
 */

function makeEnv(environment = 'production'): Bindings {
  return { ...(env as unknown as Bindings), ENVIRONMENT: environment };
}

async function fetchApp(request: Request): Promise<Response> {
  const ctx = createExecutionContext();
  const response = await app.fetch(request, makeEnv(), ctx);
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

function makeCombatant(familiarId: string, hp: number, mp: number, isAlly: boolean): BattleFamiliar {
  const data = getFamiliar(familiarId);
  if (!data) throw new Error(`Unknown familiar: ${familiarId}`);
  return {
    uid: `u-${familiarId}`,
    familiarData: data,
    currentHp: hp,
    currentMp: mp,
    statusEffects: [],
    cooldowns: {},
    isAlly,
  };
}

function makeState(anonId: string): GameState {
  return {
    version: 1,
    id: `state-${anonId}`,
    anonymousId: anonId,
    playerFamiliars: ['yellowFighter', 'whiteDog'],
    activeParty: ['yellowFighter', 'whiteDog'],
    inventory: { currency: 100, items: [{ itemId: 'potion_small', quantity: 1 }] },
    dungeon: {
      areaId: 'verdantMeadow',
      currentRoomId: 'room-1',
      party: ['yellowFighter', 'whiteDog'],
      partyHp: { yellowFighter: 140, whiteDog: 120 },
      partyMp: { yellowFighter: 60, whiteDog: 80 },
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
      runLoot: { currency: 50, items: [{ itemId: 'potion_small', quantity: 2 }] },
    },
    unlockedAreas: ['verdantMeadow'],
    defeatedBosses: [],
    battleCount: 0,
    winCount: 0,
    lastSaved: 0,
  };
}

function makeBattle(battleId: string): BattleState {
  return {
    id: battleId,
    roomId: 'room-1',
    playerFamiliar: makeCombatant('yellowFighter', 140, 60, true),
    enemyFamiliar: makeCombatant('tideTurtle', 9999, 70, false),
    isBoss: false,
    turnCount: 0,
    status: BattleResult.Active,
    swapsThisTurn: 0,
    seed: 7,
  };
}

async function seedBattle(battleId: string, anonId: string, battle: BattleState): Promise<void> {
  await (env as unknown as Bindings).DB.prepare(
    `INSERT INTO active_battles (battle_id, anonymous_id, battle_json, created_at, updated_at)
       VALUES (?, ?, ?, datetime('now'), datetime('now'))`
  )
    .bind(battleId, anonId, JSON.stringify(battle))
    .run();
}

async function readBattle(battleId: string): Promise<BattleState | null> {
  const row = await (env as unknown as Bindings).DB.prepare(
    'SELECT battle_json FROM active_battles WHERE battle_id = ?'
  )
    .bind(battleId)
    .first<{ battle_json: string }>();
  return row ? (JSON.parse(row.battle_json) as BattleState) : null;
}

const RELAY_IV: ActivePassive = { id: 'relayInstinct', tier: 4, value: 1, sourceFamiliarId: 'frostHare' };

async function seedStateRow(anonId: string): Promise<void> {
  await (env as unknown as Bindings).DB.prepare(
    `INSERT INTO game_states (anonymous_id, state_json, version, updated_at, is_anonymous)
       VALUES (?, ?, 1, datetime('now'), 1)`
  )
    .bind(anonId, JSON.stringify(makeState(anonId)))
    .run();
}

/** Start a new turn without playing one: re-allow the free swap. */
async function resetSwapAllowance(battleId: string): Promise<BattleState> {
  const battle = (await readBattle(battleId))!;
  battle.swapsThisTurn = 0;
  await (env as unknown as Bindings).DB.prepare('UPDATE active_battles SET battle_json = ? WHERE battle_id = ?')
    .bind(JSON.stringify(battle), battleId)
    .run();
  return battle;
}

async function swapTo(anonId: string, battleId: string, newFamiliarId: string): Promise<BattleState> {
  const res = await fetchApp(
    post('/api/game/battle/swap', { anonymousId: anonId, battleId, newFamiliarId, expectedTurnCount: 0 })
  );
  expect(res.status).toBe(200);
  return (await readBattle(battleId))!;
}

describe('once-per-battle passives across swaps', () => {
  it('grants the Relay Instinct discount at most once per familiar', async () => {
    const anonId = crypto.randomUUID();
    const battleId = crypto.randomUUID();
    await seedStateRow(anonId);
    await seedBattle(battleId, anonId, { ...makeBattle(battleId), playerPassives: [RELAY_IV] });

    let battle = await swapTo(anonId, battleId, 'whiteDog');
    expect(battle.playerFamiliar.relayDiscount).toBe(1);

    await resetSwapAllowance(battleId);
    battle = await swapTo(anonId, battleId, 'yellowFighter');
    expect(battle.playerFamiliar.relayDiscount).toBe(1);

    await resetSwapAllowance(battleId);
    battle = await swapTo(anonId, battleId, 'whiteDog');
    expect(battle.playerFamiliar.relayDiscount).toBeUndefined();
  });

  it('keeps a spent Second Wind spent after swapping out and back in', async () => {
    const anonId = crypto.randomUUID();
    const battleId = crypto.randomUUID();
    await seedStateRow(anonId);
    const start = makeBattle(battleId);
    start.playerFamiliar.secondWindUsed = true;
    await seedBattle(battleId, anonId, start);

    let battle = await swapTo(anonId, battleId, 'whiteDog');
    expect(battle.playerFamiliar.secondWindUsed).toBeFalsy();

    await resetSwapAllowance(battleId);
    battle = await swapTo(anonId, battleId, 'yellowFighter');
    expect(battle.playerFamiliar.secondWindUsed).toBe(true);
  });
});
