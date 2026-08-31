import type { GameState } from '@arcane-familiars/game-logic';

export interface Bindings {
  DB: D1Database;
  ENVIRONMENT: string;
  IMX_API_SANDBOX: string;
  IMX_API_MAINNET: string;
  COLLECTION_CONTRACT_SANDBOX: string;
  COLLECTION_CONTRACT_MAINNET: string;
  IMMUTABLE_CLIENT_ID: string;
  IMMUTABLE_AUTH_ISSUER: string;
  IMMUTABLE_JWKS_URI: string;
}

export interface Variables {
  accountKey?: string;
  isGuest?: boolean;
}
