import { describe, it, expect, vi, afterEach } from 'vitest';
import { ImmutableMintingProvider } from '../src/services/minting/provider';

/**
 * Unit tests for the real `ImmutableMintingProvider` adapter. `fetch` is stubbed
 * so the mapping logic (metadata payload, 409 already-processed, 404
 * not-yet-indexed) is exercised without any network.
 */

const CONFIG = {
  apiBase: 'https://api.example.com/',
  chain: 'imtbl-zkevm-testnet',
  collection: '0xcollection',
  apiKey: 'test-key',
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ImmutableMintingProvider.requestMint', () => {
  it('sends the provider-agnostic metadata in the asset payload', async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init: RequestInit) => new Response(JSON.stringify({ reference_id: 'ref' }), { status: 200 })
    );
    vi.stubGlobal('fetch', fetchMock);

    const metadata = {
      name: 'White Dog',
      attributes: [{ trait_type: 'species', value: 'whiteDog' }],
    };
    const provider = new ImmutableMintingProvider(CONFIG);
    await provider.requestMint({ referenceId: 'ref', ownerAddress: '0xowner', species: 'whiteDog', metadata });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${CONFIG.apiBase}v1/chains/imtbl-zkevm-testnet/collections/0xcollection/nfts/mint-requests`);
    expect(JSON.parse(init.body as string)).toEqual({
      assets: [{ reference_id: 'ref', owner_address: '0xowner', metadata }],
    });
  });

  it('maps an upstream 409 to an alreadyProcessed MintingProviderError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('conflict', { status: 409 }))
    );

    const provider = new ImmutableMintingProvider(CONFIG);
    await expect(
      provider.requestMint({ referenceId: 'ref', ownerAddress: '0xowner', species: 'whiteDog' })
    ).rejects.toMatchObject({ alreadyProcessed: true, status: 409 });
  });
});

describe('ImmutableMintingProvider.getStatus', () => {
  it('treats an upstream 404 as not-yet-indexed (pending)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('not found', { status: 404 }))
    );

    const provider = new ImmutableMintingProvider(CONFIG);
    await expect(provider.getStatus('ref')).resolves.toEqual({ status: 'pending' });
  });

  it('maps a succeeded status and token id', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ status: 'succeeded', token_id: '42' }), { status: 200 }))
    );

    const provider = new ImmutableMintingProvider(CONFIG);
    await expect(provider.getStatus('ref')).resolves.toEqual({ status: 'succeeded', tokenId: '42' });
  });
});
