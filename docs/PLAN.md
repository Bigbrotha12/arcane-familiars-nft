> # SUPERSEDED
> **This document is outdated and does not reflect the current project.** It describes a 2023-era plan (Unity, webpack, MUI). The canonical, up-to-date project overview is [`README.md`](../README.md); workstream/roadmap detail lives in [`docs/PRODUCTION-DEPLOYMENT-GAP-PLAN.md`](./PRODUCTION-DEPLOYMENT-GAP-PLAN.md).
> _Marked superseded as part of Workstream 6 (step 26), September 2026. Kept for historical reference only._

# Arcane Familiars NFT - Project Plan

## 1. Project Overview

**Arcane Familiars** is a browser-based NFT game integrated with Immutable X (IMX) L2 marketplace. Players summon familiars (NFTs) with stats (HP, MP, Attack, Defense, Arcane, Speed) and abilities, and interact through a React frontend that embeds the game built with Phaser 3.

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
- **Decision:** Replacing Unity WebGL with **Phaser 3** (see Section 11 for rationale)

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

1. **Phaser 3 Game (Core Loop)**
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
| **Game** | Unity WebGL (basic) | **Phaser 3** (TypeScript, native browser) |
| **Blockchain SDK** | @imtbl/imx-sdk, @imtbl/core-sdk | **@imtbl/sdk** (latest unified SDK) |
| **Contracts** | Hardhat + Solidity 0.8.17 | **Foundry** (faster) + Solidity 0.8.28+ |
| **Testnet** | Ropsten, Goerli | **Sepolia** |
| **Hosting** | Netlify + CloudFront + S3 | **Cloudflare Pages** (unified) |
| **Auth** | Custom Ethereum signature sessions | **SIWE** (Sign-In with Ethereum) via backend |
| **CI/CD** | None | **GitHub Actions** |

---

## 8. Phased Execution Plan

### Phase 1: Foundation ✅ COMPLETED
- [x] Remove `amplify/` directory entirely
- [x] Remove `admin/worker/` directory
- [x] Remove `frontend/backend/functions/` directory
- [x] Archive `game/` Unity project to `game-unity-legacy/`
- [x] Rotate exposed Infura API key
- [x] Backend scaffolding with Hono + TypeScript (5 route files)
- [x] D1 schema + migrations (5 tables, seed data applied)
- [x] API endpoints (assets, balances, auth, collection, metadata)
- [x] Vite + SWC migration (webpack/Babel removed)
- [x] Build scripts (dev, build, type-check for both frontend + backend)
- [x] Remove deprecated `@imtbl/imx-sdk`
- [x] Remove `react-unity-webgl` + Unity dead code
- [x] Remove `ethers` + blockchain verification layer from backend
- [x] Goerli → Sepolia testnet migration
- [x] GitHub Actions CI (frontend + backend, type-check + build)
- [x] Deploy worker (`wrangler deploy`) — pending infra setup

### Phase 2: Game Prototype (Week 3-6)
- [ ] Set up Phaser 3 project with TypeScript
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
- [x] Complete `wrangler login`
- [x] Create D1 database: `wrangler d1 create arcane-familiars`
- [x] Apply migrations: `wrangler d1 migrations apply arcane-familiars --remote`
- [x] Seed data: `wrangler d1 execute arcane-familiars --remote --file ./seeds/0001_seed_familiars.sql`
- [x] Deploy worker: `wrangler deploy`

---

## 9. Immediate Action Items

4. **Decision:** Confirm Immutable X is still the chosen L2 (vs Base, Arbitrum, etc.)
5. **Scope:** Approve the MVP scope above before proceeding

---

## 10. Summary

This project has solid architectural bones (proxy contracts, data schemas, frontend shell) but needs significant modernization and actual game development to become viable. The key is to **stop maintaining 3 backends and deprecated testnets**, consolidate to a modern stack, and focus on making a **playable game first** before layering on blockchain complexity.

---

## 11. Game Engine Migration: Unity WebGL → Phaser 3

### 11.1 Decision Rationale

**Why Phaser 3 over Unity WebGL:**

| Factor | Unity WebGL | Phaser 3 | Winner |
|--------|-------------|-----------------|--------|
| **Bundle size** | 10-30MB minimum | ~500KB (Phaser) | **Phaser** |
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

---

## 12. Frontend Design Implementation

Based on the **DESIGN.md** design system (created 2026-07-27 via /design-consultation).

### 12.1 Design System Foundation

The complete design system is defined in `DESIGN.md` at the repo root. Key tokens have been extracted as CSS custom properties in the design preview (`/home/bigbrotha/.gstack/projects/Bigbrotha12-arcane-familiars-nft/designs/design-system-20260727/preview.html`).

