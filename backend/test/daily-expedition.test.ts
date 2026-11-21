import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:workers';
import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { app } from '../src/index';
import type { Bindings } from '../src/types';
import {
  ActionType,
  BALANCE,
  BattleResult,
  Directions,
  RoomType,
  dailyExpedition,
  getFamiliar,
  type BattleFamiliar,
  type BattleState,
  type DungeonState,
  type GameState,
  type Room,
} from '@arcane-familiars/game-logic';

function makeEnv(): Bindings {
  return { ...(env as unknown as Bindings), ENVIRONMENT: 'development' };
}

async function fetchApp(request: Request): Promise<Response> {
  const ctx = createExecutionContext();
  const response = await app.fetch(request, makeEnv(), ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

let ipSuffix = 0;
function post(path: string, body: Record<string, unknown>): Request {
  ipSuffix += 1;
  return new Request(`https://example.com${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'CF-Connecting-IP': `10.89.${Math.floor(ipSuffix / 200)}.${ipSuffix % 200}`,
    },
    body: JSON.stringify(body),
  });
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function room(overrides: Partial<Room> & Pick<Room, 'id'>): Room {
  return {
    name: overrides.id,
    description: '',
    type: RoomType.Normal,
    exits: [],
    encounterChance: 0,
    treasureChance: 0,
    treasurePool: [],
    cleared: true,
    ...overrides,
  };
}

function makeLobbyState(anonId: string): GameState {
  return {
    version: 1,
    id: `state-${anonId}`,
    anonymousId: anonId,
    playerFamiliars: ['whiteDog', 'yellowFighter'],
    activeParty: ['whiteDog', 'yellowFighter'],
    familiarLevels: { whiteDog: 1, yellowFighter: 1 },
    familiarXp: {},
    inventory: { currency: 100, items: [] },
    dungeon: null,
    unlockedAreas: ['verdantMeadow', 'crystalCaves'],
    defeatedBosses: [],
    battleCount: 0,
    winCount: 0,
    lastSaved: 0,
  };
}

function makeDailyDungeon(day?: string): DungeonState {
  return {
    areaId: 'verdantMeadow',
    currentRoomId: 'room_1',
    party: ['whiteDog'],
    partyHp: { whiteDog: 100 },
    partyMp: { whiteDog: 60 },
    rooms: {
      room_1: room({
        id: 'room_1',
        type: RoomType.Boss,
        exits: [{ direction: Directions.South, roomId: 'room_0', label: 'Back' }],
        pendingEncounter: { enemyId: 'meadowGuardian', resolved: false },
      }),
    },
    seed: 1,
    runLoot: { currency: 10, items: [] },
    ...(day ? { daily: day } : {}),
  };
}

function combatant(familiarId: string, hp: number): BattleFamiliar {
  return {
    uid: `u-${familiarId}`,
    familiarData: getFamiliar(familiarId)!,
    currentHp: hp,
    currentMp: 60,
    statusEffects: [],
    cooldowns: {},
    isAlly: familiarId === 'whiteDog',
  };
}

function makeBossBattle(anonId: string): BattleState {
  return {
    id: `battle-${anonId}`,
    roomId: 'room_1',
    playerFamiliar: combatant('whiteDog', 9999),
    enemyFamiliar: combatant('meadowGuardian', 1),
    isBoss: true,
    enemyLevel: 3,
    turnCount: 0,
    status: BattleResult.Active,
    swapsThisTurn: 0,
    seed: 7,
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

async function seedBattle(anonId: string, battle: BattleState): Promise<void> {
  await (env as unknown as Bindings).DB.prepare(
    `INSERT INTO active_battles (battle_id, anonymous_id, battle_json, created_at, updated_at)
     VALUES (?, ?, ?, datetime('now'), datetime('now'))`
  )
    .bind(battle.id, anonId, JSON.stringify(battle))
    .run();
}

async function readState(anonId: string): Promise<GameState> {
  const row = await (env as unknown as Bindings).DB.prepare('SELECT state_json FROM game_states WHERE anonymous_id = ?')
    .bind(anonId)
    .first<{ state_json: string }>();
  if (!row) throw new Error(`No game_states row for ${anonId}`);
  return JSON.parse(row.state_json) as GameState;
}

async function writeState(anonId: string, state: GameState): Promise<void> {
  await (env as unknown as Bindings).DB.prepare('UPDATE game_states SET state_json = ? WHERE anonymous_id = ?')
    .bind(JSON.stringify(state), anonId)
    .run();
}

async function winBoss(anonId: string, battle: BattleState): Promise<{ dailyBonus?: unknown }> {
  const res = await fetchApp(
    post('/api/game/battle/action', {
      anonymousId: anonId,
      battleId: battle.id,
      action: { type: ActionType.Attack },
      expectedTurnCount: 0,
    })
  );
  expect(res.status).toBe(200);
  const body = (await res.json()) as { turnResult: { rewards?: { dailyBonus?: unknown } } };
  return { dailyBonus: body.turnResult.rewards?.dailyBonus };
}

describe('daily expedition', () => {
  it('enters the same date-seeded dungeon for every player on the same day', async () => {
    const a = '99999999-9999-4999-8999-999999999991';
    const b = '99999999-9999-4999-8999-999999999992';
    await seedState(a, makeLobbyState(a));
    await seedState(b, makeLobbyState(b));

    const expected = dailyExpedition(todayUtc(), ['verdantMeadow', 'crystalCaves']);

    const resA = await fetchApp(
      post('/api/game/dungeon/enter', { anonymousId: a, areaId: 'verdantMeadow', daily: true })
    );
    const resB = await fetchApp(
      post('/api/game/dungeon/enter', { anonymousId: b, areaId: 'verdantMeadow', daily: true })
    );
    expect(resA.status).toBe(200);
    expect(resB.status).toBe(200);

    const bodyA = (await resA.json()) as { dungeon: DungeonState };
    const bodyB = (await resB.json()) as { dungeon: DungeonState };

    expect(bodyA.dungeon.areaId).toBe(expected.areaId);
    expect(bodyA.dungeon.daily).toBe(todayUtc());
    expect(bodyA.dungeon.rooms).toEqual(bodyB.dungeon.rooms);

    // Shared layout, but each entry rolls its rooms with its own seed, so a
    // known daily chest cannot be farmed by retreating and re-entering.
    const seedA = (await readState(a)).dungeon?.seed;
    const seedB = (await readState(b)).dungeon?.seed;
    expect(seedA).not.toBe(expected.seed);
    expect(seedA).not.toBe(seedB);
  });

  it('grants the first-clear bonus once per day', async () => {
    const anonId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const today = todayUtc();
    const state = makeLobbyState(anonId);
    state.dungeon = makeDailyDungeon(today);
    state.defeatedBosses = ['meadowGuardian'];
    await seedState(anonId, state);
    await seedBattle(anonId, makeBossBattle(anonId));

    const first = await winBoss(anonId, makeBossBattle(anonId));
    expect(first.dailyBonus).toBeDefined();

    const afterFirst = await readState(anonId);
    expect(afterFirst.dailyClearedDay).toBe(today);
    expect(afterFirst.lastRunSummary?.outcome).toBe('cleared');
    // Daily bonus coins land in the bank with the rest of the run loot.
    expect(afterFirst.inventory.currency).toBeGreaterThan(100 + BALANCE.dailyBonusCurrency);

    // A second clear on the same day keeps the flag and pays no bonus.
    const secondState = afterFirst;
    secondState.dungeon = makeDailyDungeon(today);
    await writeState(anonId, secondState);
    const secondBattle = { ...makeBossBattle(anonId), id: 'battle-daily-second' };
    await seedBattle(anonId, secondBattle);

    const second = await winBoss(anonId, secondBattle);
    expect(second.dailyBonus).toBeUndefined();
    const afterSecond = await readState(anonId);
    expect(afterSecond.dailyClearedDay).toBe(today);
  });

  it('never grants the bonus on a normal run', async () => {
    const anonId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const state = makeLobbyState(anonId);
    state.dungeon = makeDailyDungeon();
    state.defeatedBosses = ['meadowGuardian'];
    await seedState(anonId, state);
    await seedBattle(anonId, makeBossBattle(anonId));

    const result = await winBoss(anonId, makeBossBattle(anonId));
    expect(result.dailyBonus).toBeUndefined();

    const after = await readState(anonId);
    expect(after.dailyClearedDay).toBeUndefined();
  });
});
