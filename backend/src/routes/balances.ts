import { Hono } from 'hono';
import type { Bindings } from '../types';
import { getUserBalances, ImxRequestError } from '../utils/imx';

const balancesRouter = new Hono<{ Bindings: Bindings }>();

const ETH_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

balancesRouter.get('/v2/balances/:address', async (c) => {
  const { address } = c.req.param();

  if (!ETH_ADDRESS_REGEX.test(address)) {
    return c.json({ error: 'Invalid Ethereum address' }, 400);
  }

  const baseUrl = c.env.ENVIRONMENT === 'production' ? c.env.IMX_API_MAINNET : c.env.IMX_API_SANDBOX;

  try {
    const data = await getUserBalances(address, baseUrl);
    return c.json(data);
  } catch (error) {
    if (error instanceof ImxRequestError) {
      console.error('IMX balances error:', error);
      return c.json({ error: 'Failed to fetch balances' }, error.status >= 500 ? 502 : (error.status as 400 | 404));
    }
    console.error('IMX balances error:', error);
    return c.json({ error: 'Failed to fetch balances' }, 502);
  }
});

export default balancesRouter;
