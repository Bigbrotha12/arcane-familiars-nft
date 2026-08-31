import { getErrorMessage } from './http';

// ---------------------------------------------------------------------------
// Immutable zkEVM Indexer API client
//
// Verified endpoints (from https://docs.immutable.com/api-reference):
//   GET /v1/chains/{chain_name}/accounts/{account_address}/nfts
//       - List NFTs owned by an account, with optional contract_address filter
//       - Returns NFTWithBalance[] with full metadata (name, image, attributes)
//       - Pagination via page_cursor / page.next_cursor
//   GET /v1/chains/{chain_name}/collections/{contract_address}/owners
//       - List owners of a collection, optional account_address filter
//
// Base URLs (from https://docs.immutable.com/docs/products/indexer/overview):
//   Sandbox/testnet : https://api.sandbox.immutable.com
//   Mainnet         : https://api.immutable.com
//
// Chain names:
//   imtbl-zkevm-testnet
//   imtbl-zkevm-mainnet
//
// No API key is required for read-only indexer queries.
// ---------------------------------------------------------------------------

export interface IMXClientBindings {
  IMX_API_SANDBOX: string;
  IMX_API_MAINNET: string;
}

// Backward-compatible aliases kept for routes that still reference them.
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

// --- Immutable zkEVM Indexer response shapes ---

interface IMXChain {
  id: string;
  name: string;
}

interface IMXNFTMetadataAttribute {
  trait_type: string;
  value: string | number | boolean;
  display_type?: string;
}

export interface IMXNFTWithBalance {
  chain: IMXChain;
  token_id: string;
  contract_address: string;
  contract_type: string;
  indexed_at: string;
  updated_at: string;
  metadata_synced_at: string | null;
  metadata_id: string | null;
  name: string | null;
  description: string | null;
  image: string | null;
  external_link: string | null;
  animation_url: string | null;
  youtube_url: string | null;
  attributes: IMXNFTMetadataAttribute[];
  balance: string;
}

interface IMXPage {
  previous_cursor: string | null;
  next_cursor: string | null;
}

export interface IMXNFTsByOwnerResult {
  result: IMXNFTWithBalance[];
  page: IMXPage;
}

// --- Known familiar species IDs (mirrors packages/game-logic/src/data/familiars.ts) ---
// Boss familiars (isBoss: true) are excluded — they aren't player-ownable NFTs
// that should surface in a player's party selector.

const KNOWN_FAMILIAR_IDS: Set<string> = new Set([
  'whiteDog',
  'yellowFighter',
  'aquaSprite',
  'leafBunny',
  'sparkMouse',
  'tideTurtle',
  'shadowCat',
]);

/**
 * Map from NFT `name` (lower-cased, whitespace-stripped) to familiar species id.
 * Populated from the FAMILIARS data — covers the standard familiar set.
 */
const NAME_TO_SPECIES: Record<string, string> = {};
for (const id of KNOWN_FAMILIAR_IDS) {
  // Create a human-readable name from the camelCase id, e.g. "whiteDog" → "White Dog"
  const humanName = id.replace(/([A-Z])/g, ' $1').trim().toLowerCase();
  NAME_TO_SPECIES[humanName] = id;
}

/**
 * Map from the 4-char blueprint prefix (as used in FamiliarLogic.tokenURI)
 * to the familiar species id. This is the on-chain convention:
 *   blueprints[_tokenId].substring(0, 4) → familiarId for image path.
 *
 * Only UNambiguous player species are listed. Boss species (meadowGuardian,
 * caveWarden, shadowLord) are not player-ownable and must never be returned by
 * mapTokenToFamiliar. shadowCat and shadowLord both begin with "shad", so a
 * 4-char prefix alone cannot distinguish them — the earlier "shac"/"shal"
 * entries were placeholder guesses and are intentionally NOT mapped (an
 * ambiguous prefix must never fall back to a species). This map is a
 * best-effort fallback and MUST be reconciled against the actual minted
 * blueprint prefixes before relying on it in production.
 */
const BLUEPRINT_PREFIX_TO_SPECIES: Record<string, string> = {
  whit: 'whiteDog',
  yell: 'yellowFighter',
  aqua: 'aquaSprite',
  leaf: 'leafBunny',
  spar: 'sparkMouse',
  tide: 'tideTurtle',
};

export function isValidEthAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

function getIMXBaseURL(environment: string, bindings: IMXClientBindings): string {
  return environment === 'production' ? bindings.IMX_API_MAINNET : bindings.IMX_API_SANDBOX;
}

function getChainName(environment: string): string {
  return environment === 'production' ? 'imtbl-zkevm-mainnet' : 'imtbl-zkevm-testnet';
}

