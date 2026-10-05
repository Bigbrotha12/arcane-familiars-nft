# Arcane Familiars — Blockchain / NFT Implementation Plan (v2)

> Scope: the blockchain/NFT workstream tracked separately in
> [PRODUCTION-DEPLOYMENT-GAP-PLAN.md](./PRODUCTION-DEPLOYMENT-GAP-PLAN.md) §7 — contracts,
> minting, on-chain ownership → gameplay, collection/marketplace, economy, and mainnet.
> The game app (SPA + Worker + Phaser + `game-logic`) is already playable in production
> without any of this; this plan layers the NFT economy on top.
>
> Status: **DRAFT — pending owner decisions (§9) and one Immutable Hub verification spike
> (§5 BC1a).** Date: 2026-10-05. Sources in §10; adversarial review of v1 in §11.

> **v2 revision note:** an adversarial review of v1 found five blockers (system-assigned
> token IDs, the Minting API's quantity-only mint function, write-after-call intent
> persistence, an unspecified/partner-gated webhook mechanism, and a mint-only ownership
> cache) plus several high findings. v2 replaces the deterministic token-ID scheme, makes mint intents
> write-ahead, moves webhooks to a later phase in favour of status polling, sources
> ownership from the Indexer (not mint events), mounts mint routes behind auth, and adds
> migrations/legal/metrics/checklist work. Full mapping in §11.

> **Progress (2026-10-05):** BC0 is **done** — the legacy StarkEx `blockchain/` package,
> the dead `FamiliarABI.json`/`IMXABI.json`, and the orphaned root
> `@openzeppelin/contracts` dependency are retired (§5 BC0). Two pieces have since landed
> as disabled-by-default seams: the BC2 mint service (`POST /api/game/mint/request`,
> `GET /api/game/mint/status/:referenceId`, write-ahead `mint_intents` idempotency, and the
> confirmed-mint `owned_nfts` upsert) behind `MINTING_ENABLED` (default `false`; the real
> `ImmutableMintingProvider` is written but unexercised), and the BC4 ownership authority
> `OWNERSHIP_AUTHORITY` (default `false`) gating the fieldable set to
> `playerFamiliars ∪ owned_nfts`.
>
> **Deferred / next:**
> - Indexer → `owned_nfts` sync + reconciliation (beyond the mint-confirmation upsert).
> - Webhooks (HMAC-SHA256 vs AWS SNS; partner-gated) — BC2b.
> - R2 metadata files at `{baseURI}/{token_id}` on mint confirmation.
> - The `/app/minter` page — BC3.
> - The mint-sink decision — Q2, before BC2's entitlement/economy work.
> - BC1a/BC6 (user-run Hub deploy spike + mainnet) — user-run/authenticated hand-offs.

---

## 1. Current state (verified against the repo)

| Area | State |
|---|---|
| `blockchain/contracts` | **Removed in BC0.** Was ~1,220 LOC (hand-rolled ERC-721 + ERC-2981, a role-routing `FamiliarProxy`, and the **StarkEx Immutable X bridge** — `Mintable.mintFor` + `Minting.split`; Solidity 0.8.17, OZ 4.8.2) — all retired with StarkEx. |
| `blockchain` config | **Removed in BC0.** Was a Truffle/Hardhat hybrid (`package.json` named `"backend"`) with all networks commented out and `scripts/deploy.ts` deploying the wrong contract (`Keepers`); no blockchain job in CI. |
| Backend | Read-only Immutable **zkEVM** Indexer proxy (`assets`, `balances`, `owned-familiars`), Passport OIDC auth, `wallet_bindings`. A **disabled** BC2 mint seam exists (`/api/game/mint/*` behind `MINTING_ENABLED`, default `false`); no live mint/transfer/write path. `viem` is already a backend dependency (used for EIP-191 wallet binding). |
| `BLUEPRINT_PREFIX_TO_SPECIES` | Defined in `backend/src/utils/imx.ts` and used by `mapTokenToFamiliar`; explicitly a placeholder. Removing it is a refactor with tests + the live `/api/game/owned-familiars` route. |
| Frontend | Passport sign-in + EIP-191 wallet binding done. `/app/collection` is a real page; `/app/{marketplace,minter,bridge}` are `ComingSoon`. `FamiliarABI.json` / `IMXABI.json` were **dead** (zero usages) and were removed in BC0. |
| Gameplay | `ownedFamiliars` is merged into the party picker as a convenience, but the server's `createDefaultGameState` hardcodes three familiars. The server also **grants** `area.baseFamiliar` on first boss defeat (`game-battle.ts`). On-chain ownership is **not** authoritative by default (`OWNERSHIP_AUTHORITY` off). |

