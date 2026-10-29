import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:workers';
import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { scheduled } from '../src/index';
import type { Bindings } from '../src/types';

/**
 * Drives the `scheduled` export (cron cleanup) directly against the shared
 * in-memory D1 to verify the chunked guest-TTL / orphan-battle / expired
 * challenge purges without needing a real Cloudflare cron invocation.
 */

function makeEnv(environment: string): Bindings {
  return { ...(env as unknown as Bindings), ENVIRONMENT: environment };
}

async function rowExists(table: string, column: string, value: string): Promise<boolean> {
  return !!(await env.DB.prepare(`SELECT 1 FROM ${table} WHERE ${column} = ?`).bind(value).first());
}

describe('scheduled cleanup', () => {
  it('purges stale guests, orphaned battles, and expired challenges but keeps fresh/authed rows', async () => {
    const db = env.DB;

    // Stale guest state (older than the 24h TTL).
    await db
      .prepare(
        `INSERT INTO game_states (anonymous_id, state_json, version, updated_at, is_anonymous)
         VALUES ('guest-stale', '{}', 1, datetime('now', '-2 days'), 1)`
      )
      .run();

    // Fresh guest state — must survive.
    await db
      .prepare(
        `INSERT INTO game_states (anonymous_id, state_json, version, updated_at, is_anonymous)
         VALUES ('guest-fresh', '{}', 1, datetime('now'), 1)`
      )
      .run();

    // Old signed-in state (is_anonymous = 0) — must survive the guest TTL purge.
    await db
      .prepare(
        `INSERT INTO game_states (anonymous_id, state_json, version, updated_at, is_anonymous)
         VALUES ('authed-old', '{}', 1, datetime('now', '-5 days'), 0)`
      )
      .run();

    // Battle belonging to the stale guest — orphaned once its state is purged.
    await db
      .prepare(
        `INSERT INTO active_battles (battle_id, anonymous_id, battle_json, created_at, updated_at)
         VALUES ('battle-stale-guest', 'guest-stale', '{}', datetime('now', '-2 days'), datetime('now', '-2 days'))`
      )
      .run();

    // Direct orphan battle — no game_states row at all.
    await db
      .prepare(
        `INSERT INTO active_battles (battle_id, anonymous_id, battle_json, created_at, updated_at)
         VALUES ('battle-orphan', 'ghost-account', '{}', datetime('now'), datetime('now'))`
      )
      .run();

    // Battle for the fresh guest — must survive.
    await db
      .prepare(
        `INSERT INTO active_battles (battle_id, anonymous_id, battle_json, created_at, updated_at)
         VALUES ('battle-fresh', 'guest-fresh', '{}', datetime('now'), datetime('now'))`
      )
      .run();

    // Expired challenge (beyond the 10-min margin) and a fresh one.
    await db
      .prepare(
        `INSERT INTO wallet_challenges (sub, nonce, message, wallet_address, created_at)
         VALUES ('sub-expired', 'nonce-1', 'msg', '0x1', datetime('now', '-11 minutes'))`
      )
      .run();
    await db
      .prepare(
        `INSERT INTO wallet_challenges (sub, nonce, message, wallet_address, created_at)
         VALUES ('sub-fresh', 'nonce-2', 'msg', '0x2', datetime('now'))`
      )
      .run();

    const ctx = createExecutionContext();
    await scheduled(
      { cron: '0 * * * *', scheduledTime: Date.now(), type: 'scheduled' } as ScheduledEvent,
      makeEnv('production'),
      ctx
    );
    await waitOnExecutionContext(ctx);

    // Stale guest state purged; fresh guest and authed states kept.
    expect(await rowExists('game_states', 'anonymous_id', 'guest-stale')).toBe(false);
    expect(await rowExists('game_states', 'anonymous_id', 'guest-fresh')).toBe(true);
    expect(await rowExists('game_states', 'anonymous_id', 'authed-old')).toBe(true);

    // Both orphan battles purged; the fresh guest's battle kept.
    expect(await rowExists('active_battles', 'battle_id', 'battle-stale-guest')).toBe(false);
    expect(await rowExists('active_battles', 'battle_id', 'battle-orphan')).toBe(false);
    expect(await rowExists('active_battles', 'battle_id', 'battle-fresh')).toBe(true);

    // Expired challenge purged; fresh challenge kept.
    expect(await rowExists('wallet_challenges', 'sub', 'sub-expired')).toBe(false);
    expect(await rowExists('wallet_challenges', 'sub', 'sub-fresh')).toBe(true);
  });
});
