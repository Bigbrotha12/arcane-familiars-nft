/**
 * Backend base URL — mirrors the game client (`game/src/api/client.ts`).
 */
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8787';

/** A row from `GET /api/collection` — the D1 `familiars` catalog. */
export interface CatalogFamiliar {
  familiar_id: number;
  name: string;
  description: string;
  image: string;
  affinity: string;
  hp: number;
  mp: number;
  attack: number;
  defense: number;
  arcane: number;
  speed: number;
  ability_1: string;
  ability_2: string;
  ability_3: string;
  ability_4: string;
  rarity: string;
  generation: number;
}

/** Fetch the public familiar catalog. Throws on network / non-2xx errors. */
export async function fetchCatalog(): Promise<CatalogFamiliar[]> {
  const res = await fetch(`${BACKEND_URL}/api/collection`, {
    headers: { 'Content-Type': 'application/json' },
  });

  if (!res.ok) {
    throw new Error(`Failed to load the catalog (${res.status})`);
  }

  const data = (await res.json()) as unknown;
  return Array.isArray(data) ? (data as CatalogFamiliar[]) : [];
}
