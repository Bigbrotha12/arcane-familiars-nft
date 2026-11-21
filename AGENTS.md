# Agent Conventions for Arcane Familiars

## Branching & Merge Workflow

Single-integration-branch flow. All work merges into **`staging`** locally; only
`staging` is synced upstream; new features reach `origin/master` via `staging`.

1. **No direct commits to `master`.** `master` advances only by merging
   `staging` (a PR `staging → master`). Feature branches never touch `master`.

2. **Branch naming (local feature branches):**
   - `feature/<short-description>` — new features (e.g., `feature/phaser-battle-system`)
   - `fix/<short-description>` — bug fixes
   - `refactor/<short-description>` — refactoring
   - `step-<N>-<M>` — phased implementation steps (e.g., `step-2-1`)

3. **Feature → staging → master flow:**
   - Refresh local `staging` from the remote first:
     `git checkout staging && git pull origin staging`.
   - Create a local feature branch from the latest `staging`
     (`git checkout -b <branch> staging`).
   - Make changes with clear, atomic commits on the feature branch.
   - Verify before merging (tests / type-check / lint green).
   - Merge the feature branch into local `staging`
     (`git checkout staging && git merge <branch>`).
   - **Feature branches are local-only — never pushed upstream.**
   - **`staging` is the only branch pushed to the remote**
     (`git push origin staging`).
   - To ship, open a PR `staging → master` (squash merge keeps `master` history
     clean), or — for a fully local flow — merge `staging` into `master` locally
     and push `master`. `master` must never receive a feature branch directly.

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
├── docs/            # Plans, decisions, reference
├── frontend/        # React SPA
├── game/            # web-based 2d game
└── AGENTS.md        # This file — agent conventions
```

Accounts use email/password auth; the game is a standalone web game.

## Design System

Always read DESIGN.md before making any visual or UI decisions.
All font choices, colors, spacing, and aesthetic direction are defined there.
Do not deviate without explicit user approval.
In QA mode, flag any code that doesn't match DESIGN.md.

## Game Assets

Game art (backgrounds, portraits, sprites, effects, icons) may be either
generated or **sourced from the internet under a permissive licence**.

- **Allowed licences: CC0 1.0 and CC-BY (3.0 or 4.0) only.** No CC-BY-SA, no
  CC-NC, no "free for personal use", no unclear or missing licence, and no
  packs that forbid redistribution (images are committed to this repo).
- **Record every sourced file** in `docs/assets/CREDITS.md`: path in the repo,
  title, author, source page URL, licence, and any changes made (crop, resize,
  recolour). Keep a copy of the licence text under
  `game/public/assets/licenses/`.
- **CC-BY needs visible credit.** CC-BY items must also appear on the in-app
  `/credits` page (linked from the footer).
- **Keep styles consistent.** Familiar portraits should come from one source
  or a small set of visually matching sources; never mix pixel art with
  painted art in the same asset family. Match the existing size specs
  (portrait 256×256 transparent PNG, room 768×576, battle chamber 800×600,
  effect sheets 96×96 frames in one row).
- Audio is fetched by a script rather than committed, and has its own source
  list; see `docs/AUDIO-PIPELINE.md`.
