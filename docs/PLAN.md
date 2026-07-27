# Arcane Familiars NFT - Project Plan

## 1. Project Overview

**Arcane Familiars** is a browser-based NFT game integrated with Immutable X (IMX) L2 marketplace. Players summon familiars (NFTs) with stats (HP, MP, Attack, Defense, Arcane, Speed) and abilities, and interact through a React frontend that embeds the game built with PixiJS + Phaser.

**Last commit:** April 28, 2023 (2+ years stale)

---

## 2. Current Project Structure

| Directory | Purpose | Status |
|-----------|---------|--------|
| `game/` | Legacy Unity project + JSON data schemas | **TO BE REPLACED** - only API test harness exists, no game logic |
| `frontend/` | React app (webpack, MUI, Redux, react-unity-webgl) | Partial UI shell - most routes show "ComingSoon" |
| `blockchain/` | Solidity contracts (Hardhat) | Deployed to deprecated testnets only |
| `admin/worker/` | Node.js batch minting worker | Functional but uses deprecated SDK |
| `amplify/` | AWS Amplify Lambda functions | **DUPLICATED** in `frontend/backend/functions/` |

### Key Findings

- **3 separate backend implementations** exist with duplicated logic:
  1. `amplify/backend/function/` (fnArcane, fnArcaneAdmin, fnArcaneMint)
  2. `frontend/backend/functions/` (metaquery, minter, session)
  3. `admin/worker/` (Minter, IMXAdmin)
- **No actual game** exists in Unity - only an API test harness (`APIHandler.cs`)
- **No game mechanics** implemented (no battles, no exploration, no familiar summoning gameplay)
- **All routes except `/app/game`** show "Coming Soon" placeholder
- **Decision:** Replacing Unity WebGL with **PixiJS + Phaser** (see Section 11 for rationale)

---

## 3. Critical Infrastructure Issues

### 3.1 Deprecated/Dead Services

| Component | Issue | Action Required |
|-----------|-------|-----------------|
| **Ropsten testnet** | Deprecated by Ethereum foundation | Remove entirely |
| **Goerli testnet** | Deprecated by Ethereum foundation | Migrate to **Sepolia** |
| **AWS Amplify** | Overly complex, duplicated with Netlify functions | **Remove** - consolidate to single backend |
| **@imtbl/imx-sdk v1.26** | Deprecated SDK | Migrate to **@imtbl/sdk** (latest) |
| **@imtbl/core-sdk** | Deprecated | Migrate to **@imtbl/sdk** |
| **Infura API key** | **Exposed in source code** (`AppConfig.ts:18-26`) | Rotate immediately, move to env vars |
| **Truffle** | Referenced in scripts but migrated to Hardhat | Clean up remnants |

### 3.2 Security Concerns

- Infura API key hardcoded in `frontend/src/app/constants/AppConfig.ts`
- MongoDB connection strings likely in env vars but no `.env.example` provided
- No input validation on API endpoints
- No rate limiting visible

### 3.3 Architecture Problems

- **3 backends** doing similar things - massive code duplication
- Legacy Unity game assets hosted on CloudFront + S3 with hardcoded URLs (to be removed with Unity)
- No CI/CD pipeline
- No automated tests (frontend, backend, or contracts)
- Webpack config is manual and fragile (polyfills for `crypto`, `stream`, `os`, `https`)

---

## 4. Blockchain Contract Analysis

The contracts use a **proxy pattern** with role-based routing:

| Contract | Role | Notes |
|----------|------|-------|
| `FamiliarProxy` | Entry point, upgradability | Custom transparent proxy with role routing |
| `FamiliarLogic` | NFT logic for direct minting | ERC721 + ERC2981 (royalties) |
| `FamiliarIMX` | NFT logic for IMX minting | Implements `Mintable` for IMX bridge |
| `FamiliarAdmin` | Admin controls | Keeper management |
| `CommonStorage` | Shared state | All state variables live here |

