# Production Readiness Plan — Arcane Familiars

Status: draft for review
Scope: current `master` (playable vertical slice) → production v1
Execution companion: `docs/IMPLEMENTATION-PLAN.md`
Last reviewed: 2026-10-29

---

## 1. Executive summary

The project has a genuinely good foundation: server-authoritative combat, seeded RNG,
optimistic concurrency on saves, a shared pure-TypeScript rules package, 127 passing
unit tests, data-driven items, scene cleanup discipline, and a complete explore → battle
→ reward loop with real art.

It is **not production ready**. The current build is a strong internal vertical slice,
but it has five structural gaps:

1. **No durable player identity.** Progress is keyed by a client-generated UUID in
   `localStorage`. Clearing storage loses the account; any leaked ID is a full account
   takeover; there is no wallet link, recovery, or session security. The existing
   `/api/auth/register` endpoint also accepts any well-formed address without proof of
   ownership, which is an impersonation hole even though the game does not use it yet.
2. **No content pipeline or progression.** 3 short random dungeons, 10 familiars
   (3 of them bosses), 8 abilities, 10 items, no levels/XP, no capture loop, no shop,
   and no meaningful currency sink. The "Recommended Level" on the world map is not a
   real mechanic.
3. **The UI does not scale.** Party select lays every owned familiar in one row; the
   world map silently hides regions that do not fit; the HUD does not show status
   effects or cooldowns. The second and third boss unlocks already stress these screens.
4. **The authoritative loop has correctness bugs that block launch.** The two-row D1
   batch is not atomic, so a racing turn can grant rewards twice. Moving rooms during a
   battle can mark the wrong room's encounter resolved and skip a boss. Restarting or
   refreshing a battle resets combat HP and is a free full heal. These must be fixed
   before content and UI work.
5. **No launch operations.** No rate limiting, integration/e2e tests, staging
   environment, monitoring, analytics, security headers, or deploy workflow. CI runs
   type-check and build only, and does not run the game-logic tests.

**Recommendation:** Ship a web-first v1 (no NFT minting at launch). Blockchain/NFT is
explicitly deferred. The selected content target is the full 6 regions, 25 familiars,
26 abilities, 20 items, and a real progression loop. A realistic calendar estimate is
**28–36 weeks** with one full-stack engineer and one artist; 40–52 weeks solo. The 4-region
tier in Section 5.7 remains a contingency only if art capacity proves insufficient.

---

## 2. What is already good

- Server-authoritative resolution: the client sends intent, the Worker resolves the
  turn, and the battle now lives in the save document so the turn, rewards, inventory,
  and HP commit in one optimistic row write (P0.19 resolved on
  `fix/battle-state-integrity`).
- Optimistic concurrency: `game_states.version` prevents stale writes; battle actions
  are conditional on the turn count.
- Seeded, reproducible RNG for encounters, loot, and combat.
- `packages/game-logic` is dependency-free, shared by backend and client, and covered by
  127 unit tests. They pass with `npm test` inside `packages/game-logic`; CI does not run
  them yet. The root workspace has no test script.
- Data-driven items and treasure pool (`ITEMS` + `dropWeight`).
- Scene lifecycle cleanup, event-bus teardown, and a screen-reader live region on the
  world map.
- Party swapping, KO relay, speed-ordered turns, KO-cancelled actions, and item
  consumption rules are already implemented.
- Art direction and a real design system exist (`DESIGN.md`), even where the game HUD
  currently uses hardcoded dark values.

These are the right bones. The plan below hardens them rather than replacing them.

---

## 3. Current-state findings

Severity: **P0** launch blocker, **P1** required for a credible v1, **P2** polish.

### P0 — must close before launch

