import type { Bindings } from '../../types';

/**
 * BC2 mint seam: internal minting-provider abstraction.
 *
 * The game/backend never talks to the Immutable Minting API directly. It talks
 * to a `MintingProvider`, which is either:
 *   - `ImmutableMintingProvider` — the real hosted Minting API adapter, used
 *     only when `IMMUTABLE_MINTING_API_KEY` is configured (Worker secret), or
 *   - `DisabledMintingProvider` — the default when no key exists. It rejects
 *     every call so the seam can be exercised without an upstream key.
 *
 * Tests inject `MockMintingProvider` through the router factory so the whole
 * write-ahead / idempotency / status-transition flow is exercised with no
 * network access.
 */

export interface MintRequest {
  referenceId: string;
  ownerAddress: string;
  species: string;
  metadata?: Record<string, unknown>;
}

export interface MintStatusResult {
  status: 'pending' | 'succeeded' | 'failed';
  tokenId?: string;
  error?: string;
}

export interface MintingProvider {
  requestMint(req: MintRequest): Promise<{ providerRef?: string }>;
  getStatus(referenceId: string): Promise<MintStatusResult>;
}

/**
 * Error raised by a provider adapter. `alreadyProcessed` lets the route
 * distinguish a benign idempotent replay (HTTP 409 upstream) from a genuine
 * upstream failure (HTTP 502).
 */
export class MintingProviderError extends Error {
  readonly status?: number;
  readonly alreadyProcessed: boolean;

  constructor(message: string, options: { status?: number; alreadyProcessed?: boolean } = {}) {
    super(message);
    this.name = 'MintingProviderError';
    this.status = options.status;
    this.alreadyProcessed = options.alreadyProcessed ?? false;
  }
}

/**
 * Deterministic, in-process provider for tests. Outcomes are supplied as
 * closures (a "queue/function") and every call is recorded so tests can assert
 * the provider was called exactly once.
 */
export interface MockMintingProviderOptions {
  requestMint?: (req: MintRequest) => Promise<{ providerRef?: string }>;
  getStatus?: (referenceId: string) => Promise<MintStatusResult>;
}

export class MockMintingProvider implements MintingProvider {
  /** Every `requestMint` call, in order — the idempotency call counter. */
  readonly requests: MintRequest[] = [];
  /** Every `getStatus` reference id, in order. */
  readonly statusCalls: string[] = [];

  private readonly requestMintFn: (req: MintRequest) => Promise<{ providerRef?: string }>;
  private readonly getStatusFn: (referenceId: string) => Promise<MintStatusResult>;

  constructor(options: MockMintingProviderOptions = {}) {
    this.requestMintFn = options.requestMint ?? (async () => ({}));
    this.getStatusFn = options.getStatus ?? (async () => ({ status: 'pending' }));
  }

  get requestCount(): number {
    return this.requests.length;
  }

  get statusCallCount(): number {
    return this.statusCalls.length;
  }

  async requestMint(req: MintRequest): Promise<{ providerRef?: string }> {
    this.requests.push(req);
    return this.requestMintFn(req);
  }

  async getStatus(referenceId: string): Promise<MintStatusResult> {
    this.statusCalls.push(referenceId);
    return this.getStatusFn(referenceId);
  }
}

/**
 * Default when no API key exists. `requestMint` rejects with a clear,
 * actionable error; `getStatus` likewise (there is no upstream to poll).
 */
export class DisabledMintingProvider implements MintingProvider {
  private static readonly MESSAGE =
    'Minting is not configured: IMMUTABLE_MINTING_API_KEY is unset (DisabledMintingProvider)';

  async requestMint(_req: MintRequest): Promise<{ providerRef?: string }> {
    throw new MintingProviderError(DisabledMintingProvider.MESSAGE);
  }

  async getStatus(_referenceId: string): Promise<MintStatusResult> {
    throw new MintingProviderError(DisabledMintingProvider.MESSAGE);
  }
}

export interface ImmutableMintingProviderConfig {
  apiBase: string;
  chain: string;
  collection: string;
  apiKey: string;
}

interface ImmutableMintRequestResponse {
  reference_id?: string;
  id?: string;
  [key: string]: unknown;
}

interface ImmutableMintStatusResponse {
  status?: string;
  token_id?: string;
  tokenId?: string;
  error?: string;
  [key: string]: unknown;
}

/**
 * Map an upstream status string onto our 3-state model. Unknown statuses are
 * treated as still-pending rather than fabricating success/failure.
 */
function mapImmutableStatus(raw: string | undefined): MintStatusResult['status'] {
  switch ((raw ?? '').toLowerCase()) {
    case 'succeeded':
    case 'success':
    case 'completed':
    case 'minted':
      return 'succeeded';
    case 'failed':
    case 'rejected':
    case 'error':
      return 'failed';
    default:
      return 'pending';
  }
}

