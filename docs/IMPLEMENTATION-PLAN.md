# Implementation Plan — Phase 0 and First Slices

Status: ready for approval
Parent plan: `docs/PRODUCTION-READINESS.md`
Scope: correctness, test harness, migrations, CI, staging, and the first auth/data-model slices
Last updated: 2026-10-29

---

## 1. How to use this document

This is the execution companion to `docs/PRODUCTION-READINESS.md`. It turns Phase 0 into
atomic PR-sized tasks with files, tests, and done criteria. Do not start content authoring
until the Phase 0 correctness gate and the Phase 2a effect contract are complete.

Ground rules:

- No direct commits to `master`. One branch and PR per task below.
- Node 22. Local D1 only for development; production D1 commands are user-run.
- Every task includes its regression tests in the same PR.
- Keep the current game playable at every merge. If a data-model change breaks the Phaser
  client, update the client or add a compatibility adapter in the same PR.
- Do not touch applied production migrations. Freeze them and add a reconciliation
  migration.
- No SIWE, wallet linking, minting, IMX, or contract work in Phase 0/1. Blockchain/NFT is
  deferred by decision.

---

## 2. Branch and PR sequence

| Order | Branch | Scope | Depends on |
|-------|--------|-------|------------|
| 1 | `fix/battle-state-integrity` | Atomic writes, room binding, movement lock, restart/abandon, validation | none |
| 2 | `chore/ci-and-test-harness` | Root scripts, all-workspace CI, integration test setup, content validation skeleton | none (can run parallel with 1) |
| 3 | `chore/migration-audit` | Freeze applied migrations, production snapshot, reconciliation migration, smoke test | user-run D1 export |
| 4 | `chore/remove-preview-hud` | Delete `/preview`, preview components, unused HUD variants | none |
| 5 | `feat/guest-sessions-recovery` | Players/sessions/recovery, cookie auth, Turnstile, rate limits | same-origin spike, 2, 3 |
| 6 | `refactor/instance-familiars` | OwnedFamiliar model, save migrations, party by instance ID, client adapter | 1, 3, 5 |
| 7 | `feat/run-lifecycle` | Run loot/bank, defeat penalty, forfeit, first-clear rewards, battle resume matrix | 1, 6 |
| 8 | `refactor/combat-effect-contract` | AbilityEffect[], affinities[], abilityUnlocks, shield/control/drain/thorns/cleanse | 6, 7 |
| 9 | `feat/react-shell` | World map, team builder, collection, shop shell, responsive HUD | 5, 6, 7 |
| 10 | `feat/content-v1` | Regions, familiars, abilities, items, progression, shops, loot | 8, 9 |

Content authoring starts after PR 8 is merged and the manifest is frozen. PR 10 is split
into content-data PRs per region rather than one large PR.

---

## 3. User-run prerequisites

These need authenticated access and cannot be run by the agent under the current
privileges.

1. **Production D1 export**
   ```bash
   cd backend
   npx wrangler d1 export arcane-familiars --remote --output ../docs/d1-snapshot-2026-10-29.sql
   ```
   Confirm the actual database name from `backend/wrangler.jsonc`. Commit the snapshot if
   it contains no secrets, or store it in a private location and reference it in
   `docs/MIGRATIONS.md`.
2. **Cloudflare staging**
   - Create a staging Worker, D1 database, and Pages project.
   - Decide the staging hostname and API path (same-origin `staging.example.com/api`).
   - Provide the account/zone IDs needed for `wrangler.jsonc`.
3. **Turnstile** site key and secret for guest creation.
4. **Email provider** (if using magic-link recovery) or confirm code-only recovery.
5. **Branch protection / CI secrets** for Sentry and deployment tokens.
6. **Art pipeline owner** and confirmation of 10–13 artist-weeks for the 6-region tier.

---

## 4. Phase 0 task breakdown

### Task 01 — Fix battle state integrity

Branch: `fix/battle-state-integrity`

