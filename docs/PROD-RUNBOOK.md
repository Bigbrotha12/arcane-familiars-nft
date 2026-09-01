# Production Runbook — Arcane Familiars

> Ops runbook for the game app (frontend React SPA + Cloudflare Worker + D1). Required by [PRODUCTION-DEPLOYMENT-GAP-PLAN.md](./PRODUCTION-DEPLOYMENT-GAP-PLAN.md) item R10 (WS1 step 7) so the WS1/WS5 acceptances are satisfiable in P0. Use when: deploying staging/prod, rolling back a bad deploy, restoring from backup, or creating the alert rule.
> Companion gate: [DEFINITION_OF_PRODUCTION.md](./DEFINITION_OF_PRODUCTION.md) — the prod deploy job does not run until that file exists; the push to `master` is the approval.

## Pre-deploy checklist (from plan §6)

Run once per environment before enabling deploy jobs. All authenticated steps are user-run per AGENTS.md.

- [ ] `wrangler login` / confirm the production Cloudflare account.
- [ ] Confirm prod D1 `arcane-familiars` exists and `backend/wrangler.jsonc` has the real id (`8e8bce41-…`).
- [ ] GitHub Actions secrets:
  - `CLOUDFLARE_API_TOKEN` — **Workers + Pages + D1 write + R2 write** scopes (L5).
  - `CLOUDFLARE_API_EMAIL`.
  - `CLOUDFLARE_ACCOUNT_ID`.
- [ ] GitHub Actions repo variables:
  - `CF_WORKERS_SUBDOMAIN` — **required**; the account's workers.dev subdomain (e.g. `acct` from `https://acct.workers.dev`), used to build the `VITE_BACKEND_URL`.
  - `BACKUP_R2_BUCKET` — optional; if set, the WS1 pre-migration D1 dump in `deploy.yml` is also uploaded to R2. Not required — D1 Time Travel is the DR mechanism.
- [ ] Worker secrets via `wrangler secret put --env production` (e.g. `JWT_SECRET` when WS2 lands).
- [ ] GitHub `production` environment exists (created automatically on first use) — it scopes the prod job's secrets/vars; **no protection rules required** (solo dev: the push to `master` is the approval).
- [ ] Staging D1 `arcane-familiars-staging` created via `wrangler d1 create arcane-familiars-staging`; fill the returned `database_id` into the `backend/wrangler.jsonc` staging placeholder (`00000000-…`, line 59).
- [ ] Pages projects `arcane-familiars` + `arcane-familiars-staging` — **auto-created** by the deploy workflow (`.github/actions/ensure-pages-project`) on first deploy; nothing to pre-create.
- [ ] Optional: R2 bucket mirroring of pre-migration dumps — only if you set `BACKUP_R2_BUCKET` and want the WS1 pre-migration dump in `deploy.yml` mirrored to R2. **No lifecycle rules needed** — D1 Time Travel is the DR mechanism.
- [ ] Record URLs (plan §6):
  - Prod Worker URL (API base for `VITE_BACKEND_URL`): `arcane-familiars-backend-production.<subdomain>.workers.dev`
  - Staging Worker URL (API base for staging `VITE_BACKEND_URL`): `arcane-familiars-backend-staging.<subdomain>.workers.dev`
  - Prod Pages URL: `arcane-familiars.pages.dev`
  - Staging Pages URL: `arcane-familiars-staging.pages.dev`
  - CORS allowlist = **Pages URLs only** (`PROD_ORIGINS` in `backend/src/index.ts`). Worker URLs are the API base, **never** allowlist entries (M3).

## Deploy procedure

### Staging (runs on push to `master`, before prod)

