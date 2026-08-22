import { Hono } from 'hono';
import type { Bindings } from '../types';
import { getUserAssets, isValidEthAddress, ImxRequestError } from '../utils/imx';
import { getErrorMessage } from '../utils/http';

const assetsRouter = new Hono<{ Bindings: Bindings }>();

assetsRouter.get('/v1/assets/:address', async (c) => {
  const { address } = c.req.param();

  if (!isValidEthAddress(address)) {
    return c.json({ error: 'Invalid Ethereum address format' }, 400);
  }

  const env = c.env.ENVIRONMENT === 'production' ? 'production' : 'sandbox';
  const collection = env === 'production'
    ? c.env.COLLECTION_CONTRACT_MAINNET
    : c.env.COLLECTION_CONTRACT_SANDBOX;

  try {
    const data = await getUserAssets(address.toLowerCase(), collection, env, c.env);
    return c.json(data);
  } catch (error: unknown) {
    console.error('IMX assets error:', getErrorMessage(error));
    if (error instanceof ImxRequestError && error.status < 500) {
      return c.json({ error: 'Failed to fetch assets' }, error.status as 400 | 404);
    }
    return c.json({ error: 'Failed to fetch assets' }, 502);
  }
});

export default assetsRouter;