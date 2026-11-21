import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:workers';
import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { app } from '../src/index';
import type { Bindings } from '../src/types';
import {
  ActionType,
  BattleResult,
  RoomType,
  getFamiliar,
  scaleFamiliarStats,
  type BattleFamiliar,
  type BattleState,
  type BattleTurnResult,
  type GameState,
} from '@arcane-familiars/game-logic';

/**
 * Heal Pulse also mends the bench. The engine reports the fraction; the
 * backend applies it to the living non-fighting party member using that
 * member's own level-scaled max HP.
 */

function makeEnv(environment = 'development'): Bindings {
  return { ...(env as unknown as Bindings), ENVIRONMENT: environment };
}

async function fetchApp(request: Request, environment = 'development'): Promise<Response> {
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

function makeState(
  anonId: string,
  opts: {
    activeParty: string[];
    partyHp: Record<string, number>;
    levels?: Record<string, number>;
  }
): GameState {
  return {
    version: 1,
    id: `state-${anonId}`,
    anonymousId: anonId,
    playerFamiliars: [...opts.activeParty],
    activeParty: [...opts.activeParty],
    familiarLevels: opts.levels,
    inventory: { currency: 100, items: [] },
    dungeon: {
      areaId: 'verdantMeadow',
      currentRoomId: 'room-1',
      party: [...opts.activeParty],
      partyHp: { ...opts.partyHp },
      partyMp: Object.fromEntries(opts.activeParty.map((id) => [id, 70])),
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

async function seed(anonId: string, state: GameState, battle: BattleState): Promise<void> {
  const db = (env as unknown as Bindings).DB;
  await db
    .prepare(
      `INSERT INTO game_states (anonymous_id, state_json, version, updated_at, is_anonymous)
       VALUES (?, ?, 1, datetime('now'), 1)`
    )
    .bind(anonId, JSON.stringify(state))
    .run();
  await db
    .prepare(
      `INSERT INTO active_battles (battle_id, anonymous_id, battle_json, created_at, updated_at)
       VALUES (?, ?, ?, datetime('now'), datetime('now'))`
    )
    .bind(battle.id, anonId, JSON.stringify(battle))
    .run();
}

function healPulseBattle(battleId: string): BattleState {
  return {
    id: battleId,
    playerFamiliar: makeCombatant('aquaSprite', 50, 100, true),
    enemyFamiliar: makeCombatant('tideTurtle', 130, 70, false),
    isBoss: false,
    turnCount: 0,
    status: BattleResult.Active,
    swapsThisTurn: 0,
    seed: 7,
  };
}

async function useHealPulse(anonId: string, battle: BattleState) {
  const res = await fetchApp(
    post('/api/game/battle/action', {
      anonymousId: anonId,
      battleId: battle.id,
      action: { type: ActionType.Ability, abilityId: 'healpulse' },
    })
  );
  expect(res.status).toBe(200);
  return (await res.json()) as {
    turnResult: BattleTurnResult;
    state: GameState;
    turnCount: number;
  };
}

describe('battle action: Heal Pulse bench heal', () => {
  it('heals the living bench member by 15% of its own level-scaled max HP', async () => {
    const anonId = crypto.randomUUID();
    const state = makeState(anonId, {
      activeParty: ['aquaSprite', 'yellowFighter'],
      partyHp: { aquaSprite: 50, yellowFighter: 100 },
      levels: { aquaSprite: 1, yellowFighter: 5 },
    });
    const battle = healPulseBattle(crypto.randomUUID());
    await seed(anonId, state, battle);

    const body = await useHealPulse(anonId, battle);
    const maxHp = scaleFamiliarStats(getFamiliar('yellowFighter')!.stats, 5).maxHp;
    const amount = Math.round(maxHp * 0.15);

    expect(maxHp).toBe(174);
    expect(amount).toBe(26);
    expect(body.turnResult.benchHealed).toEqual({
      familiarId: 'yellowFighter',
      name: 'Yellow Fighter',
      amount,
    });
    expect(body.state.dungeon?.partyHp.yellowFighter).toBe(126);

    // Mirrored into the battle log as its own step right after the heal.
    const descriptions = body.turnResult.steps.map((step) => step.result.description);
    const healIndex = descriptions.findIndex((text) => text.includes('Heal Pulse'));
    expect(descriptions[healIndex + 1]).toBe(`Yellow Fighter recovers ${amount} HP`);
  });

  it('caps the bench heal at the bench member max HP', async () => {
    const anonId = crypto.randomUUID();
    const state = makeState(anonId, {
      activeParty: ['aquaSprite', 'yellowFighter'],
      partyHp: { aquaSprite: 50, yellowFighter: 135 },
      levels: { aquaSprite: 1, yellowFighter: 1 },
    });
    const battle = healPulseBattle(crypto.randomUUID());
    await seed(anonId, state, battle);

    const body = await useHealPulse(anonId, battle);
    // 15% of 140 = 21 would overflow; only the missing 5 HP is restored.
    expect(body.turnResult.benchHealed).toEqual({
      familiarId: 'yellowFighter',
      name: 'Yellow Fighter',
      amount: 5,
    });
    expect(body.state.dungeon?.partyHp.yellowFighter).toBe(140);
  });

  it("never revives a KO'd bench member and logs nothing", async () => {
    const anonId = crypto.randomUUID();
    const state = makeState(anonId, {
      activeParty: ['aquaSprite', 'yellowFighter'],
      partyHp: { aquaSprite: 50, yellowFighter: 0 },
      levels: { aquaSprite: 1, yellowFighter: 1 },
    });
    const battle = healPulseBattle(crypto.randomUUID());
    await seed(anonId, state, battle);

    const body = await useHealPulse(anonId, battle);
    expect(body.turnResult.benchHealed).toBeUndefined();
    expect(body.state.dungeon?.partyHp.yellowFighter).toBe(0);
    expect(body.turnResult.steps.some((step) => step.result.description.includes('recovers'))).toBe(false);
  });

  it('does nothing when the party has no bench member', async () => {
    const anonId = crypto.randomUUID();
    const state = makeState(anonId, {
      activeParty: ['aquaSprite'],
      partyHp: { aquaSprite: 50 },
      levels: { aquaSprite: 1 },
    });
    const battle = healPulseBattle(crypto.randomUUID());
    await seed(anonId, state, battle);

    const body = await useHealPulse(anonId, battle);
    expect(body.turnResult.benchHealed).toBeUndefined();
  });
});