1. `npm run db:migrate:staging` — applies migrations to `arcane-familiars-staging` **before** deploy (R8).
2. From `backend/`: `npx wrangler deploy --env staging`.
3. Build the frontend with the staging Worker URL: `VITE_BACKEND_URL=https://<staging-worker-url> npm run frontend:build`.
4. From `frontend/`: `npx wrangler pages deploy dist --project-name=arcane-familiars-staging --branch=staging` (direct upload; the staging project's production branch is `staging`).
5. Verify the staging SPA against the staging backend and that deep links resolve.

### Production (gated; runs on `master` merge)

Gated on the push to `master` (the approval, solo dev — no reviewers/wait timer); a step-level `hashFiles` gate fails the prod job if `docs/DEFINITION_OF_PRODUCTION.md` is missing.

1. **Back up before mutating:** from `backend/`, `npx wrangler d1 export arcane-familiars --env production --remote --output d1-export.sql --skip-confirmation` → attach as a GH Actions artifact (`d1-backup-*`) **and/or** upload to R2 (`d1-backup/<date>.sql`). Without `--output`, the dump goes to stdout, which can't be attached as an artifact. Durable destination, not just the ephemeral runner (R6).
2. `npm run db:migrate:remote` — applies migrations to `arcane-familiars` (prod).
3. From `backend/`: `npx wrangler deploy --env production`.
4. Build the frontend with the prod Worker URL: `VITE_BACKEND_URL=https://<prod-worker-url> npm run frontend:build`.
5. `npx wrangler pages deploy frontend/dist --project-name=arcane-familiars --branch=production`.
6. Verify `GET /api/health` on the prod Worker and deep links on the prod SPA.

## Rollback procedure (R10)

**D1 Time Travel is the sole DR mechanism** — restores prod D1 **in place**, no new database or binding changes. (The WS1 pre-migration `d1-backup-*` artifact from `deploy.yml` covers the most recent deploy only; everything else is handled by Time Travel within its retention window.)

**Restore in place (Time Travel):**
1. Confirm the DB is on the supported backend: `wrangler d1 info arcane-familiars` → `version: production` (`alpha` only has old snapshot backups).
2. **Restore in place:** `npx wrangler d1 time-travel restore arcane-familiars --env production --timestamp=<UNIX>` (a point before the bad migration). **Destructive** — overwrites the database and cancels in-flight queries; note the returned `previous_bookmark` to undo the restore.
3. **Verify:** `GET /api/health` returns healthy and a sample game read succeeds.

Rebuild + redeploy the frontend only if the frontend bundle is what needs rollback (`wrangler pages deploy` a prior build artifact).

## Data handling

The `d1-backup-*` GitHub artifacts contain **full player game-state dumps** — treat them as sensitive: repo read access implies access to backups. (R2 `d1-backup/` objects exist only if `BACKUP_R2_BUCKET` is set; keep any bucket/objects **private**.)

**D1 Time Travel is the DR mechanism** — always-on and free (no enablement), retention **7 days Free / 30 days Paid**, restore in place to any minute within that window. The WS1 pre-migration artifact (GH Actions `d1-backup-*`) still covers the most recent deploy snapshot; treat it as sensitive if retained.

## Identity & guest access (WS2 step 13 superseded)

Prod allows **anonymous guest trial play** by product decision — no wallet sign-in is required before `/api/game/*` works. Guests are keyed by a client-generated UUID (`af_anonymous_id`, localStorage), persisted as `is_anonymous = 1`, and purged after 24h inactivity (cron).

On Passport sign-in, `POST /api/auth/adopt` re-keys a guest state to the wallet `sub` (session restore; the WS4 cap counters carry across). **Caveat:** adopt does not prove UUID ownership — anyone who knows a guest UUID can adopt it. Accepted for a non-monetized slice; re-review at monetization (plan §2.A / §2.L / WS2 step 13).

## Alert rule (via Notifications API — per L7/R13, WS5 step 20)

Per-Worker dashboard alerts are **no longer available** — Cloudflare removed Workers-specific alert types and consolidated alerting into the **account-level Notifications service**. Alert policies are provisioned via the Notifications API (`POST /accounts/{account_id}/alerting/v3/policies`) — no `workers_*` alert types exist.

The policy is version-controlled as a repo script (`scripts/create-alert-policy.sh`) that calls the API **idempotently** (lists existing policies by name, creates missing ones). Run it **once** with `CLOUDFLARE_API_TOKEN` (**Notifications:Edit** scope) and `CLOUDFLARE_ACCOUNT_ID` set.

**Recommended:** a **Synthetic Monitoring** test on the prod Worker's `/api/health` (`arcane-familiars-backend-production.<subdomain>.workers.dev/api/health`) using **`synthetic_test_low_availability_alert`** and/or **`synthetic_test_latency_alert`** — alert when the probe misses availability/latency targets. Tie thresholds to the incident SLA in [DEFINITION_OF_PRODUCTION.md](./DEFINITION_OF_PRODUCTION.md): time-to-alert ≤ 15 min; p95 < 500 ms at 20 concurrent players. **Alternatives:** `advanced_http_alert_error` (edge 5xx) and `real_origin_monitoring` (origin health).

The incident-SLA link still applies — create the rule **once, before** relying on "alerts within minutes."

## Anti-farming — daily battle cap (WS4 step 18, R18)

- **Decision:** daily battle cap implemented — max **20 completed battles (win or loss) per UTC calendar day per account**, enforced server-side at `POST /api/game/battle/start` (403 + Retry-After to UTC midnight) and incremented in `battle/action` on Win/Loss; fleeing does not count. The counter lives in `state_json` (`battlesToday`/`battlesDayUtc`, `YYYY-MM-DD` UTC day) and resets automatically when the UTC day changes.
- **Enforcement boundary / accepted risk:** hard per-account cap for authenticated (Passport) users; **per-browser-profile for guests** — clearing site data resets the anonymous id and grants a fresh cap the same day (accepted; identity is client-generated for guests). The guest purge (24h inactivity cron) also resets the cap for guests.
- **Owner:** Bigbrotha12 (repo owner).
- **Re-review:** revisit the cap value (20) and the guest-bypass acceptance before any monetization/NFT link (per plan P1 sequencing); suggested re-review date: at monetization planning.
- **Race guard (F1):** the state+battle writes are both conditional (version + battle-row turnCount), so a stale writer cannot commit a cap increment (match-or-both-no-op). Additionally, `battle/action` re-checks the cap after loading state and before resolution, which closes the start check-then-act race — a concurrent `start` + `action` at 19/20 cannot slip a 21st increment, and the counter cannot exceed 20.

## Post-WS6 cleanup — stale secrets (manual operator step)

WS6 removed dead env vars (`INFURA_API_KEY`, `ETHERSCAN_API_KEY`) from tracked files. These variables are unused by the current code. **Manually remove** any remaining `INFURA_API_KEY` (or other dead RPC/blockchain keys) from:

- `backend/.dev.vars` (gitignored — not committed)
- any local `backend/.env` or shell environment (`export` / `.env` sourcing)

This is a manual credentials-hygiene step — automated tooling cannot touch untracked files. Confirm with `env | grep INFURA` / `grep INFURA backend/.dev.vars` that the key is gone after removal.