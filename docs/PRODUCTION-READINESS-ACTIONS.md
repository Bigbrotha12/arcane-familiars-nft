# Arcane Familiars — Production Readiness Action Items

> Living checklist for what remains before the game app (and later the NFT economy) is
> production-ready. Companion docs: [PRODUCTION-DEPLOYMENT-GAP-PLAN.md](./PRODUCTION-DEPLOYMENT-GAP-PLAN.md),
> [BLOCKCHAIN-IMPLEMENTATION-PLAN.md](./BLOCKCHAIN-IMPLEMENTATION-PLAN.md),
> [DEFINITION_OF_PRODUCTION.md](./DEFINITION_OF_PRODUCTION.md), [PROD-RUNBOOK.md](./PROD-RUNBOOK.md).
>
> Date: 2026-10-05. Owner tags: **[You]** = authenticated/external step the user runs;
> **[Agent]** = implementable in-repo; **[External]** = third party (Immutable, audit).
>
> Current state: the game app is deployable; the blockchain integration is scaffolded with
> `MINTING_ENABLED` and `OWNERSHIP_AUTHORITY` both defaulting to `false` (zero behaviour
> change). Local `staging` is ahead of `origin/staging` and awaiting a push + PR.

---

## P0 — Ship the game app

- [ ] **[You]** Push and open the PR: `git push origin staging` →
      `gh pr create --base master --head staging`.
- [ ] **[You]** GitHub Actions secrets: `CLOUDFLARE_API_TOKEN` (Workers + Pages + D1 + R2
      write), `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_EMAIL`.
- [ ] **[You]** GitHub repo variables: `CF_WORKERS_SUBDOMAIN` (required),
      `IMMUTABLE_CLIENT_ID`.
- [ ] **[You]** Cloudflare: `wrangler login`; confirm prod D1 `02b17405-…` and staging D1
      `e9c91f6d-…` in `backend/wrangler.jsonc`; confirm the Passport `IMMUTABLE_CLIENT_ID`
      audience matches the client.
- [ ] **[You]** Create the alert policy via `scripts/create-alert-policy.sh`
      (Notifications:Edit scope) per `docs/PROD-RUNBOOK.md`.
- [ ] **[You]** Re-review `docs/DEFINITION_OF_PRODUCTION.md` (owner review date
      2026-08-30) before the prod deploy job runs.
- [ ] **[You/Agent]** Confirm the merge applies migrations `0011`/`0012` after the
      pre-migration D1 backup artifact (flags are off, so behaviour is unchanged).
- [ ] **[You]** Post-deploy smoke: `/api/health`, deep links (`/app/*`, `/play/*`,
      `/preview/*`), and the new `/app/collection` page.

## P1 — Blockchain/NFT testnet vertical slice

- [ ] **[You, Hub]** **BC1a spike:** confirm which preset Hub offers (`ImmutableERC721` vs
      `MintById`), which mint function is enabled (`mintBatchByQuantity` vs token-ID), and
      the **preset audit status** (docs say audited; the GitHub README says experimental).
- [ ] **[You]** Decide **Q1** Option A (preset + Minting API) vs B (custom OZ + EIP-712),
      **Q2** mint sink/economics, **Q3** ownership-loss policy, **Q4** starter familiars,
      **Q7** Immutable holding the minter role, **Q8** Option A permanence.
- [ ] **[You, Hub]** BC1: deploy the collection on testnet, set
      `baseURI`/`contractURI`/operator allowlist/royalties, grant the minter role, create
      the Secret API Key, then
      `wrangler secret put IMMUTABLE_MINTING_API_KEY --env staging` (and prod).
- [ ] **[Agent]** Indexer → `owned_nfts` sync + reconciliation (deferred ownership source).
- [ ] **[Agent]** R2 metadata files at `{baseURI}/{token_id}` + R2 binding on confirmation.
- [ ] **[Agent]** `/app/minter` Summon page (request → poll → refresh).
- [ ] **[Agent/You]** Replace `MINT_CAP_PLACEHOLDER` with the real economy; set
      `NFT_METADATA_BASE_URI`; flip `MINTING_ENABLED`/`OWNERSHIP_AUTHORITY` in staging,
      validate end-to-end, then prod.
- [ ] **[You/Agent]** End-to-end testnet mint → Indexer → fieldable ownership; mint abuse
      checks (idempotency, cap, rate limit).

## P2 — Pre-monetization / mainnet

- [ ] **[External/Agent]** BC2b webhooks (partner-gated): confirm HMAC vs SNS, verify
      signatures, subscribe to transfer/burn/sale/order; keep polling as reconciliation.
- [ ] **[Agent/You]** Legal/ToS/privacy delta for tradable NFTs + marketplace listing.
- [ ] **[External]** Confirm/renew the preset audit; external audit if Option B.
- [ ] **[You]** Mainnet deploy, Hub verification, Orderbook/marketplace registration,
      Trading Rewards (≥0.5% royalty), production RPC (QuickNode/dRPC).
- [ ] **[Agent]** Mint success/failure/webhook-lag metrics + alerts; secret-rotation
      runbook; pause semantics for pending intents.
- [ ] **[Agent]** Per-wallet quota (plan P1).

## Known follow-ups / tech debt (non-blocking)

- [ ] Mint seam: a stalled `pending` intent has no automatic re-drive (reconciliation
      deferred); transient `pending` still counts toward the cap.
- [ ] Collection page: `PassportLogin` is not externally reset on `af:auth-expired`
      (briefly stale header) — wire the event.
- [ ] Auth: a transient JWKS failure → 401 → guest fallback (deliberate trade-off; monitor
      in production).
- [ ] Rate limiter is per-IP (shared-NAT trade-off) and fail-open.
- [ ] Migration `0004` adds an unused `revision` column; `game-logic` pins TypeScript
      `^5.7` while the other workspaces pin `^7`.
- [ ] `docs/bug-report-21-08-2026.md` still references the retired `blockchain/`
      (historical artifact).
- [ ] Frontend has no unit-test harness for the new collection page.
- [ ] `docs/PLAN.md` remains a superseded historical document.