**The design system must be migrated from the preview HTML into the actual project as:**
- CSS custom properties on `:root` (matching the preview's `--bg-primary`, `--accent`, etc.)
- Tailwind CSS theme extension in `tailwind.config.js`
- Dark mode media query or class toggle

### 12.2 Page Inventory

| Page | Route | Priority | Description |
|------|-------|----------|-------------|
| **Landing/Homepage** | `/` | P0 | Full marketing landing: hero → creature showcase → how it works → battle preview → community → footer |
| **Game Canvas** | `/app/game` | P0 | Phaser 3 game canvas with HUD overlay, stats, ability panel |
| **Wallet Connect** | *(modal/overlay)* | P0 | "Connect Wallet" modal: MetaMask, WalletConnect, IMX options |
| **Collection** | `/app/collection` | P1 | Grid of owned familiars with stats, rarity badges |
| **Marketplace** | `/app/marketplace` | P2 | Browse/trade familiars (or link to IMX marketplace) |
| **Minter/Summon** | `/app/minter` | P1 | Mint a new familiar flow |
| **Settings** | `/app/settings` | P2 | Account, preferences, dark mode toggle |

### 12.3 Implementation Order

#### Step 1: Design Token Migration (Phase 4 prep)
- [ ] Convert CSS custom properties from preview into `frontend/src/styles/design-tokens.css`
- [ ] Extend `tailwind.config.js` with the design system colors, fonts, spacing, border-radius
- [ ] Set up dark mode class-based toggle in Tailwind
- [ ] Remove/archive old MUI theme (`frontend/src/assets/Material.ts`)

#### Step 2: Component Library Setup
- [ ] Install shadcn/ui components (as planned in Phase 1)
- [ ] Create design system wrapper components:
  - `Button` — variants: primary, secondary, ghost (using accent palette)
  - `Card` — creature card, stat card, feature card
  - `Badge` — rarity badges (common, rare, epic, legendary)
  - `Input` — form inputs with the warm palette
  - `Alert` — success, warning, error variants
  - `Modal` — wallet connect, summon familiar dialogs
- [ ] Create layout components:
  - `Nav` — top nav with logo, links, wallet button
  - `Footer` — simple footer with links
  - `PageContainer` — constrained max-width wrapper

#### Step 3: Landing Page Redesign
- [ ] Hero section: familiar mascot + "Collect. Battle. Earn." + two CTAs
- [ ] Creature showcase: horizontal scrollable grid of familiar cards
- [ ] "How It Works" section: 4-step journey
- [ ] Battle preview: side-by-side creature comparison with ability cards
- [ ] Community section: Discord/Twitter CTAs
- [ ] Footer: Privacy, Terms, White Paper, Docs links
- [ ] Dark mode toggle in header/footer

#### Step 4: Game Canvas Page
- [ ] Full-screen Phaser 3 canvas with game HUD overlay
- [ ] Creature stats panel (HP, MP, ATK, DEF, SPD bars)
- [ ] Ability cards panel at bottom
- [ ] Battle log / event feed
- [ ] Player profile mini-card (avatar, level, currency)

#### Step 5: Wallet Integration
- [ ] Connect Wallet button → modal overlay
- [ ] Wallet options: MetaMask, WalletConnect, IMX Passport
- [ ] Connected state: truncated address + balance display
- [ ] Disconnect option in dropdown

#### Step 6: App Shell
- [ ] Consistent nav bar across all logged-in pages
- [ ] Sidebar or bottom tab navigation for app routes
- [ ] Page transitions with the established motion system

### 12.4 Design Quality Gates

Before shipping any page, verify:
- [ ] Matches DESIGN.md tokens (colors, fonts, spacing)
- [ ] Dark mode renders correctly
- [ ] Responsive at mobile (375px), tablet (768px), desktop (1200px+)
- [ ] No blockchain jargon on marketing pages (landing, about)
- [ ] WCAG AA contrast on all text/background combinations
- [ ] Creature cards use the card style (rounded, shadow, hover lift)
- [ ] CTA buttons use accent (#7C5CFC) with white text
- [ ] No Inter, Roboto, Space Grotesk, or system-ui fonts (use Fredoka + DM Sans)

### 12.5 Current Frontend Dependencies

The existing stack uses MUI + TailwindCSS + Redux. The redesign should:
- **Keep:** TailwindCSS, React Router, Vite
- **Replace:** MUI components → shadcn/ui + custom design system components
- **Replace:** Redux → React Context (already planned in Phase 1)
- **Remove:** MUI theme (`frontend/src/assets/Material.ts`), legacy component structure

### 12.6 File Structure (Proposed)

```
frontend/src/
├── components/
│   ├── ui/              # Design system primitives (Button, Card, Badge, Input, Modal)
│   ├── layout/          # Nav, Footer, PageContainer
│   ├── landing/         # Hero, CreatureShowcase, HowItWorks, BattlePreview, Community
│   └── game/            # GameCanvas, StatPanel, AbilityCards, BattleLog
├── styles/
│   └── design-tokens.css
├── app/
│   ├── hooks/           # useWallet, useTheme, etc.
│   └── constants/       # AppConfig (updated)
├── App.tsx              # Updated routing
└── index.tsx            # Entry point (keep ErrorBoundary pattern)
```
