# Game Loop — Bug Findings

Date: 2026-08-15
Scope: Core game loop (world map → party select → exploration → battle → rewards/exit) in the embedded game frontend, backend Worker API, and game-logic package.
Method: Static review + live end-to-end API exercise against `wrangler dev` (backend :8787) and Vite (frontend).

## Symptom

"Network error" while playing. All game API calls failed from the browser before any game-loop request could complete.

## Root Cause (FIXED)

The frontend dev server runs on **`localhost:8081`**, not `8080`. Vite auto-increments its port when the configured port is busy (something else held `:8080`). The backend CORS allowlist hardcoded only `8080/3000`, so the preflight from `8081` returned no `Access-Control-Allow-Origin` header → browser blocked the response → `fetch` threw → `game/src/api/client.ts:30` surfaced `Network error: Failed to fetch`.

Every game-loop call (load state, enter dungeon, battle start/action, save) failed identically.

**Fix applied:** `backend/src/index.ts` now allows all origins when `ENVIRONMENT === "development"` and falls back to a strict allowlist in production. Verified live: preflight + POST from `localhost:8081` now return `Access-Control-Allow-Origin: http://localhost:8081`.

> Deploy note: ensure `ENVIRONMENT` is set to something other than `"development"` in production so the strict allowlist applies.

## Remaining Bugs & Fragile Implementations

Severity: 🔴 high · 🟠 medium · 🟡 low

### 🔴 Battle rewards are never persisted

- `game/src/scenes/BattleScene.ts:356` — `handleVictory` renders rewards from `turnResult.rewards` but never adds currency/items to `gameState.inventory`.
- Nothing increments `battleCount` / `winCount` anywhere.
- Backend `backend/src/routes/game-battle.ts` only touches `game_states` on a **loss** (clears dungeon). Wins write nothing back.

Result: the world-map stat bar (`Battles: X | Wins: Y`) stays `0` forever, and won rewards are silently lost. The reward loop is broken end-to-end.

### 🔴 Defeat is effectively free

- On loss the backend clears `state.dungeon = null` (`game-battle.ts`), but the frontend `BattleScene.handleContinue` restarts `returnScene` (`ExplorationScene`).
- `ExplorationScene.loadDungeonState` sees no dungeon and immediately calls `enterDungeon()` again — re-entering the same area fresh.
- The dedicated `DungeonFailScene` is registered in `game/src/config.ts` but **never launched** from any scene.
- Exploration stats (`roomsExplored` / `enemiesDefeated`) are never tracked or passed.

Result: losing a battle is an invisible reset with no cost.

### 🔴 Party HP/MP never carry between battles

- `DungeonState.partyHp` / `partyMp` exist and the exploration HUD reads them, but `battle/start` spawns a fresh full-HP battle familiar and no code writes battle HP/MP back into the dungeon.

Result: no resource attrition; every battle starts at full health. The loop has no difficulty curve.

### 🟠 WorldMapScene leaks keyboard handlers

- `game/src/scenes/WorldMapScene.ts:280` — `keydown-TAB/ENTER/SPACE` registered on every `create()`; `onShutdown` only cleans timers, never the keyboard handlers.
- Re-entering the world map stacks duplicate handlers → a single ENTER/SPACE can fire multiple `scene.start` calls.
- `DungeonFailScene` cleans up its handlers correctly (`cleanupTweens`); WorldMap should follow the same pattern.

### 🟠 Treasure silently dropped on dual rolls

- `backend/src/routes/game-exploration.ts` independently rolls encounter and treasure.
- `game/src/scenes/ExplorationScene.ts:209-244` — `navigateToRoom` treats boss > encounter > treasure as exclusive branches. A room that yields both encounter and treasure silently loses the treasure.

### 🟠 Stale local dungeon copy clobbers server state

- `navigateToRoom` sets `this.dungeon.currentRoomId = roomId` but never merges the returned `room` (e.g. `cleared: true`) into `this.dungeon.rooms`.
- `ExplorationScene.handleSave` writes the stale local dungeon back via `saveGameState`, reverting server-side `cleared` flags.

### 🟠 Battle soft-lock on load failure

- `game/src/scenes/BattleScene.ts:99-107` — if `loadGameState` / `startBattle` throws, the scene logs the message, hides the connecting UI, and never enables actions or offers a back path.
- `PartySelectScene` retries up to 3 times; `BattleScene` has no equivalent recovery.

### 🟡 Swap is too permissive

- `backend/src/routes/game-battle.ts` — `battle/swap` accepts any familiar id (no party-membership validation), can swap to the currently-active familiar, costs no turn, and spawns a fresh full-HP familiar.

### 🟡 Turn counter double-incremented

- `turnCount` is incremented on both the backend (`game-battle.ts`) and locally in `BattleScene.handleAction`. Cosmetic only, but confusing.

### 🟡 Battle start uses `activeParty[0]` only

- `game/src/scenes/BattleScene.ts:112` — subsequent battles always start with the first party member, ignoring the in-battle swap position.

## Recommended Order of Fixes

1. Persist rewards + `battleCount`/`winCount` (backend on win; apply locally on the frontend).
2. Wire defeat to `DungeonFailScene` with exploration stats.
3. Persist party HP/MP after each battle (write back into `DungeonState`).
4. Clean up WorldMap keyboard handlers.
5. Handle encounter+treasure dual rolls; merge returned room into local dungeon.
6. Add retry/back recovery to `BattleScene` load failures.
7. Tighten `swap` validation; remove duplicate `turnCount` increment.