**Contracts are sound architecturally** but need:
- Redeployment to Sepolia/mainnet
- Solidity version update (0.8.17 -> latest 0.8.x)
- Audit before mainnet deployment
- OpenZeppelin upgrade (4.8.2 -> 5.x)

---

## 5. Game Data Assets

Generation 1 data exists in JSON:
- **2 familiars:** WhiteDog, YellowFighter
- **2 abilities:** Brave, Sturdy
- **2 images:** 0001.png, 0002.png
- Schemas defined for familiars, abilities, and traits

This is a good start but very limited content.

---

## 6. Proposed MVP Scope (Minimal)

### What to CUT

| Cut | Reason |
|-----|--------|
| Bridge (deposit/withdraw) | Not needed for MVP - players don't need to bridge assets |
| Marketplace UI | Use IMX's built-in marketplace instead of building custom |
| Collection viewer | Defer - not core gameplay |
| Minter UI in frontend | Simplify to "claim your familiar" flow |
| AWS Amplify entirely | Replace with single backend |
| Redux state management | Overkill for MVP - use React context |
| Admin worker (batch minting) | Mint on-demand for MVP |
| Multiple backend implementations | Consolidate to ONE |

### What to KEEP / BUILD

**MVP = Playable game + mint a familiar as NFT**

1. **PixiJS + Phaser Game (Core Loop)**
   - Simple turn-based battle or exploration
   - 3-5 familiars with stats/abilities
   - Local gameplay first, blockchain second
   - Runs natively in browser (no build step, instant load)

2. **Single Backend (Cloudflare Workers)**
   - Replace ALL three backends with one Cloudflare Worker
   - Use Cloudflare KV or D1 for database (replace MongoDB)
   - Handle: session auth, familiar data API, mint authorization

3. **Blockchain (Simplified)**
   - Redeploy contracts to **Sepolia** testnet
   - Keep proxy pattern but simplify
   - Mint-on-demand (no batch worker)
   - IMX integration for L2 trading (post-MVP)

4. **Frontend (Simplified)**
   - Landing page
   - Wallet connect (MetaMask)
   - Game frame (Phaser canvas embed)
   - "Summon Familiar" = mint NFT
   - Inventory view (basic)

---

## 7. Recommended Technology Stack (Modernized)

| Layer | Current | Proposed |
|-------|---------|----------|
| **Backend** | AWS Amplify + Netlify Functions + Admin Worker | **Cloudflare Workers** (single codebase) |
| **Database** | MongoDB (Atlas) | **Cloudflare D1** (SQLite) or **Turso** |
| **Frontend** | React + Webpack + MUI + Redux | **React + Vite** + Tailwind + shadcn/ui |
| **Game** | Unity WebGL (basic) | **PixiJS + Phaser** (TypeScript, native browser) |
| **Blockchain SDK** | @imtbl/imx-sdk, @imtbl/core-sdk | **@imtbl/sdk** (latest unified SDK) |
| **Contracts** | Hardhat + Solidity 0.8.17 | **Foundry** (faster) + Solidity 0.8.28+ |
| **Testnet** | Ropsten, Goerli | **Sepolia** |
| **Hosting** | Netlify + CloudFront + S3 | **Cloudflare Pages** (unified) |
| **Auth** | Custom Ethereum signature sessions | **SIWE** (Sign-In with Ethereum) via backend |
| **CI/CD** | None | **GitHub Actions** |

---

## 8. Phased Execution Plan

### Phase 1: Foundation (Week 1-2) ✅ COMPLETED
- [x] Remove `amplify/` directory entirely
- [x] Remove `admin/worker/` directory
- [x] Remove `frontend/backend/functions/` directory
- [x] Archive `game/` Unity project to `game-unity-legacy/`
- [x] Rotate exposed Infura API key
- [x] Set up single Cloudflare Worker backend (Phase 1.6)
  - Backend scaffolding with Hono + TypeScript ✅
  - D1 schema + migrations ✅
  - API endpoints (assets, balances, auth, collection, metadata) ✅
  - Frontend wiring ✅
  - Deployment pending (wrangler login + deploy)
