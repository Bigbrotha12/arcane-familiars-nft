import { Hono } from 'hono';
import type { Bindings } from '../types';
import { getErrorMessage } from '../utils/http';

const collectionRouter = new Hono<{ Bindings: Bindings }>();

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
  } catch (error: unknown) {
    console.error('Collection query error:', getErrorMessage(error));
    return c.json({ error: 'Failed to fetch collection' }, 500);
  }
});

export default collectionRouter;