| # | Finding | Evidence | Impact | Fix |
|---|---------|----------|--------|-----|
| P0.1 | Identity is a client-generated UUID with no server session | `game/src/api/client.ts:20-27`, every `game-*.ts` route trusts `body.anonymousId`; `backend/src/routes/auth.ts:10` accepts any well-formed address without proof | Account loss on storage clear; account takeover if ID leaks; no recovery; wallet/account impersonation; no NFT ownership boundary | Server-issued session (HttpOnly cookie) + recovery code/email; remove/rewrite `/auth/register`; never accept `anonymousId` from the client. SIWE is deferred with the NFT track |
| P0.2 | Save schema has no migration path | `GameState.version` is a content-shape field that is never read or written meaningfully (`packages/game-logic/src/types/gameState.ts:14`); the DB's `game_states.version` is a separate concurrency counter (`saveManager.ts:34,83`) | Any content/type change can corrupt or silently misread existing saves; older saves without `dungeon.partyHp` can 500 permanently | Add `schemaVersion` (distinct from the DB concurrency `version`), a migration chain, validation-on-load, and a fixture per version |
| P0.3 | Collection model is species-based, not instance-based | `GameState.playerFamiliars: string[]`; party validation compares species IDs | Cannot own two of the same familiar, cannot track per-familiar XP/level, cannot map to NFT token IDs | Introduce `OwnedFamiliar { id, speciesId, level, xp, acquiredAt, source }` and make party/run references instance IDs |
| P0.4 | Defeat has no cost | `game-battle.ts:444-445` only increments counters and sets `dungeon = null`; inventory untouched | Removes the push-your-luck tension; failure is a free reset; economy has no risk | Add run loot/bank split; on defeat drop run loot and gold earned in the run; add forfeit |
| P0.5 | Party select breaks as the collection grows | `game/src/scenes/PartySelectScene.ts:224-225` computes one row from every familiar; 5 cards already exceed 800px | Unplayable after the second/third boss unlock | Replace with a scrollable React team builder; keep 2 slots, filters, search |
| P0.6 | World map hides extra regions | `WorldMapScene.ts:142-146` slices `areaList` to what fits and logs a warning | New levels are invisible | Replace with a scrollable React world map |
| P0.7 | Mid-battle refresh has no resume path | `ExplorationScene.ts:122-151` only restores boss rooms and pending treasure; active battles are not resumed | Player is returned to exploration with an unresolved encounter and can get lost/duplicate attempts | Add `GET /game/bootstrap` with active battle; resume BattleScene; add an explicit "abandon battle" path |
| P0.8 | Boss runs cannot be abandoned | `BattleScene.handleExit` returns to world map with the dungeon still active; `run` is blocked for bosses | A player who cannot win is stuck in a dungeon they cannot exit cleanly | Add `POST /game/run/forfeit` and a Battle HUD "Forfeit run" action with confirmation |
| P0.9 | No rate limiting or abuse controls | `backend/src/index.ts` has CORS only; no middleware | Trivial D1 cost DoS and reward farming via scripted requests | Per-IP/per-player rate limits, body size cap, action throttles, WAF rules |
| P0.10 | Migration hygiene is unsafe | Both `0003_add_state_version.sql` and `0003_state_revision.sql` exist; `0004` adds `dungeon_runs.ended_at`, `0005` drops unused tables; `revision` and `dungeon_runs` are unused. The 2026-10-29 production snapshot is further ahead: it has migrations `0004`–`0010` (wallet bindings/challenges, guest marker, rate limits) that are not in the repo | Ambiguous migration history; production schema is not reproducible; renumbering applied files can corrupt D1 bookkeeping; auth/rate-limit work overlaps unknown deployed code | Freeze applied migrations, recover the deployed Worker/migration source, capture the real production schema with `wrangler d1 export`, add a timestamped reconciliation migration, and reset numbering only for local/dev. See `docs/MIGRATIONS.md` |
| P0.11 | CI does not test the game | `.github/workflows/ci.yml` has only `frontend` and `backend` jobs; the `game` (Phaser) workspace and `packages/game-logic` are neither built nor type-checked, and tests are not run | Regressions in combat/progression ship silently | Add unit tests, route integration tests, e2e smoke, lint, and build/type-check for all four workspaces |
| P0.12 | Mobile is effectively unsupported | Fixed 800×600 canvas; HUD is scaled into the canvas box (`GamePage.tsx`, `useCanvasRect.ts`); battle/exploration input is still drawn in Phaser | Text and tap targets become unusably small; moving the HUD out of the canvas alone does not fix input | Make React the only input path; keep the canvas presentational; responsive shell; touch targets ≥ 44px; JS/asset budgets as exit criteria |
| P0.13 | Combat state is not visible | `BattleScene.emitStateUpdate` never sends `statusEffects` or `cooldowns`; `AbilityOption` has no cooldown field | Players cannot see DoTs/buffs or why an ability is unavailable; combat becomes guesswork | Extend `GameStateSnapshot` and HUD; show status chips, cooldown badges, turn order, damage forecast |
| P0.14 | Landing page advertises content that does not exist | `frontend/src/components/landing/CreatureShowcase.tsx` lists four familiars ("Whitedog", "Yellow Fighter", "Mystic Sprite", "Ember Fox") with emoji | Marketing is disconnected from the game; damages trust | Drive showcase from the content catalog and real art |
| P0.15 | No observability | No structured logs, error tracking, analytics, or alerts | Cannot detect outages, save corruption, or balance problems | Sentry + Workers logs/metrics + product analytics + alerts |
| P0.16 | No staging/production deploy pipeline | Backend has `wrangler deploy --env production`; there is no staging env, frontend deploy, migration gate, or smoke test | Manual, untested releases | Build staging + prod environments, migration gate, smoke tests, rollback runbook |
| P0.17 | Asset pipeline doc is missing | `AGENTS.md` references `docs/assets/ASSET-GENERATION.md`; the file does not exist | New familiars/regions cannot be produced consistently | Write the asset-generation doc and a content manifest validator |
| P0.18 | New content cannot be validated | No check that abilities/items/familiars/regions reference real IDs or have art | Broken content ships easily | Add `content.test.ts` and a manifest check in CI |
| P0.19 | Battle state + save writes are not atomic | `game-battle.ts:475-508`: the code comments claim atomicity, but two independently guarded statements in a D1 batch commit even when one matches 0 rows; the route returns 409 after the other write is already committed. Same shape in `swap` (`:579-599`) and `flee` (`:653-672`) | A racing turn can grant rewards/currency/XP twice or leave the battle row disagreeing with the save | Gate both writes on one condition (or one parent run row/version), make `expectedTurnCount` mandatory, and add a forced-zero-row integration test |
| P0.20 | Battles resolve against the current room, not the fought room | `game-battle.ts:141-145` starts from `currentRoomId`; `:396` resolves `state.dungeon.currentRoomId` at win time; `explore`/`exit` do not block during an active battle | Move into the boss room mid-fight, win the trash fight, and the boss encounter is marked resolved; progression skip/soft-lock | Stamp `roomId` on the battle at start and resolve that room; 409 `explore`/`exit`/party changes while a battle row exists |
| P0.21 | Leaving or refreshing mid-battle is a free full heal | `BattleScene.ts:688-696` returns to the world map without persisting combat HP or resolving the encounter; combat HP lives only in `active_battles` | Attrition loop defeated; losing fights are free retries | Add `battle/abandon` that persists HP and resolves the encounter (or counts as a loss); call it from exit/unload; resume active battles on bootstrap |
| P0.22 | Restarting a battle resets combat HP | `battle/start` deletes any existing `active_battles` row (`game-battle.ts:198-204`) and rebuilds from `dungeon.partyHp` (`:152`), which is only written at turn end | Call start again to erase damage taken since the last persisted turn; restarting before acting is a full heal. The comment at `:196-197` says deletion is safe only because no resume path exists | Return 409 when a battle row exists; resume or abandon are the only paths. Abandon persists HP/MP and deletes the row; for non-boss it leaves the encounter unresolved (same as flee), for boss it forfeits the run. Note: KO-cancel item/cooldown handling is already correct (`battleEngine.ts:121-135` excludes canceled actions from `steps`; regression test only) |
| P0.23 | Battle start accepts a 0-HP familiar | `game-battle.ts:152` builds from persisted HP with no aliveness check | A refreshed/relayed save can start at 0 HP and hand the enemy a free hit | Reject or auto-select a living party member in `battle/start` |
| P0.24 | `dungeon/exit` leaves an orphaned battle row | `game-exploration.ts:260-297` nulls the dungeon but not `active_battles` | `/game/state/party/active` 409s; the orphan battle is still playable and can award a win | Delete the battle row in `exit` and `abandon`; purge on bootstrap if the dungeon is gone |
| P0.25 | Full-HP item use consumes the item for zero effect | `battleEngine.ts:262-274` clamps healing to 0; `game-battle.ts:323` still decrements | Silent loss of scarce consumables | Validate `heal_hp`/`heal_mp` usefulness before consumption; disable the item in the HUD |
| P0.26 | `targetId` is not validated | `validation.ts:15-66` ignores `targetId`; `battleEngine.ts:377` lets an attack target the player's own uid | Unvalidated client input on a server-authoritative endpoint (self-harm, confusing logs) | Validate target belongs to the expected side and is alive |
| P0.27 | Guest accounts are an unbounded economy faucet | `saveManager.ts:15-22` grants 100 gold and 3 starters per new ID; no Turnstile/device limits | Cookie clearing or scripted guests farm the economy; no tradeable value in v1, but telemetry and future economy are polluted | Turnstile on guest creation, device/account velocity limits, economy invariants, per-account caps |
| P0.28 | Session cookies will not work across the current origins | SPA on `*.pages.dev`, API on `*.workers.dev`; CORS does not set credentials; `SameSite=Lax` cookies are not sent cross-site | Auth as designed would silently fail in production | Put the API on the same registrable domain (e.g. `app.domain.com/api` proxied to the Worker) or use short-lived bearer tokens with refresh rotation; set `credentials: 'include'` and `Access-Control-Allow-Credentials` |

**Status 2026-10-29:** P0.19–P0.26 are addressed on `fix/battle-state-integrity`.
The battle now lives in `GameState.activeBattle`, so turn, rewards, inventory, and HP
commit in one optimistic row write. Integration coverage is in
`backend/test/battle-integrity.test.ts` (10 tests); action validation coverage is in
`packages/game-logic`. P0.20/P0.21/P0.22/P0.23/P0.24/P0.25/P0.26 have regression tests.
P0.27/P0.28 remain for the auth phase.

### P1 — needed for a credible v1

- No XP, familiar levels, keeper levels, or ability unlocks. All stats are static.
- No capture/recruit loop. Collection grows only from boss first-clears.
- No shop, inventory screen, or currency sink. Gold accumulates with nothing to buy.
- No per-region loot tables; the same global pool drops everywhere and high-tier items
  can drop in the first room.
- No affinity effect. `Affinity` is displayed but never used in damage.
- Status effects are limited to buff/debuff/DoT/HoT; no shield, ability-level cleanse,
  stun/freeze, drain, or MP drain. The engine supports only one status per ability
  (`tonic` has an item-level cleanse; that is not the same as a cleanse ability).
- `lucky_coin` has no `dropWeight`, so it never drops; several items are data-only.
- Rewards are flat (40–70 gold per win, boss 50/100/200) regardless of region/level.
- No item use outside battle; no way to heal between rooms except items in battle.
- No run history, first-clear rewards, or star ratings.
- No audio, settings, tutorial, or onboarding.
- `WorldMapScene` "Recommended Level" is not tied to any player stat.
- Dead preview code: `frontend/src/App.tsx` exposes `/preview`; `CircularArcVariations`,
  `CompactCardInContext`, `FamiliarStatusPreview`, `CombinedControlsPreview`, and several
  status variants are unused. This bloats the bundle and obscures the real HUD.
- `dungeon_runs` is never written; the scheduled cleanup deletes an empty table.
- Production CORS allows only `arcane-familiars.pages.dev`; no custom domain plan.

### P2 — polish and scale

- 1.44 MB JS chunk (375 KB gzip) for the game bundle; code-split Phaser.
- 14 MB of art in `game/public/assets`; no WebP/AVIF, atlasing, or region lazy-load.
- No accessibility pass on Phaser-drawn menus; only the world map has keyboard nav.
- No reduced-motion setting, text scaling, or colorblind-safe status icons.
- No localization scaffolding.
- No privacy policy, terms, cookie notice, or age gate.
- No dependency audit, CSP, HSTS, or security headers.
- No load test for D1 write throughput.

---

## 4. Product definition for v1

### Assumptions (confirmed 2026-10-29)

1. **Blockchain and NFT are deferred.** Ship the web game first. No minting, wallet
   ownership, IMX integration, or contract work in v1. Keep the instance model ready for
   a later token mapping, but do not block launch on it.
2. **Guest-first identity with recovery.** A server session is created on first visit.
   Onboarding issues a one-time recovery code (and/or an email magic link) so clearing
   cookies or switching devices does not destroy progress. SIWE/wallet linking is
   deferred with the NFT track.
3. **Same-origin API.** Serve the API under the same registrable domain as the SPA
   (e.g. `app.example.com/api` proxied to the Worker) so HttpOnly session cookies work
   without third-party-cookie workarounds.
