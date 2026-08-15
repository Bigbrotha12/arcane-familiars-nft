import { Hono } from 'hono';
import { cors } from 'hono/cors';
import assetsRouter from './routes/assets';
import balancesRouter from './routes/balances';
import authRouter from './routes/auth';
import collectionRouter from './routes/collection';
import metadataRouter from './routes/metadata';
import gameStateRouter from './routes/game-state';
import gameExplorationRouter from './routes/game-exploration';
import gameBattleRouter from './routes/game-battle';

// Environment bindings from wrangler.jsonc
type Bindings = {
  DB: D1Database;
  ENVIRONMENT: string;
  IMX_API_SANDBOX: string;
  IMX_API_MAINNET: string;
  COLLECTION_CONTRACT_SANDBOX: string;
  COLLECTION_CONTRACT_MAINNET: string;
  INFURA_API_KEY: string;
};

const app = new Hono<{ Bindings: Bindings }>();

// CORS — allow all origins in development, restrict to known frontends in prod
const PROD_ORIGINS = [
  'http://localhost:8080',
  'http://127.0.0.1:8080',
  'http://localhost:3000',
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

export default app;
