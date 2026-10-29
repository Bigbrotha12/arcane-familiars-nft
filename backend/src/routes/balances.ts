import { Hono } from 'hono';
import type { Bindings, Variables } from '../types';
import { getUserBalances, isValidEthAddress, ImxRequestError } from '../utils/imx';
import { getErrorMessage } from '../utils/http';

const balancesRouter = new Hono<{ Bindings: Bindings; Variables: Variables }>();

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
    console.error(`[${c.get('requestId')}] IMX balances error:`, getErrorMessage(error));
    if (error instanceof ImxRequestError && error.status < 500) {
      return c.json({ error: 'Failed to fetch balances' }, error.status as 400 | 404);
    }
    return c.json({ error: 'Failed to fetch balances', requestId: c.get('requestId') }, 502);
  }
});

export default balancesRouter;
