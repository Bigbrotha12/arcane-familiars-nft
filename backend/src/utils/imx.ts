export async function getUserAssets(
  address: string,
  collection: string,
  baseUrl: string,
): Promise<unknown> {
  const url = new URL('/v1/assets', baseUrl);
  url.searchParams.set('user', address);
  url.searchParams.set('collection', collection);
  url.searchParams.set('page_size', '200');
  url.searchParams.set('order_by', 'updated_at');
  url.searchParams.set('direction', 'desc');

  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    throw new ImxRequestError(`IMX assets request failed`, res.status);
  }
  return res.json();
}

export async function getUserBalances(
  address: string,
  baseUrl: string,
): Promise<unknown> {
  const url = new URL(`/v2/balances/${address}`, baseUrl);

  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    throw new ImxRequestError(`IMX balances request failed`, res.status);
  }
  return res.json();
}

export class ImxRequestError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ImxRequestError';
    this.status = status;
  }
}