---

## 2. Up-to-date ecosystem facts (these shape the plan)

1. **Immutable X (StarkEx) is sunset.** Writes blocked ~2026-02-11; remaining funds migrated
   to Immutable zkEVM 2026-03-05…09. The existing `FamiliarIMX`/`Mintable` bridge contracts
   are a dead end. ([imx-migration], [esi])
2. **The chain is branded "Immutable Chain"** (formerly Immutable zkEVM): Cancun, Solidity
   up to 0.8.28. Testnet **13473** (`https://rpc.testnet.immutable.com`), mainnet **13371**
   (`https://rpc.immutable.com`). Public RPC ~25 req/s → use QuickNode/dRPC for production.
   ([chain])
3. **Immutable publishes recommended presets** in `@imtbl/contracts` v3: `ImmutableERC721`,
   `ImmutableERC721MintById`, `ImmutableERC1155`, `ImmutableERC20*`, with the **operator
   allowlist** and **EIP-2981 royalties**. OZ peer range `^4.9.6 || ^5.6.1`. ([contracts])
4. **Deploy via Hub** (zero code) auto-configures the Minting API, operator allowlist
   (Orderbook + major marketplaces pre-approved), royalties, and deploy-gas sponsorship.
   ([deploy])
5. **The Minting API is Immutable's server-side minting service**: a REST API that manages
   nonces, batching, gas, and indexing. Idempotent by `reference_id`; status pollable;
   requires Immutable **preset contracts** (custom contracts unsupported) and a **Secret API
   Key**; the collection must grant the minter role to Immutable. Standard tier 200 NFTs/min.
   ([minting-api], [build-a-game])
6. **Token IDs are system-assigned and returned asynchronously.** The Minting API "currently
   facilitates `mintBatchByQuantity()`, which does not allow the minter to specify
   `token_id`" (the with-token-ID flow shown on one doc page is not the enabled path). The
   `reference_id → token_id` mapping arrives via webhook/status. ([minting-api], [indexer])
7. **Webhooks require a managed partner relationship** ("Contact us to enable webhooks").
   Delivery is at-least-once and must be processed idempotently. The Indexer docs show
   verification via a shared-secret **HMAC-SHA256** (`x-immutable-signature`); the Minting
   API's Hub webhooks may instead deliver AWS **SNS** envelopes (subscription confirmation +
   certificate signature). **Confirm the exact mechanism in Hub before building.** ([indexer],
   [minting-api]) This gating is the main reason phase 1 is poll-first.
8. **Metadata must be hosted at `{baseURI}/{token_id}`** even when supplied in the mint
   request. The filename is only known after the token ID is assigned, so the baseURI file
   is a webhook/poll-driven artifact. ([minting-api], [indexer])
9. **The Secret API Key is a hot bearer credential** that can mint to any `owner_address` —
   it bypasses backend entitlement if leaked. Treat it like a hot wallet key. ([api-keys])
10. **Passport gas sponsorship applies to player transactions**; server-side mints don't use
    it. It matters for secondary trading/checkout, not for the Minting API itself. ([chain])
11. **Operator allowlist is required for marketplace compatibility.** ([overview])

> ⚠️ **Hard preconditions (unverified as of this date):**
> - The `@imtbl/contracts` GitHub README still says "experimental / do not use in
>   production" while the docs call the presets "audited". **Confirm the current audit
>   status and cite the report before relying on Option A's "no audit" claim.**
> - Confirm in the Hub UI exactly which preset is offered and which mint function it
>   enables (see BC1a). The two doc pages disagree on token-ID control.

---

## 3. Pivotal decision — contract & minting approach

