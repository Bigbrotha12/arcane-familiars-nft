# Agent Conventions for Arcane Familiars

## Branching & Pull Requests

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

4. **Authenticated commands require user intervention.** SSH publickey auth is
   not configured for this machine, so any command that needs credentials
   (`git push`, `gh` API/PR commands, etc.) must be run by the user. The agent
   must NOT run them. Commit locally, then hand the exact command(s) to the
   user and let them run them. Wait for confirmation before proceeding — e.g.
   only open the PR via `gh` after the user confirms the push succeeded.

## Project Structure

```
/
├── backend/         # Cloudflare Worker
├── blockchain/      # Smart contracts
├── docs/            # Plans, decisions, reference
├── frontend/        # React SPA
├── game/            # web-based 2d game
└── AGENTS.md        # This file — agent conventions
```

## Design System

Always read DESIGN.md before making any visual or UI decisions.
All font choices, colors, spacing, and aesthetic direction are defined there.
Do not deviate without explicit user approval.
In QA mode, flag any code that doesn't match DESIGN.md.

## Asset Generation

All game asset generation (sprites, portraits, animations, VFX, backgrounds, UI components) MUST follow the workflow in `docs/assets/ASSET-GENERATION.md`. This document defines the ComfyUI environment, model stack, saved workflows, prompt conventions, spritesheet specs, and the full pipeline from generation through assembly and wiring. Do not improvise asset creation — use the established process.
