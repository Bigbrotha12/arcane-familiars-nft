import { Hono } from 'hono';
import type { Bindings } from '../types';
import { getErrorMessage, readBody } from '../utils/http';

const authRouter = new Hono<{ Bindings: Bindings }>();

// TODO: Blockchain auth layer deferred — signature verification will be added
// when the blockchain integration phase begins. For now, register any valid
// address without claiming wallet ownership (no verified flag).
authRouter.post('/auth/register', async (c) => {
  try {
    const body = await readBody<{ eth_address: string }>(c);
    const ethAddress = body?.eth_address;

    if (!ethAddress) {
      return c.json({ registered: false, reason: 'Missing required field: eth_address' }, 400);
    }

    if (!/^0x[a-fA-F0-9]{40}$/.test(ethAddress)) {
      return c.json({ registered: false, reason: 'Invalid Ethereum address format' }, 400);
    }

    await c.env.DB
      .prepare(
        `INSERT INTO users (eth_address, last_seen) 
         VALUES (?, datetime('now'))
         ON CONFLICT(eth_address) 
         DO UPDATE SET last_seen = datetime('now')`
      )
      .bind(ethAddress.toLowerCase())
      .run();

    return c.json({ registered: true });
  } catch (error: unknown) {
    console.error('Auth error:', getErrorMessage(error));
    return c.json({ registered: false, reason: 'Internal registration error' }, 500);
  }
});

export default authRouter;