**Goal:** remove the reward-duplication, room-skip, free-heal, and invalid-action paths
before any content or UI work.

**Changes**

1. **Keep the upstream battle-row architecture**
   - `active_battles` remains the authoritative battle row; auth/rate-limit/daily-cap
     code depends on it.
   - Use `conditionalStateUpdate` for the state write and keep the battle statement in
     the same D1 batch.
   - Do not restart a battle by deleting the row; the start route rejects an existing
     battle with 409.
2. **Bind the battle to the fought room**
   - Add `roomId` to `BattleState`.
   - Set it in `/battle/start` from `dungeon.currentRoomId`.
   - On win, resolve the room from `battle.roomId` (falling back for legacy rows), not
     the player's current room.
   - Reject `explore`, `collect-treasure`, `exit`, party changes, and a second
     `battle/start` while an `active_battles` row exists.
3. **Restart / abandon / resume**
   - `/battle/start` returns 409 when an active battle row exists.
   - Add `POST /game/battle/abandon`: persist HP/MP and delete the battle row. For
     non-boss battles the encounter stays unresolved (same as flee); for boss battles
     abandon forfeits the run.
   - `dungeon/exit` persists the combatant, clears the battle row, and exits the dungeon.
   - Add `GET /game/bootstrap` with the reconciliation matrix from the parent plan.
4. **Validation**
   - Reject a 0-HP lead at `battle/start` or select a living party member.
   - Validate `targetId` belongs to the expected side and is alive.
   - Reject item use when it would heal 0 HP/MP; the item must not be consumed.
   - Keep the existing KO-cancel behavior and add the regression test.
5. **Client**
   - `game/src/scenes/BattleScene.ts`: bootstrap first, resume an active battle, call
     abandon on exit, and never restart a battle to heal.
   - `game/src/scenes/ExplorationScene.ts`: bootstrap, resume an active battle, and show
     an unresolved encounter after a refresh.
   - `game/src/api/client.ts`: add `bootstrap` and `abandonBattle`.

**Tests**

- `backend/test/battle-integrity.test.ts` (Cloudflare pool-workers + D1, 9 tests):
  - second start rejected;
  - room binding survives moving the current room;
  - abandon persists HP/MP and clears the battle;
  - dungeon exit clears the battle;
  - explore blocked during battle;
  - 0-HP start rejected;
  - full-HP potion not consumed;
  - invalid target rejected;
  - orphaned battle cleaned by bootstrap.
- `packages/game-logic` unit tests cover `reconcileActiveBattle`,
  `resolveBattleRoomId`, item usefulness, and target validation.

**Status:** merged into `master` on 2026-10-29 with the upstream auth/rate-limit/daily-cap
work. All backend and game-logic tests, type-checks, lint, and builds are green. The
remaining known gap is the two-row atomicity of `conditionalStateUpdate` + battle write
(P0.19); revisit it before adding more reward-bearing actions.

**Done**

- All tests pass against a local D1.
- The current Phaser client can complete a run, refresh mid-battle, abandon, and forfeit.
- No 409 path commits a partial write.

---

### Task 02 — CI and test harness

Branch: `chore/ci-and-test-harness`

**Goal:** make regressions visible before adding features.

**Changes**

- Root `package.json` scripts:
  - `type-check` → all workspaces
  - `test` → game-logic + backend integration + future e2e
  - `build` → frontend, game, backend dry-run
  - `lint` → ESLint (add config if absent)
- `.github/workflows/ci.yml`: add `game` and `packages/game-logic` jobs. Run tests, not
  just type-check/build. Cache all lockfiles.
- Add `vitest` + `@cloudflare/vitest-pool-workers` (or miniflare) for route integration
  tests with a test D1 schema.
- Add `packages/game-logic/src/utils/contentValidation.ts` and
  `content.test.ts` skeleton. It can start with current 10 familiars/8 abilities/10 items
  and grow with content.
- Add a bundle/asset budget script:
  - current baseline: game chunk 1.44 MB (375 KB gzip), assets 14 MB.
  - fail CI if the budget regresses by more than 10% until targets are set.

