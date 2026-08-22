import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Bindings } from './types';
import assetsRouter from './routes/assets';
import balancesRouter from './routes/balances';
import authRouter from './routes/auth';
import collectionRouter from './routes/collection';
import metadataRouter from './routes/metadata';
import gameStateRouter from './routes/game-state';
import gameExplorationRouter from './routes/game-exploration';
import gameBattleRouter from './routes/game-battle';

const app = new Hono<{ Bindings: Bindings }>();

// CORS — allow all origins in development; restrict to known frontends in prod.
const PROD_ORIGINS = [
  'https://arcane-familiars.pages.dev',
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

// 404 handler
app.notFound((c) => {
  return c.json({ error: 'Not found' }, 404);
});

// Error handler
app.onError((err, c) => {
  console.error('Unhandled error:', err);
  return c.json({ error: 'Internal server error' }, 500);
});

// Scheduled cleanup: purge abandoned battles and finished dungeon runs so the
// tables don't grow without bound.
async function scheduled(event: ScheduledEvent, env: Bindings, ctx: ExecutionContext): Promise<void> {
  ctx.waitUntil((async () => {
    await env.DB
      .prepare(`DELETE FROM active_battles WHERE created_at < datetime('now', '-1 day')`)
      .run();
    await env.DB
      .prepare(`DELETE FROM dungeon_runs WHERE ended_at IS NOT NULL AND ended_at < datetime('now', '-7 day')`)
      .run();
    await env.DB
      .prepare(`DELETE FROM dungeon_runs WHERE ended_at IS NULL AND started_at < datetime('now', '-7 day')`)
      .run();
  })());
}

export default {
  fetch: app.fetch,
  scheduled,
};
