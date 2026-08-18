import { getErrorMessage } from './http';

export interface IMXClientBindings {
  IMX_API_SANDBOX: string;
  IMX_API_MAINNET: string;
}

export interface IMXAsset {
  id?: string;
  token_id?: string;
  name?: string;
  image_url?: string;
  status?: string;
  [key: string]: unknown;
}

export interface IMXAssetsResponse {
  result: IMXAsset[];
  cursor?: string;
}

export function isValidEthAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

function getIMXBaseURL(environment: string, bindings: IMXClientBindings): string {
  return environment === 'production' ? bindings.IMX_API_MAINNET : bindings.IMX_API_SANDBOX;
}

async function imxFetch<T>(baseURL: string, path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(path, baseURL);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const res = await fetch(url.toString(), {
    headers: { 'Content-Type': 'application/json' },
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`IMX request failed (${res.status}): ${detail}`);
  }

  return res.json() as Promise<T>;
}

/**
 * Fetch all assets across pages using the cursor returned by the IMX API.
 */
export async function getUserAssets(
  address: string,
  collection: string,
  environment: string,
  bindings: IMXClientBindings,
): Promise<IMXAssetsResponse> {
  const baseURL = getIMXBaseURL(environment, bindings);
  const result: IMXAsset[] = [];
  let cursor: string | undefined;

  for (let page = 0; page < 10; page++) {
    const params: Record<string, string> = {
      user: address,
      collection,
      page_size: '200',
      order_by: 'updated_at',
      direction: 'desc',
    };
    if (cursor) {
      params.cursor = cursor;
    }

    const data = await imxFetch<IMXAssetsResponse>(baseURL, '/v1/assets', params);
    if (Array.isArray(data.result)) {
      result.push(...data.result);
    }

    cursor = data.cursor;
    if (!cursor) break;
  }

  return { result };
}

export async function getUserBalances(
  address: string,
  environment: string,
  bindings: IMXClientBindings,
): Promise<unknown> {
  const baseURL = getIMXBaseURL(environment, bindings);
  return imxFetch<unknown>(baseURL, `/v2/balances/${address}`, {});
}

export { getErrorMessage };