4. **Desktop-first, mobile-playable.** The run/battle canvas stays 16:9, but all menus
   and battle input live in responsive React. The canvas is presentational.
5. **Party size is 2 in a dungeon; collection size is unlimited.** The player may own and
   manage any number of familiars. Exactly two enter a run and participate in the
   swap/KO-relay loop. The team builder must scale to a large collection.
6. **Full 6-region v1.** 6 regions, 25 familiars, 26 abilities, 20 items, 6 bosses. The
   4-region tier in Section 5.7 is a contingency, not the selected scope.
7. **Capture/recruit is in v1.** Without it the game is a dungeon crawler, not a
   creature collector. Captured familiars are game-owned; NFT minting is deferred.

### Definition of production ready

A new player can:

- start a session, complete onboarding, choose a starter pair, understand the loop, and
  has a recovery path that survives cookie clearing or a device switch;
- build a party from a collection of any size, on desktop and mobile, with React as the
  only input layer;
- clear the launch regions with visible progression, loot, shopping, and meaningful
  defeat;
- refresh mid-run or mid-battle and resume exactly where they were;
- never lose progress to a client bug, stale save, or race condition;
- get help, report a bug, and read privacy/terms.

Operations can:

- deploy to staging and production with one workflow and a migration gate;
- see errors, latency, win rates, and funnel drop-off;
- roll back a bad deploy or restore a D1 backup;
- rate-limit and block abusive clients.

---

## 5. Content roadmap

### 5.1 Regions (levels)

Replace the current 3 random `Area`s with 6 curated `Region`s. Each has a room template
pool, region-specific room names/descriptions, encounter weights, an elite modifier
pool, one boss, and a first-clear reward.

| # | Region | Level | Rooms | Encounters | Boss | Unlocks |
|---|--------|-------|-------|------------|------|---------|
| 1 | Verdant Meadow | 1–3 | 8 | whiteDog, leafBunny, sparkMouse, honeyBear, petalWisp | Meadow Guardian | Crystal Caves |
| 2 | Crystal Caves | 3–6 | 9 | aquaSprite, tideTurtle, crystalMole, echoBat | Cave Warden | Shadow Forest |
| 3 | Shadow Forest | 6–9 | 10 | shadowCat, thornWolf, moonMoth, leafBunny | Shadow Lord | Ember Hollow |
| 4 | Ember Hollow | 9–12 | 10 | yellowFighter, emberFox, magmaHound, shadowCat | Ember Titan | Frostpeak Summit |
| 5 | Frostpeak Summit | 12–15 | 11 | aquaSprite, frostHare, glacierOwl, echoBat | Frost Queen | Sunken Archive |
| 6 | Sunken Archive | 15–18 | 12 | inkSerpent, runeGolem, moonMoth, crystalMole | Archive Keeper | Endgame |

Post-launch regions:

| # | Region | Level | Encounters | Boss |
|---|--------|-------|------------|------|
| 7 | Storm Citadel | 18–21 | thunderRoc, stormKnight, staticSprite | Storm Herald |
| 8 | Arcane Nexus | 21+ | voidling, prismSeraph, chronoSnail | Nexus Wyrm |

**Room types to add:** Start, Battle, Elite, Treasure, Shrine (one-time heal/buff),
Rest (recover a percentage, once per run), Shop (in-run purchase), Event (choice with
risk/reward), Boss. Replace the current random name/description picker with region-specific
pools and a curated graph template per region, with seeded variation.

**Run structure:** 8–12 rooms, 2–4 branches, a guaranteed shrine/rest before the boss,
and optional side rooms with better loot. Target 10–15 minutes per run.

### 5.2 Familiars (25 total at launch)

Existing playable (7): whiteDog, yellowFighter, aquaSprite, leafBunny, sparkMouse,
tideTurtle, shadowCat.

New playable (12):

| Familiar | Affinity | Role | Region | Signature kit |
|----------|----------|------|--------|---------------|
| Honey Bear | Earth | Tank/support | Meadow | sturdy, honeyGuard (def buff + regen) |
| Petal Wisp | Light | Healer | Meadow | healpulse, pollenVeil (speed buff) |
| Crystal Mole | Earth | Bruiser | Caves | ironbash, crystalShard |
| Echo Bat | Wind | Speed/control | Caves | quickstep, sonicScreech (speed debuff) |
| Thorn Wolf | Earth | Bleed DPS | Forest | brave, thornCoat (DoT/def) |
| Moon Moth | Dark | Control | Forest | nightTerror, hex |
| Ember Fox | Fire | Mage | Ember | fireball, cinderCloak |
| Magma Hound | Fire/Earth | Bruiser | Ember | flameLash, magmaArmor |
| Frost Hare | Water | Speed | Frostpeak | quickstep, frostbite |
| Glacier Owl | Water/Wind | Control | Frostpeak | frozenTide, glacialWard |
| Ink Serpent | Water/Dark | DoT | Archive | hex, siphon |
| Rune Golem | Earth | Tank | Archive | runeShield, ironbash |

Bosses (6): meadowGuardian, caveWarden, shadowLord, emberTitan, frostQueen,
archiveKeeper. Bosses use phases and one signature mechanic; they are not capturable.
First defeat unlocks the base familiar and the next region.

**Familiar identity:** each owned familiar gets an instance record, level, XP, and
ability unlock ranks. Add a detail screen with stats, lore, abilities, and upgrade path.

**Affinity:** implement a simple cycle so types matter without a chart the player must
memorize:

```
Fire > Earth > Wind > Water > Fire
Light <-> Dark (mutual advantage)
```

Advantage = 1.25× outgoing damage, disadvantage = 0.8×. Show the matchup in the encounter
preview and battle HUD.

### 5.3 Abilities (26 total at launch)

Keep the existing 8. Add 18:

| Ability | Type | MP | Effect | Cooldown | Owner examples |
|---------|------|----|--------|----------|----------------|
| flameLash | Damage + DoT | 14 | 1.3× ATK + Burn 6/turn for 3 | 3 | Ember Fox |
| cinderCloak | Self buff | 10 | +30% ARC for 2 | 3 | Ember Fox |
| magmaArmor | Self buff | 12 | +40% DEF for 2 | 3 | Magma Hound |
| frostbite | Damage + debuff | 14 | 1.2× ARC + -30% SPD for 2 | 2 | Frost Hare |
| glacialWard | Shield | 12 | Absorb 25% max HP for 2 | 3 | Glacier Owl |
| frozenTide | Damage + control | 18 | 1.4× ARC + 35% Freeze 1 turn | 4 | Glacier Owl |
| thornCoat | Self buff | 10 | +30% DEF + Thorns 6 for 2 | 3 | Thorn Wolf |
| rootSnare | Debuff | 10 | -35% SPD for 2 | 2 | Leaf Bunny |
| nightTerror | Damage + debuff | 16 | 1.3× ARC + -20% ATK for 2 | 3 | Moon Moth |
| lifedrain | Damage + heal | 16 | 1.2× ARC, heal 50% of damage | 3 | Ink Serpent |
| hex | DoT | 12 | 10/turn for 3 | 3 | Moon Moth |
| siphon | Damage + MP drain | 14 | 1.0× ARC + drain 15 MP | 3 | Ink Serpent |
| runeShield | Shield | 12 | Absorb 30% max HP for 2 | 3 | Rune Golem |
| purify | Cleanse + heal | 12 | Remove debuffs/DoTs, heal 10% | 3 | Petal Wisp |
| thunderclap | Damage | 16 | 1.1× SPD-based damage | 2 | Echo Bat |
| windWard | Self buff | 10 | +40% SPD for 2 | 3 | Echo Bat |
| rally | Self buff | 10 | +25% ATK for 2 | 3 | Honey Bear |
| focus | Self buff | 10 | +25% ARC for 2 | 3 | Petal Wisp |

Engineering requirement: generalize `AbilityData` to an `effects: AbilityEffect[]` list
so an ability can combine damage + status + heal/cleanse. Add `Shield`, `Stun`, `Drain`,
and `Cleanse` effect kinds. Add resistance/immunity so hard control cannot chain-lock a
boss.

### 5.4 Items (20 total at launch)

Keep the existing 10. Add 10, with rarity, buy price, sell price, and region-gated drop
weights:

