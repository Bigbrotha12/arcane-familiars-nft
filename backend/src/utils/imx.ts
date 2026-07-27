import axios from 'axios';

export function createIMXClient(environment: string): ReturnType<typeof axios.create> {
  const baseURL = environment === 'production'
    ? 'https://api.x.immutable.com'
    : 'https://api.sandbox.x.immutable.com';

  return axios.create({
    baseURL,
    timeout: 10000,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function getUserAssets(
  address: string,
  collection: string,
  environment: string
): Promise<any> {
  const client = createIMXClient(environment);
  const { data } = await client.get('/v1/assets', {
    params: {
      user: address,
      collection,
      page_size: 200,
      order_by: 'updated_at',
      direction: 'desc',
    },
  });
  return data;
}

export async function getUserBalances(
  address: string,
  environment: string
): Promise<any> {
  const client = createIMXClient(environment);
  const { data } = await client.get(`/v2/balances/${address}`);
  return data;
}
