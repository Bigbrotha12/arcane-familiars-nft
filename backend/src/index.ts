import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Bindings, Variables } from './types';
import { authMiddleware } from './middleware/auth';
import { cleanupRateLimits, rateLimitMiddleware } from './middleware/rateLimit';
import assetsRouter from './routes/assets';
import balancesRouter from './routes/balances';
import authRouter, { CHALLENGE_TTL_SECONDS } from './routes/auth';
import collectionRouter from './routes/collection';
import metadataRouter from './routes/metadata';
import gameStateRouter from './routes/game-state';
import gameExplorationRouter from './routes/game-exploration';
import gameBattleRouter from './routes/game-battle';
import ownedFamiliarsRouter from './routes/game-owned-familiars';

export const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// CORS — allow all origins in development; restrict to known frontends in prod.
const PROD_ORIGINS = [
  'https://arcane-familiars.pages.dev',
  'https://arcane-familiars-staging.pages.dev',
];

app.use('/api/*', cors({
  origin: (origin, c) => {
    if (c.env.ENVIRONMENT === 'development') return origin || '*';
    if (origin && PROD_ORIGINS.includes(origin)) return origin;
    return null;
  },
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
}));

// Rate-limit ALL /api/* traffic (guests and authenticated users) BEFORE the
// auth middleware, so the limiter cannot be bypassed and abuse of any
// endpoint (e.g. UUID spam minting junk D1 rows) is capped. It runs first, so
// `accountKey` is not yet set here — the counter key is the client IP only.
app.use('/api/*', rateLimitMiddleware);

// Auth guard: only /api/game/* is gated. Health and auth/collection/metadata
// endpoints stay unauthenticated.
app.use('/api/game/*', authMiddleware);

// Health check
app.get('/api/health', (c) => {
  return c.json({
    status: 'ok',
    environment: c.env.ENVIRONMENT,
    timestamp: Date.now(),
  });
});

// Routes
app.route('/api', assetsRouter);
app.route('/api', balancesRouter);
app.route('/api', authRouter);

app.route('/api', collectionRouter);
app.route('/api', metadataRouter);

// Game routes
app.route('/api', gameStateRouter);
app.route('/api', gameExplorationRouter);
app.route('/api', gameBattleRouter);
app.route('/api', ownedFamiliarsRouter);

// 404 handler
app.notFound((c) => {
  return c.json({ error: 'Not found' }, 404);
});

// Error handler
app.onError((err, c) => {
  console.error('Unhandled error:', err);
  return c.json({ error: 'Internal server error' }, 500);
});

const CLEANUP_CHUNK_SIZE = 500;
const MAX_CLEANUP_ROUNDS = 20;

// Scheduled cleanup (cron trigger): purge stale guest saves, orphaned battles,
// and expired wallet challenges so the tables don't grow without bound.
export async function scheduled(event: ScheduledEvent, env: Bindings, ctx: ExecutionContext): Promise<void> {
  const summary: Record<string, number> = {};

  // 1. Stale guest game states (24h TTL). SQLite has no DELETE ... LIMIT, so
  //    delete in bounded chunks via rowid until a chunk comes back short.
  try {
    let deleted = 0;
    for (let round = 0; round < MAX_CLEANUP_ROUNDS; round++) {
      const res = await env.DB
        .prepare(
          `DELETE FROM game_states WHERE rowid IN (
             SELECT rowid FROM game_states
             WHERE is_anonymous = 1 AND updated_at < datetime('now', '-1 day')
             LIMIT ?
           )`
        )
        .bind(CLEANUP_CHUNK_SIZE)
        .run();
      deleted += res.meta.changes ?? 0;
      if ((res.meta.changes ?? 0) < CLEANUP_CHUNK_SIZE) break;
    }
    summary.staleGameStates = deleted;
  } catch (err) {
    console.error('scheduled: stale guest game_states cleanup failed', err);
  }

  // 2. Orphaned active battles — no matching game_states row (also catches
  //    battles left behind when stale guest states above are purged). Chunked
  //    too so a single query never scans the whole table.
  try {
    let deleted = 0;
    for (let round = 0; round < MAX_CLEANUP_ROUNDS; round++) {
      const res = await env.DB
        .prepare(
          `DELETE FROM active_battles WHERE battle_id IN (
             SELECT battle_id FROM active_battles
             WHERE anonymous_id NOT IN (SELECT anonymous_id FROM game_states)
             LIMIT ?
           )`
        )
        .bind(CLEANUP_CHUNK_SIZE)
        .run();
      deleted += res.meta.changes ?? 0;
      if ((res.meta.changes ?? 0) < CLEANUP_CHUNK_SIZE) break;
    }
    summary.orphanedBattles = deleted;
  } catch (err) {
    console.error('scheduled: orphaned active_battles cleanup failed', err);
  }

  // 3. Expired wallet challenges. Nonces are one-time with a short TTL; the
  //    cleanup margin below keeps a challenge valid for its full TTL even if
  //    the cron fires late. The cutoff is derived from CHALLENGE_TTL_SECONDS
  //    so a TTL change can never silently shrink the margin.
  try {
    const challengeCutoffSeconds = CHALLENGE_TTL_SECONDS + 300;
    const res = await env.DB
      .prepare(`DELETE FROM wallet_challenges WHERE created_at < datetime('now', ?)`)
      .bind(`-${challengeCutoffSeconds} seconds`)
      .run();
    summary.expiredChallenges = res.meta.changes ?? 0;
  } catch (err) {
    console.error('scheduled: expired wallet_challenges cleanup failed', err);
  }

  // 4. Expired rate-limit counters. One row per active client IP, so a single
  //    DELETE suffices. Keeps the table from growing without bound.
  try {
    summary.rateLimitRows = await cleanupRateLimits(env.DB);
  } catch (err) {
    console.error('scheduled: rate_limits cleanup failed', err);
  }

  // Legacy: dungeon_runs is no longer written by the app, but keep purging old
  // rows so the table doesn't grow if it ever gets populated again.
  try {
    const finished = await env.DB
      .prepare(`DELETE FROM dungeon_runs WHERE ended_at IS NOT NULL AND ended_at < datetime('now', '-7 day')`)
      .run();
    const stale = await env.DB
      .prepare(`DELETE FROM dungeon_runs WHERE ended_at IS NULL AND started_at < datetime('now', '-7 day')`)
      .run();
    summary.dungeonRuns = (finished.meta.changes ?? 0) + (stale.meta.changes ?? 0);
  } catch (err) {
    console.error('scheduled: dungeon_runs cleanup failed', err);
  }

  console.log('scheduled cleanup complete', summary);
}

export default {
  fetch: app.fetch,
  scheduled,
};