| Item | Effect | Notes |
|------|--------|-------|
| potion_large | Restore 100 HP | Shop, later regions |
| mega_elixir | Restore 100 HP + 50 MP | Boss drop |
| mana_dew | Restore 30% max MP | Shop |
| antidote | Cleanse + restore 20 HP | Shop |
| regen_draught | HoT 12 HP/turn for 3 | Craft/shop |
| venom_flask | DoT 8/turn for 3 | Drop |
| shock_bomb | 30 damage + -30% SPD 2 turns | Drop |
| smoke_bomb | Guaranteed flee (non-boss) | Shop |
| ward_scroll | +40% DEF for 3 turns | Drop |
| capture_charm | +25% recruit chance for one battle | Shop/rare drop |

Also fix `lucky_coin` (give it a drop weight or remove it), and give every item an icon.
Add per-region loot tables instead of one global `TREASURE_POOL`.

### 5.5 Progression and economy

- **Familiar level 1–20.** XP from wins. Use one shared level curve for players and
  enemies: `statMultiplier = 1 + 0.06 × (level − 1)` (level 20 = +114%). Scale enemies
  relative to the region's recommended level, not by a separate 10%-per-level formula.
  Add a unit test asserting parity at the recommended level. Ability slots unlock at
  levels 1/5/10/15, with 2–3 abilities per species (26 unique abilities shared across
  species; not four unique abilities per familiar).
- **Keeper level 1–30.** XP from first clears, bosses, and daily objectives. Unlocks
  regions, shop tiers, and cosmetic titles. No stat inflation.
- **Gold sources:** battles, treasure, first clears, boss rewards.
- **Gold sinks:** shop consumables, bond/level upgrades, region key items, respec.
- **Run loot vs bank:** loot found in a run goes to a run inventory. Exit/victory banks
  it; defeat drops it. Banked items are usable but tracked so defeat cannot duplicate
  them. This creates the push-your-luck tension the design doc describes.
- **First-clear rewards:** one-time gold, item, and familiar unlock per region. Re-fights
  give normal rewards only.
- **Star ratings (optional v1.1):** clear, no KO, under N turns. Used for cosmetics and
  a small first-clear bonus, not power creep.
- **Recruit:** after an enemy drops below 25% HP, the player can spend a turn using
  `capture_charm` or the Recruit command. Chance scales with missing HP, rarity, and
  charm tier. Bosses cannot be recruited. Recruited familiars start at level 1 with
  their region's base kit.

### 5.6 Content data architecture

Split the current monolithic data files into a content package with stable IDs and
validation:

```
packages/game-logic/src/data/
├── familiars.ts        # species definitions, base stats, affinities[], abilityUnlocks[]
├── abilities.ts        # AbilityEffect[] lists, cooldowns, targeting
├── items.ts            # effect lists, rarity, prices, icons
├── regions.ts          # room templates, encounter tables, boss, rewards
├── lootTables.ts       # per-region, per-room-type weighted drops
├── progression.ts      # XP curves, level caps, stat growth
├── shops.ts            # per-region stock and prices
└── contentManifest.ts  # sprite/audio/icon requirements
```

Required type changes:

- `FamiliarData.affinity: Affinity` becomes `affinities: Affinity[]` (primary first,
  optional secondary). Attack uses the primary affinity; defense resists against any
  owned affinity. Show both on the familiar card.
- `FamiliarData.abilities: string[]` becomes
  `abilityUnlocks: { level: number; abilityId: string }[]`, so instance level controls
  the active kit. The legacy `abilities` field can be derived for display.
- `FamiliarState` in the game event snapshot carries level, affinity list, status effects,
  and cooldowns.
- Region 1 first-clear must not unlock `whiteDog` (already a starter). Give gold, an item,
  and a guaranteed recruit of a Meadow species not offered as a starter (e.g. Honey Bear).

Add `packages/game-logic/src/utils/contentValidation.ts` and a `content.test.ts` that
fails CI when:

- a familiar references an unknown ability;
- a region references an unknown familiar/boss/item;
- an item has no icon or a drop weight but no loot table;
- a boss is unreachable or an unlock chain is cyclic;
- stats are outside design bounds;
- a required sprite/audio asset is missing from the manifest.

### 5.7 Scope tiers and art capacity

The selected scope is **Full v1: 6 regions / 25 familiars / 26 abilities / 20 items**.
The 4-region tier is a documented contingency if art capacity or schedule forces a cut;
it is not the plan of record. Lock the manifest before Phase 2 and track art capacity
against it.

| Tier | Regions | Familiars (incl. bosses) | Abilities | Items | Art estimate | Engineering estimate |
|------|---------|--------------------------|-----------|-------|--------------|----------------------|
| **Full v1 (selected)** | 6 | 25 | 26 | 20 | 10–13 artist-weeks | 28–36 calendar weeks (incl. buffer) with 1 engineer + 1 artist |
| Launch-safe (contingency) | 4 | 19 | 22 | 16 | 6–8 artist-weeks | 20–24 calendar weeks with 1 engineer + 1 artist |
| Solo | 4–6 | 19–25 | 22–26 | 16–20 | 10–16 weeks | 40–52 calendar weeks |

Art assumptions per familiar: one portrait, one idle sheet (8–12 frames), palette/VFX
variation; bosses add a second phase pose. Per region: 3 room backgrounds, one battle
background, one boss background, a room-icon set. Per item: one icon. VFX can fall back
to a colored hit flash, but each ability needs a readable log line.

If art capacity cannot support 10–13 artist-weeks, cut to 4 regions rather than cutting
progression, recovery, or correctness work. Those are the difference between a demo and
a product.

### 5.8 Combat effect contract (freeze in Phase 2a)

Write this contract before authoring content. It is the highest-risk ambiguity in the
plan.

**Ability effects**

```ts
type AbilityEffect =
  | { kind: 'damage'; scaling: 'attack' | 'arcane' | 'speed'; multiplier: number }
  | { kind: 'heal_hp'; percentMaxHp: number }
  | { kind: 'heal_mp'; value: number }
  | { kind: 'buff'; stat: StatName; multiplier: number; turns: number }
  | { kind: 'debuff'; stat: StatName; multiplier: number; turns: number }
  | { kind: 'dot'; value: number; turns: number }
  | { kind: 'hot'; value: number; turns: number }
  | { kind: 'shield'; percentMaxHp: number; turns: number }
  | { kind: 'cleanse' }
  | { kind: 'control'; turns: number; chance: number } // skip the target's next action
  | { kind: 'drain_hp'; percent: number }              // heal source by % of damage dealt
  | { kind: 'drain_mp'; value: number }
  | { kind: 'thorns'; value: number; turns: number };
```

Rules:

- `Target.Ally` resolves to the active combatant in 1v1. Bench-targeted buffs are out of
  scope; remove `rally` or redefine it as a self buff.
- One effect list per ability; effects resolve in order. A KO stops later effects.
- Status effects do not stack; re-applying the same `abilityId` refreshes duration.
- `shield` is absorbed before HP; track it as a separate value on `BattleFamiliar`, not
  as a stat multiplier.
- `control` is checked at the start of the target's slot; a controlled actor skips its
  action and the effect decrements. Bosses get resistance/immunity for the first turn.
- `thorns` deals flat damage to the attacker after a damaging hit.
- `drain_*` is computed from actual damage/healing, not the pre-mitigation number.
- `FamiliarData.affinities` uses primary for outgoing damage and all owned affinities
  for incoming resistance.

**Item effects**

Extend `ItemEffectSpec` with the missing kinds:

```ts
| { kind: 'flee'; guaranteed: boolean }       // smoke bomb
| { kind: 'reveal_map' }                      // map scroll
| { kind: 'capture_bonus'; percent: number }  // capture charm
| { kind: 'dot'; value: number; turns: number }
| { kind: 'shield'; percentMaxHp: number; turns: number }
```

`mana_dew` can use `heal_mp` with a percentage field or a new `heal_mp_percent`; pick one
and document it. `venom_flask` uses the item `dot` kind. Full-HP/MP item use must be
rejected before consumption.

**Status snapshot**

`BattleFamiliar` needs a serializable status snapshot for the HUD:
`{ id, kind, stat?, value, turnsRemaining, sourceUid }`. Send it in
`GameStateSnapshot` for both combatants. Cooldowns are a separate record.

**Acceptance**

- Unit tests for every effect kind, including shield absorption, control skip, thorns,
  drain, cleanse, and KO ordering.
- A content validation test that every ability/item effect kind is implemented and
  every sprite/icon exists.

---

## 6. UX and UI changes

### 6.1 Move menus out of Phaser

Keep Phaser for the run stage and battle animation. Move world map, party builder,
collection, shop, and outcomes to React. This is the single biggest UX simplification:
React gives us responsive layout, focus management, scroll, accessibility, and much
faster iteration than hand-drawn Phaser text.

