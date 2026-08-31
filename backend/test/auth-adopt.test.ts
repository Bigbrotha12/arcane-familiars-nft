import { describe, it, expect, vi } from 'vitest';
import { env } from 'cloudflare:workers';
import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import type { Bindings } from '../src/types';
// The `?auth-adopt-test` query forces a fresh module graph in the test bundle.
// Without it, the import resolves to the main Worker's pre-bundled module, where
// Vitest mocks are not applied (observed empirically — see scratch tests during
// development). The fresh graph is still the real router; only `verifyIdToken`
// is stubbed.
import authRouter from '../src/routes/auth.ts?auth-adopt-test';

/**
 * Focused tests for POST /auth/adopt.
 *
 * Verifying a real Passport ID token against Immutable's remote JWKS is not
 * possible in the test harness (same constraint as prod-auth.test.ts). We stub
 * `verifyIdToken` (keeping a real `readBearerToken`) so the route's auth gate is
 * exercised deterministically: a fixed token maps to a fixed `sub`, anything
 * else is rejected. The route logic and the shared in-memory D1 (migrations
 * applied by apply-migrations.ts) run unchanged.
 */

vi.mock('../src/utils/auth', () => ({
  readBearerToken: (c: { req: { header: (name: string) => string | undefined } }) => {
    const header = c.req.header('Authorization');
    if (!header || !header.startsWith('Bearer ')) return null;
    return header.slice('Bearer '.length).trim();
  },
  verifyIdToken: vi.fn(async (token: string) => {
    if (token === 'adopt-valid-token') return { sub: 'sub-adopt-new' };
    if (token === 'adopt-existing-token') return { sub: 'sub-adopt-existing' };
    return null;
  }),
}));

function makeEnv(): Bindings {
  return { ...(env as unknown as Bindings), ENVIRONMENT: 'production' };
}

async function fetchAdopt(token: string | null, body: unknown): Promise<Response> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (token) headers['authorization'] = `Bearer ${token}`;
  const ctx = createExecutionContext();
  const res = await authRouter.fetch(
    new Request('https://example.com/auth/adopt', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    }),
    makeEnv(),
    ctx
  );
  await waitOnExecutionContext(ctx);
  return res;
}

// ---- D1 seed / assert helpers (shared in-memory DB, migrations applied) ----

async function seedGameState(anonymousId: string, isAnonymous: boolean): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO game_states (anonymous_id, state_json, version, updated_at, is_anonymous)
       VALUES (?, ?, 1, datetime('now'), ?)`
  )
    .bind(anonymousId, JSON.stringify({ version: 1, anonymousId }), isAnonymous ? 1 : 0)
    .run();
}

async function seedBattle(battleId: string, anonymousId: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO active_battles (battle_id, anonymous_id, battle_json, created_at, updated_at)
       VALUES (?, ?, ?, datetime('now'), datetime('now'))`
  )
    .bind(battleId, anonymousId, JSON.stringify({ battleId }))
    .run();
}

