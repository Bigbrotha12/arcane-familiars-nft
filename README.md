# Arcane Familiars

A browser-based NFT creature-collector game integrated with the Immutable X (IMX) L2 marketplace. Summon familiars, battle with turn-based combat, and trade on-chain — all from your browser.

> **Status:** Active development — **playable vertical slice**: dungeon exploration, server-authoritative turn-based combat (speed-ordered turns, status effects, items, party swapping, KO relay), loot and currency. Blockchain integration is the next milestone.

## Project Structure

```
├── backend/           # Cloudflare Worker (Hono + D1) — game state, battles, dungeons
├── blockchain/        # Smart contracts
├── docs/              # Plans, architecture decisions
├── frontend/          # React SPA (Vite + SWC + Tailwind) — HUD + landing
├── game/              # Phaser 3 scenes (world map, exploration, battle)
└── packages/
    └── game-logic/    # Shared pure-TS engine: combat math, items, types (vitest)
```

## Tech Stack

### Frontend
- **React 18** with TypeScript
- **Vite** + SWC for fast builds
- **Tailwind CSS** with custom design tokens (see [DESIGN.md](./DESIGN.md))
- **React Router v6** for client-side routing
- Fonts: Fredoka (display), DM Sans (body), JetBrains Mono (data)

### Backend
- **Hono** on Cloudflare Workers (edge runtime)
- **Cloudflare D1** (SQLite) for persistent storage
- **TypeScript** with type-safe env bindings
- Proxies Immutable X API for asset/balance data

### Game
- **Phaser 3** scenes embedded in the React app (`game/`), bridged via an event bus
- **`packages/game-logic`** — shared, dependency-free combat engine (damage math, status effects, items, turn resolution) consumed by both backend and client; 127 vitest specs
- Server-authoritative battles: the client sends actions, the Worker resolves the full turn and returns a replayable result (ordered steps, canceled actions, forced swaps)
- HUD is React (Tailwind, DESIGN.md tokens) rendered in an 800×600 design-space stage scaled to the canvas

### Blockchain
- **Solidity 0.8.17** with Hardhat
- **OpenZeppelin** contracts (ERC721 + ERC2981)
- Transparent proxy pattern with role-based routing (FamiliarProxy / FamiliarLogic / FamiliarAdmin)
- IMX Bridge integration for L2 minting
- **Immutable X** for gas-free trading

## Getting Started

### Prerequisites
- Node.js 22+ (see `.nvmrc`)

### Install
```bash
npm install
```

### Run backend + frontend together (development)
```bash
npm run dev        # backend http://localhost:8787, frontend http://localhost:8080
```

The backend runs `wrangler dev` against a **local** D1 database — it never
touches production. To (re)create the local database with schema + seed data:

```bash
npm run db:setup  # applies migrations + seed to the local D1 (idempotent)
```

### Run individually
```bash
npm run backend:dev    # wrangler dev
npm run frontend:dev   # http://localhost:8080
```

### Blockchain
```bash
cd blockchain
npm install
npx hardhat compile
npx hardhat test
```

## Game Mechanics

Players summon **familiars** — creature NFTs with unique stats and abilities:

| Stat | Description |
|------|-------------|
| HP | Hit points |
| MP | Magic points |
| ATK | Attack power |
| DEF | Defense |
| ARC | Arcane power |
| SPD | Speed (decides turn order) |

Each familiar has an **affinity** (Light, Dark, Fire, Water, Earth, Wind), a **rarity** tier (common through legendary), and up to 4 **abilities** that affect combat.

### Implemented gameplay
- **Dungeon runs**: pick a party of 2, explore room graphs (minimap), treasure rooms, boss rooms
- **Turn-based combat**: speed-ordered sequential turns (faster familiar acts first; a KO'd-before-acting familiar loses its action), abilities with cooldowns and MP costs, status effects (buffs, debuffs, DoT/HoT), defend, flee
- **Party management**: swap the active familiar between rooms or mid-battle (once per turn, free); if the active familiar falls, the backup relays in automatically — defeat only when both are down
- **Items**: inventory drops (potions, bombs, revives, currency) usable in battle; consumption respects KO cancellation

## Development Phases

| Phase | Scope | Status |
|-------|-------|--------|
| 1 — Foundation | Cleanup, backend scaffolding, Vite migration, CI | Done |
| 2 — Game Prototype | Phaser 3 engine, core game loop, dungeons, battles, items, party | Done |
| 3 — Blockchain | Contract updates, Sepolia deploy, IMX SDK | Pending |
| 4 — MVP Polish | Wallet connect, mint flow, landing page | Landing done; wallet/mint pending |
| 5 — Mainnet | Audit, mainnet deploy, IMX trading | Post-MVP |

## CI

GitHub Actions runs type-check and build for both frontend and backend on every push/PR to `master`.

## Design

The design system prioritizes a warm, playful aesthetic — "cozy indie game meets Pokemon Center, not crypto exchange." See [DESIGN.md](./DESIGN.md) for tokens, typography, colors, and layout rules.

## License

Private — all rights reserved.