Proposed routes:

| Route | Screen | Replaces |
|-------|--------|----------|
| `/play` | World map / region select | `WorldMapScene` |
| `/play/party` | Team builder (2 slots, collection grid) | `PartySelectScene` |
| `/play/run` | Phaser run stage + HUD | `ExplorationScene` + `GamePage` |
| `/play/collection` | Owned familiars, detail, upgrade | ComingSoon |
| `/play/shop` | Shop + inventory | none |
| `/play/profile` | Keeper level, stats, settings | none |
| `/app/*` | Redirect to `/play/*` | legacy routes |

Remove `WorldMapScene`, `PartySelectScene`, and `DungeonFailScene` from the Phaser scene
list once the React equivalents are live. `BootScene` can become a React loading state.

### 6.2 New and changed components

**New**

- `WorldMapPage` — region cards with progress, lock reason, recommended level, boss
  preview, first-clear reward, and a clear CTA. Scrollable grid; no slicing.
- `TeamBuilderPage` — 2 active slots, collection grid with search/filter/sort, affinity
  coverage hint, total power estimate, "Start run" CTA. Handles any collection size.
- `CollectionPage` / `FamiliarDetailPage` — owned instances, level/XP, abilities,
  affinity, lore, upgrade button.
- `ShopPage` / `InventoryPage` — buy, sell, use, filter.
- `ProfilePage` — keeper level, run history, settings (audio, motion, text size).
- `RunHUD` — responsive shell around the Phaser canvas.
- `BattleCommandBar` — attack, ability, item, guard, swap, run, forfeit.
- `AbilityPicker` — inline popover/grid, not a modal; shows MP, cooldown, affinity,
  target, and damage forecast.
- `ItemPicker` — inline drawer with icons, quantities, descriptions.
- `StatusChipRow` — buffs/debuffs/DoT/HoT/shield with duration and tooltip.
- `TurnOrderBar` — active, enemy, and upcoming order.
- `EncounterPreview` — enemy name, level, affinity matchup, rewards, Fight/Flee.
- `TreasureCard` — item icon, name, description, Take/Leave.
- `BattleOutcome` — XP, gold, items, recruit, level-ups, first-clear badge.
- `Onboarding` — starter pair choice (2 of 3), tutorial battle, first-run tooltips.
- `SettingsPanel` — audio, reduced motion, text scale, reset save.
- `ErrorState` / `RetryButton` — offline, timeout, 409 recovery.

**Change**

- `FamiliarStatusCompact` — add level, status chips, shield bar, affinity icon.
- `CircularArcPartyPanel` — support 2+ party members; show level and status.
- `MiniMap` — room-type icons, legend, larger maps, current-path highlight.
- `RoomInfo` — region name, depth, room type, objective.
- `ActionBar` — keyboard shortcuts, disabled reasons as tooltips.
- `Modal` — focus trap, `aria-modal`, restore focus on close.
- `BattleHUD` / `ExplorationHUD` — split into responsive containers; no hardcoded
  800×600 offsets on mobile.
- `GameToolbar` — show region, room, keeper level, gold, settings.

**Remove**

- `/preview` route and all `*Preview`/`*Variations` components.
- Unused status variants (`FamiliarStatusArc`, `FamiliarStatusSide`,
  `FamiliarStatusMinimal`, `FamiliarStatusTooltip`, `CompactCardInContext`) unless a
  single one is chosen as the real component.
- `CombinedControlsPreview`.
- Hardcoded HUD hex values; use the dark palette in `design-tokens.css`/Tailwind.

### 6.3 Battle UX specifics

- Show the full turn order before the player commits.
- Show a damage estimate range on ability hover (server remains authoritative; the
  estimate uses the same public formula).
- Show why an action is disabled: "Not enough MP (12/15)", "Cooldown 2 turns",
  "No fainted allies".
- Show status effects on both combatants with duration and stack/refresh behavior.
- Show a shield value as a distinct segment on the HP bar.
- Show affinity advantage/disadvantage in the encounter preview and target card.
- Make the log collapsible; keep the last 3 lines visible on mobile.
- Add a confirm step only for run-ending actions (forfeit, flee from boss is disabled).
- Add keyboard shortcuts: 1 Attack, 2 Ability, 3 Item, 4 Guard, S Swap, R Run.
- Add a "battle speed" setting (normal/fast) and respect `prefers-reduced-motion`.

### 6.4 Mobile

- Breakpoint at 768px: move the HUD below the canvas; stack map, status, and commands.
- Portrait layout: canvas at the top (16:9), party/status cards, scrollable log,
  sticky command bar.
- Minimum tap target 44px; no hover-only information.
- Disable the canvas letterbox scaling for HUD; HUD lives in normal DOM flow.
- Test at 375×667, 768×1024, 1280×800.

### 6.5 Accessibility

- Keyboard path through world map, team builder, battle commands, and modals.
- Focus trap and restore in `Modal`.
- `aria-live` for battle log, room changes, and reward outcomes.
- Status conveyed by icon + text, not color alone.
- Respect reduced motion; provide a text-scale setting.
- Contrast check against `DESIGN.md`; the current dark HUD uses several hardcoded
  colors that need a contrast pass.
- Canvas fallback: a text summary of the current room and combatants.

---

## 7. Backend and data architecture

### 7.1 Identity and sessions

Add a `players` table and a session layer:

```
players(id, created_at, display_name, recovery_email NULL)
sessions(id, player_id, created_at, expires_at, last_seen_at, user_agent_hash)
recovery_codes(id, player_id, code_hash, used_at, expires_at)
```

- First visit: `POST /api/auth/guest` creates a player + HttpOnly/Secure/SameSite=Lax
  session cookie. Put a Turnstile challenge on this endpoint.
- Onboarding shows a one-time recovery code (and optionally emails a magic link). This
  is the difference between "guest" and "guest with no recovery".
- Existing clients: migrate `af_anonymous_id` through a signed, one-time migration token,
  not by trusting the raw ID forever. Keep the legacy mapping for a limited window.
- Wallet link, SIWE, and `/auth/nonce`/`/auth/verify` are **deferred with the NFT track**.
  Do not build them in v1.
- Replace `POST /api/auth/register` (currently accepts any well-formed address without
  proof of ownership) with nothing in v1, or remove it. It is not used by the game.
- All game routes resolve `playerId` from the session. Remove `anonymousId` from request
  bodies and from the API types.
- Serve the API on the same registrable domain as the SPA. If a separate
  `api.example.com` is unavoidable, use `SameSite=None; Secure` plus
  `credentials: 'include'` and `Access-Control-Allow-Credentials`, and test Safari and
  private browsing. Prefer short-lived bearer tokens over third-party cookies if the
  domains cannot be unified.

### 7.2 Save schema

Replace `playerFamiliars: string[]` with:

```ts
interface OwnedFamiliar {
  id: string;            // instance id; maps to tokenId later
  speciesId: string;
  level: number;
  xp: number;
  acquiredAt: number;
  source: 'starter' | 'boss' | 'recruit' | 'event' | 'mint';
}

interface GameState {
  schemaVersion: number; // bump on every shape change
  playerId: string;
  ownedFamiliars: OwnedFamiliar[];
  activeParty: string[]; // instance ids
  keeperLevel: number;
  keeperXp: number;
  inventory: Inventory;
  bankedLoot: Inventory; // or derive from inventory + run
  dungeon: DungeonState | null;
  activeBattle: BattleState | null; // authoritative; commits with the save
  unlockedRegions: string[];
  defeatedBosses: string[];
  firstClears: string[];
  battleCount: number;
  winCount: number;
  lastSaved: number;
}
```

- Add `migrateState(raw, fromVersion)` with one function per version and a fixture per
  version. Run it on load and persist the upgraded state. `schemaVersion` is distinct
  from the DB's concurrency `version` column; keep both.
- Validate the loaded shape before use; if validation fails, return a recoverable
  `SAVE_CORRUPT` response with a support path rather than 500ing forever.
- Backfill `dungeon.partyHp`/`partyMp` from `dungeon.party` for pre-`partyHp` saves, and
  use optional access in every route that reads those maps.
- Keep `state_json` for now. It is fast and small. Normalize only when a query need
  appears (leaderboards, analytics). The active battle now lives in
  `state.activeBattle`, so battle turns and player state share one optimistic row write;
  the `active_battles` table is only a legacy import/cleanup path.

### 7.3 API surface

