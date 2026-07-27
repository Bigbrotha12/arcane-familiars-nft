import { Hono } from 'hono';

const collectionRouter = new Hono<{ Bindings: { DB: D1Database } }>();

/**
 * GET /api/collection
 * Returns the full catalog of familiar types from D1.
 * Ordered by familiar_id ascending.
 */
collectionRouter.get('/collection', async (c) => {
  try {
    const { results } = await c.env.DB
      .prepare('SELECT * FROM familiars ORDER BY familiar_id ASC')
      .all();
    
    return c.json(results);
  } catch (error: any) {
    console.error('Collection query error:', error.message);
    return c.json({ error: 'Failed to fetch collection' }, 500);
  }
});

export default collectionRouter;