/**
 * Real adapter for the Immutable hosted Minting API.
 *
 *   POST {apiBase}/v1/chains/{chain}/collections/{collection}/nfts/mint-requests
 *        header: x-immutable-api-key
 *        body:   { assets: [{ reference_id, owner_address, metadata }] }
 *   GET  {apiBase}/v1/chains/{chain}/collections/{collection}/nfts/mint-requests/{referenceId}
 *
 * This adapter is written but intentionally not exercised (no key exists); the
 * `MINTING_ENABLED` flag stays false and `createMintingProvider` returns the
 * disabled provider until a key is provisioned.
 */
export class ImmutableMintingProvider implements MintingProvider {
  private readonly apiBase: string;
  private readonly chain: string;
  private readonly collection: string;
  private readonly apiKey: string;

  constructor(config: ImmutableMintingProviderConfig) {
    // Defense in depth: the factory already guards on the key, but the adapter
    // itself must never be constructible without one.
    if (!config.apiKey) {
      throw new MintingProviderError('ImmutableMintingProvider requires an API key');
    }
    this.apiBase = config.apiBase.replace(/\/$/, '');
    this.chain = config.chain;
    this.collection = config.collection;
    this.apiKey = config.apiKey;
  }

  private get mintRequestsUrl(): string {
    return `${this.apiBase}/v1/chains/${this.chain}/collections/${this.collection}/nfts/mint-requests`;
  }

  private headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'x-immutable-api-key': this.apiKey,
    };
  }

  async requestMint(req: MintRequest): Promise<{ providerRef?: string }> {
    const res = await fetch(this.mintRequestsUrl, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        assets: [
          {
            reference_id: req.referenceId,
            owner_address: req.ownerAddress,
            metadata: req.metadata ?? {},
          },
        ],
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (res.status === 409) {
      throw new MintingProviderError('Mint request already processed', { status: 409, alreadyProcessed: true });
    }
    if (!res.ok) {
      throw new MintingProviderError(`Minting request failed (${res.status})`, { status: res.status });
    }

    const data = (await res.json()) as ImmutableMintRequestResponse;
    const providerRef = typeof data.reference_id === 'string' ? data.reference_id : data.id;
    return { providerRef };
  }

  async getStatus(referenceId: string): Promise<MintStatusResult> {
    const url = `${this.mintRequestsUrl}/${encodeURIComponent(referenceId)}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: this.headers(),
      signal: AbortSignal.timeout(10_000),
    });

    // A 404 means the reference id is not indexed yet, not that the mint
    // failed. Treat it as still-pending so clients keep polling.
    if (res.status === 404) {
      return { status: 'pending' };
    }

    if (!res.ok) {
      throw new MintingProviderError(`Mint status request failed (${res.status})`, { status: res.status });
    }

    const data = (await res.json()) as ImmutableMintStatusResponse;
    const status = mapImmutableStatus(data.status);
    const result: MintStatusResult = { status };
    const tokenId = typeof data.token_id === 'string' ? data.token_id : data.tokenId;
    if (typeof tokenId === 'string') result.tokenId = tokenId;
    if (typeof data.error === 'string') result.error = data.error;
    return result;
  }
}

/**
 * Resolve the chain slug / collection contract / API base for the current
 * environment. Sandbox covers development + staging; production uses mainnet.
 */
export function resolveMintingTarget(
  env: Pick<Bindings, 'ENVIRONMENT' | 'COLLECTION_CONTRACT_MAINNET' | 'COLLECTION_CONTRACT_SANDBOX'>
): {
  chain: string;
  collection: string;
} {
  const isProduction = env.ENVIRONMENT === 'production';
  return {
    chain: isProduction ? 'imtbl-zkevm-mainnet' : 'imtbl-zkevm-testnet',
    collection: isProduction ? env.COLLECTION_CONTRACT_MAINNET : env.COLLECTION_CONTRACT_SANDBOX,
  };
}

/**
 * Factory used by the app. Returns the real adapter only when the Worker secret
 * `IMMUTABLE_MINTING_API_KEY` is present; otherwise the disabled provider, so
 * the seam exists in every environment without any upstream key.
 */
export function createMintingProvider(env: Bindings): MintingProvider {
  const apiKey = env.IMMUTABLE_MINTING_API_KEY;
  if (!apiKey) {
    return new DisabledMintingProvider();
  }

  const isProduction = env.ENVIRONMENT === 'production';
  const { chain, collection } = resolveMintingTarget(env);
  return new ImmutableMintingProvider({
    apiKey,
    chain,
    collection,
    apiBase: isProduction ? env.IMX_API_MAINNET : env.IMX_API_SANDBOX,
  });
}