Group routes under a versioned prefix, e.g. `/api/v1`.

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/auth/guest` | Create guest session |
| POST | `/auth/recover` | Redeem a one-time recovery code |
| GET | `/game/bootstrap` | Player, collection, content version, active run/battle |
| GET | `/game/content` | Catalog for the current content version |
| POST | `/game/onboarding/starters` | Choose the starter pair |
| POST | `/game/party` | Set party (instance IDs) |
| POST | `/game/run/start` | Start a region run |
| POST | `/game/run/explore` | Enter a room |
| POST | `/game/run/collect` | Take treasure |
| POST | `/game/run/exit` | Bank loot and leave |
| POST | `/game/run/forfeit` | Abandon run, drop run loot |
| POST | `/game/battle/start` | Start encounter |
| POST | `/game/battle/action` | Resolve turn (attack/ability/item/guard/recruit) |
| POST | `/game/battle/swap` | Swap active familiar |
| POST | `/game/battle/flee` | Flee non-boss |
| POST | `/game/battle/abandon` | Persist HP, resolve/cancel the encounter, leave the battle |
| POST | `/game/battle/forfeit` | End boss run |
| POST | `/game/shop/buy` | Buy item/upgrade |
| POST | `/game/inventory/use` | Use item outside battle |
| POST | `/game/familiar/upgrade` | Spend gold to level |
| GET | `/game/history` | Run/battle history |

Deferred with the NFT track: `/auth/nonce`, `/auth/verify`, wallet linking, minting, and
IMX routes. Do not build them in v1.

Implementation notes:

- Keep the existing `/api/game/dungeon/*` and `/api/game/state/*` aliases during the
  transition, or update `game/src/api/client.ts` and all scenes in the same PR. Do not
  ship a rename that leaves the only client pointing at dead routes.
- Validate every body with a schema (Zod or a small hand-rolled validator). Reject
  unknown fields and cap body size at 16 KB.
- Stamp `roomId` on the battle at start and resolve that room's encounter on win. Block
  `explore`, `exit`, party changes, and a second `battle/start` while an active battle
  row exists.
- Fix the two-row write first: gate the state update on the same battle turn condition,
  or store both under one guarded parent row. Only then add an idempotency key that
  returns the stored result of a retried action. Do not build idempotency on the current
  non-atomic batch.
- Keep the current `steps`-derived "did the actor actually execute" contract (KO-cancel
  is already handled), and add a regression test so future effect kinds do not consume
  items or cooldowns from a canceled action.
- Reject a 0-HP familiar at `battle/start`, or auto-select a living party member.
- Validate `targetId` belongs to the expected side and is alive.
- Return a stable error code (`INSUFFICIENT_MP`, `STALE_TURN`, `OUT_OF_SYNC`) plus a
  human message; the client should not parse prose.
- Add `contentVersion` to the bootstrap response. If the client is older than the
  server, return `426 CLIENT_OUTDATED` and prompt a refresh.
- Keep all RNG server-side. The client may run the same formula for forecasts, but
  never for outcomes.

### 7.4 Database cleanup

- Do **not** rename or renumber migrations that may already be applied in production.
  Freeze them, capture the actual production schema with `wrangler d1 export`, and add a
  new reconciliation migration for any correction.
- Reset numbering only for local/dev databases.
- Drop `revision` if it stays unused, or start using it instead of `version` (pick one).
- Drop `dungeon_runs` unless run history is implemented; if kept, write to it on run
  start/end and add `ended_at`, `outcome`, `rooms_cleared`, `enemies_defeated`.
- Add indexes for `sessions(player_id)`, `sessions(expires_at)`, `recovery_codes(player_id)`,
  `active_battles(anonymous_id)` (already unique), and any analytics table.
- Add a D1 export step before migrations in production (`wrangler d1 export`).
- Add a migration smoke test that applies all migrations to a fresh local D1 and checks
  the schema. Include a test that applies the production snapshot plus the new migration.

### 7.5 Run lifecycle and defeat penalty

Add a run record separate from `GameState.dungeon`:

```ts
interface RunState {
  id: string;
  regionId: string;
  party: string[];          // instance ids
  startedAt: number;
  loot: Inventory;          // items earned this run
  goldEarned: number;       // gold earned this run, never negative
  roomsCleared: number;
  enemiesDefeated: number;
  seed: number;
}
```

- On run start: snapshot banked inventory, initialize `loot`, and set `goldEarned = 0`.
- Loot drops and battle gold increment `run.loot` / `run.goldEarned`, not the bank.
- On exit/victory: merge `run.loot` into the bank and add `run.goldEarned`.
- On defeat: discard `run.loot` and set currency back by `run.goldEarned` only. Track
  `goldEarned` as its own non-negative counter; do not subtract
  `inventory.currency - baselineCurrency`, because in-run shop purchases make that
  difference negative and would grant gold on defeat. Shop purchases are never refunded.
- Add a confirmation screen showing exactly what will be lost.
- Add `forfeit` for both exploration and battle. Boss runs must be forfeitable.
- Stamp `roomId` on the battle, resolve that room's `pendingEncounter`, and delete the
  `active_battles` row on exit, abandon, forfeit, win, and loss.
- Block `explore`, `exit`, party changes, and a second `battle/start` while a battle row
  exists.

### 7.6 Active-run reconciliation

`GET /game/bootstrap` must reconcile these states deterministically. The cron must not
delete a battle that belongs to an active run; bind battle lifetime to the run and expire
inactive runs after a defined window (e.g. 30 days), not battles after one day.

| Dungeon | Battle row | Current room pending | Action |
|---------|------------|----------------------|--------|
| no | no | n/a | normal map |
| yes | yes | yes | resume the battle |
| yes | yes | no/resolved | delete the battle, resume exploration |
| yes | no | yes | show encounter/start battle |
| yes | no | no | resume exploration |
| no | yes | n/a | delete the battle, normal map |

Also handle a battle whose `roomId` is missing after a regenerate: abandon the battle,
mark the encounter resolved or restore the room from the run seed, and log the anomaly.
Add an integration test for every row of the matrix.

---

## 8. Security, operations, and deployment

### 8.1 Security

- Session cookie: `HttpOnly`, `Secure`, `SameSite=Lax`, 30-day expiry, rotate on recovery
  or privilege change. Serve the API same-origin so the cookie is sent.
- Recovery: one-time code and/or email magic link at onboarding; test cookie deletion,
  device switch, and expiry. A guest with no recovery is not "durable identity".
- SIWE, wallet linking, and `/auth/register` are deferred/removed. Do not ship the
  unauthenticated register endpoint in v1.
- CSRF: if cookie auth, require a same-site custom header or double-submit token on
  mutating routes.
- Rate limits: 60 requests/min per IP, 20 battle actions/min per player, 10 run starts/day
  per player. Use Cloudflare Rate Limiting or a Durable Object token bucket.
- Guest creation: Turnstile challenge and device/account velocity limits. Otherwise
  scripted guests farm the starting grant and inflate D1.
- Economy invariants on the server: no negative currency/quantity, bounded grants per
  action, total gold audit, per-account caps. Gate any tradeable value behind a verified
  wallet.
- Body size limit and strict schema validation.
- CORS: exact origins for staging and production; no wildcard; `credentials` only when
  the API is on a separate origin.
- Security headers: CSP (allow Google Fonts and the game bundle only), HSTS,
  `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`.
- Dependency audit (`npm audit`), pinned versions, Dependabot.
- Secrets only via `wrangler secret`; never in `wrangler.jsonc`.
- Do not expose internal error details in production responses; log them with a request
  ID.
- Abuse: detect impossible win rates, run-start floods, rapid item grants, and duplicate
  battle-result writes. Add a server-side anomaly log.

### 8.2 Observability

- Sentry for Worker and React; source maps uploaded on deploy.
- Structured JSON logs: request ID, player ID, route, status, duration, error code.
- Workers Analytics Engine or a D1 `analytics_events` table for product events:
  `session_start`, `onboarding_complete`, `run_start`, `room_enter`, `battle_start`,
  `turn_resolved`, `battle_end`, `item_use`, `shop_buy`, `run_end`, `level_up`.
- Dashboards: DAU, new players, onboarding completion, run completion by region,
  battle win rate by region/boss, average run length, gold earned/spent, error rate,
  p95 latency.
- Alerts: error rate > 1%, p95 > 500 ms, D1 errors, cron failure, spike in 5xx.
- Privacy: analytics without wallet addresses; hash player IDs.

### 8.3 Deployment

- Environments: `staging` and `production` for Worker, D1, and Pages.
- CI on every PR: lint, type-check all workspaces, unit tests, integration tests, build.
- Deploy staging on merge to `main`/`master`; deploy production on tag.
- Migration gate: export D1, apply migrations, run smoke tests, then deploy. Fail closed.
- Smoke test after deploy: health, guest session, bootstrap, start run, one battle action,
  exit run.
- Rollback: previous Worker version + D1 Time Travel restore runbook.
- Custom domain and TLS; update CORS allowed origins.
- Uptime monitor and status page.

---

## 9. Testing, QA, and balance

### 9.1 Test layers

1. **Unit (game-logic):** expand beyond 127 tests. Cover every ability effect kind,
   shield/cleanse/control, affinity, level scaling, loot tables, XP curves, party
   validation, save migrations.
2. **Content validation:** every ID resolves; every asset/icon exists; every region is
   reachable; no cyclic unlocks; stats within bounds.
3. **Route integration:** run against a local D1/miniflare. Cover auth, bootstrap, run
   start/explore/collect/exit/forfeit, battle start/action/swap/flee, concurrency (two
   writers), idempotent retries, rate limits, invalid bodies, and these regressions:
   - two concurrent battle actions where the second row matches zero rows;
   - move to another room during a battle, then win, and assert the fought room not the
     current room was resolved;
   - a KO-cancelled player action does not consume an item or start a cooldown;
   - `battle/start` rejects a 0-HP familiar;
   - `dungeon/exit` and `battle/abandon` delete the active battle row;
   - leaving/re-entering a battle does not restore HP;
   - a full-HP potion is rejected or disabled without consuming;
   - an invalid `targetId` is rejected.
4. **E2E (Playwright):** onboarding → starter pair → team builder → clear Meadow → shop →
   refresh mid-battle → resume → defeat → forfeit → abandon → mobile viewport.
5. **Recovery:** clear cookies, use the recovery code on a second browser, and assert
   the same player and save are restored.
6. **Visual regression:** key HUD states at desktop and mobile widths.
7. **Load:** 100 concurrent players, 10 actions/minute, D1 write throughput.
8. **Security:** auth bypass attempts, IDOR (another player's run), replay, rate-limit
   bypass, oversized bodies, duplicate guest creation.

### 9.2 Balance targets

Use a headless simulator that runs the real battle engine with scripted player policies
and the real enemy AI. Run 10,000 iterations per region and boss.

| Metric | Target |
|--------|--------|
| Normal encounter win rate at recommended level | 80–90% |
| Elite win rate | 55–70% |
| Boss first-attempt win rate | 40–55% |
| Full region clear, at-level party | 55–70% |
| Average battle length | 4–8 turns |
| Average run length | 10–15 minutes |
| Gold earned per run vs shop prices | 1 run ≈ 2–3 consumables |
| Death rate per run | 15–25% |

Track live win rates by region and boss after launch; tune enemy stats, AI, and rewards
from telemetry, not guesses.

---

## 10. Phased execution plan

Estimates assume one full-stack engineer plus one artist working in parallel. Solo
development is roughly 1.5–1.8× the calendar time. The selected 6-region target is
**28–36 weeks**. The 4-region cut is a contingency only.

### Phase 0 — Correctness, hygiene, and baseline (2 weeks)

- Fix the P0 loop bugs before adding content:
  - atomic state + battle write (one guard or one parent row);
  - stamp the fought `roomId` on the battle and resolve that room;
  - block `explore`/`exit`/party changes and a second `battle/start` during an active
    battle;
  - reject 0-HP starts, invalid `targetId`, and useless full-HP items;
  - delete the battle row on dungeon exit and add `battle/abandon`;
  - add the bootstrap reconcile matrix and tests.
- Freeze applied migrations, export the production schema (**user-run command**), add a
  reconciliation migration, and add a fresh-DB plus production-snapshot migration test.
- Same-origin API/domain spike on a throwaway Worker+Pages project; prove an HttpOnly
  cookie is set and read with `credentials: 'include'`.
- Create the staging Worker + D1 + Pages environment as the last Phase 0 task.
- Add lint, test scripts, and all-workspace CI (including `game` and `game-logic`).
- Remove preview/dead HUD components and the `/preview` route.
- Add the content validation test and manifest skeleton.
- Add Sentry and structured logging.
- Baseline metrics: bundle size, asset size, Lighthouse, current win rates.

**Exit:** the concurrency, room-binding, battle-restart, abandon, and 0-HP regressions
have integration tests; CI runs type-check, unit tests, and build for all four
workspaces; a fresh local D1 applies all migrations; the cookie/domain topology is proven
on staging.

### Phase 1 — Identity, sessions, save integrity (3 weeks)

- `players`/`sessions`/`recovery_codes` tables and guest session cookie.
- Turnstile on guest creation; rate limits, body limits, security headers, CORS.
- Recovery code and/or email magic link; acceptance tests for cookie deletion, device
  switch, and expiry.
- Remove the unauthenticated `/auth/register`; do not add SIWE/wallet code in v1.
- Signed migration for legacy `af_anonymous_id`.
- `schemaVersion` + migration chain + validation on load; backfill `partyHp`/`partyMp`.
- Remove `anonymousId` from request bodies and API types.
- Productionize the staging/prod deploy workflow from Phase 0.

**Exit:** a player can start a session, recover it on a second browser, and keep
progress; an old anonymous save migrates cleanly; auth bypass and IDOR tests pass.

### Phase 2a — Data model and combat contract (4 weeks)

- Instance-based `OwnedFamiliar` model and migration from species arrays.
- Update `game/src/api/client.ts` and the existing Phaser scenes to use instance IDs and
  the new API shape in the same change, or add a compatibility adapter. The game must
  remain playable at every phase gate.
- Run loot/bank split, defeat penalty with `goldEarned`, forfeit, first-clear rewards.
- Battle resume after refresh; bootstrap returns active battle/run and reconciles the
  matrix.
- Generalize `AbilityData` to `effects[]`; add shield, cleanse, control, drain, thorns.
- Freeze the content schema and publish the manifest. Content authoring can start after
  this gate.

**Exit:** save migrations are proven on staging; a refresh mid-battle resumes the same
turn; defeat removes only run loot; the combat effect contract has unit tests and is
frozen for content; the existing Phaser client still completes a run.

### Phase 2b — React shell and responsive HUD (4 weeks)

- React world map, team builder, collection, shop shell, profile.
- Responsive run/battle HUD; React becomes the only input path.
- Status/cooldown/turn-order/damage-forecast UI.
- Onboarding + starter pair choice.
- Remove Phaser menu scenes and dead preview components.
- Hard budgets: initial JS < 300 KB gzip, LCP < 2.5 s on 4G, playable at 375px.

**Exit:** a player can build a party from 20+ familiars, refresh mid-battle and resume,
forfeit a boss run, lose run loot on defeat, and play on a 375px viewport without
overflow; budgets pass.

### Phase 3 — Content v1 and progression (8–12 weeks, art in parallel)

- 6 regions with curated room templates, elites, shrines, rest, in-run shop, events.
- 12 new familiars + 3 new bosses; 18 new abilities; 10 new items.
- Per-region loot tables and shops.
- Familiar levels/XP, keeper levels, ability unlocks.
- Recruit/capture loop.
- Affinity cycle and status effects (shield, cleanse, control, drain).
- Asset pipeline doc, manifest, and art production.

**Exit:** all launch regions clearable end-to-end; content validation passes; a new player
can reach the endgame without a developer account; balance simulator meets targets.

### Phase 4 — Polish and launch (3 weeks)

- Audio: region themes, battle/boss music, SFX, volume settings.
- Settings: reduced motion, text scale, audio, reset save.
- Accessibility pass and visual regression.
- Analytics dashboards and alerts.
- Privacy policy, terms, support/contact, age gate if required.
- Marketing page driven by real content and art.
- Load test, security review, staging soak, production deploy, rollback rehearsal.
- Launch checklist sign-off.

**Exit:** all P0/P1 closed; staging smoke and load tests pass; monitoring and rollback are
live; launch checklist signed.

### Phase 5 — Post-launch (parallel track)

- Remaining content: seasonal events, challenge dungeons, additional familiars.
- Daily/weekly challenges, leaderboards.
- PvP or async ghost battles (only after the single-player loop is stable).
- Blockchain/NFT is explicitly out of scope for this plan. Revisit only after v1
  retention and a separate audit/budget decision.

**Total to launch:** ~28–36 calendar weeks for the selected 6-region v1 with an
engineer + artist; 40–52 weeks solo. The 4-region contingency is ~20–24 weeks. Treat
these as planning ranges until the Phase 0 cookie spike and the art-capacity exercise are
done. The phase table sums to 24–28 engineering weeks; the range adds 15–30% contingency
for art review, content tuning, and launch hardening.

---

## 11. Launch checklist

### Product

- [ ] All 6 launch regions complete (25 familiars, 26 abilities, 20 items, 6 bosses)
- [ ] Onboarding + starter pair choice + tutorial battle + recovery code
- [ ] Team builder handles an unlimited collection with exactly 2 slots
- [ ] Familiar levels, keeper levels, ability unlocks
- [ ] Recruit loop
- [ ] Shop, inventory, gold sinks
- [ ] Run loot, defeat penalty, forfeit, first-clear rewards
- [ ] Affinity and status effects visible and balanced
- [ ] Run/battle resume after refresh
- [ ] Mobile playable at 375px
- [ ] Audio + settings
- [ ] Accessibility pass

### Engineering

- [ ] Server sessions + recovery (no SIWE/wallet in v1)
- [ ] Save schema version + migrations + corruption recovery
- [ ] Instance-based collection
- [ ] All game routes require a session
- [ ] Atomic state + battle writes (or one guarded parent row)
- [ ] Battle resolves the fought room, not the current room
- [ ] KO-cancelled actions never consume items/cooldowns
- [ ] Abandon/forfeit paths delete the battle row and persist HP
- [ ] 0-HP start, invalid target, full-HP item regressions covered
- [ ] Rate limits, body limits, schema validation, Turnstile
- [ ] Idempotent battle actions (only after atomic writes are fixed)
- [ ] Content version handshake
- [ ] Unit + integration + e2e + load tests in CI
- [ ] Staging/prod deploy with migration gate
- [ ] Sentry, logs, analytics, alerts
- [ ] D1 backup/restore runbook
- [ ] Security headers + CSP + dependency audit

### Content and art

- [ ] Every familiar has a portrait and idle sheet
- [ ] Every item has an icon
- [ ] Every region has room backgrounds and a battle background
- [ ] Every ability has a VFX or a readable fallback
- [ ] Audio assets and licenses documented
- [ ] Content manifest validation in CI

### Business and legal

- [ ] Privacy policy and terms
- [ ] Support channel and bug report path
- [ ] Age/region requirements reviewed
- [ ] NFT/blockchain scope decision documented
- [ ] Analytics consent if required

---

## 12. Decisions

### Locked (2026-10-29)

1. **Blockchain/NFT: deferred.** No minting, wallet ownership, IMX, or contract work in
   v1. Keep the instance model ready for a later token mapping.
2. **Auth: guest session + recovery.** One-time recovery code and/or email magic link.
   SIWE wallet linking is deferred with the NFT track.
3. **Content: full 6 regions.** 25 familiars, 26 abilities, 20 items, 6 bosses.
4. **Party: 2 in a dungeon, unlimited collection.** Exactly two familiars enter a run;
   the team builder must scale to any collection size.
5. **API topology: same-origin.** `app.domain.com/api` proxied to the Worker.

### Still open

1. **Recovery mechanism:** one-time code only, email magic link only, or both. Recommend
   both if email infrastructure is available; code-only otherwise.
2. **Mobile:** playable responsive v1 (recommended) or desktop-only with an
   unsupported-device message.
3. **Art capacity:** confirm who produces 12 new familiars, 3 bosses, 6 region packs,
   item icons, and audio. The 4-region contingency is available if capacity is short.
4. **Monetization:** none at launch (recommended), cosmetic-only, or future NFT. This
   affects economy tuning and legal copy.
5. **Launch region naming/localization:** English-only at launch (recommended) or
   localization scaffolding from day one.

---

## 13. Risks and mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Art production is slower than code | High | Launch slips | Start concept/art exploration in Phase 0 but lock production against the Phase 2a manifest; use the 4-region contingency if capacity is short |
| Content/balance takes longer than expected | Medium | Launch slips | Build the simulator in Phase 2; tune with data; use the 4-region contingency only if needed |
| Instance model refactor breaks saves | Medium | Data loss | Migration chain + fixtures; staging soak; backup before deploy |
| Auth migration loses anonymous progress | Medium | Trust damage | Signed one-time migration token; recovery code/email; visible "link your save" flow |
| Two-row battle writes duplicate rewards | High if unfixed | Economy corruption | Fix atomicity in Phase 0; integration test with a forced zero-row match; only then add idempotency |
| Mid-battle room movement skips a boss | Medium | Progression loss | Stamp `roomId` on the battle; block movement during battle; regression test |
| D1 write costs grow | Low/Medium | Cost | Batch writes; idempotency; rate limits; monitor per-player actions |
| Mobile HUD is still cramped | Medium | Poor reviews | React-only input; prototype in Phase 2b; test on real devices; portrait layout |
| Blockchain scope creep | High | Launch slips | Explicit go/no-go after v1 retention data; separate branch and budget |
| Scope creep from PvP/marketplace | Medium | Launch slips | Defer PvP, marketplace UI, bridge, equipment to post-launch |

---

## 14. File-level work map (starting point)

| Area | Files |
|------|-------|
| Identity/session | new `backend/src/routes/auth.ts`, `backend/src/middleware/session.ts`, `backend/src/utils/recovery.ts`, migrations |
| Save/schema | `packages/game-logic/src/types/gameState.ts`, new `utils/migrations.ts`, `backend/src/utils/saveManager.ts` |
| Content | `packages/game-logic/src/data/{familiars,abilities,items,regions,lootTables,shops,progression}.ts`, new `contentValidation.ts` |
| Combat | `packages/game-logic/src/utils/battleEngine.ts`, `enemyAI.ts`, `data/abilities.ts`, `data/items.ts` |
| Correctness | `backend/src/routes/game-battle.ts` (atomicity, room binding, KO-cancel), `game-exploration.ts` (battle lock, exit cleanup), `packages/game-logic/src/utils/validation.ts` |
| Run lifecycle | `backend/src/routes/game-exploration.ts`, `game-battle.ts`, `packages/game-logic/src/types/exploration.ts` |
| API | `game/src/api/client.ts`, `packages/game-logic/src/types/api.ts`, `backend/src/routes/game-state.ts` |
| React shell | `frontend/src/App.tsx`, new `pages/WorldMapPage.tsx`, `TeamBuilderPage.tsx`, `CollectionPage.tsx`, `ShopPage.tsx`, `ProfilePage.tsx` |
| HUD | `frontend/src/components/game/hud/*`, `GamePage.tsx`, `useCanvasRect.ts`, `styles.css`, `design-tokens.css` |
| Phaser | `game/src/config.ts`, remove `WorldMapScene.ts`, `PartySelectScene.ts`, `DungeonFailScene.ts`; keep `ExplorationScene`, `BattleScene`, `BootScene` |
| Events/state | `game/src/events.ts`, `event-bus.ts`, new `frontend/src/state/*` (TanStack Query + small Zustand store or context) |
| Ops | `.github/workflows/ci.yml`, new deploy workflow, `backend/wrangler.jsonc`, `frontend` Pages config |
| Docs | new `docs/assets/ASSET-GENERATION.md`, this plan, update `README.md`, retire stale `docs/PLAN.md` assumptions |

---

## 15. Immediate next actions (this week)

1. Treat Section 12 as the locked scope; only the open items need answers.
2. **User-run prerequisite:** `wrangler d1 export arcane-familiars --remote` (or the
   actual production database name) and freeze migration filenames. The agent cannot run
   authenticated Cloudflare commands.
3. Fix the Phase 0 correctness bugs and add the regression tests before any content work:
   atomicity, room binding, battle restart, abandon/exit cleanup, 0-HP start, target
   validation, full-HP item use. Add a regression test for the already-correct KO-cancel
   behavior.
4. Write and freeze the effect/status/item contract in Section 5.8, plus
   `contentValidation.ts` and its test, before any content authoring.
5. Run the same-origin cookie/domain spike on a throwaway Worker+Pages project; create
   staging as the last Phase 0 task.
6. Write `docs/assets/ASSET-GENERATION.md` and lock the 6-region content manifest;
   confirm 10–13 artist-weeks of capacity.
7. Start the instance/save-schema refactor on a branch before writing content, so content
   is authored once against the final shape. Update the Phaser client in the same change
   or add a compatibility adapter.
8. Prototype the React team builder and reactive battle HUD with mock data; validate on
   a 375px viewport before committing to the component structure.
9. Deploy the current slice to staging as a baseline and run the balance simulator against
   the 3 existing regions.