- [x] Migrate to Vite + modern React setup (Phase 1.7)
  - Remove webpack + Babel ✅
  - Install Vite + SWC ✅
  - Update build scripts ✅
  - Remove deprecated @imtbl/imx-sdk ✅
- [x] Set up GitHub Actions CI

### Phase 2: Game Prototype (Week 3-6)
- [ ] Set up PixiJS + Phaser project with TypeScript
- [ ] Build core game loop (turn-based battle or exploration)
- [ ] Implement 3-5 familiars with stats
- [ ] Implement basic ability system
- [ ] Embed Phaser canvas in React frontend
- [ ] Local save state (no blockchain yet)

### Phase 3: Blockchain Integration (Week 7-8)
- [ ] Update contracts to latest Solidity + OpenZeppelin
- [ ] Deploy to Sepolia testnet
- [ ] Update to latest @imtbl/sdk (replace deprecated SDK)
- [ ] Implement mint-on-demand flow
- [ ] Connect game to backend for NFT data

### Phase 4: MVP Polish (Week 9-10)
- [ ] Wallet connection (MetaMask)
- [ ] "Summon Familiar" mint flow
- [ ] Basic inventory display
- [ ] Landing page
- [ ] Deploy to Cloudflare Pages

### Phase 5: Mainnet (Post-MVP)
- [ ] Contract audit
- [ ] Deploy contracts to mainnet
- [ ] IMX collection registration
- [ ] Enable trading on IMX marketplace
- [ ] Additional familiars and abilities

### Phase 6: Backend Deployment
- [ ] Complete `wrangler login`
- [ ] Create D1 database: `wrangler d1 create arcane-familiars`
- [ ] Apply migrations: `wrangler d1 migrations apply arcane-familiars --remote`
- [ ] Seed data: `wrangler d1 execute arcane-familiars --remote --file ./seeds/0001_seed_familiars.sql`
- [ ] Set secrets: `wrangler secret put INFURA_API_KEY`
- [ ] Deploy worker: `wrangler deploy`

---

## 9. Immediate Action Items

1. **Security:** Rotate the Infura API key exposed in `AppConfig.ts`
2. **Cleanup:** Delete `amplify/` directory (dead code, duplicated)
3. **Cleanup:** Archive/remove `game/` Unity project (replaced by PixiJS + Phaser)
4. **Decision:** Confirm Immutable X is still the chosen L2 (vs Base, Arbitrum, etc.)
5. **Scope:** Approve the MVP scope above before proceeding

---

## 10. Summary

This project has solid architectural bones (proxy contracts, data schemas, frontend shell) but needs significant modernization and actual game development to become viable. The key is to **stop maintaining 3 backends and deprecated testnets**, consolidate to a modern stack, and focus on making a **playable game first** before layering on blockchain complexity.

---

## 11. Game Engine Migration: Unity WebGL → PixiJS + Phaser

### 11.1 Decision Rationale

**Why PixiJS + Phaser over Unity WebGL:**

| Factor | Unity WebGL | PixiJS + Phaser | Winner |
|--------|-------------|-----------------|--------|
| **Bundle size** | 10-30MB minimum | ~100KB (Phaser) | **Phaser** |
| **Load time** | Slow (downloads entire runtime) | Instant | **Phaser** |
| **Tech stack** | C# (separate from frontend) | TypeScript (same as frontend) | **Phaser** |
| **Web3 integration** | Awkward (cross-language calls) | Native (same JS context) | **Phaser** |
| **Iteration speed** | Slow (build + deploy cycle) | Fast (hot reload) | **Phaser** |
| **License cost** | $2,040/year at scale | Free (MIT) | **Phaser** |
| **Existing code** | Nothing to migrate | N/A | **Tie** |
| **2D game fit** | Overkill (3D engine for 2D game) | Purpose-built | **Phaser** |