The earlier chat pick ("rewrite minimal OZ 5.x + on-chain EIP-712 server-signed mint") is
**not** Immutable's recommended path. Both options remain, but Option A is only recommended
**after** the BC1a spike confirms Hub capabilities and the audit precondition holds.

| | **Option A — Immutable preset + Minting API** *(recommended, gated on BC1a)* | **Option B — Custom OZ 5.x + EIP-712 mint** *(fallback)* |
|---|---|---|
| Contract | `ImmutableERC721` (or `MintById` if confirmed), deployed via Hub | New minimal ERC-721 (+ ERC-2981, AccessControl, Pausable) |
| Mint authority | Secret API Key → Minting API; minter role delegated to Immutable | Backend signer key; contract verifies EIP-712 signature + nonce |
| Native token IDs | System-assigned; map via `reference_id` | We choose |
| Allowlist | Pre-approved | **We implement + register Immutable's operator allowlist** |
| Gas/nonce/batching/indexing | Managed by Immutable | We manage |
| Custom on-chain logic | Minting API rejects custom contracts | Full control |
| Effort / risk | Lower, **conditional on the audit + Hub verification** | Higher (Solidity + external audit + ops) |
| Trust | Immutable holds mint role; our secret key can mint without entitlement | A hot backend signer key has the same blast radius |

**Trust correction:** both options hinge on a hot credential. A leaked Minting API key mints
to arbitrary addresses exactly as a leaked EIP-712 signer does. The real comparison is
operational (managed indexing/batching vs self-hosted), not "trust Immutable vs trust
nobody". Kill switch for Option A: the collection owner can revoke Immutable's minter role.

**Recommendation:** run the **BC1a spike** (Hub contract variant + enabled mint function +
audit confirmation). If it passes, ship phase 1 on Option A; otherwise default to Option B.
Do not begin BC2/BC3 against an unconfirmed mint interface.

**Token-ID decision (revised):** **no deterministic IDs.** The authoritative species map is
`mint_intents.reference_id → species`, and the cache stores `token_id → species` once
assigned. Delete `BLUEPRINT_PREFIX_TO_SPECIES` and the fuzzy name/attribute fallbacks in
`mapTokenToFamiliar` together.

---

## 4. Target architecture (Option A, phase 1: poll-based, no webhooks)

```
Player ──Passport sign-in──▶ Worker (authMiddleware) ──▶ game state (D1)

Summon (wallet-bound, under /api/game/mint/*)
  │
  ▼
Worker /api/game/mint/request
  │  1. entitlement + economy + per-account cap + rate limit
  │  2. WRITE-AHEAD: D1 mint_intents(reference_id UNIQUE, sub, species, status='pending')
  │  3. call Immutable Minting API (Secret API Key) with owner_address = bound wallet
  ▼
Immutable Minting API ──(system token_id)──▶ Indexer
  │
  ▼  client/Worker polls status by reference_id (no webhooks in phase 1)
Worker /api/game/mint/status/:referenceId
  │  on succeeded: persist token_id + species, write {baseURI}/{token_id}.json to R2,
  │  invalidate the account's ownership cache
  ▼
Ownership source: Indexer (cached per account, short TTL)
  │
  ▼
party select + battle/start validate against owned NFTs ∪ explicit grants
```

- **No webhooks in phase 1.** Status polling avoids the partner-enablement, subscription,
  signature, and raw-body work, and the Worker-limiter conflict. Activity webhooks are a
  phase-2 hardening step for real-time updates (§5 BC2b).
- **Ownership is sourced from the Indexer, not mint events**, so transfers, burns, and
  marketplace sales are visible (the mint-only cache could not see them).
- **Cache keyed by account `sub` + `token_id`**, invalidated on mint confirmation and on
  wallet rebind; short TTL with periodic resync.
- **Grants are modelled explicitly** (starter set + area-unlock rewards) and unioned with
  owned NFTs — the boss-defeat `playerFamiliars.push` grant must not be silently dropped.

---

## 5. Workstreams

