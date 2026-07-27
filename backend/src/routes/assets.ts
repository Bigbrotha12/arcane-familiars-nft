import { Hono } from 'hono';
import { getUserAssets } from '../utils/imx';

const assetsRouter = new Hono<{ Bindings: { IMX_API_SANDBOX: string; IMX_API_MAINNET: string; COLLECTION_CONTRACT_SANDBOX: string; COLLECTION_CONTRACT_MAINNET: string; ENVIRONMENT: string } }>();

assetsRouter.get('/v1/assets/:address', async (c) => {
  const { address } = c.req.param();
  const env = c.env.ENVIRONMENT === 'production' ? 'production' : 'sandbox';
  const collectionKey = env === 'production' ? 'COLLECTION_CONTRACT_MAINNET' : 'COLLECTION_CONTRACT_SANDBOX';
  const collection = c.env[collectionKey as keyof typeof c.env] as string;

  try {
    const data = await getUserAssets(address, collection, env);
    return c.json(data);
  } catch (error: any) {
    console.error('IMX assets error:', error?.response?.data || error.message);
    return c.json(
      { error: 'Failed to fetch assets', details: error?.response?.data || error.message },
      error?.response?.status || 502
    );
  }
});

export default assetsRouter;
