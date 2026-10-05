# Arcane Familiars — Production Deployment Gap Analysis & Remediation Plan (v4)

> Scope: bringing the **game app** (frontend React SPA + Cloudflare Worker + Phaser game + shared `game-logic` engine) to a **production deployment**. The blockchain and NFT workstream (contracts, wallet connect, mint, IMX trading) is tracked separately at the end — it is explicitly the "next milestone" per the README and is out of scope for the game app to be *playable in production*.
>
> Severity: **BLOCKER** = deploy cannot succeed as written; **HIGH** = must fix before the monetized launch; **MEDIUM** = must fix during implementation (or its acceptance fails); **LOW** = harden/cleanup, handle inline.
>
> **v4 revision note:** Three adversarial review rounds, each verified against the code. Round 1 (v1→v2) fixed the backend lockfile/migration blockers and the auth-rekey design. Round 2 (v2→v3) fixed the remaining lockfile staleness (all three per-package lockfiles), `VITE_BACKEND_URL` wiring, a P0/P1 test contradiction, durable backups, and the `_redirects` location. **Round 3 (v3→v4) verdict: CONDITIONAL with no blockers** — two conditions (exact CI surgery; a concrete §5 gate) plus one wording fix were required before implementation, all folded into the workstreams below. Round-3 findings M1–M3/L1–L8 are in §8c. This plan is now ready for implementation.
>
> **v5 revision note (2026-10-05) — IMPLEMENTED; one material deviation.** WS0–WS6 are done and green locally. The deviation: WS2 identity shipped as **Immutable Passport OIDC** (JWKS-verified ID tokens via `jose` + an EIP-191 `personal_sign` wallet-binding challenge stored in D1), **not** the SIWE + backend-HMAC-JWT + KV-nonce design written in §2.K/§2.L and WS2 steps 9–12; `JWT_SECRET` is not used. Guest trial and `POST /api/auth/adopt` are as documented. A post-implementation review (same date) closed three findings: (1) a present-but-invalid `Authorization` token now returns **401** instead of silently downgrading a signed-in player to their anonymous guest key, with client-side silent refresh + a single retry; (2) the rate limiter now keys on **client IP only** (the pre-auth `ip:token` hash was bypassable by rotating a bogus `Bearer`); (3) dungeon/party mutations are blocked while a battle is active, including a **write-time** `NOT EXISTS (active_battles)` guard that closes the lost-win race described in WS4-F1. Remaining: the blockchain and NFT track (§7) is incomplete — BC0 is done and the BC2 mint seam / BC4 ownership flag are scaffolded but disabled by default — and the client-facing refresh path assumes a live Passport session.

---

## 1. What is already production-ready (good)

- **Server-authoritative combat.** The Worker owns battle/inventory/dungeon state; the client only sends actions. Battle writes are atomic and conditionally-guarded on `turnCount`/`version` (`game-battle.ts:479-508`, `saveManager.ts:72-89`), so stale/concurrent writers fail with 409 rather than corrupt state.
- **Robust input validation** on game routes: area unlock checks, party membership checks, KO-cancellation-aware item validation, server-derived enemy identity (`game-exploration.ts:35-80`, `game-battle.ts:111-211`).
- **Optimistic concurrency control** (`version` column, `saveGameStateIfVersion`).
- **Prod CORS allowlist** restricts origins to `https://arcane-familiars.pages.dev` (`index.ts:16-28`); `allowHeaders` already includes `Authorization` (`index.ts:26`).
- **Scheduled cleanup** cron purges abandoned battles/finished runs so D1 doesn't grow unbounded (`index.ts:65-77`).
- **No committed secrets.** `.env`, `.dev.vars` are gitignored; only `frontend/.env.example` (placeholders) is tracked.
- **Verified green locally:** `game-logic` vitest **127 tests pass** (6 files), frontend type-check + build succeed, root lockfile correctly links both `@arcane-familiars/game` and `@arcane-familiars/game-logic` (verified in `package-lock.json:78-82`).

> **Local-vs-CI trap (verified):** all three per-package lockfiles (`backend/`, `frontend/`, `game/`) are **stale** — they omit the `@arcane-familiars/*` workspace deps, and `game` pins `phaser ^3.88.0` vs the required `^4.2.1`. Everything passes locally only because npm **hoists** to the root `node_modules`. CI runs isolated `npm ci` per workspace, which fails at install. Every CI job below runs from the **workspace root**.

---

## 2. Gap analysis (severity-ranked, v4)