### BC0 — Retire legacy + foundation *(cleanup, parallel)* — **DONE** ✅
> **Status (2026-10-05): done.** `blockchain/` removed (`git rm -r`); dead
> `frontend/src/app/constants/{FamiliarABI,IMXABI}.json` deleted; the orphaned root
> `@openzeppelin/contracts` dependency and the now-dead `blockchain` tooling exclusions
> (eslint/prettier/gitignore) dropped. README, PRODUCTION-DEPLOYMENT-GAP-PLAN §7, and the
> §1 rows above were updated. `npm run lint` and `npm run frontend:type-check` pass. The
> backend `StarkEx` comments and `BLUEPRINT_PREFIX_TO_SPECIES` are intentionally left for a
> later step (BC2).

- Stop treating `blockchain/` as deployable: archive/remove the StarkEx bridge, custom
  ERC721/proxy, and Truffle remnants. Delete dead `FamiliarABI.json`/`IMXABI.json`.
- No ABI dependency is needed for Option A (REST only). Add `@imtbl/contracts` + OZ 5.x only
  if Option B is exercised.
- Correct the stale notes: `viem` is already a backend dep; `BLUEPRINT_PREFIX_TO_SPECIES`
  lives in `utils/imx.ts` and removal touches `mapTokenToFamiliar` + `owned-familiars`.
- Acceptance: no StarkEx references remain; CI green.

### BC1 — Collection setup on Immutable Chain *(testnet)*
- Deploy the confirmed preset via Hub with `baseURI`, `contractURI`, operator allowlist,
  royalty receiver + bps; grant the minter role to Immutable; create the Secret API Key.
- **BC1a (spike, precedes BC2/BC3):** in Hub, capture the offered contract variants, the
  enabled mint function (`mintBatchByQuantity` vs token-ID), and the audit status. Record
  the collection address, key id, and webhook/status endpoints.
- Define the metadata JSON template (species/rarity/stats as attributes) and the R2 layout.
- User-run, authenticated steps are explicit hand-offs (per AGENTS.md) with recorded outputs.
- Acceptance: contract on testnet; a manual Minting API mint succeeds; the Indexer shows it
  with correct metadata; BC1a confirms the interface.

### BC2 — Backend mint service + ownership sync — **SEAM SCAFFOLDED** ⚙️
> **Status (2026-10-05): scaffolded, disabled.** The authenticated mint request/status
> routes, write-ahead `mint_intents` idempotency, and the `owned_nfts` upsert on confirmed
> mint are implemented behind `MINTING_ENABLED` (default `false`; `ImmutableMintingProvider`
> unexercised). Indexer sync/reconciliation, grants replacement, and R2 metadata are deferred.

- Mint routes **mounted behind `authMiddleware`** (e.g. `/api/game/mint/*`) or equivalent
  explicit token + wallet-binding checks; anonymous requests rejected (tested).
- `POST .../mint/request`: validate wallet binding + entitlement/economy/per-account cap;
  **write-ahead** the intent (unique `reference_id`, status `pending`) **before** the API
  call; on retry reuse the stored `reference_id`; treat API `409` as already-processed.
- `GET .../mint/status/:referenceId`: poll Minting API; on success persist `token_id` +
  species, generate `{token_id}.json` to R2, invalidate the ownership cache.
- **Ownership sync:** Indexer-backed cache keyed `(sub, token_id)` with species/owner and a
  short TTL; resync on party selection and on a schedule. Define the loss-of-ownership policy
  (a familiar sold/burned mid-run must not remain fielded).
- Reconciliation for stuck `pending` intents (bounded cadence/pagination; separate from the
  hourly cleanup cron).
- Replace `createDefaultGameState` starters with granted starters; keep area-unlock grants.
- Delete `BLUEPRINT_PREFIX_TO_SPECIES`; derive species from `mint_intents`/cache.
- Migrations: `mint_intents`, `owned_nfts` (numbered, with the existing pre-migration
  backup/Time-Travel runbook).
- Tests: auth rejection, entitlement, idempotency, cap, status transition, cache sync,
  forged-ownership rejection, rebind invalidation.
- Acceptance: signed-in wallet-bound player mints on testnet; it becomes selectable; replay
  and forged requests are rejected.