**Done**

- CI runs type-check, tests, and build for frontend, game, backend, and game-logic.
- A deliberately broken content reference fails CI.
- The baseline bundle/asset numbers are recorded in the PR description.

---

### Task 03 — Migration audit and smoke test

Branch: `chore/migration-audit`

**Prerequisite:** user-run production D1 export.

**Changes**

- Add `docs/MIGRATIONS.md`: list applied migrations, the production schema snapshot,
  known duplicates (`0003_*`), unused columns/tables (`revision`, `dungeon_runs`), and the
  reconciliation plan.
- Do not rename applied migrations. Add a new reconciliation migration only if the
  snapshot differs from what the migrations produce.
- Add `backend/test/migrations.test.ts`:
  - apply all migrations to a fresh local D1;
  - assert expected tables/columns/indexes;
  - apply the production snapshot plus the reconciliation migration and assert no errors.
- Add a CI job or script for the migration test.

**Done**

- Fresh local DB and production snapshot both migrate cleanly.
- The team can explain every column in `game_states` and every table in D1.

---

### Task 04 — Remove preview and dead HUD code

Branch: `chore/remove-preview-hud`

**Changes**

- Remove `/preview` from `frontend/src/App.tsx` and delete
  `FamiliarStatusPreview.tsx`, `CombinedControlsPreview.tsx`,
  `CircularArcPartyPreview.tsx`, `CircularArcVariations.tsx`,
  `CompactCardInContext.tsx`, and unused status variants.
- Keep one status card and one party panel. Add status chips in PR 9; do not delete the
  chosen component.
- Replace hardcoded HUD hex values with Tailwind tokens/CSS variables where safe.
- Verify no bundle imports remain.

**Done**

- `rg "Preview|Variations|CompactCardInContext" frontend/src` returns only intentional
  names.
- Frontend build passes and the bundle shrinks.

---

### Task 05 — Same-origin cookie spike and staging

Branch: `chore/same-origin-staging` (or infra-only PR)

**Goal:** prove the auth topology before building auth.

**Changes**

- Choose one:
  - Worker serves the SPA static assets and `/api` on one hostname; or
  - Pages Function proxies `/api` to the Worker.
- Create a throwaway staging Worker + Pages project (user-run Cloudflare setup).
- Add `GET /api/health` and a temporary `POST /api/auth/cookie-probe` that sets an
  HttpOnly cookie and a `GET /api/auth/cookie-probe` that reads it.
- Test with `credentials: 'include'` from the SPA origin, plus Safari/private mode.
- Document the result in `docs/MIGRATIONS.md` or a new `docs/DEPLOYMENT.md`.

**Done**

- Cookie is set and read on the chosen staging hostname.
- CORS/credentials are correct for the chosen topology.
- The probe endpoints are removed before production.

---

### Task 06 — Guest sessions and recovery

Branch: `feat/guest-sessions-recovery`

**Changes**

- Migrations: `players`, `sessions`, `recovery_codes`.
- `POST /api/auth/guest`: Turnstile verification, create player + session, set HttpOnly
  cookie.
- `POST /api/auth/recover`: redeem a one-time recovery code, rotate the session.
- Onboarding issues a recovery code and (optionally) emails a magic link.
- Session middleware resolves `playerId`; all game routes use it and reject missing
  sessions.
- Remove `anonymousId` from request types and routes.
- One-time signed migration for legacy `af_anonymous_id`; keep a mapping table or
  `legacy_anonymous_id` column with an expiry.
- Remove `/auth/register` and the unused `users` table dependency.
- Rate limits, body limits, security headers, CORS credentials.
- Add CSRF protection for cookie mutations.

**Tests**

- Guest creation sets a cookie.
- Recovery on a second browser restores the same player and save.
- Cookie deletion then recovery works.
- Expired/used recovery code rejected.
- Missing/invalid session on every game route returns 401.
- IDOR: player A cannot read or mutate player B's state.
- Legacy anonymous ID migrates exactly once.
- Rate limit returns 429.

