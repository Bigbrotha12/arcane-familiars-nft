# Cloudflare Worker Backend — Foundation Plan

## Overview

Replace the three defunct backend implementations (amplify/, admin/worker/, frontend/backend/functions/) with a single Cloudflare Worker backend. The frontend currently calls IMX API directly for assets/balances/auth. This worker becomes the unified API gateway.

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Runtime | Cloudflare Workers |
| Framework | [Hono](https://hono.dev/) (TypeScript-first, ~20KB, native Workers support) |
| Database | Cloudflare D1 (SQLite, via `env.DB`) |
| Storage | Cloudflare R2 *(future — when Phaser assets are ready)* |
| Tooling | `wrangler` CLI |
| Auth | SIWE-style (EIP-191 signed message verification via `ethers`) |
| Secrets | `wrangler secret put` + `.dev.vars` for local dev |

## Project Structure

```
backend/
├── src/
│   ├── index.ts              # Hono app entry, route registration
│   ├── routes/
│   │   ├── assets.ts         # GET /api/v1/assets/:address — proxy to IMX
│   │   ├── balances.ts       # GET /api/v2/balances/:address — proxy to IMX
│   │   ├── auth.ts           # POST /api/auth/verify — signer recovery
│   │   ├── collection.ts     # GET /api/collection — D1-backed catalog
│   │   └── metadata.ts       # GET /api/metadata/:id — D1-backed type detail
│   └── utils/
│       ├── imx.ts            # IMX API client (axios to x.immutable.com)
│       └── verify.ts         # Ethers signer recovery
├── migrations/
│   └── 0001_initial.sql      # D1 schema (familiars, keepers, abilities, users, minting_queue)
├── seeds/
│   └── 0001_seed.sql         # Initial familiar type data
├── wrangler.jsonc            # Worker config (D1 binding, env vars)
├── tsconfig.json
├── package.json
└── .dev.vars                 # Local secrets (gitignored)
```

## Execution Steps

### Step 1 — Scaffold Worker Project

- Create `backend/` directory
- `npm init -y`, install `hono`, `wrangler`, `typescript`, `@cloudflare/workers-types`, `ethers`, `axios`
- Create `tsconfig.json` with `"moduleResolution": "bundler"` (Workers-compatible)
- Create `wrangler.jsonc` with:
  - `name: "arcane-familiars-backend"` (placeholder, user sets real name)
  - `main: "src/index.ts"`
  - `compatibility_date` with `nodejs_compat` flag
  - D1 binding `{ binding: "DB", database_name: "arcane-familiars", database_id: "" }` (user fills after login)
  - Env vars placeholder
- Create `src/index.ts` with Hono app and `GET /api/health`
- Create `.dev.vars` with placeholder secrets

### Step 2 — D1 Schema + Migrations

Tables match existing TypeScript types:

**familiars** — catalog of familiar type definitions
```sql
CREATE TABLE familiars (
  familiar_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  image TEXT,
  affinity TEXT NOT NULL,       -- Light/Dark/Fire/Water/Earth/Wind
  hp INTEGER NOT NULL,
  mp INTEGER NOT NULL,
  attack INTEGER NOT NULL,
  defense INTEGER NOT NULL,
  arcane INTEGER NOT NULL,
  speed INTEGER NOT NULL,
  ability_1 TEXT,
  ability_2 TEXT,
  ability_3 TEXT,
  ability_4 TEXT,
  rarity TEXT NOT NULL,          -- common/uncommon/rare/secret/legendary
  generation INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);
```

**keepers** — Keeper NFT type catalog
```sql
CREATE TABLE keepers (
  keeper_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  image TEXT,
  levels INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);
```

**abilities** — ability definitions
```sql
CREATE TABLE abilities (
  ability_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  effect TEXT,                   -- JSON array
  drawback TEXT,                 -- JSON array
  created_at TEXT DEFAULT (datetime('now'))
);
```

**users** — auth cache / session tracking
```sql
CREATE TABLE users (
  eth_address TEXT PRIMARY KEY,
  last_auth_timestamp INTEGER,
  last_seen TEXT DEFAULT (datetime('now')),
  created_at TEXT DEFAULT (datetime('now'))
);
```

**minting_queue** — mint operation tracking
```sql
CREATE TABLE minting_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  eth_address TEXT NOT NULL,
  familiar_id INTEGER NOT NULL,
  status TEXT DEFAULT 'pending', -- pending/processing/minted/failed
  token_id TEXT,
  tx_hash TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
```

### Step 3 — IMX Proxy Endpoints

- `GET /api/v1/assets/:address` — proxies `GET /v1/assets?user={address}&collection={contract}` to IMX API
  - Adds caching headers
  - Returns transformed `AssetResponseOK` matching frontend types
- `GET /api/v2/balances/:address` — proxies `GET /v2/balances/{address}` to IMX API
  - Returns `IMXBalance` matching frontend types

### Step 4 — Auth Verification

- `POST /api/auth/verify` — accepts `{ eth_address, eth_timestamp, eth_signature }`
  - Recovers signer from `(eth_timestamp, eth_signature)` via `ethers.utils.verifyMessage`
  - Compares recovered address to `eth_address`
  - On success: upserts into `users` table, returns `{ verified: true }`
  - On failure: returns `{ verified: false, reason: "..." }`

### Step 5 — D1-Backed Endpoints

- `GET /api/collection` — `SELECT * FROM familiars ORDER BY familiar_id`
- `GET /api/metadata/:id` — `SELECT * FROM familiars WHERE familiar_id = ?`

### Step 6 — Frontend Wiring

- Add `VITE_BACKEND_URL=http://localhost:8787` to `frontend/.env.example`
- Add backend URL to `frontend/src/app/constants/AppConfig.ts`
- Create API client that routes requests through the worker
- Remove hardcoded S3 image URL from `AppConfig.ts` (S3 site is down)

### Step 7 — AGENTS.md

- Create `.github/AGENTS.md` or `AGENTS.md` at repo root
- Document branching convention:
  - All future work uses feature branches (`feature/description` or `step-1-6` pattern)
  - Changes merged via pull requests
  - No direct pushes to `master`

## What's NOT Included

| Feature | Reason |
|---------|--------|
| R2 bucket | No game assets ready to migrate; S3 is already dead |
| Mint endpoint | Needs Phase 3 smart contract integration |
| Bridge endpoints | Post-MVP feature |
| D1 creation/wrangler login | User must `wrangler login` and `wrangler d1 create` after setup |

## To-Do's

wrangler login                          # Authenticate with Cloudflare
wrangler d1 create arcane-familiars     # Create the D1 database
# Copy the database_id into wrangler.jsonc
wrangler d1 migrations apply arcane-familiars --remote   # Apply schema
wrangler d1 execute arcane-familiars --remote --file ./seeds/0001_seed_familiars.sql  # Seed data
wrangler secret put INFURA_API_KEY      # Set the Infura key
wrangler deploy                         # Deploy the Worker

## Env Variables

### Worker secrets (`wrangler secret put` / `.dev.vars`)

```
IMX_API_SANDBOX=https://api.sandbox.x.immutable.com
IMX_API_MAINNET=https://api.x.immutable.com
COLLECTION_CONTRACT_SANDBOX=0xb7eaa855fa6432d0597f297bace4613c33a075d1
COLLECTION_CONTRACT_MAINNET=0xacb3c6a43d15b907e8433077b6d38ae40936fe2c
INFURA_API_KEY=your_infura_key
```

### `.dev.vars` (local, gitignored)

```
CLOUDFLARE_API_TOKEN=your_token_here
INFURA_API_KEY=dev_key_for_testing
```