### BC2b — Real-time webhooks *(phase 2 / hardening; requires partner enablement)*
- Request webhook enablement (managed partner relationship) and **verify in Hub which
  mechanism applies**: HMAC-SHA256 (`x-immutable-signature` + shared secret) or AWS SNS
  (subscription confirmation + certificate signature over the raw body). Build the
  corresponding verifier; never parse the body before verifying.
- Process at-least-once/delivery-ordered events idempotently (dedupe by event id); handle
  retries/DLQ/replay.
- Subscribe to mint + **activity/transfer/burn/sale/order** events for the collection so
  sales and burns invalidate ownership promptly; keep polling as reconciliation.
- Exempt the webhook path from the IP limiter (signature is the control).
- Acceptance: a sold familiar loses fielded access within the SLA; duplicate/out-of-order
  events are safe; signature failures are rejected.

### BC3 — Frontend: Summon + Collection
- `/app/minter`: show entitlement/cost, call `mint/request`, poll status, surface
  pending/succeeded/failed and "minted but not yet indexed"; refresh ownership.
- `/app/collection`: grid from the Indexer with species/rarity; link to Immutable's
  marketplace (do not build one).
- Require wallet binding before minting; reuse the design system (DESIGN.md).
- Acceptance: mint + collection work on testnet; loading/error/empty states covered.

### BC4 — Ownership → gameplay authority — **FLAG SCAFFOLDED** ⚙️
> **Status (2026-10-05): scaffolded, disabled.** `OWNERSHIP_AUTHORITY` (default `false`)
> gates `state/party`, `dungeon/enter`, and `battle/start` on the fieldable set
> `playerFamiliars ∪ owned_nfts` (`resolveFieldableFamiliars`); off, it is exactly today's
> grants-only set with no extra D1 read. The `owned_nfts` cache is populated only by the
> (disabled) mint-status path.

- Party selection + `state/party` + `battle/start` validate `owned_nfts ∪ grants` (explicit
  starter and area-unlock grants).
- Define behaviour when ownership is lost mid-run (indexer lag, sale, burn).
- Acceptance: an unowned, non-granted familiar cannot be fielded (server-enforced, tested).

### BC5 — Economy, abuse, security, legal
- **Decide the mint sink now** (before BC2): fiat via Checkout, achievement-gated, or
  free-with-cap. If off-chain currency is used, require a **wallet-bound** account and a
  per-wallet cap that guest-reset cannot bypass (guest UUIDs are forgeable; the 20/day cap
  is per-browser for guests).
- Secret API Key custody (separate staging/prod keys, rotation runbook, anomaly alerting);
  document that a leaked key = unbounded minting until the minter role is revoked.
- Add mint-specific limits on top of the existing 120 req/60s IP limiter.
- **Legal/ToS delta:** farmable currency converting to tradable NFTs + marketplace listing
  changes the legal/privacy surface (`/privacy`, `/terms` exist).
- Audit: confirm the preset is audited (precondition); Option B requires an external audit.
- Acceptance: documented economics; mint abuse bounded; secrets server-side only; ToS updated.

### BC6 — Mainnet + ecosystem + observability
- Deploy/clone to mainnet, verify collection in Hub, register Orderbook/marketplace, consider
  Trading Rewards (≥0.5% royalty).
- Production RPC (QuickNode/dRPC); add mint success/failure, webhook-lag, and reconciliation
  metrics/alerts tied to the existing Workers Observability.
- Pause semantics for pending intents + API-key rotation runbook.
- Acceptance: mainnet mint + secondary trade via Immutable's Orderbook; runbook documented.

---

## 6. Sequencing & rough effort

| Phase | Workstreams | Effort (solo-dev, focused, Option A) |
|---|---|---|
| P0 testnet vertical slice | BC1a → BC1 → BC2 → BC3 → BC4 (+ BC0 cleanup) | ~3–5 weeks |
| P1 hardening | BC2b (webhooks), BC5 | ~1–2 weeks |
| P2 mainnet | BC6 | ~1–2 weeks |
| Option B instead | full Solidity rewrite + external audit | +4–6 weeks |

