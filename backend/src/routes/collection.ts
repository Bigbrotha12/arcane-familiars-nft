import { Hono } from 'hono';
import type { Bindings, Variables } from '../types';
import { internalError } from '../utils/http';

const collectionRouter = new Hono<{ Bindings: Bindings; Variables: Variables }>();

/**
 * GET /api/collection
 * Returns the full catalog of familiar types from D1.
 * Ordered by familiar_id ascending.
 */
collectionRouter.get('/collection', async (c) => {
  try {
    const { results } = await c.env.DB.prepare('SELECT * FROM familiars ORDER BY familiar_id ASC').all();

    return c.json(results);
  } catch (error: unknown) {
    return internalError(c, error, 'Collection query');
  }
});

export default collectionRouter;
