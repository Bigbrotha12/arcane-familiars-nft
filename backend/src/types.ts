export interface Bindings {
  DB: D1Database;
  ENVIRONMENT: string;
  // Rollout flag for on-chain ownership authority (BC4). Strictly parsed as
  // `=== 'true'`; unset/false keeps the persisted grants set authoritative.
  OWNERSHIP_AUTHORITY?: string;
  IMX_API_SANDBOX: string;
  IMX_API_MAINNET: string;
  COLLECTION_CONTRACT_SANDBOX: string;
  COLLECTION_CONTRACT_MAINNET: string;
  IMMUTABLE_CLIENT_ID: string;
  IMMUTABLE_AUTH_ISSUER: string;
  IMMUTABLE_JWKS_URI: string;
  // BC2 minting: the hosted Immutable Minting API key is a Worker secret (never
  // a var). Absent → the minting seam uses DisabledMintingProvider.
  IMMUTABLE_MINTING_API_KEY?: string;
  // Rollout flag for the mint seam. Strictly parsed as `=== 'true'`; unset or
  // false rejects mint requests with 403.
  MINTING_ENABLED?: string;
  // Optional public base URI for NFT metadata images. When unset, minted tokens
  // carry name/traits but no `image`. Provider-agnostic (built in the route),
  // so it is intentionally absent from wrangler.jsonc vars.
  NFT_METADATA_BASE_URI?: string;
}

export interface Variables {
  accountKey?: string;
  isGuest?: boolean;
  requestId?: string;
}
