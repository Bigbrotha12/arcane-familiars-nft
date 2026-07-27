import { Hono } from 'hono';

const metadataRouter = new Hono<{ Bindings: { DB: D1Database } }>();

/**
 * GET /api/metadata/:id
 * Returns a single familiar type's metadata from D1 by familiar_id.
 */
metadataRouter.get('/metadata/:id', async (c) => {
  try {
    const { id } = c.req.param();
    const familiarId = parseInt(id, 10);
    
    if (isNaN(familiarId)) {
      return c.json({ error: 'Invalid familiar ID' }, 400);
    }
    
    const result = await c.env.DB
      .prepare('SELECT * FROM familiars WHERE familiar_id = ?')
      .bind(familiarId)
      .first();
    
    if (!result) {
      return c.json({ error: 'Familiar not found' }, 404);
    }
    
    return c.json(result);
  } catch (error: any) {
    console.error('Metadata query error:', error.message);
    return c.json({ error: 'Failed to fetch metadata' }, 500);
  }
});

export default metadataRouter;
