import { Hono } from 'hono';
import type { Bindings } from '../types';
import { getUserAssets, ImxRequestError } from '../utils/imx';

const assetsRouter = new Hono<{ Bindings: Bindings }>();

assetsRouter.get('/v1/assets/:address', async (c) => {
  const { address } = c.req.param();

  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return c.json({ error: 'Invalid Ethereum address' }, 400);
  }

  const isProduction = c.env.ENVIRONMENT === 'production';
  const baseUrl = isProduction ? c.env.IMX_API_MAINNET : c.env.IMX_API_SANDBOX;
  const collection = isProduction ? c.env.COLLECTION_CONTRACT_MAINNET : c.env.COLLECTION_CONTRACT_SANDBOX;

  try {
    const data = await getUserAssets(address, collection, baseUrl);
    return c.json(data);
  } catch (error) {
    if (error instanceof ImxRequestError) {
      console.error('IMX assets error:', error);
      return c.json({ error: 'Failed to fetch assets' }, error.status >= 500 ? 502 : (error.status as 400 | 404));
    }
    console.error('IMX assets error:', error);
    return c.json({ error: 'Failed to fetch assets' }, 502);
  }
});

export default assetsRouter;
