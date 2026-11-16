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
  type CharmInstance,
  type DungeonState,
  type GameState,
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
function nextIp(): string {
  ipSuffix += 1;
  return `10.91.${Math.floor(ipSuffix / 200)}.${ipSuffix % 200}`;
}

function post(path: string, body: Record<string, unknown>): Request {
  return new Request(`https://example.com${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'CF-Connecting-IP': nextIp() },
    body: JSON.stringify(body),
  });
}

function charm(uid: string, overrides: Partial<CharmInstance> = {}): CharmInstance {
  return {
    uid,
    baseId: 'emberBand',
    rarity: 'common',
    mods: [{ stat: 'attack', pct: 10 }],
    ...overrides,
  };
}

function makeDungeon(party: string[]): DungeonState {
  const partyHp: Record<string, number> = {};
  const partyMp: Record<string, number> = {};
  for (const id of party) {
    const data = getFamiliar(id)!;
    const stats = scaleFamiliarStats(data.stats, 1);
    partyHp[id] = stats.hp;
    partyMp[id] = stats.mp;
  }

  return {
    areaId: 'verdantMeadow',
    currentRoomId: 'room_1',
    party,
    partyHp,
    partyMp,
    rooms: {
      room_1: {
        id: 'room_1',
        name: 'Test room',
        description: '',
        type: RoomType.Normal,
        exits: [],
        encounterChance: 0,
        treasureChance: 0,
        treasurePool: [],
        cleared: true,
        pendingEncounter: { enemyId: 'yellowFighter', resolved: false, level: 1 },
      },
    },
    seed: 1,
    runLoot: { currency: 0, items: [] },
  };
}

function makeState(
  anonId: string,
  options: {
    party?: string[];
    owned?: string[];
    charms?: CharmInstance[];
    currency?: number;
    dungeon?: DungeonState | null;
  } = {}
): GameState {
  const party = options.party ?? ['whiteDog'];
  return {
    version: 1,
    id: `state-${anonId}`,
    anonymousId: anonId,
    playerFamiliars: options.owned ?? party,
    activeParty: party,
    familiarLevels: {},
    familiarXp: {},
    inventory: { currency: options.currency ?? 0, items: [] },
    charms: options.charms,
    dungeon: options.dungeon === undefined ? makeDungeon(party) : options.dungeon,
    unlockedAreas: ['verdantMeadow'],
    defeatedBosses: [],
    battleCount: 0,
    winCount: 0,
    lastSaved: 0,
  };
}

async function seed(anonId: string, state: GameState): Promise<void> {
  await (env as unknown as Bindings).DB.prepare(
    `INSERT INTO game_states (anonymous_id, state_json, version, updated_at, is_anonymous)
     VALUES (?, ?, 1, datetime('now'), 1)`
  )
    .bind(anonId, JSON.stringify(state))
    .run();
}

async function readState(anonId: string): Promise<GameState> {
  const row = await (env as unknown as Bindings).DB.prepare('SELECT state_json FROM game_states WHERE anonymous_id = ?')
    .bind(anonId)
    .first<{ state_json: string }>();
  return JSON.parse(row!.state_json) as GameState;
}

async function seedActiveBattle(anonId: string): Promise<void> {
  await (env as unknown as Bindings).DB.prepare(
    `INSERT INTO active_battles (battle_id, anonymous_id, battle_json, created_at, updated_at)
     VALUES (?, ?, ?, datetime('now'), datetime('now'))`
  )
    .bind(`battle-${anonId}`, anonId, JSON.stringify({}))
    .run();
}

function combatant(familiarId: string, hp: number, mp: number): BattleFamiliar {
  const data = getFamiliar(familiarId)!;
  return {
    uid: `u-${familiarId}`,
    familiarData: data,
    currentHp: hp,
    currentMp: mp,
    statusEffects: [],
    cooldowns: {},
    isAlly: familiarId === 'yellowFighter',
  };
}

async function seedLosingBattle(anonId: string): Promise<void> {
  const battle: BattleState = {
    id: `battle-loss-${anonId}`,
    roomId: 'room_1',
    playerFamiliar: combatant('yellowFighter', 1, 60),
    enemyFamiliar: combatant('yellowFighter', 999, 60),
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
    .bind(battle.id, anonId, JSON.stringify(battle))
    .run();
}

function scaledAttack(familiarId: string, level = 1): number {
  return scaleFamiliarStats(getFamiliar(familiarId)!.stats, level).attack;
}

describe('charm endpoints', () => {
  it('equips a charm on an owned familiar', async () => {
    const anonId = 'c1a2b3c4-1111-4a2b-8c3d-000000000001';
    await seed(anonId, makeState(anonId, { charms: [charm('c1')] }));

    const res = await fetchApp(
      post('/api/game/charms/equip', { anonymousId: anonId, charmUid: 'c1', familiarId: 'whiteDog' })
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean; charms: CharmInstance[] };
    expect(body.success).toBe(true);
    expect(body.charms.find((entry) => entry.uid === 'c1')?.equippedTo).toBe('whiteDog');
    expect((await readState(anonId)).charms?.[0].equippedTo).toBe('whiteDog');
  });

  it('equipping moves the charm and unequips the familiar’s previous charm', async () => {
    const anonId = 'c1a2b3c4-1111-4a2b-8c3d-000000000002';
    await seed(
      anonId,
      makeState(anonId, {
        owned: ['whiteDog', 'yellowFighter'],
        party: ['whiteDog'],
        charms: [charm('old', { equippedTo: 'whiteDog' }), charm('new')],
      })
    );

    const res = await fetchApp(
      post('/api/game/charms/equip', { anonymousId: anonId, charmUid: 'new', familiarId: 'whiteDog' })
    );
    expect(res.status).toBe(200);

    const state = await readState(anonId);
    expect(state.charms?.find((entry) => entry.uid === 'old')?.equippedTo).toBeUndefined();
    expect(state.charms?.find((entry) => entry.uid === 'new')?.equippedTo).toBe('whiteDog');
  });

  it('moves a charm off its previous familiar', async () => {
    const anonId = 'c1a2b3c4-1111-4a2b-8c3d-000000000003';
    await seed(
      anonId,
      makeState(anonId, {
        owned: ['whiteDog', 'yellowFighter'],
        party: ['whiteDog'],
        charms: [charm('c1', { equippedTo: 'whiteDog' })],
      })
    );

    await fetchApp(
      post('/api/game/charms/equip', { anonymousId: anonId, charmUid: 'c1', familiarId: 'yellowFighter' })
    );
    const state = await readState(anonId);
    expect(state.charms?.[0].equippedTo).toBe('yellowFighter');
  });

  it('unequips with familiarId null', async () => {
    const anonId = 'c1a2b3c4-1111-4a2b-8c3d-000000000004';
    await seed(anonId, makeState(anonId, { charms: [charm('c1', { equippedTo: 'whiteDog' })] }));

    const res = await fetchApp(
      post('/api/game/charms/equip', { anonymousId: anonId, charmUid: 'c1', familiarId: null })
    );
    expect(res.status).toBe(200);
    expect((await readState(anonId)).charms?.[0].equippedTo).toBeUndefined();
  });

  it('rejects an unowned charm or familiar', async () => {
    const anonId = 'c1a2b3c4-1111-4a2b-8c3d-000000000005';
    await seed(anonId, makeState(anonId, { charms: [charm('c1')] }));

    const unownedCharm = await fetchApp(
      post('/api/game/charms/equip', { anonymousId: anonId, charmUid: 'missing', familiarId: 'whiteDog' })
    );
    expect(unownedCharm.status).toBe(400);

    const unownedFamiliar = await fetchApp(
      post('/api/game/charms/equip', { anonymousId: anonId, charmUid: 'c1', familiarId: 'aquaSprite' })
    );
    expect(unownedFamiliar.status).toBe(400);
  });

  it('refuses equip and salvage during an active battle', async () => {
    const anonId = 'c1a2b3c4-1111-4a2b-8c3d-000000000006';
    await seed(anonId, makeState(anonId, { charms: [charm('c1')] }));
    await seedActiveBattle(anonId);

    const equip = await fetchApp(
      post('/api/game/charms/equip', { anonymousId: anonId, charmUid: 'c1', familiarId: 'whiteDog' })
    );
    expect(equip.status).toBe(409);

    const salvage = await fetchApp(post('/api/game/charms/salvage', { anonymousId: anonId, charmUid: 'c1' }));
    expect(salvage.status).toBe(409);
  });

  it('salvages an unequipped charm for coins', async () => {
    const anonId = 'c1a2b3c4-1111-4a2b-8c3d-000000000007';
    await seed(anonId, makeState(anonId, { charms: [charm('c1', { rarity: 'rare' })], currency: 5 }));

    const res = await fetchApp(post('/api/game/charms/salvage', { anonymousId: anonId, charmUid: 'c1' }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean; charms: CharmInstance[]; currency: number };
    expect(body.success).toBe(true);
    expect(body.charms).toEqual([]);
    expect(body.currency).toBe(65);

    const state = await readState(anonId);
    expect(state.charms).toEqual([]);
    expect(state.inventory.currency).toBe(65);
  });

  it('refuses to salvage an equipped charm', async () => {
    const anonId = 'c1a2b3c4-1111-4a2b-8c3d-000000000008';
    await seed(anonId, makeState(anonId, { charms: [charm('c1', { equippedTo: 'whiteDog' })] }));

    const res = await fetchApp(post('/api/game/charms/salvage', { anonymousId: anonId, charmUid: 'c1' }));
    expect(res.status).toBe(400);
    const state = await readState(anonId);
    expect(state.charms).toHaveLength(1);
    expect(state.inventory.currency).toBe(0);
  });

  it('rejects salvaging a charm that is not owned', async () => {
    const anonId = 'c1a2b3c4-1111-4a2b-8c3d-000000000009';
    await seed(anonId, makeState(anonId, { charms: [] }));

    const res = await fetchApp(post('/api/game/charms/salvage', { anonymousId: anonId, charmUid: 'missing' }));
    expect(res.status).toBe(400);
  });
});

describe('charm run lifecycle', () => {
  it('banks run charms when exiting a dungeon', async () => {
    const anonId = 'c1a2b3c4-1111-4a2b-8c3d-00000000000d';
    const state = makeState(anonId, { charms: [] });
    state.dungeon!.runCharms = [charm('run1')];
    await seed(anonId, state);

    const res = await fetchApp(post('/api/game/dungeon/exit', { anonymousId: anonId }));
    expect(res.status).toBe(200);

    const saved = await readState(anonId);
    expect(saved.dungeon).toBeNull();
    expect(saved.charms?.map((entry) => entry.uid)).toEqual(['run1']);
  });

  it('loses run charms on defeat and leaves the collection intact', async () => {
    const anonId = 'c1a2b3c4-1111-4a2b-8c3d-00000000000e';
    const state = makeState(anonId, { party: ['yellowFighter'], charms: [charm('owned')] });
    state.dungeon!.runCharms = [charm('run1')];
    await seed(anonId, state);
    await seedLosingBattle(anonId);

    const res = await fetchApp(
      post('/api/game/battle/action', {
        anonymousId: anonId,
        battleId: `battle-loss-${anonId}`,
        action: { type: ActionType.Attack },
        expectedTurnCount: 0,
      })
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      turnResult: { lostLoot?: { charms?: CharmInstance[] } };
      state: GameState;
    };
    expect(body.turnResult.lostLoot?.charms?.map((entry) => entry.uid)).toEqual(['run1']);
    expect(body.state.charms?.map((entry) => entry.uid)).toEqual(['owned']);
    expect(body.state.dungeon).toBeNull();
  });
});

describe('charms in battle', () => {
  it('applies the equipped charm to the started player combatant', async () => {
    const anonId = 'c1a2b3c4-1111-4a2b-8c3d-00000000000a';
    await seed(anonId, makeState(anonId, { charms: [charm('c1', { equippedTo: 'whiteDog' })] }));

    const res = await fetchApp(post('/api/game/battle/start', { anonymousId: anonId, playerFamiliarId: 'whiteDog' }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { battle: { playerFamiliar: { familiarData: { stats: { attack: number } } } } };
    expect(body.battle.playerFamiliar.familiarData.stats.attack).toBe(Math.round(scaledAttack('whiteDog') * 1.1));
  });

  it('leaves an unequipped familiar’s stats unchanged', async () => {
    const anonId = 'c1a2b3c4-1111-4a2b-8c3d-00000000000b';
    await seed(anonId, makeState(anonId, { charms: [] }));

    const res = await fetchApp(post('/api/game/battle/start', { anonymousId: anonId, playerFamiliarId: 'whiteDog' }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { battle: { playerFamiliar: { familiarData: { stats: { attack: number } } } } };
    expect(body.battle.playerFamiliar.familiarData.stats.attack).toBe(scaledAttack('whiteDog'));
  });

  it('applies the charm again on swap-in', async () => {
    const anonId = 'c1a2b3c4-1111-4a2b-8c3d-00000000000c';
    await seed(
      anonId,
      makeState(anonId, {
        owned: ['whiteDog', 'yellowFighter'],
        party: ['whiteDog', 'yellowFighter'],
        charms: [charm('c1', { equippedTo: 'yellowFighter' })],
      })
    );

    const start = await fetchApp(post('/api/game/battle/start', { anonymousId: anonId, playerFamiliarId: 'whiteDog' }));
    expect(start.status).toBe(200);
    const started = (await start.json()) as { battle: { id: string } };

    const swap = await fetchApp(
      post('/api/game/battle/swap', {
        anonymousId: anonId,
        battleId: started.battle.id,
        newFamiliarId: 'yellowFighter',
        expectedTurnCount: 0,
      })
    );
    expect(swap.status).toBe(200);
    const body = (await swap.json()) as {
      battle: { playerFamiliar: { familiarData: { id: string; stats: { attack: number } } } };
    };
    expect(body.battle.playerFamiliar.familiarData.id).toBe('yellowFighter');
    expect(body.battle.playerFamiliar.familiarData.stats.attack).toBe(Math.round(scaledAttack('yellowFighter') * 1.1));
  });
});