### A. Identity & authentication — **HIGH (before monetized launch)**
- The game is keyed on a client-generated `anonymousId` stored in `localStorage` and sent **in the request body** of every call (`game/src/api/client.ts:16-26,54`). Passport (wallet) sign-in is implemented: a verified Bearer token's `sub` becomes the account key, and `readBody` (`utils/http.ts`) overrides the body `anonymousId` with it — identity is derived server-side from the token, never trusted from the body.
- **Product decision (supersedes §2.L / WS2 step 13):** anonymous **guest trial play is allowed in ALL environments including prod**, keyed by the client UUID (`af_anonymous_id`). On Passport sign-in, `POST /api/auth/adopt` re-keys a guest state (`is_anonymous = 1` → 0) to the wallet account — session restored. Adopt does not prove UUID ownership (`routes/auth.ts:52`: "no proof of ownership"); accepted for a non-monetized slice.
- **Consequence:** identity remains forgeable until monetization — the biggest trust-boundary gap. Sequenced **P1 (before any monetization/NFT link), not P0**; the guest-trial/adopt trade-off is the deliberate design, re-reviewed before monetizing.

### B. No CI/CD deployment pipeline; CI is currently red at install — **BLOCKER**
- `.github/workflows/ci.yml` runs `npm ci` **inside** `frontend/` and `backend/` against stale per-package lockfiles (R1). All install jobs fail. Even when fixed, CI runs only `type-check` + `build` — no deploy, no tests, no lint, no environments.
- `backend/package.json` `build` is a **dry-run**; `deploy` exists but nothing triggers it.
- **No frontend static-hosting config** (no Cloudflare Pages config, no `_redirects`, no `wrangler.toml`). SPA routes `/app/*`, `/play/*`, `/preview/*` (`App.tsx:10-41`) would 404 without an SPA rewrite.

### C. Workspace dependency resolution broken in CI — **BLOCKER** *(R1/F1/R1, verified)*
- The per-package lockfiles omit `@arcane-familiars/game-logic` (backend) and `@arcane-familiars/game` (frontend); game pins `phaser ^3.88.0`. Regenerating a standalone backend lockfile is **not viable**: `@arcane-familiars/game-logic` is `private: true` with no registry version (R4).
- **Fix (v3):** single workspace-root `npm ci` for all CI jobs; delete the three stale per-package lockfiles.

