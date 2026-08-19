import { Hono } from 'hono';
import type { Bindings } from '../types';
import { getUserBalances, isValidEthAddress } from '../utils/imx';
import { getErrorMessage } from '../utils/http';

const balancesRouter = new Hono<{ Bindings: Bindings }>();

balancesRouter.get('/v2/balances/:address', async (c) => {
  const { address } = c.req.param();

  if (!isValidEthAddress(address)) {
    return c.json({ error: 'Invalid Ethereum address format' }, 400);
  }

  const env = c.env.ENVIRONMENT === 'production' ? 'production' : 'sandbox';

  try {
    const data = await getUserBalances(address.toLowerCase(), env, c.env);
    return c.json(data);
  } catch (error: unknown) {
    console.error('IMX balances error:', getErrorMessage(error));
    return c.json({ error: 'Failed to fetch balances' }, 502);
  }
});

export default balancesRouter;