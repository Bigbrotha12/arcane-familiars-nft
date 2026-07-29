# Arcane Familiars

A browser-based NFT creature-collector game integrated with the Immutable X (IMX) L2 marketplace. Summon familiars, battle with turn-based combat, and trade on-chain — all from your browser.

> **Status:** Active development — landing page live, game engine (Phaser 3) and blockchain integration in progress.

## Project Structure

```
├── backend/         # Cloudflare Worker (Hono + D1)
├── blockchain/      # Smart contracts
├── docs/            # Plans, architecture decisions
└── frontend/        # React SPA (Vite + SWC + Tailwind)
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

### Blockchain
- **Solidity 0.8.17** with Hardhat
- **OpenZeppelin** contracts (ERC721 + ERC2981)
- Transparent proxy pattern with role-based routing (FamiliarProxy / FamiliarLogic / FamiliarAdmin)
- IMX Bridge integration for L2 minting
- **Immutable X** for gas-free trading

## Getting Started

### Prerequisites
- Node.js 22+ (see `.nvmrc`)

### Frontend
```bash
cd frontend
npm install
npm run dev        # http://localhost:8080
```

### Backend
```bash
cd backend
npm install
npm run dev        # wrangler dev
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
| SPD | Speed |

Each familiar has an **affinity** (Light, Dark, Fire, Water, Earth, Wind), a **rarity** tier (common through legendary), and up to 4 **abilities** that affect combat.

## Development Phases

| Phase | Scope | Status |
|-------|-------|--------|
| 1 — Foundation | Cleanup, backend scaffolding, Vite migration, CI | Done |
| 2 — Game Prototype | Phaser 3 engine, core game loop, 3-5 familiars | Pending |
| 3 — Blockchain | Contract updates, Sepolia deploy, IMX SDK | Pending |
| 4 — MVP Polish | Wallet connect, mint flow, landing page | In progress |
| 5 — Mainnet | Audit, mainnet deploy, IMX trading | Post-MVP |

## CI

GitHub Actions runs type-check and build for both frontend and backend on every push/PR to `master`.

## Design

The design system prioritizes a warm, playful aesthetic — "cozy indie game meets Pokemon Center, not crypto exchange." See [DESIGN.md](./DESIGN.md) for tokens, typography, colors, and layout rules.

## License

Private — all rights reserved.
