import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:workers';
import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { app } from '../src/index';
import type { Bindings } from '../src/types';
import {
  ActionType,
  BattleResult,
  Outcome,
  RoomType,
  getFamiliar,
  scaleFamiliarStats,
  type BattleFamiliar,
  type BattleState,
  type BattleTurnResult,
  type GameState,
} from '@arcane-familiars/game-logic';

/**
 * Coverage for the recruit bond and the victory-screen party swap:
 * - Three wins against an unowned common species guarantee a recruit, and the
 *   intermediate wins report bond progress instead of recruiting.
 * - POST /game/dungeon/party/replace swaps a newly recruited familiar into the
 *   running party in place and resets its run HP/MP to the level-scaled maximum.
 */

function makeEnv(): Bindings {
  return { ...(env as unknown as Bindings), ENVIRONMENT: 'production' };
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

function makeCombatant(familiarId: string, hp: number, isAlly: boolean): BattleFamiliar {
  const data = getFamiliar(familiarId);
  if (!data) throw new Error(`Unknown familiar: ${familiarId}`);
  return {
    uid: `u-${familiarId}-${isAlly ? 'ally' : 'enemy'}`,
    familiarData: data,
    currentHp: hp,
    currentMp: data.stats.mp,
    statusEffects: [],
    cooldowns: {},
    isAlly,
  };
}

function makeBaseState(anonId: string): GameState {
  return {
    version: 1,
    id: `state-${anonId}`,
    anonymousId: anonId,
    playerFamiliars: ['yellowFighter', 'whiteDog'],
    activeParty: ['yellowFighter', 'whiteDog'],
    inventory: { currency: 100, items: [] },
    dungeon: null,
    unlockedAreas: ['verdantMeadow'],
    defeatedBosses: [],
    battleCount: 0,
    winCount: 0,
    lastSaved: 0,
  };
}

function makeInDungeonState(anonId: string): GameState {
  const state = makeBaseState(anonId);
  state.playerFamiliars.push('aquaSprite');
  // Entering a dungeon copies the active party, so both rosters stay aligned.
  state.activeParty = ['whiteDog', 'yellowFighter'];
  state.dungeon = {
    areaId: 'verdantMeadow',
    currentRoomId: 'room-1',
    party: ['whiteDog', 'yellowFighter'],
    partyHp: { whiteDog: 120, yellowFighter: 140 },
    partyMp: { whiteDog: 80, yellowFighter: 60 },
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
    activeIndex: 1,
    runRecruits: ['aquaSprite'],
    seed: 1,
  };
  return state;
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

async function readState(anonId: string): Promise<GameState> {
  const row = await (env as unknown as Bindings).DB.prepare('SELECT state_json FROM game_states WHERE anonymous_id = ?')
    .bind(anonId)
    .first<{ state_json: string }>();
  if (!row) throw new Error(`No game_states row for ${anonId}`);
  return JSON.parse(row.state_json) as GameState;
}

/** A first-turn win: the enemy is at 1 HP, so any player hit finishes it. */
function makeWinnableBattle(battleId: string, enemyId: string, seed: number): BattleState {
  return {
    id: battleId,
    playerFamiliar: makeCombatant('yellowFighter', 9999, true),
    enemyFamiliar: makeCombatant(enemyId, 1, false),
    isBoss: false,
    enemyLevel: 1,
    turnCount: 0,
    status: BattleResult.Active,
    swapsThisTurn: 0,
    seed,
  };
}

async function winBattle(anonId: string, battle: BattleState): Promise<BattleTurnResult> {
  await seedBattle(battle.id, anonId, battle);
  const res = await fetchApp(
    post('/api/game/battle/action', {
      anonymousId: anonId,
      battleId: battle.id,
      action: { type: ActionType.Attack },
      expectedTurnCount: 0,
    })
  );
  expect(res.status).toBe(200);
  const body = (await res.json()) as { turnResult: BattleTurnResult };
  expect(body.turnResult.battleOutcome).toBe(Outcome.Win);
  return body.turnResult;
}

describe('recruit bond through the battle route', () => {
  it('guarantees an unowned common recruit on the third win and reports bond before it', async () => {
    const anonId = 'f5b6c07c-3c58-4a0a-9c2b-a7e4f2d1c3a4';
    await seedState(anonId, makeBaseState(anonId));

    // A fixed seed keeps the lucky per-win roll stable across the three wins.
    const seed = 7;

    const first = await winBattle(anonId, makeWinnableBattle('battle-bond-1', 'aquaSprite', seed));
    expect(first.rewards?.recruitedFamiliar).toBeUndefined();
    expect(first.rewards?.recruitProgress).toEqual({
      familiarId: 'aquaSprite',
      name: 'Aqua Sprite',
      bond: 1,
      needed: 3,
    });

    const second = await winBattle(anonId, makeWinnableBattle('battle-bond-2', 'aquaSprite', seed));
    expect(second.rewards?.recruitedFamiliar).toBeUndefined();
    expect(second.rewards?.recruitProgress).toEqual({
      familiarId: 'aquaSprite',
      name: 'Aqua Sprite',
      bond: 2,
      needed: 3,
    });

    const third = await winBattle(anonId, makeWinnableBattle('battle-bond-3', 'aquaSprite', seed));
    expect(third.rewards?.recruitedFamiliar).toBe('aquaSprite');
    expect(third.rewards?.recruitedName).toBe('Aqua Sprite');
    expect(third.rewards?.recruitedLevel).toBe(1);
    expect(third.rewards?.recruitProgress).toBeUndefined();

    const persisted = await readState(anonId);
    expect(persisted.playerFamiliars).toContain('aquaSprite');
    if (persisted.dungeon) expect(persisted.dungeon.runRecruits).toContain('aquaSprite');
    expect(persisted.recruitBond?.aquaSprite).toBeUndefined();
  });
});

describe('POST /game/dungeon/party/replace', () => {
  it('swaps the recruit in place and fills its level-scaled HP/MP', async () => {
    const anonId = '2f1d3e4a-5b6c-4d7e-8f90-1a2b3c4d5e6f';
    await seedState(anonId, makeInDungeonState(anonId));

    const res = await fetchApp(
      post('/api/game/dungeon/party/replace', { anonymousId: anonId, outId: 'whiteDog', inId: 'aquaSprite' })
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { state: GameState };
    expect(body.state.dungeon?.party).toEqual(['aquaSprite', 'yellowFighter']);
    expect(body.state.activeParty).toEqual(['aquaSprite', 'yellowFighter']);
    expect(body.state.dungeon?.activeIndex).toBe(1);
    expect(body.state.dungeon?.partyHp.whiteDog).toBeUndefined();
    expect(body.state.dungeon?.partyMp.whiteDog).toBeUndefined();

    const expected = scaleFamiliarStats(getFamiliar('aquaSprite')!.stats, 1);
    expect(body.state.dungeon?.partyHp.aquaSprite).toBe(expected.maxHp);
    expect(body.state.dungeon?.partyMp.aquaSprite).toBe(expected.maxMp);
    expect(body.state.dungeon?.runRecruits).toEqual([]);
  });

  it('only lets a familiar recruited this run join, and only once', async () => {
    const anonId = '7d8e9f0a-1b2c-4d3e-8f4a-5b6c7d8e9f0a';
    const state = makeInDungeonState(anonId);
    state.dungeon!.runRecruits = [];
    await seedState(anonId, state);

    // Owned, but not recruited this run: swapping it in would be a free full heal.
    const res = await fetchApp(
      post('/api/game/dungeon/party/replace', { anonymousId: anonId, outId: 'whiteDog', inId: 'aquaSprite' })
    );
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe('Only a familiar recruited this run can join mid-run');
  });

  it('cannot cycle a familiar back in after swapping it out', async () => {
    const anonId = '8e9f0a1b-2c3d-4e5f-9a6b-7c8d9e0f1a2b';
    await seedState(anonId, makeInDungeonState(anonId));

    const first = await fetchApp(
      post('/api/game/dungeon/party/replace', { anonymousId: anonId, outId: 'whiteDog', inId: 'aquaSprite' })
    );
    expect(first.status).toBe(200);

    const back = await fetchApp(
      post('/api/game/dungeon/party/replace', { anonymousId: anonId, outId: 'aquaSprite', inId: 'whiteDog' })
    );
    expect(back.status).toBe(400);
  });

  it('rejects a swap during an active battle', async () => {
    const anonId = '6a7b8c9d-0e1f-4a2b-8c3d-4e5f6a7b8c9d';
    const state = makeInDungeonState(anonId);
    await seedState(anonId, state);
    await seedBattle('battle-blocks-replace', anonId, makeWinnableBattle('battle-blocks-replace', 'aquaSprite', 7));

    const res = await fetchApp(
      post('/api/game/dungeon/party/replace', { anonymousId: anonId, outId: 'whiteDog', inId: 'aquaSprite' })
    );

    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe('Cannot change dungeon state during an active battle');
  });

  it('rejects an unowned incoming familiar', async () => {
    const anonId = '9c8b7a6d-5e4f-4a3b-9c2d-1e0f3a4b5c6d';
    await seedState(anonId, makeInDungeonState(anonId));

    const res = await fetchApp(
      post('/api/game/dungeon/party/replace', { anonymousId: anonId, outId: 'whiteDog', inId: 'leafBunny' })
    );

    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe('That familiar is not owned');
  });

  it('rejects an incoming familiar already in the party', async () => {
    const anonId = '1b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e';
    await seedState(anonId, makeInDungeonState(anonId));

    const res = await fetchApp(
      post('/api/game/dungeon/party/replace', { anonymousId: anonId, outId: 'whiteDog', inId: 'yellowFighter' })
    );

    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe('That familiar is already in your party');
  });

  it('rejects an outgoing familiar that is not in the party', async () => {
    const anonId = '3c4d5e6f-7a8b-4c9d-8e0f-1a2b3c4d5e6f';
    await seedState(anonId, makeInDungeonState(anonId));

    const res = await fetchApp(
      post('/api/game/dungeon/party/replace', { anonymousId: anonId, outId: 'leafBunny', inId: 'aquaSprite' })
    );

    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe('That familiar is not in your party');
  });
});
