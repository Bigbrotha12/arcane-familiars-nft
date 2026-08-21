import { Hono } from 'hono';
import { getUserBalances } from '../utils/imx';

const balancesRouter = new Hono<{ Bindings: { ENVIRONMENT: string } }>();

const ETH_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

balancesRouter.get('/v2/balances/:address', async (c) => {
  const { address } = c.req.param();

  if (!ETH_ADDRESS_REGEX.test(address)) {
    return c.json({ error: 'Invalid Ethereum address' }, 400);
  }

  const env = c.env.ENVIRONMENT === 'production' ? 'production' : 'sandbox';

  try {
    const data = await getUserBalances(address, env);
    return c.json(data);
  } catch (error) {
    console.error('IMX balances error:', error);
    return c.json({ error: 'Failed to fetch balances' }, 502);
  }
});

export default balancesRouter;