### D. Migration command for prod does not exist — **BLOCKER** *(R1/F2, verified)*
- `backend/package.json:13` is `wrangler d1 migrations apply arcane-familiars-dev --local`; no script targets prod `arcane-familiars --remote` (the migrations' own header `0001:2` documents the intended invocation).
- **Fix:** add `db:migrate:remote` and `db:migrate:staging` scripts (WS0 step 2).

### E. Production SPA not wired to the backend URL — **BLOCKER** *(R2/R2, verified)*
- `game/src/api/client.ts:19` is the **only** consumer of `VITE_BACKEND_URL` and falls back to `http://localhost:8787`.
- **Fix:** WS1 step 6 sets `VITE_BACKEND_URL=https://<prod-worker-url>` for prod and the staging Worker URL for staging. The Worker URL is the **API base**, never a CORS allowlist entry (M3, corrected in WS1).

### F. No rate limiting / abuse protection — **HIGH**
- No rate limiting, throttling, or per-client quota on any Worker route. With forgeable `anonymousId` + no auth, unlimited battle spam, currency farming, and D1 write amplification are possible.
- **Mechanism decision (shipped):** a D1-backed fixed-window rate limiter (`backend/src/middleware/rateLimit.ts`, migration `0010_rate_limits.sql`) applies to ALL `/api/*` traffic — 120 req/60s per client IP (or per SHA-256(ip:token) when a Bearer token is present), fail-open, 429 + Retry-After, with cron cleanup. This deviates from the earlier plan wording ("Cloudflare ratelimit binding / KV counters"); the deviation is accepted and the plan is corrected here. Per-wallet quotas (if any) remain a KV counter; not implemented.

### G. Anti-farming economics unaddressed — **MEDIUM/HIGH** *(R1/F13)*
- Currency is farmable: `generateBattleRewards` (`game-battle.ts:100-109`) grants `40 + rng()*30` currency + 35% potion chance per win; no stamina/energy system. Rate limiting caps *request rate*, not *farming throughput*.
- **Fix:** explicit design decision (daily battle/currency cap or energy) with an owner + dated re-review if deferred (R18).

### H. No observability / error tracking — **MEDIUM** *(addressed by WS5 step 20)*
- Only `console.error` + the `onError` 500 handler (`index.ts:58-61`). No structured logging, request IDs, metrics, error reporting, or `observability` config in `wrangler.jsonc`.
- **Status:** addressed — Workers Observability enabled in `wrangler.jsonc`; request-id on every log line (see WS5 step 20). The alert rule remains a manual user step (runbook).

### I. Tests not wired into CI — **MEDIUM**
- `game-logic` vitest (127 tests) never runs in CI, and `backend` route handlers have no tests. The retired legacy contracts never had a CI job; their package was removed in BC0 and the replacement Immutable Chain track is unstarted (§7).
- **Mechanism decisions (v3):** backend tests via `@cloudflare/vitest-pool-workers` (real `workerd` + D1). `game-logic` tests run with `working-directory: packages/game-logic` + `npm test` (its `include` glob resolves relative to cwd — root invocation collects 0 tests, R9).

### J. No staging environment, no rollback design — **MEDIUM**
- No staging Worker/D1/Pages. Auto-migrating prod with no durable pre-migration backup means the first bad migration is applied before rollback is possible.
- **Fixes (v3):** staging env (own D1 + Pages) deployed first, with staging **migrations run in the staging job** (R8); pre-migration backup to a **durable destination** — R2 or a GH artifact (R6); restore-as-rollback runbook moved into P0 (R10).

### K. Cross-origin session transport not designed — **HIGH (before monetized launch)**
- Frontend on `arcane-familiars.pages.dev` and backend on `*.workers.dev`/custom domain are different origins — cookies cannot be shared and `index.ts` sets no `credentials`. **Bearer header only** (R1/F4): signed JWT via `Authorization: Bearer`, single-use expiring nonce, client stops sending identity in the body.
- **Also required (R5):** backend **auth middleware** that verifies the JWT, resolves the account from the wallet binding, and replaces body-derived `anonymousId` in **all** `/api/game/*` handlers — client-only change leaves identity forgeable.
- **Status:** implemented — `authMiddleware` (`backend/src/middleware/auth.ts`) + `readBody` override + `POST /api/auth/adopt`; the prod-enforcement half is superseded by decision (see §2.L).

### L. "anonymousId fallback for dev only" is unenforceable — **HIGH (before monetized launch)** *(superseded by decision)*
- No env gating forces wallet auth in prod; no backend flag rejects anonymous requests.
- **Original fix:** backend `ENVIRONMENT === 'production'` guard rejects `/api/game/*` without a verified `Authorization` token (401); client requires sign-in before initializing `gameApiClient` in prod; CI test asserts anonymous rejection in the prod env. Staging sets `ENVIRONMENT: "staging"` (not `development`) so staging CORS stays allowlisted and only `=== 'production'` enables the guard (R14).
- **SUPERSEDED (product decision, see §2.A):** guest trial play is deliberately allowed in prod, so the 401 guard and the client prod sign-in gate were NOT implemented; `authMiddleware` passes guests through in all environments and `backend/test/prod-auth.test.ts` documents that. Revisit before monetization (enforce the guard or ship wallet-only play).

### M. D1 backup / DR — **MEDIUM** *(addressed by WS5 step 21)*
- No automated backup. `wrangler d1 export` is CLI-local — a scheduled Worker cannot shell out to it.
- **Status:** addressed — **D1 Time Travel is the sole DR mechanism** (always-on, free, 7 days Free / 30 days Paid retention; restore in place via `wrangler d1 time-travel restore` — see WS5 step 21 and the runbook). A nightly export/R2 job was considered and **removed as unnecessary** (no >7-day recovery requirement). The WS1 pre-migration backup in `deploy.yml` (GH artifact `d1-backup-*`, optional R2) remains for the most recent deploy.

### N. SPA has no security headers/CSP; sourcemaps ship to prod — **MEDIUM (hardening, P2)**
- No CSP anywhere; `frontend/index.html` loads Google Fonts cross-origin; `frontend/vite.config.ts:75` ships `sourcemap: true`. **Additionally (v4):** `frontend/public/index.html` is a stale 6.9 kB duplicate (old Inter-font landing) that Vite copies into `dist/`, risk overwriting the real entry HTML (L8, verified).

### O. "Production" is undefined — **MEDIUM**
- No target users/load/cost/SLO; the prose gate had no mechanism (M2).
- **Fix (v4):** WS1 step 8 gates the prod deploy job on a committed, complete `docs/DEFINITION_OF_PRODUCTION.md` + manual approval; bind at least one acceptance to a number.

### P. Secrets bootstrap missing — **MEDIUM** *(R1/F16 + R2/R19)*
- Deploy jobs need `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, Pages deploy token, `JWT_SECRET` Worker secret. None specified.
- **Fix:** §6 checklist. Staging deploy on PR is **same-repo only** (fork PRs can't access secrets — R19). Backup jobs need **R2 write scope** on the token (L5).

### Q. Secrets / env hygiene — **LOW** *(R1/F18, L1)*
- `VITE_INFURA_API_KEY`/`VITE_ETHERSCAN_API_KEY` unused in source. `backend/.dev.vars` `INFURA_API_KEY` unused. Note: `axios` is **already gone** from `backend/package.json` (L1) — it survives only in the to-be-deleted stale lockfile, so no "remove axios" step is needed. `.dev.vars` is gitignored → scope cleanup to tracked files.

### R. Stale planning docs — **LOW**
- `docs/PLAN.md` describes a legacy state that no longer matches the repo.

### S. Legal/privacy surface — **LOW**
- A production game storing per-player state and (post-auth) wallet addresses has GDPR/privacy obligations. No `/privacy`, `/terms` routes; no analytics/consent decision.

### T. Migration numbering + asset handling — **LOW** *(R15, R16-corrected)*
- `migrations/0003_state_revision.sql` and `migrations/0003_add_state_version.sql` both exist (lexicographic order invisible). Renumber to a clean 0001–0006 before first prod run (R15).
- **Assets (v4 correction):** `frontend/public/assets` is a **symlink** to `game/public/assets` — the two "copies" are the same files, so no sync step is needed (R16 superseded). Verify the symlink is preserved in CI checkout/git (it is stored as a symlink in git; confirm on the CI runner).

---

## 3. Prioritized remediation plan (v4)

### Workstream 0 — Fix the build foundation *(BLOCKER — precedes everything)*
1. **Root install everywhere + exact CI surgery (R1/R4/M1):**
   - Delete the stale per-package lockfiles (`backend/`, `frontend/`, `game/`) and per-package `node_modules` copies; the root `package-lock.json` (verified to link `@arcane-familiars/*`) owns everything.
   - Edit `.github/workflows/ci.yml`:
     - remove `defaults.run.working-directory` (frontend job line 16, backend job line 35);
     - change `cache-dependency-path` to `package-lock.json` (currently lines 24, 43 — these **fail the job** once the per-package lockfiles are deleted);
     - change the run steps to the root scripts that exist (`npm run frontend:type-check`, `npm run frontend:build`, `npm run backend:type-check`, `npm run backend:build` — root `package.json:14-20` has no bare `build`/`type-check`).
   - Optional: remove `axios` from the stale lockfile only if not deleting it.
2. **Add real migration scripts** to `backend/package.json`:
    - `db:migrate:remote: wrangler d1 migrations apply arcane-familiars --env production --remote`
    - `db:migrate:staging: wrangler d1 migrations apply arcane-familiars-staging --env staging --remote`
   - Confirm the prod D1 id (`02b17405-…`, `wrangler.jsonc` `env.production`) is the migration target.
3. **Renumber migrations** 0003 → clean 0001–0006 sequence before any remote apply (R15).

*Acceptance:* CI (frontend + backend jobs) passes from a root `npm ci`; `db:migrate:remote` targets the prod DB (verify via `wrangler d1 migrations list arcane-familiars --env production --remote` — there is no remote `--dry-run`, R12); game-logic tests run in CI.

### Workstream 1 — Deployment pipeline (staging-first, playable-in-prod)
4. **Add a staging environment:** `staging` env in `wrangler.jsonc` (own D1 `arcane-familiars-staging`, `ENVIRONMENT: "staging"`), a staging Pages project, and `PROD_ORIGINS` gains **both frontend origins** (prod + staging Pages domains — not Worker URLs, M3). The staging deploy job runs `db:migrate:staging` **before** deploy (R8).
5. **Deploy the Worker via CI:** `master`-gated prod job: (a) `wrangler d1 export arcane-familiars --remote` → upload to R2 **or** attach as a GH Actions artifact — a durable destination, not the ephemeral runner (R6); (b) `db:migrate:remote`; (c) `wrangler deploy --env production`.
6. **Deploy the frontend via CI (M3 wording fixed):**
   - Set `VITE_BACKEND_URL` = the **prod Worker URL** (`arcane-familiars-backend.<subdomain>.workers.dev`, i.e. the API base — **not** an allowlist entry) for the prod Pages build; set it to the **staging Worker URL** for the staging Pages build (R2). Record both URLs in §6.
   - Pages deploy mechanism: **direct upload** (`wrangler pages deploy dist --project-name=arcane-familiars --branch=production`) in the CI job, using the §6 token with Pages write (L6). Two Pages projects (prod + staging) or two branch deploys.
   - SPA fallback via **`frontend/public/_redirects`** (`/*  /index.html  200`) — vite copies `public/` into `dist/`; a committed `dist/_redirects` would be wiped by `vite build` (R7).
   - **Delete `frontend/public/index.html` and `frontend/public/index.css`** (stale landing duplicates; `public/index.html` risks overwriting the built `dist/index.html` on some Vite versions — L8). Keep the `frontend/public/assets` symlink and `frontend/public/images`.
7. **Rollback/runbook (R10):** write `docs/PROD-RUNBOOK.md` here (deploy, restore-by-export, repoint D1 binding, redeploy) so WS1/WS5 acceptances are satisfiable in P0.
8. **Definition of Production gate (M2):** commit `docs/DEFINITION_OF_PRODUCTION.md` with every §5 field non-empty; the prod deploy job runs only when `if: hashFiles('docs/DEFINITION_OF_PRODUCTION.md')` passes **and** a manual approval (`workflow_dispatch` / environment protection) is granted. Bind at least one acceptance to a §5 number.

*Acceptance:* a merge to `master` produces a **playable** prod Worker + SPA (game talks to the prod backend, not localhost), deep links work, staging deploy precedes prod, and rollback is a documented restore from a durable backup.

### Workstream 2 — Identity & auth (Bearer-only; no PK rekey) *(P1 — before monetized launch)*

> **SUPERSEDED BY THE v5 NOTE (top of doc):** the SIWE + backend-HMAC-JWT + KV-nonce mechanics in steps 9–12 below were not built. Identity shipped as Immutable Passport OIDC (JWKS-verified ID tokens) + a D1-stored EIP-191 wallet-binding challenge. The acceptance intent (identity always derived server-side from the verified token, never the body) still holds.
9. **Design decision (R1/F3):** keep `anonymous_id` as the opaque account key; add a nullable `wallet_address` column + unique index to `game_states`; bind it at sign-in. Additive (one ALTER, no backfill); preserves unauthenticated dev play. Renumber migrations and number this `0006_…` (R15).
10. **Implement SIWE (EIP-4361):** `POST /api/auth/nonce` (single-use, expiring; **store nonces in KV**, not D1 — L4), `POST /api/auth/sign` verifying the wallet signature; pin a Worker-compatible stack (`@noble/curves` + `@noble/hashes`, or a SIWE lib that bundles cleanly under `nodejs_compat`). Unit tests for recovery (forge a signature → 401).
11. **Issue a signed JWT** (HMAC via Workers `JWT_SECRET`), carrying `eth_address` + account id; client stores in `sessionStorage`, sends `Authorization: Bearer`. Define **token TTL vs battle duration** and add a refresh/silent-reissue endpoint so mid-battle 401s can't kill a run (R17).
12. **Backend auth middleware (R5):** a shared middleware verifies the Bearer JWT, resolves the account from the wallet binding, and **replaces body-derived `anonymousId`** in all `/api/game/*` handlers.
13. **Enforce production auth (R1/F7 + R14) and remove the register stub (L3):** **SUPERSEDED by product decision (guest trial + `POST /api/auth/adopt`)** — the `ENVIRONMENT === 'production'` 401 guard and the client prod sign-in gate were intentionally NOT built so anonymous guests can trial-play in prod and restore their session on sign-in. The `/api/auth/register` stub is gone (L3 moot). Staging keeps `ENVIRONMENT: "staging"`. Revisit before monetization.

*Acceptance (revised to the guest-trial decision):* identity for signed-in players is always derived server-side from the verified Bearer token (never from the body); a signed-in player's state is keyed by the wallet `sub` and cannot be read via a forged body `anonymousId`; guests can trial-play anonymously in any environment and adopt their state on sign-in (`POST /api/auth/adopt`); the register stub is not reachable in prod. (The v4 "must sign in before any game endpoint works in prod" acceptance is superseded by the decision.)

### Workstream 3 — Testing & quality gates in CI
14. **`game-logic` tests:** CI job with `working-directory: packages/game-logic` + `npm test` (or `vitest run --dir packages/game-logic`); fail if 0 files collected (R9).
15. **Backend tests:** scaffold with `@cloudflare/vitest-pool-workers` (real `workerd` + D1). Cover: battle start/action, item KO-cancellation, party reorder, 409-concurrency (`saveGameStateIfVersion` + `game-battle.ts:505`). **Do NOT include the prod-anonymous-rejection test here** — it belongs to WS2 step 13 (resolves the P0/P1 contradiction, R3).
16. **Lint job:** ESLint + Prettier across workspaces (none exists today).

*Acceptance:* a PR cannot merge to `master` with failing tests/type-check/lint. (Reachable only after WS0 fixes the install.)

### Workstream 4 — Abuse & cost protection
17. **Rate limiting (DONE):** D1-backed fixed-window limiter on all `/api/*` (120 req/60s per IP or hashed Bearer token; 429 + Retry-After; fail-open; cron cleanup) — `backend/src/middleware/rateLimit.ts`, migration `0010`, tests `backend/test/rate-limit.test.ts`. Note the deviation from the earlier "Cloudflare ratelimit binding, zero D1 writes" mechanism decision.
18. **Anti-farming economics (DONE):** daily battle cap — max **20 completed battles (win or loss) per UTC calendar day per account**, enforced server-side at `POST /api/game/battle/start` (403 + Retry-After to UTC midnight) and incremented in `battle/action` on Win/Loss; fleeing does not count. Fields `battlesToday`/`battlesDayUtc` live in `state_json` (no migration). Scope note: hard per-account cap for authenticated users; per-browser-profile for guests (bypassable by identity reset — accepted, see runbook). Tests: `backend/test/battle-daily-cap.test.ts`.
19. **Request logging with request-id** on the 500 path (WS5) `(DONE in WS4: requestId in route-level 500 bodies + X-Request-Id header)`.

*Acceptance:* a single client cannot exceed a bounded request rate (429 observable); unbounded currency farming is blocked by the 20-battles/day cap (403 observable); the cap resets on the UTC day boundary.

### Workstream 5 — Observability & DR
20. **Structured logging + error tracking (DONE):** Workers Observability enabled in `wrangler.jsonc` (top-level `observability: { enabled: true }`, all envs); request-id on every log line — `internalError` helper + `onError` 500s already prefixed, the 6 remaining routes (assets, balances, collection, metadata, game-owned-familiars, auth) + the rateLimit fail-open log now prefixed too; the cron `scheduled` handler has no HTTP request and is correctly left unprefixed. **Alert rule** (HTTP 5xx rate / Workers exception tied to the health probe): created by the **user** during the deploy runbook (Cloudflare dashboard alerts are manual, not code — L7), and the runbook step references it so "alerts within minutes" is traceable (R13). The rule's thresholds can now be tuned from the Workers Observability metrics.
21. **D1 backup/DR (DONE):** **D1 Time Travel is the primary and sole DR mechanism** — always-on, free (no enablement), retention **7 days Free / 30 days Paid**, restore in place within minutes via `wrangler d1 time-travel restore` (verified available; runbook R10). Sufficient for the owner's requirement — no recovery beyond the Time Travel window is needed. A nightly `Nightly D1 Backup` workflow + R2 export job (`.github/workflows/backup.yml`) was implemented for longer-term retention but **REMOVED as unnecessary** (no >7-day recovery requirement). The **WS1 pre-migration backup** in `deploy.yml` (GH artifact `d1-backup-*`, optional R2 `d1-backup/<TS>.sql` when `BACKUP_R2_BUCKET` is set) remains for the most recent deploy. No R2 lifecycle rules required.
22. **Health/metrics probe (DONE):** `/api/health` now returns `latencyMs` (handler time, 1 decimal) alongside `status`/`environment`/`timestamp`, bound to §5 acceptance #5 (p95 < 500 ms at 20 concurrent players); p95 over time is observed via Workers Observability analytics or external probes. The deploy.yml curl health check (HTTP 200 only) is unaffected.

*Acceptance:* a prod 500 or D1 failure alerts within minutes (rule actually created per runbook, R13); a data incident is recoverable via D1 Time Travel in place within the retention window; the runbook (WS1 step 7) covers restore.

### Workstream 6 — Security headers, legal, cleanup *(P2 — hardening)*
23. **CSP + security headers** on the SPA (script-src self + font/Phaser origins); disable sourcemaps in prod build (`sourcemap: false` or conditional).
24. **Legal pages:** `/privacy` + `/terms` routes; decide + document the analytics/consent stance.
25. **Dead env vars:** remove `VITE_INFURA_API_KEY`/`VITE_ETHERSCAN_API_KEY` from `frontend/.env.example`; document `.dev.vars` `INFURA_API_KEY` removal as a manual user step (untracked file).
26. **`docs/PLAN.md` superseded (DONE):** docs/PLAN.md has been marked SUPERSEDED with a banner pointing to root `README.md` and this gap plan; it remains gitignored/local-only. Step 26 complete, September 2026.

---

## 4. Suggested sequencing (minimal production for the *game*)

- **P0 (blockers + must-have):** WS0 (root install + CI surgery, real migration scripts, renumber), WS1 (deploy pipeline, staging-first, durable backup, `VITE_BACKEND_URL`, runbook, §5 gate), WS3 (tests in CI), WS4 (rate limiting + anti-farming), WS5 (observability + D1 backup + alert rule).
- **P1 (before monetizing / linking NFTs):** WS2 (wallet auth, Bearer middleware, prod 401 guard, remove register stub) + per-wallet quota. The WS3 anonymous-rejection test moves to WS2 (R3).
- **P2 (hardening/cleanup):** WS6 (headers, legal, env cleanup, docs).

Severity labels reconcile to this sequence: "HIGH" items in §2 that land in P1/P2 are explicitly qualified ("before the monetized launch") rather than "before launch" (L2).

---

## 5. Definition of Production *(gate, M2)*

Fill in `docs/DEFINITION_OF_PRODUCTION.md` (all fields non-empty) with the owner before WS1's prod deploy job can run. The job runs only when `if: hashFiles('docs/DEFINITION_OF_PRODUCTION.md')` passes **and** a manual approval is granted (WS1 step 8).
- **Users:** target concurrent players at launch (e.g. 20) and 90-day goal (e.g. 500 DAU).
- **Load:** expected battles/hour at peak; max D1 row growth/day (measure via the WS5 probe).
- **Cost ceiling:** monthly Cloudflare budget (Workers + D1 writes + R2).
- **Availability target:** e.g. 99.5% uptime; `/api/health` monitored.
- **Incident SLA:** time-to-alert ≤ 15 min (alert rule from WS5 step 20); time-to-restore target.

At least one acceptance criterion must reference a §5 number (e.g. WS5 health-probe latency under the §5 concurrent-load figure).

---

## 6. Secrets & Bootstrap checklist *(F16/R19/L5)*

Authenticated steps are user-run per AGENTS.md. Before enabling any deploy job:
- [ ] `wrangler login` / confirm production Cloudflare account.
- [ ] Confirm prod D1 `arcane-familiars` exists + `wrangler.jsonc` id (`02b17405-…`) is correct.
- [ ] GitHub Actions secrets: `CLOUDFLARE_API_TOKEN` (**Workers + Pages + D1 write + R2 write** — L5), `CLOUDFLARE_ACCOUNT_ID`, Pages deploy token. **Staging-deploy-on-PR is same-repo only** (fork PRs can't access secrets — R19).
- [ ] Worker secrets: `JWT_SECRET` (and any SIWE/IMX secrets) via `wrangler secret put --env production`.
- [ ] Create staging env (D1 + Pages project) and staging domain; update `index.ts` CORS allowlist (`PROD_ORIGINS` gains the **frontend** prod + staging Pages origins; staging sets `ENVIRONMENT: "staging"` — R14/M3).
- [ ] (Optional) R2 bucket mirroring — only if you set `BACKUP_R2_BUCKET` and want the WS1 pre-migration dump in `deploy.yml` mirrored to R2. **No longer required** — D1 Time Travel is the DR mechanism; no lifecycle rules needed.
- [ ] Record prod + staging **Worker URLs** (API base for `VITE_BACKEND_URL` in WS1 step 6 — R2/M3) and prod + staging **Pages URLs** (for the CORS allowlist).

---

## 7. Separate track — Blockchain / NFT (NOT part of "game app production")

> Implementation plan: [`BLOCKCHAIN-IMPLEMENTATION-PLAN.md`](./BLOCKCHAIN-IMPLEMENTATION-PLAN.md) (v2).

- The legacy **Immutable X (StarkEx)** contracts (custom ERC-721/ERC-2981 proxy +
  `Mintable`/`IMX_Bridge`) were **retired and removed** (BC0) — StarkEx is sunset. They were
  never deployable: the Hardhat config had **all networks commented out** and
  `scripts/deploy.ts` deployed the wrong contract. The workstream now targets **Immutable
  Chain** (zkEVM); see `BLOCKCHAIN-IMPLEMENTATION-PLAN.md` §1–§3.
- Frontend Passport sign-in + wallet binding are done; there is no mint flow. `/app/collection` is a real page (`CollectionPage`), while `/app/minter`, `/app/marketplace`, and `/app/bridge` remain `ComingSoon` in `App.tsx`.
- The retired contracts predated any audit; the replacement track's audit status is gated on BC1a (§5 of the plan).
- Backend Immutable **zkEVM** proxying exists (`assets`, `balances`, `owned-familiars`) but no end-to-end mint/ownership path wired to the game.
- **Note (F13):** the game's farmable currency/items become an economy injection the moment they feed NFT mint. WS4 step 18's anti-farming decision is the prerequisite for this track.

*Decision needed:* confirm the Immutable Chain (zkEVM) collection approach and the mint-on-demand flow before investing here.

---

## 8. Review history & resolution status

### Round 1 (v1 → v2) — F1–F18
All resolved (see v2 §8). Verified: F1 backend lockfile, F2 migration script, F3 no-PK-rekey.

### Round 2 (v2 → v3) — R1–R19
All resolved (see v3 §8). Verified: R1 frontend/game lockfiles, R2 VITE_BACKEND_URL, R3 P0/P1 contradiction, R6 durable backup, R7 public/_redirects, R8 staging migrations, R9 vitest invocation, R10 runbook move.

### Round 3 (v3 → v4) — M1–M3 / L1–L8

| # | Finding | Severity | Resolution in v4 |
|---|---------|----------|------------------|
| M1 | WS0 CI conversion under-specified: `cache-dependency-path` + `working-directory` + missing root scripts break the job | Medium | WS0 step 1 spells out the exact `ci.yml` surgery |
| M2 | §5 gate has no mechanism (what is the marker? how is the job gated?) | Medium | WS1 step 8: `hashFiles('docs/DEFINITION_OF_PRODUCTION.md')` + manual approval |
| M3 | WS1 step 6 conflated Worker URL with CORS allowlist (wrong direction) | Medium | WS1 step 6 + §6: Worker URL = API base for `VITE_BACKEND_URL`; allowlist = frontend Pages origins |
| L1 | "Remove phantom axios" is stale — axios already gone from `backend/package.json` | Low | §2.Q corrected; no such step |
| L2 | Severity labels contradict P1/P2 sequencing | Low | §2.A/K/L/N qualified "before monetized launch"; §4 note |
| L3 | `/api/auth/register` stub stays live in prod | Low | WS2 step 13 disables/removes it in prod |
| L4 | Nonce store unspecified | Low | WS2 step 10: KV |
| L5 | §6 token scope omits R2 | Low | §6: token gains R2 write scope |
| L6 | Pages deploy mechanism unspecified | Low | WS1 step 6: direct upload (`wrangler pages deploy`) |
| L7 | Alert "provision" mechanism unstated | Low | WS5 step 20: user creates the rule during the runbook |
| L8 | `frontend/public/index.html` (stale duplicate) can overwrite built `dist/index.html` | Low | WS1 step 6: delete `public/index.html` + `public/index.css` |

### Round 3 verdict
**CONDITIONAL — ready to implement, no blockers.** Two conditions (M1 exact CI surgery, M2 gate mechanism) + one wording fix (M3) must be applied; all folded in above. Verified-clean: root lockfile links workspace deps; frontend/game build resolution via alias; backend bundle resolution via `moduleResolution: "bundler"` + game-logic `imports`; `remote: true` on prod D1 is a valid wrangler key (but never run `wrangler dev --env production`); auth workstream complete; prod D1 id matches; migration renumbering planned.

**Note (v4 correction to R16):** `frontend/public/assets` is a **symlink** to `game/public/assets` (verified), so the "duplicate asset trees" finding is moot — no sync step needed; just confirm the symlink survives on the CI runner.

---

## 8b. The round-2 conditions → v3 locations (all resolved)

1. Root install everywhere; delete stale per-package lockfiles → WS0 step 1.
2. `VITE_BACKEND_URL` (prod + staging) + Worker URLs, cross-checked with CORS → WS1 step 6, §6.
3. Resolve WS3↔WS2 P0/P1 contradiction → anonymous-rejection test moved to WS2 step 13.
4. Durable pre-migration backup + `_redirects` in `public/` → WS1 steps 5–6.
5. Backend Bearer-identity middleware + correct vitest invocation → WS2 step 12, WS3 step 14.

---

## 9. Actions requiring the user (per AGENTS.md — authenticated commands)

- `wrangler login`; confirm the production Cloudflare account, prod D1, Pages projects (prod + staging), staging env, and the exact prod/staging Worker + Pages URLs.
- Create the GitHub Actions + Worker secrets in §6.
- `git push origin staging` (the only branch synced upstream) and open a PR `staging → master` to ship. The agent prepares all local changes on local feature branches and merges them into local `staging` (see AGENTS.md — Branching & Merge Workflow); feature branches are never pushed.
- Create the Cloudflare alert rule per the WS5 runbook step.
- (Optional) Create the R2 bucket and set the `BACKUP_R2_BUCKET` repo var only if you want the WS1 pre-migration dump in `deploy.yml` mirrored to R2. **No lifecycle rules and no nightly backup workflow** — D1 Time Travel is the DR mechanism (open question resolved: it is primary, WS5 step 21).

The agent can prepare all local code changes on local feature branches and merge them into local `staging`; the user runs the authenticated steps — `git push origin staging`, the `staging → master` PR, and the deploy/secrets/alert steps.