v1's "2–4 weeks" under-counted the spike, webhook work, transfer reconciliation,
metadata generation, economy decisions, and NFT art/metadata production
(`docs/assets/ASSET-GENERATION.md`). Re-baseline after BC1a.

---

## 7. Risks

- **Hot credential (both options):** a leaked API key (A) or signer key (B) mints without
  entitlement until roles/keys are revoked. Mitigate with separate staging/prod keys,
  rotation, anomaly alerts, and a documented kill switch.
- **Option A lock-in:** the Minting API rejects custom contracts; a later pivot to Option B
  likely means a new collection and **stranded existing NFTs**. Decide whether A is permanent
  before mainnet.
- **Ownership correctness:** the Indexer is eventually consistent, and sales/burns must
  revoke access. Per-action checks + cache invalidation are required, not optional.
- **Guest/farming loophole:** currency-gated mints amplify the forgeable-guest design into
  real NFT inflation unless wallet binding is required.
- **Webhook gating/mechanism (phase 2):** webhooks need partner enablement and the verifier
  (HMAC vs SNS certificate) must be built in Workers; the documented examples are
  Node/Fastify, not Workers. Poll-first avoids this for launch.
- **Limiter conflict:** the IP limiter will 429 webhook bursts and metadata crawls; exempt
  those paths and host metadata off the Worker.
- **Audit uncertainty:** Option A's "no audit" advantage is unconfirmed; the preset audits
  must be verified and cited.
- **Legacy drag:** `blockchain/` must be genuinely retired to prevent accidental StarkEx use.

---

## 8. Acceptance criteria (definition of done for the track)

1. A signed-in, wallet-bound player can summon a familiar on testnet; it mints to their
   zkEVM wallet, appears in the Indexer, and becomes selectable.
2. On-chain ownership is authoritative **including transfers/burns/sales**: an unowned,
   non-granted familiar cannot be fielded (server-enforced, tested).
3. Idempotency + cap + rate limiting bound mint abuse; duplicate `reference_id` cannot
   double-mint; a leaked-credential revoke path is documented.
4. Secrets are server-side only; mint status is trusted only from Immutable (API key +
   TLS) and, once webhooks are enabled, their signatures are verified; metadata at
   `{baseURI}/{token_id}` is correct and served off the rate-limited path.
5. Mainnet collection is verified, tradable on Immutable's Orderbook, with a pause/rotation
   runbook and mint metrics/alerts.

---

## 9. Open questions (owner decisions)

- **Q1 — Option A vs B**, gated on BC1a + audit confirmation (§3).
- **Q2 — Mint sink** (decide before BC2): fiat/Checkout, achievement-gated, or free-with-cap?
- **Q3 — Ownership-loss policy:** what happens to a fielded familiar that is sold/burned
  mid-dungeon? (Recommended: block further fielding, allow the run to finish.)
- **Q4 — Starter familiars:** which species are granted, and are they re-mintable?
- **Q5 — Webhooks vs poll-only for launch** (recommended: poll-only for phase 1).
- **Q6 — Preset audit status** (hard precondition).
- **Q7 — Accept Immutable holding the minter role?** (Option A.)
- **Q8 — Is Option A permanent, or a temporary path to Option B?** (Migration blast radius.)

---

## 10. Sources

- Chain / network config: https://docs.immutable.com/docs/products/immutable-chain/overview
- Asset contracts overview (presets, allowlist, royalties): https://docs.immutable.com/docs/products/asset-contracts/overview
- Deploy contracts via Hub: https://docs.immutable.com/docs/products/asset-contracts/deploy-contracts
- Minting API: https://docs.immutable.com/docs/products/asset-contracts/minting-api
- Indexer (polling, caching TTLs, webhook events + partner gating): https://docs.immutable.com/docs/products/indexer
- API-key security: https://docs.immutable.com/docs/guides/advanced-setup/api-keys
- Build a game: https://docs.immutable.com/docs/guides/build-a-game
- `@imtbl/contracts` presets/ABIs: https://github.com/immutable/contracts
- Immutable X sunset & migration: https://github.com/immutable/imx-migration-contracts
- Deprecation coverage: https://esportsinsider.com/2026/02/immutable-x-zkevm-merge-web3-gaming

---

## 11. Adversarial review (v1 → v2)

