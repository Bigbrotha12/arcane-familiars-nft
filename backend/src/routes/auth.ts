import { Hono } from 'hono';
import { verifyAuth } from '../utils/verify';

const authRouter = new Hono<{ Bindings: { DB: D1Database } }>();

authRouter.post('/auth/verify', async (c) => {
  try {
    const { eth_address, eth_timestamp, eth_signature } = await c.req.json();

    if (!eth_address || !eth_timestamp || !eth_signature) {
      return c.json({ verified: false, reason: 'Missing required fields: eth_address, eth_timestamp, eth_signature' }, 400);
    }

    if (!/^0x[a-fA-F0-9]{40}$/.test(eth_address)) {
      return c.json({ verified: false, reason: 'Invalid Ethereum address format' }, 400);
    }

    const result = verifyAuth(eth_address, eth_timestamp, eth_signature);

    if (result.verified) {
      await c.env.DB
        .prepare(
          `INSERT INTO users (eth_address, last_auth_timestamp, last_seen) 
           VALUES (?, ?, datetime('now'))
           ON CONFLICT(eth_address) 
           DO UPDATE SET last_auth_timestamp = excluded.last_auth_timestamp, last_seen = datetime('now')`
        )
        .bind(eth_address.toLowerCase(), eth_timestamp)
        .run();

      return c.json({ verified: true });
    }

    return c.json({ verified: false, reason: result.reason }, 401);
  } catch (error: any) {
    console.error('Auth verification error:', error.message);
    return c.json({ verified: false, reason: 'Internal verification error' }, 500);
  }
});

export default authRouter;