async function seedDungeonRun(runId: string, anonymousId: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO dungeon_runs (id, anonymous_id, area_id, started_at)
       VALUES (?, ?, ?, datetime('now'))`
  )
    .bind(runId, anonymousId, 'verdantMeadow')
    .run();
}

interface GameStateRow {
  anonymous_id: string;
  state_json: string;
  version: number;
  is_anonymous: number;
}

async function gameStateRow(anonymousId: string): Promise<GameStateRow | null> {
  return env.DB.prepare(
    'SELECT anonymous_id, state_json, version, is_anonymous FROM game_states WHERE anonymous_id = ?'
  )
    .bind(anonymousId)
    .first<GameStateRow>();
}

async function battleRow(battleId: string): Promise<{ anonymous_id: string } | null> {
  return env.DB.prepare('SELECT anonymous_id FROM active_battles WHERE battle_id = ?')
    .bind(battleId)
    .first<{ anonymous_id: string }>();
}

async function dungeonRunRow(runId: string): Promise<{ anonymous_id: string } | null> {
  return env.DB.prepare('SELECT anonymous_id FROM dungeon_runs WHERE id = ?')
    .bind(runId)
    .first<{ anonymous_id: string }>();
}

describe('POST /auth/adopt auth + validation', () => {
  it('rejects a request without a Bearer token', async () => {
    const res = await fetchAdopt(null, { anonymousId: 'adopt-missing-token' });
    expect(res.status).toBe(401);
  });

  it('rejects a request with an invalid token', async () => {
    const res = await fetchAdopt('not-a-real-token', { anonymousId: 'adopt-bad-token' });
    expect(res.status).toBe(401);
  });

  it('rejects a missing anonymousId', async () => {
    const res = await fetchAdopt('adopt-valid-token', {});
    expect(res.status).toBe(400);
  });

  it('rejects an empty anonymousId', async () => {
    const res = await fetchAdopt('adopt-valid-token', { anonymousId: '' });
    expect(res.status).toBe(400);
  });
});

describe('POST /auth/adopt guest migration', () => {
  it('adopts a new guest game, moving the save, battle and dungeon run to the sub', async () => {
    const guestId = 'adopt-guest-new';
    const sub = 'sub-adopt-new';
    await seedGameState(guestId, true);
    await seedBattle('adopt-battle-new', guestId);
    await seedDungeonRun('adopt-run-new', guestId);

    const res = await fetchAdopt('adopt-valid-token', { anonymousId: guestId });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { adopted: boolean; sub?: string };
    expect(body).toEqual({ adopted: true, sub });

    // Save moved to the account key and un-marked as guest.
    const adoptedRow = await gameStateRow(sub);
    expect(adoptedRow).not.toBeNull();
    expect(adoptedRow!.anonymous_id).toBe(sub);
    expect(adoptedRow!.is_anonymous).toBe(0);

    // No guest row remains under the old UUID.
    expect(await gameStateRow(guestId)).toBeNull();

    // In-progress battle and dungeon run followed the save.
    expect((await battleRow('adopt-battle-new'))?.anonymous_id).toBe(sub);
    expect((await dungeonRunRow('adopt-run-new'))?.anonymous_id).toBe(sub);
  });

  it('does NOT overwrite an existing account save and leaves the guest row untouched', async () => {
    const guestId = 'adopt-guest-existing';
    const sub = 'sub-adopt-existing';
    await seedGameState(guestId, true);
    await seedGameState(sub, false);

    const res = await fetchAdopt('adopt-existing-token', { anonymousId: guestId });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { adopted: boolean; reason?: string };
    expect(body).toEqual({ adopted: false, reason: 'existing-account' });

    // Guest row untouched: still keyed by guest UUID and still marked guest.
    const guestRow = await gameStateRow(guestId);
    expect(guestRow).not.toBeNull();
    expect(guestRow!.anonymous_id).toBe(guestId);
    expect(guestRow!.is_anonymous).toBe(1);

    // Account save untouched.
    const accountRow = await gameStateRow(sub);
    expect(accountRow).not.toBeNull();
    expect(accountRow!.anonymous_id).toBe(sub);
    expect(accountRow!.is_anonymous).toBe(0);
    expect(JSON.parse(accountRow!.state_json)).toMatchObject({ anonymousId: sub });
  });

  it('returns no-guest when no guest save exists (idempotent)', async () => {
    const res = await fetchAdopt('adopt-valid-token', { anonymousId: 'adopt-guest-missing' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { adopted: boolean; reason?: string };
    expect(body).toEqual({ adopted: false, reason: 'no-guest' });
  });

  it('treats a guest UUID equal to the account key as no-guest (non-destructive)', async () => {
    const sub = 'sub-adopt-new';
    // The sub already owns a save from the first test; ensure it is untouched.
    const before = await gameStateRow(sub);
    const res = await fetchAdopt('adopt-valid-token', { anonymousId: sub });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { adopted: boolean; reason?: string };
    expect(body).toEqual({ adopted: false, reason: 'no-guest' });
    const after = await gameStateRow(sub);
    expect(after?.is_anonymous).toBe(before?.is_anonymous);
    expect(after?.state_json).toBe(before?.state_json);
  });

  it("never adopts another authenticated player's save (is_anonymous = 0)", async () => {
    // A row that exists but is NOT guest-marked must not be adoptable even if
    // the caller knows the id.
    await seedGameState('adopt-authed-row', false);
    const res = await fetchAdopt('adopt-valid-token', { anonymousId: 'adopt-authed-row' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { adopted: boolean; reason?: string };
    expect(body).toEqual({ adopted: false, reason: 'no-guest' });
    expect((await gameStateRow('adopt-authed-row'))?.anonymous_id).toBe('adopt-authed-row');
  });

  it('returns no-guest and does NOT migrate battles/runs when the guest row was purged (cron race)', async () => {
    // Simulate the 24h cron purge: the guest's game_states row is gone, but
    // its active_battles / dungeon_runs rows are still present (the cron
    // purges orphaned battles on a later pass). Adopting must be a no-op that
    // never migrates those rows to the account key.
    const guestId = 'adopt-purged-guest';
    await seedBattle('adopt-purged-battle', guestId);
    await seedDungeonRun('adopt-purged-run', guestId);
    // No seedGameState(guestId) — the row does not exist.

    const res = await fetchAdopt('adopt-valid-token', { anonymousId: guestId });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { adopted: boolean; reason?: string };
    expect(body).toEqual({ adopted: false, reason: 'no-guest' });

    // Neither the battle nor the dungeon run followed a non-existent save.
    expect((await battleRow('adopt-purged-battle'))?.anonymous_id).toBe(guestId);
    expect((await dungeonRunRow('adopt-purged-run'))?.anonymous_id).toBe(guestId);
  });
});