Verdict on v1: **NOT READY** — five blockers, ten high/medium issues. Disposition below.

| # | Sev | v1 issue | v2 resolution |
|---|-----|----------|---------------|
| B1 | BLOCKER | Assumed token-ID control (`MintById`); Minting API may only enable quantity minting and Hub may not offer `MintById`. | BC1a spike; default `ImmutableERC721`; do not build against an unconfirmed interface. |
| B2 | BLOCKER | Deterministic `species*1e6+serial` IDs — impossible with system-assigned IDs. | Dropped; authoritative map is `reference_id → species`; delete `BLUEPRINT_PREFIX_TO_SPECIES`. |
| B3 | BLOCKER | Persisted intent after the API call → double-mint / lost mapping. | Write-ahead intent before the call; idempotent retries; `409` = already processed. |
| B4 | BLOCKER | "Verify webhook secret" under-specified; webhook mechanism (HMAC vs SNS) and partner enablement unverified. | Phase 1 poll-only; mechanism confirmed in Hub and handled in BC2b. |
| B5 | BLOCKER | Ownership cache from mint events only → sales/burns invisible. | Ownership sourced from the Indexer; transfer/activity events in BC2b; loss policy Q3. |
| H1 | HIGH | Cache had no owner. | Cache keyed `(sub, token_id)` with owner/species. |
| H2 | HIGH | Mint routes outside the `/api/game/*` auth gate. | Mount behind `authMiddleware`; anonymous rejection tested. |
| H3 | HIGH | Metadata pre-generated before token IDs exist. | Metadata generated on confirmation (poll/webhook) and written to R2. |
| H4 | HIGH | IP limiter would 429 webhook bursts / metadata crawls. | Exempt mint status/webhook; host metadata off the Worker. |
| H5 | HIGH | Currency-gated mints + forgeable guests = NFT inflation. | Require wallet binding + per-wallet cap; decide sink before BC2 (Q2). |
| H6 | HIGH | Option A rests on an unverified preset audit. | Hard precondition + cite the report (§2 warning, Q6). |
| H7 | HIGH | Trust framing ignored the API key's blast radius. | Corrected §3; hot-secret handling + revoke kill switch. |
| H8 | HIGH | `owned_nfts`-only predicate would drop area-unlock grants. | Grants modelled explicitly and unioned in the authority predicate. |
| H9 | HIGH | Address-keyed cache not invalidated on wallet rebind. | Cache keyed by `sub`; invalidated on rebind. |
| M1–M11 | MED | Missing migrations; reconciliation cadence; rate-limit/cost model; user-run checklist; sources; migration blast radius; effort; stale ABI/viem notes; legal; serial atomicity. | Added migrations (§5 BC2), cadence (§5 BC2), rate-limit/cost notes (§5 BC5), hand-offs (§5 BC1), sources (§10), Q8, re-baselined effort (§6), corrected repo facts (§1), legal (§5 BC5), and dropped serial allocation (revised §3). |
| L1–L5 | LOW | BC0 "blocker" mislabel; duplicate collection vars; gas-sponsorship nuance; pause semantics; missing mint metrics. | BC0 relabelled cleanup; reuse existing `COLLECTION_CONTRACT_*` vars; corrected §2.10; pause + metrics in BC6. |

---

## Appendix A — Option B (custom contract + EIP-712), retained as fallback

If custom on-chain mechanics are required (or BC1a fails):

- **Contract:** minimal ERC-721 + ERC-2981 + `AccessControl` (DEFAULT_ADMIN / MINTER /
  PAUSER) + `Pausable`, OZ 5.x. `mintWithSignature(MintRequest, sig)` with EIP-712
  `{ to, speciesId, tokenId, nonce, deadline }`; nonce mapping; supply + per-address caps.
  Must implement **Immutable's operator allowlist** for marketplace compatibility.
- **Backend:** sign EIP-712 payloads after entitlement checks; verify + sync ownership;
  own indexing/reconciliation; self-host metadata; external audit before mainnet.
- Not a starting point from the legacy `blockchain/contracts` — rewrite from OZ 5.x /
  `@imtbl/contracts` base contracts.