**Key benefits for Arcane Familiars:**
- **Same tech stack** - TypeScript throughout (frontend + game + blockchain)
- **Tiny footprint** - instant load vs Unity's 10-30MB
- **Native Web3** - wallet/NFT code runs in same context as game
- **Zero switching cost** - no existing Unity game code to lose
- **Perfect for 2D** - turn-based RPG is exactly what Phaser excels at

**Trade-offs:**
- No visual editor (code everything)
- Smaller community than Unity
- 2D only (but we don't need 3D)

### 11.2 Migration Steps

Since there's **no actual game code** in Unity (only an API test harness), migration is straightforward:

#### Step 1: Archive Legacy Unity Project
```bash
# Move Unity project to archive (keep for reference)
mv game/ game-unity-legacy/
```

#### Step 2: Create New Phaser Project
```bash
# Create new game directory
mkdir game-phaser
cd game-phaser

# Initialize TypeScript project
npm init -y
npm install phaser
npm install -D typescript @types/node vite

# Set up project structure
mkdir -p src/{scenes,sprites,ui,utils}
```

#### Step 3: Migrate Game Data
The JSON schemas from `game-unity-legacy/Generation1/` can be reused directly:
- `familiar-schemas.json` → `src/data/familiar-schemas.json`
- `ability-schemas.json` → `src/data/ability-schemas.json`
- Familiar images → `public/assets/familiars/`

#### Step 4: Build Core Game Systems
Priority order:
1. **Game loop** - Phaser scene management
2. **Familiar renderer** - display familiars with stats
3. **Battle system** - turn-based combat (or exploration)
4. **Ability system** - implement Brave, Sturdy, etc.
5. **UI layer** - HUD, inventory, menus

#### Step 5: Integrate with React Frontend
Replace `react-unity-webgl` with Phaser canvas:
```tsx
// Old: Unity WebGL embed
import { Unity, useUnityContext } from "react-unity-webgl";

// New: Phaser canvas embed
import Phaser from 'phaser';
import { useEffect, useRef } from 'react';

const GameCanvas = () => {
  const gameRef = useRef<Phaser.Game>();
  
  useEffect(() => {
    gameRef.current = new Phaser.Game({
      type: Phaser.AUTO,
      width: 800,
      height: 600,
      parent: 'game-container',
      scene: [/* your scenes */]
    });
    
    return () => gameRef.current?.destroy();
  }, []);
  
  return <div id="game-container" />;
};
```

#### Step 6: Web3 Integration
Since Phaser runs in the same JS context as your frontend, Web3 integration is trivial:
```typescript
// In Phaser scene, directly access wallet
import { useAccount } from 'wagmi';

class BattleScene extends Phaser.Scene {
  async mintFamiliar() {
    // Direct access to wallet - no cross-language calls needed
    const { address } = useAccount();
    // ... mint logic
  }
}
```

### 11.3 Migration Timeline

| Week | Task |
|------|------|
| Week 3 | Archive Unity, set up Phaser project, migrate data |
| Week 4 | Build core game loop + familiar renderer |
| Week 5 | Implement battle system + abilities |
| Week 6 | Integrate with React frontend + Web3 |

### 11.4 What We're NOT Migrating

- **Unity Editor scenes** - rebuild in Phaser code
- **C# scripts** - rewrite in TypeScript
- **Unity WebGL build pipeline** - use Vite for Phaser
- **CloudFront/S3 asset hosting** - bundle with Phaser or use Cloudflare R2

### 11.5 Future Considerations

**When to reconsider Unity:**
- If you need 3D graphics
- If you need mobile/desktop ports (Phaser is web-only)
- If you need visual scene editing for complex levels

**When to consider other engines:**
- **PlayCanvas** - if you need 3D in browser
- **Godot** - if you need cross-platform with visual editor
- **Three.js** - if you need pure 3D without game engine overhead
