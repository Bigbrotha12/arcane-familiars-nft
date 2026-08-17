import type { GameState } from '@arcane-familiars/game-logic';

export interface Bindings {
  DB: D1Database;
  ENVIRONMENT: string;
  IMX_API_SANDBOX: string;
  IMX_API_MAINNET: string;
  COLLECTION_CONTRACT_SANDBOX: string;
  COLLECTION_CONTRACT_MAINNET: string;
}
