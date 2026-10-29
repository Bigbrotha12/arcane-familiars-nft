import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:workers';
import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { Hono } from 'hono';
import { app } from '../src/index';
import type { Bindings, Variables } from '../src/types';
import gameStateRouter from '../src/routes/game-state';

/**
 * Drives requests through the real `app` exported from `src/index.ts` so the
 * test exercises the actual production wiring (authMiddleware, all mounted
 * routers, CORS, error handlers) against the shared in-memory D1.
 */

/**
 * Builds an env object for a single request. Spreading the pool-provided env
 * keeps the shared in-memory D1 `DB` binding while ENVIRONMENT is overridden
 * per test.
 */
function makeEnv(environment: string): Bindings {
  return { ...(env as unknown as Bindings), ENVIRONMENT: environment };
}

async function fetchApp(request: Request, environment: string): Promise<Response> {
  const ctx = createExecutionContext();
  const response = await app.fetch(request, makeEnv(environment), ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

function anonymousPost(path: string, body?: Record<string, unknown>): Request {
  return new Request(`https://example.com${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? { anonymousId: 'anon-test' }),
  });
}

/**
 * Query the shared in-memory D1 for a game_states row so tests can assert what
 * actually got persisted (and how it was marked) rather than just the response.
 */
async function gameStateRow(
  anonymousId: string
): Promise<{ state_json: string; version: number; is_anonymous: number } | null> {
  return (env as unknown as Bindings).DB.prepare(
    'SELECT state_json, version, is_anonymous FROM game_states WHERE anonymous_id = ?'
  )
    .bind(anonymousId)
    .first<{ state_json: string; version: number; is_anonymous: number }>();
}

describe('anonymous demo mode in production', () => {
  it('allows anonymous /api/game/state/load in production and persists a guest row', async () => {
    const anonId = 'anon-guest-marked';
    const res = await fetchApp(anonymousPost('/api/game/state/load', { anonymousId: anonId }), 'production');

    expect(res.status).toBe(200);
    const body = (await res.json()) as { state: { anonymousId: string; version: number } };
    expect(body.state.anonymousId).toBe(anonId);
    expect(body.state.version).toBe(1);

    // Guest state must be persisted to D1 and marked is_anonymous = 1 so a
    // future cleanup job can purge stale guest rows.
    const row = await gameStateRow(anonId);
    expect(row).not.toBeNull();
    expect(row!.is_anonymous).toBe(1);
    expect(JSON.parse(row!.state_json)).toMatchObject({ anonymousId: anonId, version: 1 });
  });

  it('returns the same persisted state on subsequent loads (guest continuity)', async () => {
    const anonId = 'anon-guest-continuity';

    // First call creates and persists the guest row.
    const res1 = await fetchApp(anonymousPost('/api/game/state/load', { anonymousId: anonId }), 'production');
    expect(res1.status).toBe(200);
    const body1 = (await res1.json()) as { state: { id: string; version: number } };

    // Second call with the same anonymousId loads the persisted row instead
    // of minting a fresh state.
    const res2 = await fetchApp(anonymousPost('/api/game/state/load', { anonymousId: anonId }), 'production');
    expect(res2.status).toBe(200);
    const body2 = (await res2.json()) as { state: { id: string; version: number } };
    expect(body2.state.id).toBe(body1.state.id);
    expect(body2.state.version).toBe(1);

    const row = await gameStateRow(anonId);
    expect(row?.is_anonymous).toBe(1);
  });

  it('keeps /api/health unauthenticated in production', async () => {
    const res = await fetchApp(new Request('https://example.com/api/health'), 'production');

    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; environment: string };
    expect(body.status).toBe('ok');
    expect(body.environment).toBe('production');
  });
});

describe('guest game routes in production', () => {
  it('allows anonymous /api/game/dungeon/enter in production', async () => {
    const res = await fetchApp(
      anonymousPost('/api/game/dungeon/enter', {
        anonymousId: 'anon-dungeon-test',
        areaId: 'verdantMeadow',
      }),
      'production'
    );

    // Route is reachable (not401) for anonymous guests.
    expect(res.status).not.toBe(401);
  });

  it('allows anonymous /api/game/battle/start in production', async () => {
    const res = await fetchApp(
      anonymousPost('/api/game/battle/start', {
        anonymousId: 'anon-battle-test',
        playerFamiliarId: 'whiteDog',
      }),
      'production'
    );

    // Not401 — anonymous demo mode is allowed.
    expect(res.status).not.toBe(401);
  });
});

describe('guest battle routes recreate guest-marked state after a purge', () => {
  /**
   * Regression for MEDIUM 1: the 24h cron purges stale guest game_states rows,
   * but a mid-battle guest can keep their active_battles row until the next
   * cron run. When they fire a battle action/swap/flee, the handler calls
   * getOrCreateGameState to resurrect the row — that CREATE must carry the
   * guest marker (is_anonymous = 1), or the row becomes permanently
   * unpurgeable AND unadoptable (adopt requires is_anonymous = 1).
   *
   * We seed an orphaned battle (battle row, no game_states row — exactly what
   * a purge leaves behind) with a non-active status so the handler creates the
   * state row and then exits 400 before any write; the assertion is on what
   * got persisted, not the response.
   */
  async function seedOrphanedBattle(battleId: string, anonymousId: string): Promise<void> {
    await (env as unknown as Bindings).DB.prepare(
      `INSERT INTO active_battles (battle_id, anonymous_id, battle_json, created_at, updated_at)
         VALUES (?, ?, ?, datetime('now'), datetime('now'))`
    )
      .bind(
        battleId,
        anonymousId,
        JSON.stringify({
          id: battleId,
          playerFamiliar: { uid: 'u-p', familiarData: { id: 'whiteDog' } },
          enemyFamiliar: { uid: 'u-e', familiarData: { id: 'meadowGuardian' } },
          status: 'fled',
          turnCount: 0,
        })
      )
      .run();
  }

  const ENDPOINTS = [
    { path: '/api/game/battle/action', body: { battleId: 'b-pg', action: { type: 'attack' } } },
    { path: '/api/game/battle/swap', body: { battleId: 'b-pg-swap', newFamiliarId: 'yellowFighter' } },
    { path: '/api/game/battle/flee', body: { battleId: 'b-pg-flee' } },
  ];

  it('battle/action, swap and flee all recreate the purged guest row as is_anonymous = 1', async () => {
    for (const ep of ENDPOINTS) {
      const anonId = `anon-purged-${ep.path.split('/').pop()}`;
      await seedOrphanedBattle(ep.body.battleId as string, anonId);

      const res = await fetchApp(anonymousPost(ep.path, { anonymousId: anonId, ...ep.body }), 'production');
      // Non-active status → 400, but only AFTER the handler (re)created the state.
      expect(res.status).toBe(400);

      const row = await gameStateRow(anonId);
      expect(row).not.toBeNull();
      expect(row!.is_anonymous).toBe(1);
    }
  });
});

describe('authenticated game state persistence', () => {
  const AUTH_SUB = 'sub-authed-user';

  /**
   * A minimal app that sets accountKey + isGuest the same way authMiddleware
   * does for a valid Passport token (verifying a real ID token is not possible
   * in the test harness), mounted with the real gameStateRouter so the
   * readBody override and saveManager logic are exercised unchanged.
   */
  function makeAuthedApp(): Hono<{ Bindings: Bindings; Variables: Variables }> {
    const authed = new Hono<{ Bindings: Bindings; Variables: Variables }>();
    authed.use('*', async (c, next) => {
      c.set('accountKey', AUTH_SUB);
      c.set('isGuest', false);
      await next();
    });
    authed.route('/', gameStateRouter);
    return authed;
  }

  async function fetchAuthed(path: string, body: Record<string, unknown>): Promise<Response> {
    const ctx = createExecutionContext();
    const res = await makeAuthedApp().fetch(
      new Request(`https://example.com${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
      makeEnv('production'),
      ctx
    );
    await waitOnExecutionContext(ctx);
    return res;
  }

  it('persists a signed-in row keyed by the verified account key with is_anonymous = 0', async () => {
    // The client-provided anonymousId is forged; readBody must override it
    // with the verified account key from context.
    const res = await fetchAuthed('/game/state/load', { anonymousId: 'spoofed-anonymous-id' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { state: { anonymousId: string } };
    expect(body.state.anonymousId).toBe(AUTH_SUB);

    const row = await gameStateRow(AUTH_SUB);
    expect(row).not.toBeNull();
    expect(row!.is_anonymous).toBe(0);

    // No row may exist under the forged id.
    expect(await gameStateRow('spoofed-anonymous-id')).toBeNull();
  });
});