**Done**

- A new player can play, refresh, clear cookies, recover on another browser, and keep
  progress.
- No game route accepts a client-supplied identity.

---

### Task 07 — Instance familiars and save migrations

Branch: `refactor/instance-familiars`

**Changes**

- Add `OwnedFamiliar` and `schemaVersion` to `GameState`.
- Migrate `playerFamiliars: string[]` to `ownedFamiliars: OwnedFamiliar[]`; create one
  instance per species in the old array.
- Change `activeParty`, run party, and battle start to instance IDs.
- Update `validateParty` to validate instance ownership and uniqueness.
- Update `game/src/api/client.ts`, `PartySelectScene`, `BattleScene`, and
  `ExplorationScene` to carry instance IDs.
- Add `migrateState(raw)` with fixtures for v1 (species array) and v2 (instances).
- Handle older saves missing `dungeon.partyHp`/`partyMp`.

**Tests**

- v1 save migrates to v2 without data loss.
- Party validation rejects an instance not owned, duplicate instance, and wrong size.
- Battle/run start uses instance IDs.
- A full Meadow run works after migration.
- Corrupt JSON returns a recoverable error, not a 500.

**Done**

- Existing saves migrate on load and persist the upgraded shape.
- The client completes a run with instance IDs.

---

### Task 08 — Run lifecycle

Branch: `feat/run-lifecycle`

**Changes**

- Add `RunState` with `loot`, `goldEarned`, party, region, seed, counters.
- Loot drops and battle gold go to the run, not the bank.
- Exit/victory merges run loot.
- Defeat discards run loot and subtracts `goldEarned` only (never negative).
- Add forfeit for exploration and battle with a confirmation payload.
- First-clear rewards: gold, item, guaranteed recruit (not a starter species for region 1).
- Add run history if the table is kept; otherwise drop `dungeon_runs`.
- Update HUD outcome screen to show what was kept/lost.

**Tests**

- Defeat drops only run loot and earned gold.
- Shop purchases are not refunded.
- Exit banks loot exactly once (idempotent on retry).
- Forfeit from exploration and boss battle both clean up the battle row and run.
- First clear is awarded once.

**Done**

- The push-your-luck loop is real: leaving banks, dying loses run gains.

---

### Task 09 — Combat effect contract

Branch: `refactor/combat-effect-contract`

**Changes**

- Replace `AbilityData.effectType/statusEffect` with `effects: AbilityEffect[]`.
- Add `shield`, `control`, `drain_hp`, `drain_mp`, `thorns`, `cleanse` kinds.
- Add `BattleFamiliar.shield` and serializable status snapshots.
- Add `affinities: Affinity[]` and `abilityUnlocks`.
- Extend `ItemEffectSpec` with `flee`, `reveal_map`, `capture_bonus`, `dot`, `shield`.
- Implement control skip in `resolveTurn`, shield absorption in `applyActionResult`,
  thorns after damaging hits, drain from actual values.
- Update AI to understand the new effect kinds.
- Update the HUD payload with status effects, cooldowns, and affinity.

**Tests**

- One test per effect kind.
- Shield absorbs before HP and expires.
- Control skips the target's next action and decrements.
- Thorns triggers once per damaging hit.
- Drain uses actual damage/healing.
- KO stops later effects.
- Bidirectional speed ordering still deterministic.

**Done**

- The content schema is frozen; content PRs can be authored without engine changes.

---

### Task 10 — React shell and responsive HUD

Branch: `feat/react-shell`

**Changes**

- Add `WorldMapPage`, `TeamBuilderPage`, `CollectionPage`, `ShopPage`, `ProfilePage`.
- Replace `WorldMapScene`, `PartySelectScene`, and `DungeonFailScene` with React routes.
- Mount Phaser only on `/play/run`; canvas is presentational.
- Build `BattleCommandBar`, `AbilityPicker`, `ItemPicker`, `StatusChipRow`,
  `TurnOrderBar`, `EncounterPreview`, `TreasureCard`, `BattleOutcome`.
