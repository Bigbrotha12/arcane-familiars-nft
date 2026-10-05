import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:workers';
import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { Hono } from 'hono';
import type { Bindings, Variables } from '../src/types';
import gameStateRouter from '../src/routes/game-state';
import gameBattleRouter from '../src/routes/game-battle';
import { resolveFieldableFamiliars } from '../src/utils/ownership';
import { RoomType, type DungeonState, type GameState, type Room } from '@arcane-familiars/game-logic';

/**
 * BC4 — on-chain ownership authority.
 *
 * `OWNERSHIP_AUTHORITY` gates whether the on-chain `owned_nfts` cache widens
 * the persisted `playerFamiliars` grants set. The flag defaults off, so the
 * default-path tests here are regression guards for today's behaviour; the
 * flag-on tests prove ownership joins the fieldable set.
 *
 * The real routers are driven through a minimal Hono app that sets `accountKey`
 * directly (verifying a real Passport ID token is not possible in-harness),
 * following the `prod-auth.test.ts` / `owned-familiars.test.ts` pattern.
 */

function makeEnv(ownershipAuthority: 'true' | 'false'): Bindings {
  return {
    ...(env as unknown as Bindings),
    ENVIRONMENT: 'production',
    OWNERSHIP_AUTHORITY: ownershipAuthority,
  };
}

function makeAuthedApp(accountKey: string): Hono<{ Bindings: Bindings; Variables: Variables }> {
  const authed = new Hono<{ Bindings: Bindings; Variables: Variables }>();
  authed.use('*', async (c, next) => {
    c.set('accountKey', accountKey);
    c.set('isGuest', false);
    await next();
  });
  authed.route('/', gameStateRouter);
  authed.route('/', gameBattleRouter);
  return authed;
}

function makeGuestApp(): Hono<{ Bindings: Bindings; Variables: Variables }> {
  const guest = new Hono<{ Bindings: Bindings; Variables: Variables }>();
  guest.route('/', gameStateRouter);
  return guest;
}