async function imxFetch<T>(baseURL: string, path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(path, baseURL);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const res = await fetch(url.toString(), {
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    throw new ImxRequestError(`IMX request failed (${res.status})`, res.status);
  }

  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Token → familiar species mapping
// ---------------------------------------------------------------------------

/**
 * Given an NFT from the zkEVM indexer (with metadata), return the familiar
 * species id if it maps to a known species, or null.
 *
 * Mapping strategy (tried in order):
 *   1. NFT `attributes` — look for a trait_type "species" or "familiar_id"
 *   2. NFT `name` — lowercased and matched against KNOWN_FAMILIAR_IDS
 *   3. Blueprint prefix from attributes or token_id heuristic — mapped via
 *      BLUEPRINT_PREFIX_TO_SPECIES (placeholder; reconcile with minted data)
 */
export function mapTokenToFamiliar(nft: IMXNFTWithBalance): string | null {
  // Every species-derivation path below is gated on KNOWN_FAMILIAR_IDS so a
  // boss id can never leak out — bosses are excluded from the known set.

  // 1. Check attributes for explicit species/familiar_id trait
  if (nft.attributes && Array.isArray(nft.attributes)) {
    for (const attr of nft.attributes) {
      const traitLower = attr.trait_type.toLowerCase();
      if (traitLower === 'species' || traitLower === 'familiar_id') {
        const species = String(attr.value);
        if (species && KNOWN_FAMILIAR_IDS.has(species)) return species;
      }
    }

    // Also check for a "blueprint" attribute (first 4 chars → species). Only
    // an unambiguous prefix mapping to a KNOWN player species is used.
    for (const attr of nft.attributes) {
      if (attr.trait_type.toLowerCase() === 'blueprint') {
        const prefix = String(attr.value).substring(0, 4).toLowerCase();
        const species = BLUEPRINT_PREFIX_TO_SPECIES[prefix];
        if (species && KNOWN_FAMILIAR_IDS.has(species)) return species;
      }
    }
  }

  // 2. Match NFT name against known species names
  if (nft.name) {
    const nameLower = nft.name.toLowerCase().trim();
    const species = NAME_TO_SPECIES[nameLower];
    if (species && KNOWN_FAMILIAR_IDS.has(species)) return species;
  }

  // 3. If the token_id is small (likely an early mint), try the blueprint
  //    prefix heuristic — but only if there's no ambiguity.
  //    For now, skip this for token_ids > 9 to avoid false positives.

  return null;
}

// ---------------------------------------------------------------------------
// Public API functions
// ---------------------------------------------------------------------------

/**
 * Fetch all NFTs owned by a wallet in a specific collection, then map each
 * to a known familiar species id. Returns only recognized species (boss/NFTs
 * that don't map to anything are silently dropped).
 *
 * Uses the zkEVM indexer endpoint:
 *   GET /v1/chains/{chain_name}/accounts/{account_address}/nfts
 *       ?contract_address={collection}
 *       &page_size=200
 *       &page_cursor={cursor}
 */
export async function getOwnedFamiliars(
  walletAddress: string,
  collectionContract: string,
  environment: string,
  bindings: IMXClientBindings,
): Promise<string[]> {
  const baseURL = getIMXBaseURL(environment, bindings);
  const chainName = getChainName(environment);
  const speciesSet = new Set<string>();
  let cursor: string | undefined;

  for (let page = 0; page < 10; page++) {
    const params: Record<string, string> = {
      contract_address: collectionContract,
      page_size: '200',
    };
    if (cursor) {
      params.page_cursor = cursor;
    }

    const path = `/v1/chains/${chainName}/accounts/${walletAddress}/nfts`;
    const data = await imxFetch<IMXNFTsByOwnerResult>(baseURL, path, params);

    if (Array.isArray(data.result)) {
      for (const nft of data.result) {
        const species = mapTokenToFamiliar(nft);
        if (species) speciesSet.add(species);
      }
    }

    cursor = data.page?.next_cursor ?? undefined;
    if (!cursor) break;
  }

  return Array.from(speciesSet);
}

/**
 * Fetch all assets (NFTs) in a collection owned by a wallet.
 * Migrated from the legacy StarkEx /v1/assets endpoint to the zkEVM indexer.
 * Returns a shape compatible with the previous IMXAssetsResponse.
 */
export async function getUserAssets(
  address: string,
  collection: string,
  environment: string,
  bindings: IMXClientBindings,
): Promise<IMXAssetsResponse> {
  const baseURL = getIMXBaseURL(environment, bindings);
  const chainName = getChainName(environment);
  const result: IMXAsset[] = [];
  let cursor: string | undefined;

  for (let page = 0; page < 10; page++) {
    const params: Record<string, string> = {
      contract_address: collection,
      page_size: '200',
    };
    if (cursor) {
      params.page_cursor = cursor;
    }

    const path = `/v1/chains/${chainName}/accounts/${address}/nfts`;
    const data = await imxFetch<IMXNFTsByOwnerResult>(baseURL, path, params);

    if (Array.isArray(data.result)) {
      for (const nft of data.result) {
        result.push({
          id: nft.token_id,
          token_id: nft.token_id,
          name: nft.name ?? undefined,
          image_url: nft.image ?? undefined,
          status: 'imtbl_zkevm',
          contract_address: nft.contract_address,
          contract_type: nft.contract_type,
          balance: nft.balance,
        });
      }
    }

    cursor = data.page?.next_cursor ?? undefined;
    if (!cursor) break;
  }

  return { result };
}

/**
 * Fetch token balances for a wallet.
 *
 * The legacy StarkEx endpoint (GET /v2/balances/:address) has no direct
 * equivalent in the Immutable zkEVM Indexer — ERC-20 balances live on-chain
 * and aren't indexed by the same REST surface. We return an empty result
 * so downstream routes remain functional; callers that need live ERC-20
 * balances should query the chain directly or via a dedicated indexer.
 */
export async function getUserBalances(
  _address: string,
  _environment: string,
  _bindings: IMXClientBindings,
): Promise<unknown> {
  // The zkEVM Indexer does not expose an ERC-20 balance endpoint.
  // Return an empty result matching the previous response intent.
  return { result: [] };
}

export class ImxRequestError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ImxRequestError';
    this.status = status;
  }
}

export { getErrorMessage };
