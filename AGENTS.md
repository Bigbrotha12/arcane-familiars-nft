# Agent Conventions for Arcane Familiars

## Branching & Pull Requests

> **Established Phase 1.6** — all future work follows this convention.

1. **No direct commits to `master`.** All changes must go through feature branches and pull requests.

2. **Branch naming:**
   - `feature/<short-description>` — new features (e.g., `feature/phaser-battle-system`)
   - `fix/<short-description>` — bug fixes
   - `refactor/<short-description>` — refactoring
   - `step-<N>-<M>` — phased implementation steps (e.g., `step-2-1`)

3. **PR process:**
   - Create a branch from the latest `master`
   - Make changes with clear, atomic commits
   - Push and open a PR with a descriptive title and summary
   - Ensure CI (GitHub Actions) passes
   - Request review (human or agent) before merging
   - Merge with squash to keep history clean

4. **Commit message style:**
   ```
   <area>: <brief description>
   
   <optional details, why, tradeoffs>
   ```

## Project Structure

```
/
├── backend/         # Cloudflare Worker (Hono + D1)
├── blockchain/      # Smart contracts (Hardhat)
├── docs/            # Plans, decisions, reference
├── frontend/        # React SPA (Vite + SWC)
└── AGENTS.md        # This file — agent conventions
```

## Key Decisions

| Decision | Rationale |
|----------|-----------|
| Cloudflare Workers over AWS Lambda | Single provider for compute + DB + storage |
| D1 (SQLite) over MongoDB | No existing Mongo schemas, simpler, no separate DB server |
| Hono over raw Workers | Type-safe routing, middleware ecosystem |
| Vite over webpack | ~10x faster builds, native ESM |
| SWC over Babel | ~20x faster JSX transform |

## Design System
Always read DESIGN.md before making any visual or UI decisions.
All font choices, colors, spacing, and aesthetic direction are defined there.
Do not deviate without explicit user approval.
In QA mode, flag any code that doesn't match DESIGN.md.