function post(path: string, body: Record<string, unknown>): Request {
  return new Request(`https://example.com${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function fetchApp(
  app: Hono<{ Bindings: Bindings; Variables: Variables }>,
  request: Request,
  flag: 'true' | 'false'
): Promise<Response> {
  const ctx = createExecutionContext();
  const res = await app.fetch(request, makeEnv(flag), ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

function makeState(anonId: string, overrides: Partial<GameState> = {}): GameState {
  return {
    version: 1,
    id: `state-${anonId}`,
    anonymousId: anonId,
    playerFamiliars: ['whiteDog', 'yellowFighter', 'aquaSprite'],
    activeParty: ['whiteDog', 'yellowFighter'],
    inventory: { currency: 100, items: [] },
    dungeon: null,
    unlockedAreas: ['verdantMeadow'],
    defeatedBosses: [],
    battleCount: 0,
    winCount: 0,
    lastSaved: 0,
    ...overrides,
  };
}

function makeDungeon(party: string[]): DungeonState {
  const room: Room = {
    id: 'room-1',
    name: 'Room 1',
    description: 'Test room',
    type: RoomType.Normal,
    exits: [],
    encounterChance: 1,
    treasureChance: 0,
    treasurePool: [],
    cleared: true,
    pendingEncounter: { enemyId: 'tideTurtle', resolved: false },
  };
  return {
    areaId: 'verdantMeadow',
    currentRoomId: 'room-1',
    party: [...party],
    partyHp: Object.fromEntries(party.map((id) => [id, 100])),
    partyMp: {},
    rooms: { 'room-1': room },
    seed: 1,
  };
}

async function seedState(anonId: string, state: GameState): Promise<void> {
  const db = (env as unknown as Bindings).DB;
  await db.prepare('DELETE FROM game_states WHERE anonymous_id = ?').bind(anonId).run();
  await db
    .prepare(
      `INSERT INTO game_states (anonymous_id, state_json, version, updated_at, is_anonymous)
         VALUES (?, ?, 1, datetime('now'), 0)`
    )
    .bind(anonId, JSON.stringify(state))
    .run();
}

async function insertOwnedNft(sub: string, tokenId: string, species: string): Promise<void> {
  // Idempotent upsert so re-running a test (or watch mode) cannot trip the
  // (sub, token_id) primary key.
  await (env as unknown as Bindings).DB.prepare(
    `INSERT INTO owned_nfts (sub, token_id, species, owner_address)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(sub, token_id) DO UPDATE SET
       species = excluded.species,
       owner_address = excluded.owner_address`
  )
    .bind(sub, tokenId, species, '0xabc')
    .run();
}

describe('resolveFieldableFamiliars', () => {
  it('flag OFF returns the grants unchanged and needs no database read', async () => {
    const throwingDb = {
      prepare: () => {
        throw new Error('owned_nfts must not be queried when the flag is off');
      },
    } as unknown as D1Database;
    const state = makeState('sub-unit-off');

    const result = await resolveFieldableFamiliars(throwingDb, 'sub-unit-off', state, false);

    expect(result).toEqual(state.playerFamiliars);
  });

  it('flag ON returns the de-duplicated union of grants and owned species', async () => {
    const sub = 'sub-unit-union';
    const db = (env as unknown as Bindings).DB;
    await db.prepare('DELETE FROM owned_nfts WHERE sub = ?').bind(sub).run();
    await insertOwnedNft(sub, 'tok-u1', 'shadowCat');
    // Overlaps a grant: the union must de-duplicate.
    await insertOwnedNft(sub, 'tok-u2', 'whiteDog');
    const state = makeState(sub);

    const result = await resolveFieldableFamiliars(db, sub, state, true);

    expect(result).toEqual(['whiteDog', 'yellowFighter', 'aquaSprite', 'shadowCat']);
  });

  it('flag ON falls back to grants when owned_nfts is unavailable (no throw)', async () => {
    const throwingDb = {
      prepare: () => {
        throw new Error('no such table: owned_nfts');
      },
    } as unknown as D1Database;
    const state = makeState('sub-unit-missing');

    const result = await resolveFieldableFamiliars(throwingDb, 'sub-unit-missing', state, true);

    expect(result).toEqual(state.playerFamiliars);
  });
});

describe("flag OFF (default) keeps today's party behaviour", () => {
  it('rejects a party member that is not a persisted grant', async () => {
    const sub = 'sub-owner-flag-off';
    await seedState(sub, makeState(sub));

    const res = await fetchApp(
      makeAuthedApp(sub),
      post('/game/state/party', { anonymousId: 'spoofed', activeParty: ['whiteDog', 'shadowCat'] }),
      'false'
    );

    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("You don't own familiar: shadowCat");
  });
});

describe('flag ON: on-chain ownership widens the fieldable set', () => {
  it('accepts a species present only in owned_nfts', async () => {
    const sub = 'sub-owner-on-accept';
    await seedState(sub, makeState(sub));
    await insertOwnedNft(sub, 'tok-accept', 'shadowCat');

    const res = await fetchApp(
      makeAuthedApp(sub),
      post('/game/state/party', { anonymousId: 'spoofed', activeParty: ['whiteDog', 'shadowCat'] }),
      'true'
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean; state: GameState };
    expect(body.success).toBe(true);
    expect(body.state.activeParty).toEqual(['whiteDog', 'shadowCat']);
  });

  it('still rejects a species in neither playerFamiliars nor owned_nfts', async () => {
    const sub = 'sub-owner-on-reject';
    await seedState(sub, makeState(sub));
    await insertOwnedNft(sub, 'tok-reject', 'shadowCat');

    const res = await fetchApp(
      makeAuthedApp(sub),
      post('/game/state/party', { anonymousId: 'spoofed', activeParty: ['whiteDog', 'emberling'] }),
      'true'
    );

    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("You don't own familiar: emberling");
  });

  it('guests (no accountKey) get a fieldable set equal to their grants', async () => {
    const anonId = 'anon-owner-guest';
    await seedState(anonId, makeState(anonId));

    // A guest cannot field an on-chain-only species...
    const rejected = await fetchApp(
      makeGuestApp(),
      post('/game/state/party', { anonymousId: anonId, activeParty: ['whiteDog', 'shadowCat'] }),
      'true'
    );
    expect(rejected.status).toBe(400);

    // ...but their persisted grants remain fieldable.
    const accepted = await fetchApp(
      makeGuestApp(),
      post('/game/state/party', { anonymousId: anonId, activeParty: ['whiteDog', 'aquaSprite'] }),
      'true'
    );
    expect(accepted.status).toBe(200);
  });
});

describe('battle start defence in depth', () => {
  it('flag ON rejects a battle lead that is activeParty-only and not fieldable', async () => {
    const sub = 'sub-owner-battle-on';
    await seedState(
      sub,
      makeState(sub, { activeParty: ['whiteDog', 'shadowCat'], dungeon: makeDungeon(['whiteDog', 'shadowCat']) })
    );

    const res = await fetchApp(
      makeAuthedApp(sub),
      post('/game/battle/start', { anonymousId: 'spoofed', playerFamiliarId: 'shadowCat' }),
      'true'
    );

    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe('Familiar is not owned by this account');
  });

  it('flag OFF leaves the same request accepted (zero regression)', async () => {
    const sub = 'sub-owner-battle-off';
    await seedState(
      sub,
      makeState(sub, { activeParty: ['whiteDog', 'shadowCat'], dungeon: makeDungeon(['whiteDog', 'shadowCat']) })
    );

    const res = await fetchApp(
      makeAuthedApp(sub),
      post('/game/battle/start', { anonymousId: 'spoofed', playerFamiliarId: 'shadowCat' }),
      'false'
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { battle: { playerFamiliar: { familiarData: { id: string } } } };
    expect(body.battle.playerFamiliar.familiarData.id).toBe('shadowCat');
  });

  it('flag ON accepts a battle lead owned only on-chain', async () => {
    const sub = 'sub-owner-battle-owned';
    await seedState(
      sub,
      makeState(sub, { activeParty: ['whiteDog', 'shadowCat'], dungeon: makeDungeon(['whiteDog', 'shadowCat']) })
    );
    await insertOwnedNft(sub, 'tok-battle', 'shadowCat');

    const res = await fetchApp(
      makeAuthedApp(sub),
      post('/game/battle/start', { anonymousId: 'spoofed', playerFamiliarId: 'shadowCat' }),
      'true'
    );

    expect(res.status).toBe(200);
  });
});
