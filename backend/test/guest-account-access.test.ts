import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:workers';
import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { app } from '../src/index';
import type { Bindings } from '../src/types';
import {
  BattleResult,
  RoomType,
  getFamiliar,
  type BattleFamiliar,
  type BattleState,
  type GameState,
} from '@arcane-familiars/game-logic';

/**
 * Regression coverage for guest→account save access. Only bootstrap used to
 * reject `isGuest && !isAnonymous`; every other /api/game route let an
 * unauthenticated caller send a registered user id as anonymousId and act on
 * that save. The fix lives in getOrCreateGameState (the shared choke point) and
 * must cover state, shop, and battle routes.
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

function post(path: string, body: Record<string, unknown>, headers: Record<string, string> = {}): Request {
  return new Request(`https://example.com${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

async function register(email: string): Promise<{ userId: string; cookie: string; csrf: string }> {
  const res = await fetchApp(post('/api/auth/register', { email, password: 'correct horse battery' }));
  expect(res.status).toBe(201);
  const body = (await res.json()) as { csrfToken: string; user: { id: string } };
  const cookie = res.headers
    .getSetCookie()
    .map((header) => header.split(';')[0])
    .join('; ');
  return { userId: body.user.id, cookie, csrf: body.csrfToken };
}

function makeCombatant(familiarId: string): BattleFamiliar {
  const data = getFamiliar(familiarId);
  if (!data) throw new Error(`Unknown familiar: ${familiarId}`);
  return {
    uid: `u-${familiarId}`,
    familiarData: data,
    currentHp: data.stats.hp,
    currentMp: data.stats.mp,
    statusEffects: [],
    cooldowns: {},
    isAlly: true,
  };
}

function makeState(anonId: string): GameState {
  return {
    version: 1,
    id: `state-${anonId}`,
    anonymousId: anonId,
    playerFamiliars: ['whiteDog', 'yellowFighter'],
    activeParty: ['whiteDog', 'yellowFighter'],
    inventory: { currency: 100, items: [{ itemId: 'potion_small', quantity: 1 }] },
    dungeon: {
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
      seed: 1,
    },
    unlockedAreas: ['verdantMeadow'],
    defeatedBosses: [],
    battleCount: 0,
    winCount: 0,
    lastSaved: 0,
  };
}

async function seedAccountSave(userId: string, isAnonymous = 0): Promise<void> {
  await (env as unknown as Bindings).DB.prepare(
    `INSERT INTO game_states (anonymous_id, state_json, version, updated_at, is_anonymous)
       VALUES (?, ?, 1, datetime('now'), ?)`
  )
    .bind(userId, JSON.stringify(makeState(userId)), isAnonymous)
    .run();
}

async function gameStateRow(anonymousId: string) {
  return (env as unknown as Bindings).DB.prepare('SELECT is_anonymous FROM game_states WHERE anonymous_id = ?')
    .bind(anonymousId)
    .first<{ is_anonymous: number }>();
}

describe('guests cannot reach account saves', () => {
  it('rejects a guest using an account id on state/load and creates no row for it', async () => {
    const auth = await register('guest-load@example.com');

    const res = await fetchApp(post('/api/game/state/load', { anonymousId: auth.userId }));
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: string }).error).toBe('Guest session cannot access an account save');

    // The guest must not pre-create a save under the account id either.
    expect(await gameStateRow(auth.userId)).toBeNull();
  });

  it('rejects a guest using an account id on shop/buy', async () => {
    const auth = await register('guest-shop@example.com');
    await seedAccountSave(auth.userId);

    const res = await fetchApp(post('/api/game/shop/buy', { anonymousId: auth.userId, itemId: 'potion_small' }));
    expect(res.status).toBe(403);

    const row = await (env as unknown as Bindings).DB.prepare(
      'SELECT state_json FROM game_states WHERE anonymous_id = ?'
    )
      .bind(auth.userId)
      .first<{ state_json: string }>();
    expect((JSON.parse(row!.state_json) as GameState).inventory.currency).toBe(100);
  });

  it('rejects a guest using an account id on battle/start', async () => {
    const auth = await register('guest-battle-start@example.com');
    await seedAccountSave(auth.userId);

    const res = await fetchApp(
      post('/api/game/battle/start', { anonymousId: auth.userId, playerFamiliarId: 'whiteDog' })
    );
    expect(res.status).toBe(403);
  });

  it('rejects a guest acting on an account battle and leaves the battle untouched', async () => {
    const auth = await register('guest-battle-action@example.com');
    await seedAccountSave(auth.userId);

    const battleId = crypto.randomUUID();
    const battle: BattleState = {
      id: battleId,
      roomId: 'room-1',
      playerFamiliar: makeCombatant('whiteDog'),
      enemyFamiliar: makeCombatant('tideTurtle'),
      isBoss: false,
      turnCount: 0,
      status: BattleResult.Active,
      swapsThisTurn: 0,
      seed: 7,
    };
    await (env as unknown as Bindings).DB.prepare(
      `INSERT INTO active_battles (battle_id, anonymous_id, battle_json, created_at, updated_at)
         VALUES (?, ?, ?, datetime('now'), datetime('now'))`
    )
      .bind(battleId, auth.userId, JSON.stringify(battle))
      .run();

    const res = await fetchApp(
      post('/api/game/battle/action', {
        anonymousId: auth.userId,
        battleId,
        action: { type: 'attack' },
        expectedTurnCount: 0,
      })
    );
    expect(res.status).toBe(403);

    const row = await (env as unknown as Bindings).DB.prepare(
      'SELECT battle_json FROM active_battles WHERE battle_id = ?'
    )
      .bind(battleId)
      .first<{ battle_json: string }>();
    expect((JSON.parse(row!.battle_json) as BattleState).turnCount).toBe(0);

    // The account save itself was not written either.
    const stateRow = await (env as unknown as Bindings).DB.prepare(
      'SELECT version FROM game_states WHERE anonymous_id = ?'
    )
      .bind(auth.userId)
      .first<{ version: number }>();
    expect(stateRow!.version).toBe(1);
  });

  it('still allows a guest with a UUID-shaped id', async () => {
    const anonId = crypto.randomUUID();
    const res = await fetchApp(post('/api/game/state/load', { anonymousId: anonId }));
    expect(res.status).toBe(200);
    expect((await res.json()) as { state: { anonymousId: string } }).toMatchObject({
      state: { anonymousId: anonId },
    });
  });

  it('rejects a non-UUID guest anonymousId with 400', async () => {
    const res = await fetchApp(post('/api/game/state/load', { anonymousId: 'not-a-uuid' }));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe('anonymousId must be a UUID');
  });

  it('does not validate the body id for authenticated requests (it is overwritten)', async () => {
    const auth = await register('guest-authed@example.com');
    const res = await fetchApp(
      post('/api/game/state/load', { anonymousId: 'forged' }, { cookie: auth.cookie, 'x-csrf-token': auth.csrf })
    );
    expect(res.status).toBe(200);
    expect((await res.json()) as { state: { anonymousId: string } }).toMatchObject({
      state: { anonymousId: auth.userId },
    });
  });
});