- Add onboarding + starter pair selection.
- Add keyboard shortcuts, focus management, ARIA live log.
- Mobile layout at 375px, 768px, 1280px.
- Hard budgets: JS < 300 KB gzip initial, LCP < 2.5 s on 4G.

**Tests**

- Playwright: onboarding → team builder → run → battle → outcome.
- Collection with 40 familiars scrolls and selects exactly 2.
- Status/cooldown chips match the battle state.
- Keyboard-only battle works.
- 375px no horizontal overflow.
- Bundle budget passes.

**Done**

- The game is playable end-to-end without touching Phaser-drawn menus.

---

## 5. Phase 0 acceptance gate

Phase 0 is complete when all of these are true:

- [ ] `npm run type-check` passes for frontend, game, backend, game-logic
- [ ] `npm test` passes for game-logic and backend integration
- [ ] `npm run build` passes for frontend, game, backend dry-run
- [ ] CI runs all four workspaces and the migration test
- [ ] No duplicate reward can be produced by a concurrent action
- [ ] No room-skip or boss-skip is possible by moving during battle
- [ ] Restarting, refreshing, exiting, abandoning, and forfeiting are all deterministic
- [ ] Zero-HP start, invalid target, and useless-item cases are rejected
- [ ] Production migrations are frozen and documented
- [ ] Same-origin cookie topology is proven on staging
- [ ] `/preview` and dead HUD variants are removed
- [ ] Baseline bundle and asset budgets are recorded
- [ ] Current game is still playable at the Phase 0 commit

Do not merge from Phase 0 to Phase 1 until the gate is green.

---

## 6. First PR in detail

Start with `fix/battle-state-integrity` because it removes exploitable behavior and
unblocks every later data-model decision.

**Files likely touched**

- `backend/src/routes/game-battle.ts`
- `backend/src/routes/game-exploration.ts`
- `backend/src/routes/game-state.ts`
- `backend/src/index.ts` (cron/lifetime)
- `backend/src/utils/saveManager.ts` (optional)
- `packages/game-logic/src/types/battle.ts` (`roomId`)
- `packages/game-logic/src/types/exploration.ts` (if run state changes)
- `packages/game-logic/src/utils/validation.ts`
- `game/src/api/client.ts`
- `game/src/scenes/BattleScene.ts`
- new `backend/test/battle-integrity.test.ts`
- new or updated `packages/game-logic/src/utils/__tests__/validation.test.ts`

**Suggested commits**

1. `fix(battle): guard state and battle writes on the same turn`
2. `fix(battle): bind encounters to the fought room`
3. `fix(battle): reject restart and add abandon`
4. `fix(battle): validate targets and useless item use`
5. `test(battle): add integrity regressions`
6. `fix(client): resume or abandon instead of restarting`

**Verification**

```bash
npm run backend:type-check
npm run game:type-check
npm test --prefix packages/game-logic
npm run test --prefix backend   # once the integration harness exists
npm run frontend:build
```

---

## 7. What can run in parallel

- Task 01 (battle integrity) and Task 02 (CI harness) can run in parallel.
- Task 03 (migration audit) needs the user-run export; it can start once the snapshot
  exists.
- Task 04 (preview cleanup) is independent and safe.
- Task 05 (cookie spike) needs Cloudflare staging access.
- Art concept exploration can start once the manifest is sketched, but production art
  waits for Task 09 (effect contract) and the content manifest.

Do not run Task 06 (auth) and Task 07 (instance model) in parallel on the same files:
both touch save loading and route identity. Sequence them.

---

## 8. Approval needed to start

Reply with approval for the `fix/battle-state-integrity` PR and any user-run prerequisites
you can complete (D1 export, staging hostname). Once approved, the first implementation
step is Task 01 on branch `fix/battle-state-integrity`, with tests written before the
route changes.
