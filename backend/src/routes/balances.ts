import { Hono } from 'hono';
import { getUserBalances } from '../utils/imx';

const balancesRouter = new Hono<{ Bindings: { ENVIRONMENT: string } }>();

balancesRouter.get('/v2/balances/:address', async (c) => {
  const { address } = c.req.param();
  const env = c.env.ENVIRONMENT === 'production' ? 'production' : 'sandbox';

  try {
    const data = await getUserBalances(address, env);
    return c.json(data);
  } catch (error: any) {
    console.error('IMX balances error:', error?.response?.data || error.message);
    return c.json(
      { error: 'Failed to fetch balances', details: error?.response?.data || error.message },
      error?.response?.status || 502
    );
  }
});

export default balancesRouter;
