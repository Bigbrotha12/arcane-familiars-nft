import { Hono } from 'hono';
import type { Bindings } from '../types';

const authRouter = new Hono<{ Bindings: Bindings }>();

// TODO: Blockchain auth layer deferred — signature verification will be added
// when the blockchain integration phase begins. For now, accept any valid address.
authRouter.post('/auth/verify', async (c) => {
  try {
    const { eth_address } = await c.req.json();

    if (!eth_address) {
      return c.json({ verified: false, reason: 'Missing required field: eth_address' }, 400);
    }

    if (!/^0x[a-fA-F0-9]{40}$/.test(eth_address)) {
      return c.json({ verified: false, reason: 'Invalid Ethereum address format' }, 400);
    }

    await c.env.DB
      .prepare(
        `INSERT INTO users (eth_address, last_seen) 
         VALUES (?, datetime('now'))
         ON CONFLICT(eth_address) 
         DO UPDATE SET last_seen = datetime('now')`
      )
      .bind(eth_address.toLowerCase())
      .run();

    return c.json({ verified: true });
  } catch (error: any) {
    console.error('Auth error:', error.message);
    return c.json({ verified: false, reason: 'Internal verification error' }, 500);
  }
});

export default authRouter;
