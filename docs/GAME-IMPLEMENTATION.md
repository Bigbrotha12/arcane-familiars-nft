# Game Implementation Plan — Arcane Familiars (Phase 2 MVP)

## Overview

Turn-based creature-battler built with Phaser 3 (TypeScript) embedded in the React frontend. Player explores areas, encounters wild familiars, battles them, and captures them. **Backend-mediated game logic** for security — all RNG, battle resolution, and state persistence run on the Cloudflare Worker (Hono + D1). Client is a thin rendering layer.

### Why backend-mediated?

This will eventually be a blockchain game with player-to-player interactions. Client-side code cannot be trusted — players could manipulate:
- Random outcomes (encounters, treasure, crits)
- Battle resolution (damage, HP, status effects)
- Game state (inventory, currency, unlocks)

By routing all game logic through the backend:
- **RNG is server-side** — player can't predict or manipulate dice rolls
- **Battle resolution is authoritative** — backend calculates damage, applies effects, validates actions
- **State is persisted in D1** — no client-side save file manipulation
- **Actions are validated** — backend rejects illegal moves (insufficient MP, invalid targets, etc.)

### What exists today

| Layer | State |
|-------|-------|
| `game/src/data/familiars.ts` | 2 familiars (WhiteDog, YellowFighter) with `FamiliarData` + `FamiliarStats` interfaces |
| `game/src/data/abilities.ts` | 2 abilities (Brave, Sturdy) with `AbilityData` + `AbilityEffect` interfaces |
| `game/src/scenes/BootScene.ts` | Placeholder boot scene (text only, no asset loading) |
| `game/src/scenes/BattleScene.ts` | Placeholder battle scene (colored rectangles, no logic) |
| `game/src/sprites/`, `ui/`, `utils/` | Empty directories |
| Backend D1 | Tables: `familiars`, `abilities`, `keepers`, `users`, `minting_queue` |
| Frontend | React Router with ComingSoon at `/app/game` |

### MVP scope (what this plan builds)

1. **5 common familiars** as starting choices (player picks 2)
2. **3 boss familiars** (stronger versions of existing familiars)
3. **8 abilities** across damage, heal, buff, debuff types
4. **1v1 turn-based battle system** with swap mechanic (queued action resolution)
5. **Dungeon exploration** with branching rooms, encounters, treasure, and boss fights
6. **HUD overlay** (HP/MP bars, ability panel, battle log, swap button)
7. **Game state persistence** (D1 database, versioned schema)
8. **React-Phaser bridge** (embed game canvas in frontend, same-origin build)
9. **Collection growth** (defeating bosses unlocks familiars)
10. **Backend-mediated game logic** (shared code package, API endpoints for all game actions)

### NOT in scope (deferred)

- Sprites/art assets (use colored shapes + text labels as placeholders)
- Sound/music
- Multiplayer PvP
- Blockchain integration (Phase 3)
- Familiar capture/taming mechanic (post-MVP)
- Keeper system (post-MVP)
- Authentication (Phase 3 — blockchain wallet login)

---

## 2. System Architecture

### 2.1 Client-Server Model

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT (Phaser Game)                      │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Rendering Layer (Scenes, UI Components)                  │   │
│  │  - Displays battle animations, room navigation, HUD      │   │
│  │  - Receives results from backend, animates outcomes      │   │
│  │  - No local state mutation for trusted operations        │   │
│  └──────────────────────────────────────────────────────────┘   │
│                            ↕ API calls                           │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  API Client Layer                                         │   │
│  │  - Sends player actions to backend                       │   │
│  │  - Receives results + updated state                      │   │
│  │  - Handles errors, retries, loading states               │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                            ↕ HTTP/JSON
┌─────────────────────────────────────────────────────────────────┐
│                     SERVER (Cloudflare Worker)                   │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  API Routes (Hono)                                        │   │
│  │  - POST /api/game/battle/action                          │   │
│  │  - POST /api/game/dungeon/enter                          │   │
│  │  - POST /api/game/dungeon/explore                        │   │
│  │  - POST /api/game/dungeon/exit                           │   │
│  │  - POST /api/game/state/save                             │   │
│  │  - POST /api/game/state/load                             │   │
│  └──────────────────────────────────────────────────────────┘   │
│                            ↕                                      │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Game Logic Layer (Shared Code)                           │   │
│  │  - battleEngine.ts (damage calc, status effects, turns)  │   │
│  │  - enemyAI.ts (decision tree)                            │   │
│  │  - dungeonEngine.ts (room navigation, encounter rolls)   │   │
│  │  - mathUtils.ts (RNG with server-side seeds)             │   │
│  │  - saveManager.ts (D1 persistence)                       │   │
│  └──────────────────────────────────────────────────────────┘   │
│                            ↕                                      │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  D1 Database (Authoritative State)                        │   │
│  │  - game_states table (player progress, inventory)        │   │
│  │  - dungeon_runs table (active dungeon state)             │   │
│  │  - battle_history table (audit trail)                    │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Shared Code Package

Game logic is extracted to a shared package that both backend and frontend can import:

```
packages/
└── game-logic/
    ├── package.json
    ├── tsconfig.json
    └── src/
        ├── types/
        │   ├── battle.ts
        │   ├── exploration.ts
        │   ├── gameState.ts
        │   └── api.ts              # API request/response types
        ├── data/
        │   ├── familiars.ts        # 5 common + 3 boss familiars
        │   ├── abilities.ts        # 8 abilities
        │   ├── areas.ts            # 3 area definitions
        │   ├── items.ts            # Consumable items
        │   └── mappers.ts          # D1 row → data mappers
        └── utils/
            ├── battleEngine.ts     # Pure functions (no side effects)
            ├── enemyAI.ts          # Pure functions
            ├── dungeonEngine.ts    # Pure functions
            ├── mathUtils.ts        # RNG with seed parameter
            └── validation.ts       # Action validation logic
```

**Why shared code?**
- Single source of truth for game rules
- Backend and frontend use identical logic
- Easier to test (unit tests run once, shared by both)
- Reduces duplication and drift

**How it works:**
- Backend imports from `@arcane-familiars/game-logic` (workspace dependency)
- Frontend imports same package (Vite resolves via workspace)
- Both use identical functions, but backend is authoritative

### 2.3 API Flow Examples

**Example 1: Battle action**

```
CLIENT                              SERVER
  │                                   │
  │  Player selects "Attack"          │
  │  POST /api/game/battle/action     │
  │  {                                │
  │    sessionId: "abc123",           │
  │    action: { type: "attack" }     │
  │  }                                │
  │ ────────────────────────────────► │
  │                                   │  1. Load battle state from D1
  │                                   │  2. Validate action is legal
  │                                   │  3. Generate RNG seed
  │                                   │  4. Resolve player action
  │                                   │  5. Enemy AI selects action
  │                                   │  6. Resolve enemy action
  │                                   │  7. Apply status effects
  │                                   │  8. Check for KO
  │                                   │  9. Update battle state in D1
  │                                   │  10. Return result
  │  {                                │
  │    playerAction: { ... },         │
  │    enemyAction: { ... },          │
  │    damageDealt: 45,               │
  │    damageTaken: 28,               │
  │    playerHp: 72,                  │
  │    enemyHp: 0,                    │
  │    battleOutcome: "win",          │
  │    rewards: { currency: 15 }      │
  │  }                                │
  │ ◄──────────────────────────────── │
  │                                   │
  │  Animate results                  │
```

**Example 2: Room exploration**

```
CLIENT                              SERVER
  │                                   │
  │  Player clicks "Go left"          │
  │  POST /api/game/dungeon/explore   │
  │  {                                │
  │    sessionId: "abc123",           │
  │    roomId: "meadow_1"             │
  │  }                                │
  │ ────────────────────────────────► │
  │                                   │  1. Load dungeon state from D1
  │                                   │  2. Validate room is accessible
  │                                   │  3. Check if room is cleared
  │                                   │  4. If uncleared: roll encounter
  │                                   │  5. If encounter: select enemy
  │                                   │  6. Update dungeon state in D1
  │                                   │  7. Return result
  │  {                                │
  │    room: { ... },                 │
  │    event: "encounter",            │
  │    enemy: { ... },                │
  │    battleSessionId: "xyz789"      │
  │  }                                │
  │ ◄──────────────────────────────── │
  │                                   │
  │  Transition to BattleScene        │
```

### 2.4 RNG Strategy

All random operations use server-side seeded RNG:

```typescript
// packages/game-logic/src/utils/mathUtils.ts

export function seededRandom(seed: number): () => number {
  // Mulberry32 PRNG - deterministic, fast, good distribution
  return function() {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// Backend generates seed, passes to game logic
const seed = crypto.getRandomValues(new Uint32Array(1))[0];
const random = seededRandom(seed);
const roll = random();  // 0-1
```

**Why seeded RNG?**
- Backend controls all randomness
- Results are reproducible for debugging (if seed is logged)
- Client can't predict or manipulate outcomes
- Same logic works in both environments

### 2.5 State Validation

Backend validates all player actions before processing:

```typescript
// packages/game-logic/src/utils/validation.ts

export function validateBattleAction(
  action: BattleAction,
  battleState: BattleState
): { valid: boolean; error?: string } {
  // Check action type is valid
  if (!['attack', 'ability', 'defend', 'item', 'swap', 'run'].includes(action.type)) {
    return { valid: false, error: 'Invalid action type' };
  }

  // Check ability exists and has enough MP
  if (action.type === 'ability') {
    const ability = getAbility(action.abilityId!);
    if (!ability) return { valid: false, error: 'Ability not found' };
    if (battleState.activeFamiliar.currentMp < ability.mpCost) {
      return { valid: false, error: 'Insufficient MP' };
    }
  }

  // Check item exists in inventory
  if (action.type === 'item') {
    const item = battleState.inventory.items.find(i => i.itemId === action.itemId);
    if (!item || item.quantity <= 0) {
      return { valid: false, error: 'Item not in inventory' };
    }
  }

  // Check swap target is alive
  if (action.type === 'swap') {
    const target = battleState.party.find(f => f.id === action.swapToFamiliarId);
    if (!target || target.currentHp <= 0) {
      return { valid: false, error: 'Cannot swap to KO\'d familiar' };
    }
  }

  // Check run is allowed
  if (action.type === 'run' && battleState.isBoss) {
    return { valid: false, error: 'Cannot run from boss battles' };
  }

  return { valid: true };
}
```

### 2.6 Session Management

Each dungeon run gets a unique session ID for state tracking:

```typescript
interface GameSession {
  sessionId: string;           // UUID
  ethAddress: string;          // Player address (Phase 3)
  anonymousId: string;         // Temporary ID for MVP (localStorage)
  dungeonState: DungeonState | null;
  battleState: BattleState | null;
  createdAt: number;
  lastActive: number;
}
```

**MVP (no auth):**
- Generate `anonymousId` on first visit (stored in localStorage)
- All game state keyed by `anonymousId`
- Player can clear localStorage to reset (acceptable for MVP)

**Phase 3 (blockchain auth):**
- Replace `anonymousId` with `ethAddress`
- Game state tied to wallet
- State can be migrated to on-chain storage

---

## 3. Data Models

### 1.1 Reuse existing types (with extensions)

The existing `FamiliarData` and `AbilityData` interfaces are close but need extensions for battle state tracking.

```
EXISTING (game/src/data/familiars.ts)          EXTENSIONS NEEDED
─────────────────────────────────────────      ──────────────────
FamiliarStats { hp, maxHp, mp, maxMp,    →     (no changes needed)
                attack, defense, arcane,
                speed }

FamiliarData { id, name, description,    →     Add: rarity (match D1 schema)
               stats, abilities[],              Add: affinity (match D1 schema: Light/Dark/Fire/Water/Earth/Wind)
               sprite? }
```

```
EXISTING (game/src/data/abilities.ts)          EXTENSIONS NEEDED
─────────────────────────────────────────      ──────────────────
AbilityEffect { type, value, stat?,      →     value semantics: multiplier for buff/debuff, flat amount for DoT/HoT
              duration? }

AbilityData { id, name, description,     →     (no changes needed)
              mpCost, target, effects[],
              cooldown? }
```

### 1.2 New types needed

```typescript
// --- Battle state types (game/src/types/battle.ts) ---

interface BattleFamiliar {
  familiarData: FamiliarData;
  currentHp: number;
  currentMp: number;
  statusEffects: StatusEffect[];
  cooldowns: Record<string, number>;  // abilityId → turns remaining
  isAlly: boolean;
}

interface StatusEffect {
  abilityId: string;
  type: 'buff' | 'debuff' | 'dot' | 'hot';
  stat: string;           // which stat is modified (for buff/debuff)
  value: number;          // multiplier for buff/debuff (e.g., 1.5 = +50%), flat amount for DoT/HoT
  turnsRemaining: number;
}

interface BattleAction {
  type: 'attack' | 'ability' | 'defend' | 'item' | 'swap' | 'run';
  abilityId?: string;     // required if type === 'ability'
  itemId?: string;        // required if type === 'item'
  swapToFamiliarId?: string; // required if type === 'swap'
}

interface ActionResult {
  effectType: AbilityEffectType;
  targetId: string;       // familiar ID
  value: number;          // actual damage/heal amount
  isCritical: boolean;
  description: string;    // "White Dog used Brave! 45 damage!"
}

// --- Exploration types (game/src/types/exploration.ts) ---

interface Area {
  id: string;
  name: string;
  description: string;
  levelRange: [number, number];   // min-max familiar level in this area
  encounterPool: string[];        // familiar IDs that can appear here
  rooms: Room[];                  // pre-determined room layout
  bossId: string;                 // familiar ID for boss encounter (boss version)
  bossReward: BossReward;
  bgColor: number;                // Phaser hex color for placeholder
}

interface Room {
  id: string;
  name: string;
  description: string;            // "You encounter a fork in the road"
  type: 'start' | 'normal' | 'deadend' | 'boss';
  exits: RoomExit[];              // navigation options
  encounterChance: number;        // 0-1, chance of random encounter
  treasureChance: number;         // 0-1, chance of treasure (if no encounter)
  treasurePool: TreasureEntry[];  // possible rewards
  cleared: boolean;               // true after encounter/treasure resolved
}

interface TreasureEntry {
  itemId: string;                 // item ID (potion_small, etc.)
  weight: number;                 // relative probability weight
}

interface RoomExit {
  direction: string;              // "left", "right", "forward", "back"
  roomId: string;                 // target room ID
  label: string;                  // button text shown to player
}

interface BossReward {
  currency: number;               // gold earned on boss defeat
  items: string[];                // item IDs guaranteed on boss defeat
}

interface DungeonState {
  areaId: string;
  currentRoomId: string;
  party: string[];                // familiar IDs (max 2)
  partyHp: Record<string, number>; // current HP per familiar (persists between rooms)
  partyMp: Record<string, number>; // current MP per familiar
  inventory: Inventory;
  rooms: Record<string, boolean>; // roomId → cleared status
}

interface Inventory {
  currency: number;               // gold (canonical representation)
  items: InventoryItem[];         // consumables only (no currency items)
}

interface InventoryItem {
  itemId: string;
  quantity: number;
}

// --- Game save state (game/src/types/gameState.ts) ---

interface GameState {
  version: number;                  // save schema version (start at 1)
  playerFamiliars: string[];       // owned familiar IDs (collection)
  activeParty: string[];           // currently equipped party (max 2)
  inventory: Inventory;            // persistent inventory (carries between dungeons)
  dungeon: DungeonState | null;    // null if not in dungeon
  unlockedAreas: string[];         // area IDs player can access
  defeatedBosses: string[];        // area IDs where boss was defeated
  battleCount: number;
  winCount: number;
  lastSaved: number;               // timestamp
}
```

### 1.3 Reconciling game types with D1 schema

The D1 `familiars` table uses flat columns (`hp`, `mp`, `attack`...) while the game uses a nested `FamiliarStats` object. Add a mapper:

```typescript
// game/src/data/mappers.ts

function d1RowToFamiliarData(row: DBFamiliarRow): FamiliarData {
  return {
    id: `gen${row.generation}_${row.familiar_id}`,
    name: row.name,
    description: row.description,
    stats: {
      hp: row.hp, maxHp: row.hp,
      mp: row.mp, maxMp: row.mp,
      attack: row.attack, defense: row.defense,
      arcane: row.arcane, speed: row.speed,
    },
    abilities: [row.ability_1, row.ability_2, row.ability_3, row.ability_4]
      .filter(a => a.length > 0)
      .map(a => a.toLowerCase()),
    sprite: row.image || undefined,
  };
}
```

For MVP (local-only), the game uses hardcoded data from `familiars.ts`. The mapper is for Phase 3 when we fetch from the backend.

### 1.4 Starting familiars (5 common)

All players start by choosing 2 from these 5 common familiars:

| ID | Name | Affinity | HP | MP | ATK | DEF | ARC | SPD | Abilities |
|----|------|----------|----|----|-----|-----|-----|-----|-----------|
| whiteDog | White Dog | Light | 120 | 80 | 55 | 70 | 45 | 60 | brave, sturdy |
| yellowFighter | Yellow Fighter | Fire | 140 | 60 | 80 | 45 | 35 | 75 | brave |
| aquaSprite | Aqua Sprite | Water | 90 | 100 | 40 | 50 | 80 | 55 | healpulse, sturdy |
| leafBunny | Leaf Bunny | Earth | 110 | 70 | 50 | 80 | 40 | 65 | sturdy, brave |
| sparkMouse | Spark Mouse | Wind | 75 | 60 | 60 | 35 | 65 | 90 | brave, quickstep |

### 1.5 Boss familiars (3 boss versions)

Bosses are stronger versions of existing familiars. Each area has a unique boss:

| Area | Boss ID | Base Familiar | Stat Multiplier | Level |
|------|---------|---------------|-----------------|-------|
| Verdant Meadow | meadowGuardian | White Dog | 2.0x all stats | 5 |
| Crystal Caves | caveWarden | TideTurtle | 2.5x all stats | 7 |
| Shadow Forest | shadowLord | ShadowCat | 3.0x all stats | 10 |

Boss familiars are defined as separate entries in `familiars.ts` with `isBoss: true` flag and pre-scaled stats. They are NOT added to the player's collection — defeating a boss unlocks the base familiar version.

### 1.6 Expanded abilities (8 total)

Existing abilities (keep):

| ID | Name | Type | MP | Target | Effect | Cooldown |
|----|------|------|----|--------|--------|----------|
| brave | Brave | Damage | 10 | Enemy | 1.5x attack damage | 1 |
| sturdy | Sturdy | Buff | 8 | Self | 1.5x defense for 2 turns | 3 |

New abilities to add:

| ID | Name | Type | MP | Target | Effect | Cooldown |
|----|------|------|----|--------|--------|----------|
| fireball | Fireball | Damage | 15 | Enemy | 2.0x arcane damage | 2 |
| quickstep | Quick Step | Buff | 8 | Self | 1.5x speed for 2 turns | 2 |
| healpulse | Heal Pulse | Heal | 12 | Ally | Restore 30% maxHp to target | 3 |
| shadowstrike | Shadow Strike | Damage+Debuff | 18 | Enemy | 1.2x damage + 0.8x defense debuff for 2 turns | 3 |

**Heal Pulse targeting:** Changed from `Self` to `Ally` — can target any alive familiar in party (including self). In 1v1 combat, effectively heals self. In party battles, allows healing the active familiar from the bench.

### 1.7 Items (consumables only)

| Item ID | Type | Effect |
|---------|------|--------|
| `potion_small` | Consumable | Restore 30 HP |
| `potion_medium` | Consumable | Restore 60 HP |
| `ether_small` | Consumable | Restore 20 MP |

**Currency representation:** Gold is stored as `inventory.currency: number` (flat number). Treasure drops add directly to this field. No `currency_*` item IDs exist.

---

## 2. Core Game Loop

### 2.1 State machine

```
                    ┌──────────────┐
                    │   BootScene  │
                    │  (load data) │
                    └──────┬───────┘
                           │
                    ┌──────▼───────┐
              ┌────►│  WorldMap    │◄────┐
              │     │  Scene       │     │
              │     └──────┬───────┘     │
              │            │ "Enter area" │ "Dungeon failed"
              │     ┌──────▼───────┐     │ (or "Exit early")
              │     │  PartySelect │     │
              │     │  Scene       │     │
              │     └──────┬───────┘     │
              │            │ "Start"     │
              │     ┌──────▼───────┐     │
              │     │  Exploration │     │
              │     │  Scene       │─────┤
              │     │  (dungeon)   │     │ (boss defeated)
              │     └──────┬───────┘     │
              │            │ encounter   │
              │     ┌──────▼───────┐     │
              │     │  BattleScene │─────┤
              │     │              │     │
              │     └──────┬───────┘     │
              │            │ (lose)      │
              │     ┌──────▼───────┐     │
              └─────┤  DungeonFail │─────┘
                    │  Scene       │
                    └──────────────┘
```

### 2.2 Scene responsibilities

| Scene | Responsibility |
|-------|---------------|
| `BootScene` | Load game data, check localStorage for save, transition to WorldMap |
| `WorldMapScene` | Display 3 areas, show unlock status, handle area selection |
| `PartySelectScene` | Choose 2 familiars from collection before entering dungeon |
| `ExplorationScene` | Room navigation, encounter/treasure rolls, inventory management, exit dungeon |
| `BattleScene` | Full turn-based combat (party vs enemy), item usage |
| `DungeonFailScene` | Show "You were defeated" message, inventory lost, return to WorldMap |

### 2.3 Scene manager updates

```typescript
// game/src/config.ts — updated scene list
scene: [BootScene, WorldMapScene, PartySelectScene, ExplorationScene, BattleScene, DungeonFailScene]
```

### 2.4 Scene data passing protocol

Scenes communicate via Phaser's `scene.start(key, data)` for local data, and API calls for state changes:

```typescript
// Entering battle from exploration:
// 1. Client calls API to explore room
const response = await gameApiClient.explore({
  sessionId: currentSessionId,
  dungeonSessionId: currentDungeonId,
  roomId: 'meadow_1'
});

// 2. If encounter, transition to BattleScene with session ID
if (response.event === 'encounter') {
  this.scene.start('BattleScene', {
    battleSessionId: response.encounter.battleSessionId,
    playerFamiliar: activeFamiliar,  // from local cache
    enemyFamiliar: response.encounter.enemy,  // from API response
    isBoss: response.encounter.isBoss
  });
}

// Returning from battle:
// 1. BattleScene calls API for each action
const actionResult = await gameApiClient.battleAction({
  battleSessionId: currentBattleId,
  action: { type: 'attack' }
});

// 2. Animate result
// 3. Check battle outcome
if (actionResult.battleOutcome === 'win') {
  // Return to ExplorationScene with updated state
  this.scene.start('ExplorationScene', {
    dungeonSessionId: currentDungeonId,
    currentRoom: actionResult.updatedRoom,
    inventory: actionResult.rewards
  });
} else if (actionResult.battleOutcome === 'lose') {
  // Transition to DungeonFailScene
  this.scene.start('DungeonFailScene', {
    message: 'You were defeated!'
  });
}
```

**Key principle:** Scenes receive session IDs and cached data, not full state. All state mutations go through the backend API.

---

## 4. Battle Mechanics

### 4.1 Battle initialization

**Client flow:**
1. Player enters dungeon room with encounter
2. Client calls `POST /api/game/dungeon/explore` with roomId
3. Backend rolls encounter, returns `battleSessionId` + enemy data
4. Client transitions to BattleScene with session ID

**Backend flow:**
1. Receive explore request
2. Load dungeon state from D1
3. Roll for encounter (server-side RNG)
4. If encounter: create battle session, save to D1
5. Return battle session ID + enemy data

```typescript
// Client initiates battle
const response = await gameApiClient.explore({
  sessionId: currentSessionId,
  roomId: 'meadow_1'
});

// Backend returns
{
  event: 'encounter',
  battleSessionId: 'battle_xyz789',
  enemy: {
    id: 'whiteDog',
    name: 'White Dog',
    level: 2,
    stats: { hp: 120, mp: 80, attack: 55, ... }
  }
}

// Client transitions to BattleScene
this.scene.start('BattleScene', {
  battleSessionId: 'battle_xyz789',
  playerFamiliar: activeFamiliar,
  enemyFamiliar: response.enemy,
  isBoss: false
});
```

**BattleScene receives:**
- `battleSessionId` — used for all subsequent API calls
- `playerFamiliar` — active familiar data (from client cache)
- `enemyFamiliar` — enemy data (from backend response)
- `isBoss` — boolean flag

### 4.2 Turn order (queued action resolution)

**Client flow:**
1. Player selects action for active familiar
2. Client calls `POST /api/game/battle/action` with action
3. Backend resolves both actions (player + enemy), returns result
4. Client animates the result

**Backend flow:**
1. Receive player action
2. Validate action is legal
3. Generate RNG seed
4. Resolve player action (damage, effects, etc.)
5. Enemy AI selects action (server-side)
6. Resolve enemy action
7. Apply status effects, decrement cooldowns
8. Check for KO
9. Update battle state in D1
10. Return full result

```typescript
// Client sends action
const response = await gameApiClient.battleAction({
  battleSessionId: 'battle_xyz789',
  action: { type: 'attack' }
});

// Backend returns
{
  playerAction: {
    type: 'attack',
    damage: 45,
    isCritical: false,
    description: 'White Dog attacks! 45 damage!'
  },
  enemyAction: {
    type: 'ability',
    abilityId: 'brave',
    damage: 28,
    isCritical: true,
    description: 'Enemy Yellow Fighter used Brave! 28 damage!'
  },
  battleState: {
    playerFamiliar: { currentHp: 72, currentMp: 80, statusEffects: [] },
    enemyFamiliar: { currentHp: 0, currentMp: 60, statusEffects: [] },
  },
  battleOutcome: 'win',  // or 'lose' or 'continue'
  rewards: { currency: 15, items: [] }
}

// Client animates the result
```

**Swap mechanic details:**
- Player can swap active familiar during action selection (once per turn)
- Swapping does NOT cost an action — after swap, player still selects an action
- Swapped-in familiar retains their current HP/MP/status effects
- Cannot swap to a KO'd familiar
- If active familiar is KO'd, auto-switch to other familiar (if alive)
- Swap is a separate API call: `POST /api/game/battle/swap`

### 3.3 Damage formula

```
BASIC ATTACK:
  rawDamage = attacker.attack * (1.0 + random(-0.1, 0.1))
  finalDamage = max(1, rawDamage - defender.defense * 0.4)

ABILITY (damage type):
  baseValue = ability.effects[0].value    // e.g., 1.5 for Brave
  if damage is multiplier:
    rawDamage = attacker.attack * baseValue * (1.0 + random(-0.1, 0.1))
  if damage is arcane-scaled:
    rawDamage = attacker.arcane * baseValue * (1.0 + random(-0.1, 0.1))
  finalDamage = max(1, rawDamage - defender.defense * 0.4)

CRITICAL HIT (10% chance):
  finalDamage *= 1.5

DEFENDING:
  defender.defense *= 1.5 for the CURRENT ROUND ONLY
  Applied before damage calculation
  Expires at end of round (after both actions resolve)
```

### 3.4 Status effects

```
VALUE SEMANTICS:
  - Buffs/debuffs: value is a MULTIPLIER (e.g., 1.5 = +50%, 0.8 = -20%)
  - DoT/HoT: value is FLAT AMOUNT per tick (e.g., 10 = 10 HP damage per turn)

APPLICATION:
  - Check if effect already exists on target (by abilityId)
  - If exists: refresh duration, don't stack
  - Create StatusEffect with turnsRemaining = ability effect duration

TICK (end of each round):
  - For each StatusEffect on each familiar:
    - DoT: reduce hp by value
    - HoT: restore hp by value (cap at maxHp)
    - Decrement turnsRemaining
    - Remove if turnsRemaining <= 0
  - For buffs/debuffs: recalculate effective stats

EFFECTIVE STAT CALCULATION:
  effectiveStat = baseStat
  for each active buff/debuff affecting this stat:
    effectiveStat *= effect.value  // multiplier
  return effectiveStat
```

### 4.5 Battle actions (player)

| Action | MP Cost | Description |
|--------|---------|-------------|
| Attack | 0 | Basic attack using damage formula above |
| Ability | varies | Use one of familiar's abilities (shows ability panel) |
| Defend | 0 | +50% defense for current round, recover 5 MP |
| Item | varies | Use consumable from inventory (potion, ether, etc.) |
| Swap | 0 | Switch active familiar (once per turn, then select another action) |
| Run | 0 | 50% base chance + ((player_speed - enemy_speed) * 5)%. Clamped to 5-95%. Cannot run from boss battles. Fail = lose turn. |

**Multi-effect abilities:**
- Abilities with multiple effects (e.g., ShadowStrike: damage + debuff) apply effects in order
- If the attack KOs the target, subsequent effects don't apply
- MP cost covers all effects in the ability

**Item usage in battle:**
- Player can use consumables from their inventory as a battle action
- Using an item consumes the familiar's turn
- Items can target the active familiar only (1v1 combat)
- If inventory is empty, "Item" option is disabled

**API flow for battle actions:**

```typescript
// Player selects action
const response = await gameApiClient.battleAction({
  battleSessionId: currentBattleId,
  action: {
    type: 'ability',
    abilityId: 'brave'
  }
});

// Backend validates and resolves
// Returns full turn result (player action + enemy action + updated state)
```

### 4.6 Enemy AI

Simple priority-based AI for MVP. **Runs server-side** — client cannot see or modify enemy decision.

```
ENEMY AI DECISION TREE:

  if hp < 30% AND has_heal_ability AND mp >= heal_cost:
    → use heal (target: self)
  elif has_buff_available AND NOT already_buffed:
    → use buff (50% chance, target: self)
  elif has_damage_ability AND mp >= ability_cost:
    → use strongest damage ability (70% chance, target: player active familiar)
  else:
    → basic attack (target: player active familiar)
```

**Security:** Enemy AI logic is in the shared package, but only the backend executes it. The client receives the result after the enemy has already acted.

### 4.7 Battle rewards

**Backend handles all reward distribution:**

```
DUNGEON ENCOUNTER (regular enemy):
  ON WIN:
    Backend:
    - Award currency (random 5-20 based on enemy level)
    - Small chance (20%) of dropping a consumable item
    - Update dungeon state in D1
    - Return rewards to client
    
    Client:
    - Display reward animation
    - Update local inventory display
    - Player can use items from inventory to heal before next room
    - Active familiar's HP/MP persists (NOT restored)

  ON LOSS (active familiar KO'd):
    Backend:
    - If other familiar alive: auto-switch, battle continues
    - If both familiars KO'd: DUNGEON FAILED
    - Lose all inventory (currency + items collected in this dungeon run)
    - Update game state in D1
    - Return failure result to client
    
    Client:
    - Transition to DungeonFailScene
    - Display "You were defeated" message
    - Return to WorldMapScene
    - Party HP/MP restored to full (merciful reset)

DUNGEON BOSS:
  ON WIN:
    Backend:
    - Award bossReward.currency + bossReward.items
    - Unlock boss familiar for player's collection (add to playerFamiliars)
    - Mark area as boss-defeated
    - Unlock next area (if applicable)
    - Update game state in D1
    - Return victory result to client
    
    Client:
    - Display victory animation
    - Show unlocked familiar
    - Return to WorldMapScene
    - Party HP/MP restored to full
    - Keep all inventory

  ON LOSS:
    Backend:
    - DUNGEON FAILED
    - Lose all inventory (currency + items collected in this dungeon run)
    - Update game state in D1
    - Return failure result to client
    
    Client:
    - Transition to DungeonFailScene
    - Return to WorldMapScene
    - Party HP/MP restored to full (merciful reset)
    - Boss familiar NOT unlocked (must defeat again)
```

---

## 5. Exploration Mechanics

### 5.1 World Map & Area Selection

```
WORLD MAP (3 areas for MVP):

  ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
  │  Verdant Meadow │────►│  Crystal Caves   │────►│  Shadow Forest  │
  │  Level 1-3      │     │  Level 3-5       │     │  Level 5-8      │
  │  Common spawns  │     │  Uncommon spawns │     │  Rare spawns    │
  │  5 rooms + boss │     │  6 rooms + boss  │     │  7 rooms + boss │
  └─────────────────┘     └─────────────────┘     └─────────────────┘
        bg: 0x2d5a27            bg: 0x3a3a6e            bg: 0x1a1a2e
```

**Unlock progression:** Defeat boss in Meadow → unlock Caves. Defeat boss in Caves → unlock Forest.

**Party selection:** Before entering any dungeon, player selects exactly 2 familiars from their collection. These familiars persist through the entire dungeon run with HP/MP carrying between rooms.

**API flow:**

```typescript
// Player selects area
const response = await gameApiClient.enterDungeon({
  sessionId: currentSessionId,
  areaId: 'verdantMeadow',
  party: ['whiteDog', 'yellowFighter']
});

// Backend:
// 1. Validate player owns familiars
// 2. Create dungeon session
// 3. Initialize dungeon state in D1
// 4. Return dungeon state

// Client transitions to ExplorationScene
this.scene.start('ExplorationScene', {
  dungeonSessionId: response.dungeonSessionId,
  area: response.area,
  party: response.party,
  currentRoom: response.currentRoom
});
```

### 5.2 Dungeon Structure (Branching Rooms)

Each area has a pre-determined map of rooms with branching paths. Rooms can have:
- **Random encounter** (chance-based)
- **Treasure** (chance-based, if no encounter)
- **Nothing** (flavor text only)
- **Dead end** (must backtrack)
- **Boss room** (final room, guaranteed encounter)

**Example dungeon layout (Verdant Meadow):**

```
START ──► Room 1 ──┬──► Room 2 (left path) ──► Room 4 ──► Room 5 (boss)
                   │
                   └──► Room 3 (right path, dead end) ──► [must backtrack to Room 1]
```

**Room data structure:** (same as before, but stored in shared package)

```typescript
// packages/game-logic/src/data/areas.ts
const MEADOW_ROOMS: Room[] = [
  // ... room definitions (same as before)
];
```

**Treasure pool weights:** Higher weight = more likely. Example: `[{ itemId: 'potion_medium', weight: 1 }, { itemId: 'potion_small', weight: 2 }]` means potion_small is 2x more likely than potion_medium.

### 5.3 Exploration Loop (Room-by-Room)

**Client flow:**
1. Player clicks exit button (e.g., "Go left")
2. Client calls `POST /api/game/dungeon/explore` with roomId
3. Backend resolves room entry (encounter/treasure/nothing)
4. Client displays result and transitions to next scene if needed

**Backend flow:**
1. Receive explore request
2. Load dungeon state from D1
3. Validate room is accessible (connected to current room)
4. Check if room is already cleared
5. If uncleared: roll for encounter (server-side RNG)
6. If encounter: select enemy, create battle session
7. If treasure: roll for item (server-side RNG, weighted)
8. Update dungeon state in D1
9. Return result

```typescript
// Client sends explore request
const response = await gameApiClient.explore({
  sessionId: currentSessionId,
  dungeonSessionId: currentDungeonId,
  roomId: 'meadow_1'
});

// Backend returns
{
  room: {
    id: 'meadow_1',
    name: 'Fork in the Path',
    description: 'You encounter a fork in the road. Which way?',
    exits: [...],
    cleared: true
  },
  event: 'encounter',  // or 'treasure' or 'nothing'
  encounter: {
    enemy: { id: 'whiteDog', name: 'White Dog', level: 2, ... },
    battleSessionId: 'battle_xyz789'
  },
  treasure: {
    item: { itemId: 'potion_small', quantity: 1 }
  },
  message: 'You found a potion_small!'
}

// Client handles result
if (response.event === 'encounter') {
  this.scene.start('BattleScene', {
    battleSessionId: response.encounter.battleSessionId,
    playerFamiliar: activeFamiliar,
    enemyFamiliar: response.encounter.enemy,
    isBoss: false
  });
} else if (response.event === 'treasure') {
  // Display treasure message
  // Update local inventory display
} else {
  // Display flavor text
}
```

**Room entry sequence:**

```
ENTER DUNGEON:
  Client: POST /api/game/dungeon/enter
  Backend: Create dungeon session, initialize state in D1
  Client: Transition to ExplorationScene

ROOM ENTRY (first time):
  Client: POST /api/game/dungeon/explore
  Backend: Roll encounter/treasure, update state
  Client: Display result, handle event

ROOM ENTRY (return visit):
  Client: POST /api/game/dungeon/explore
  Backend: Room is cleared, skip event resolution
  Client: Display room description, show exits

ROOM NAVIGATION:
  Client: Display room description + available exits as buttons
  Player clicks exit button
  Client: POST /api/game/dungeon/explore with new roomId
  Backend: Validate move, resolve event
  Client: Display result

BOSS BATTLE:
  Client: POST /api/game/dungeon/explore with boss roomId
  Backend: Guaranteed encounter, create battle session
  Client: Transition to BattleScene (isBoss: true)

EXIT DUNGEON EARLY:
  Client: POST /api/game/dungeon/exit
  Backend: Update game state (keep inventory, unlock areas if boss defeated)
  Client: Transition to WorldMapScene
```

**Cleared room behavior:**
- Once a room is cleared (encounter won, treasure found, or nothing), it stays cleared
- Re-entering a cleared room shows the description but no new events
- This prevents grinding and makes backtracking safe
- All rooms reset when player exits dungeon (win, lose, or early exit)
- Backend tracks cleared status in D1

### 4.4 Item Usage in Exploration

**When can items be used?**
- Between rooms (after event resolution, before choosing exit)
- During battle (as a battle action)
- NOT during event resolution (can't use items before encounter/treasure roll)

**UI flow:**
- Exploration screen shows "Inventory" button (always visible)
- Clicking "Inventory" opens InventoryPanel overlay
- Panel shows: currency amount + list of consumable items with quantities
- Each item has a "Use" button
- Clicking "Use" prompts for target familiar (if party has 2 familiars)
- After using item, panel closes, player continues navigation

**Item effects:**
- `potion_small`: Restore 30 HP to target familiar
- `potion_medium`: Restore 60 HP to target familiar
- `ether_small`: Restore 20 MP to target familiar
- Items cannot exceed maxHp/maxMp

### 4.5 Enemy Level Scaling

```
REGULAR ENEMY GENERATION:

  level = random(area.levelRange[0], area.levelRange[1])
  scaleFactor = 1.0 + (level - 1) * 0.1    // +10% stats per level

  enemyFamiliar = deepClone(baseFamiliarData)
  for each stat in [hp, mp, attack, defense, arcane, speed]:
    enemyFamiliar.stats[stat] = Math.round(baseStat * scaleFactor)
  enemyFamiliar.stats.maxHp = enemyFamiliar.stats.hp
  enemyFamiliar.stats.maxMp = enemyFamiliar.stats.mp

BOSS FAMILIARS:
  Boss familiars are pre-defined with scaled stats (see Section 1.5)
  No dynamic scaling — boss stats are fixed in data
  Example: meadowGuardian has 2.0x White Dog's base stats
```

### 4.6 Treasure & Items

**MVP item types (consumables only):**

| Item ID | Type | Effect |
|---------|------|--------|
| `potion_small` | Consumable | Restore 30 HP to one familiar |
| `potion_medium` | Consumable | Restore 60 HP to one familiar |
| `ether_small` | Consumable | Restore 20 MP to one familiar |

**Currency:** Gold is stored as `inventory.currency: number` (flat number). Regular encounters award 5-20 gold directly. No currency items exist.

**Item usage:**
- **In dungeon:** Player can use consumables from inventory between rooms (see Section 4.4 for UI flow)
- **In battle:** Player can use consumables as a battle action (replaces attack/ability/defend/run)
- **Currency:** Used for future features (shop, upgrades). MVP is accumulation only.

### 4.6 Push-Your-Luck Mechanic

**Core tension:** The deeper you go, the better the treasure, but the more you risk losing.

- Each room has a chance for treasure (better treasure in later rooms)
- Encounters drain HP/MP (resources)
- Player must decide: exit now with what you have, or push deeper for better rewards?
- **Death = lose everything** (all currency and items collected in that dungeon run)
- **Exit early = keep everything**

**Risk/reward curve:**

```
Room 1 (start):  10% treasure, 20% encounter, low-value loot
Room 2-3:        20% treasure, 30% encounter, medium-value loot
Room 4-5:        30% treasure, 40% encounter, high-value loot
Boss room:       100% encounter (boss), guaranteed boss rewards on win
```

---

## 5. UI System (Phaser-native)

### 5.1 Battle HUD layout (1v1 with swap)

```
BATTLE HUD LAYOUT (800x600):

  ┌──────────────────────────────────────────────────────┐
  │  [Enemy Name]                           HP ████████░░  │
  │                                         MP ██████░░░░  │
  │           ┌─────────┐    ┌─────────┐                   │
  │           │  ENEMY   │    │  ACTIVE │                  │
  │           │ SPRITE   │    │ SPRITE  │                  │
  │           │ (160x160)│    │(160x160)│                  │
  │           └─────────┘    └─────────┘                   │
  │                                                        │
  │  [Active Familiar Name]                 HP ██████████  │
  │  Affinity: Fire                         MP ████████░░  │
  ├──────────────────────────────────────────────────────┤
  │  BENCH: [Bench Familiar Name] HP: 85/100  MP: 40/60   │
  │         [Swap]                                          │
  ├──────────────────────────────────────────────────────┤
  │  ACTIONS:                                               │
  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐  │
  │  │ Attack   │ │ Brave    │ │ Sturdy   │ │ Item   │  │
  │  │ (0 MP)   │ │ (10 MP)  │ │ (8 MP)   │ │        │  │
  │  └──────────┘ └──────────┘ └──────────┘ └────────┘  │
  │  ┌──────────┐ ┌──────────┐                             │
  │  │ Defend   │ │ Run      │                             │
  │  │ (0 MP)   │ │          │                             │
  │  └──────────┘ └──────────┘                             │
  ├──────────────────────────────────────────────────────┤
  │  BATTLE LOG:                                            │
  │  > White Dog used Brave! 45 damage!                     │
  │  > Enemy Yellow Fighter attacks! 28 damage!             │
  └──────────────────────────────────────────────────────┘
```

**Swap button:** Always visible in bench area. Clicking it switches active familiar (once per turn). After swap, player still selects an action for the new active familiar.

### 5.2 Exploration HUD layout

```
EXPLORATION HUD LAYOUT (800x600):

  ┌──────────────────────────────────────────────────────┐
  │  [Area Name]                     Gold: 125             │
  ├──────────────────────────────────────────────────────┤
  │                                                        │
  │  [Room Name]                                           │
  │                                                        │
  │  "You encounter a fork in the road. Which way?"        │
  │                                                        │
  │  ┌────────────────────────────────────────────────┐   │
  │  │  [Go left]                                      │   │
  │  │  [Go right]                                     │   │
  │  │  [Go back]                                      │   │
  │  │  [Exit area]                                    │   │
  │  └────────────────────────────────────────────────┘   │
  │                                                        │
  │  [Use Item]                                            │
  │                                                        │
  ├──────────────────────────────────────────────────────┤
  │  PARTY STATUS:                                         │
  │  ┌────────────────────┐  ┌────────────────────┐       │
  │  │ White Dog          │  │ Yellow Fighter     │       │
  │  │ HP: 85/120  MP:60  │  │ HP: 140/140 MP:60  │       │
  │  └────────────────────┘  └────────────────────┘       │
  └──────────────────────────────────────────────────────┘
```

**Inventory overlay:** Clicking "Use Item" opens a modal showing consumables. Player selects item, then selects target familiar. Modal closes after use.

### 5.3 UI components to build

All in `game/src/ui/`:

| File | Purpose |
|------|---------|
| `HealthBar.ts` | HP/MP bar with smooth tween animation, color changes at thresholds |
| `AbilityButton.ts` | Clickable ability card with MP cost, cooldown overlay, disabled state |
| `BattleLog.ts` | Scrolling text log of battle events (last 5 entries) |
| `FamiliarCard.ts` | Familiar display: name, affinity badge, HP/MP bars, status icons |
| `DamageNumber.ts` | Floating damage/heal numbers that fade out (tween up + alpha) |
| `ActionPanel.ts` | Bottom panel containing action buttons |
| `SwapButton.ts` | Swap active familiar button (shows bench familiar info) |
| `RoomDisplay.ts` | Room description + exit buttons |
| `InventoryPanel.ts` | Modal overlay: show items, currency, use items |
| `PartyStatusPanel.ts` | Show party HP/MP during exploration |

### 5.4 Placeholder sprites

No art assets for MVP. Use Phaser graphics primitives:

```
ALLY FAMILIAR:  Rounded rectangle (blue-purple fill) with name text overlay
ENEMY FAMILIAR: Rounded rectangle (red fill) with name text overlay
AFFINITY BADGE: Small colored circle (Fire=orange, Water=blue, Earth=green, Wind=cyan, Light=yellow, Dark=purple)
STATUS ICONS:   Text symbols (⬆ buff, ⬇ debuff, 🔥 DoT, 💚 HoT)
```

---

## 6. Game State Persistence

### 6.1 Database schema (D1)

**New tables for game state:**

```sql
-- Migration 0002: Game state tables

-- Player game state (MVP: anonymous, Phase 3: wallet-based)
CREATE TABLE IF NOT EXISTS game_states (
  id TEXT PRIMARY KEY,                    -- UUID
  anonymous_id TEXT NOT NULL,             -- Temporary ID for MVP (localStorage)
  eth_address TEXT,                       -- Phase 3: wallet address
  player_familiars TEXT NOT NULL DEFAULT '[]',  -- JSON array of familiar IDs
  active_party TEXT NOT NULL DEFAULT '[]',      -- JSON array of familiar IDs (max 2)
  inventory TEXT NOT NULL DEFAULT '{"currency":0,"items":[]}',  -- JSON
  unlocked_areas TEXT NOT NULL DEFAULT '["verdantMeadow"]',     -- JSON array
  defeated_bosses TEXT NOT NULL DEFAULT '[]',                   -- JSON array of area IDs
  battle_count INTEGER NOT NULL DEFAULT 0,
  win_count INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Active dungeon run (one per player at a time)
CREATE TABLE IF NOT EXISTS dungeon_runs (
  id TEXT PRIMARY KEY,                    -- UUID (dungeonSessionId)
  game_state_id TEXT NOT NULL,            -- FK to game_states
  area_id TEXT NOT NULL,
  current_room_id TEXT NOT NULL,
  party TEXT NOT NULL DEFAULT '[]',       -- JSON array of familiar IDs
  party_hp TEXT NOT NULL DEFAULT '{}',    -- JSON: { familiarId: hp }
  party_mp TEXT NOT NULL DEFAULT '{}',    -- JSON: { familiarId: mp }
  inventory TEXT NOT NULL DEFAULT '{"currency":0,"items":[]}',  -- JSON (dungeon-specific)
  rooms TEXT NOT NULL DEFAULT '{}',       -- JSON: { roomId: cleared }
  status TEXT NOT NULL DEFAULT 'active',  -- 'active', 'completed', 'failed'
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (game_state_id) REFERENCES game_states(id)
);

-- Active battle session (one per battle)
CREATE TABLE IF NOT EXISTS battle_sessions (
  id TEXT PRIMARY KEY,                    -- UUID (battleSessionId)
  game_state_id TEXT NOT NULL,            -- FK to game_states
  dungeon_run_id TEXT,                    -- FK to dungeon_runs (null if not in dungeon)
  player_familiar_id TEXT NOT NULL,
  enemy_familiar_id TEXT NOT NULL,
  enemy_level INTEGER NOT NULL,
  player_hp INTEGER NOT NULL,
  player_mp INTEGER NOT NULL,
  enemy_hp INTEGER NOT NULL,
  enemy_mp INTEGER NOT NULL,
  player_status_effects TEXT NOT NULL DEFAULT '[]',  -- JSON array
  enemy_status_effects TEXT NOT NULL DEFAULT '[]',   -- JSON array
  is_boss INTEGER NOT NULL DEFAULT 0,
  turn_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',  -- 'active', 'won', 'lost', 'fled'
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (game_state_id) REFERENCES game_states(id),
  FOREIGN KEY (dungeon_run_id) REFERENCES dungeon_runs(id)
);

-- Battle history (audit trail for debugging/analytics)
CREATE TABLE IF NOT EXISTS battle_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_state_id TEXT NOT NULL,
  battle_session_id TEXT NOT NULL,
  turn_number INTEGER NOT NULL,
  player_action TEXT NOT NULL,            -- JSON: { type, abilityId?, itemId? }
  enemy_action TEXT NOT NULL,             -- JSON: { type, abilityId? }
  player_damage_dealt INTEGER NOT NULL,
  enemy_damage_dealt INTEGER NOT NULL,
  player_hp_after INTEGER NOT NULL,
  enemy_hp_after INTEGER NOT NULL,
  rng_seed INTEGER NOT NULL,              -- For reproducibility
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (game_state_id) REFERENCES game_states(id),
  FOREIGN KEY (battle_session_id) REFERENCES battle_sessions(id)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_game_states_anonymous_id ON game_states(anonymous_id);
CREATE INDEX IF NOT EXISTS idx_dungeon_runs_game_state_id ON dungeon_runs(game_state_id);
CREATE INDEX IF NOT EXISTS idx_battle_sessions_game_state_id ON battle_sessions(game_state_id);
CREATE INDEX IF NOT EXISTS idx_battle_history_battle_session_id ON battle_history(battle_session_id);
```

### 6.2 State management flow

**Save game state:**

```typescript
// Backend: POST /api/game/state/save
async function saveGameState(req: SaveGameStateRequest): Promise<void> {
  const { gameStateId, anonymousId, state } = req;
  
  await env.DB.prepare(`
    UPDATE game_states SET
      player_familiars = ?,
      active_party = ?,
      inventory = ?,
      unlocked_areas = ?,
      defeated_bosses = ?,
      battle_count = ?,
      win_count = ?,
      version = ?,
      updated_at = datetime('now')
    WHERE id = ? AND anonymous_id = ?
  `).bind(
    JSON.stringify(state.playerFamiliars),
    JSON.stringify(state.activeParty),
    JSON.stringify(state.inventory),
    JSON.stringify(state.unlockedAreas),
    JSON.stringify(state.defeatedBosses),
    state.battleCount,
    state.winCount,
    state.version,
    gameStateId,
    anonymousId
  ).run();
}
```

**Load game state:**

```typescript
// Backend: POST /api/game/state/load
async function loadGameState(req: LoadGameStateRequest): Promise<GameState | null> {
  const { anonymousId } = req;
  
  const result = await env.DB.prepare(`
    SELECT * FROM game_states WHERE anonymous_id = ?
  `).bind(anonymousId).first();
  
  if (!result) return null;
  
  return {
    version: result.version,
    playerFamiliars: JSON.parse(result.player_familiars),
    activeParty: JSON.parse(result.active_party),
    inventory: JSON.parse(result.inventory),
    unlockedAreas: JSON.parse(result.unlocked_areas),
    defeatedBosses: JSON.parse(result.defeated_bosses),
    battleCount: result.battle_count,
    winCount: result.win_count,
    lastSaved: Date.parse(result.updated_at),
  };
}
```

### 6.3 Auto-save triggers

**Backend auto-saves on:**
- After every battle (win or loss) — update game state + dungeon run
- On room entry (before event resolution) — update dungeon run
- When switching areas — update game state
- On dungeon exit (win, lose, or early) — finalize dungeon run, update game state

**Client does NOT save directly** — all persistence goes through backend API.

### 6.4 Session lifecycle

```
1. First visit (anonymous):
   Client: POST /api/game/state/load { anonymousId: "abc123" }
   Backend: No state found, create new game state
   Client: Display WorldMapScene

2. Enter dungeon:
   Client: POST /api/game/dungeon/enter
   Backend: Create dungeon_run record
   Client: Display ExplorationScene

3. Explore rooms:
   Client: POST /api/game/dungeon/explore
   Backend: Update dungeon_run (rooms cleared, HP/MP, inventory)
   Client: Display events, battles

4. Battle:
   Client: POST /api/game/battle/action
   Backend: Update battle_session, then update dungeon_run/game_state
   Client: Animate results

5. Exit dungeon:
   Client: POST /api/game/dungeon/exit
   Backend: Finalize dungeon_run (status: 'completed' or 'failed')
            Update game_state (inventory, unlocks, etc.)
   Client: Display WorldMapScene

6. Page close:
   Client: window.beforeunload → POST /api/game/state/save
   Backend: Persist current state
```

### 6.5 Migration strategy

**MVP (no auth):**
- Generate `anonymousId` on first visit (stored in localStorage)
- All game state keyed by `anonymousId`
- Player can clear localStorage to reset (acceptable for MVP)

**Phase 3 (blockchain auth):**
- Replace `anonymousId` with `ethAddress`
- Migrate anonymous game state to wallet-based state
- Add migration endpoint: `POST /api/game/state/migrate`
- State can be migrated to on-chain storage (future)

---

## 7. React-Phaser Bridge

### 7.1 Embedding

The game lives in its own Vite app (`game/`) and is embedded in the React frontend via iframe for MVP isolation:

```
frontend/src/components/game/GameCanvas.tsx:

  <iframe
    src="http://localhost:3000"   // game dev server
    width="800"
    height="600"
    style={{ border: 'none', borderRadius: '12px' }}
    title="Arcane Familiars Game"
  />
```

For production: build game to `game/dist/`, serve from same origin or embed as a static asset.

### 7.2 Game-Backend Communication

The game communicates with the backend via HTTP API (not postMessage):

```typescript
// game/src/api/gameApiClient.ts

class GameApiClient {
  private baseUrl: string;
  private sessionId: string;

  constructor(baseUrl: string, sessionId: string) {
    this.baseUrl = baseUrl;
    this.sessionId = sessionId;
  }

  async battleAction(req: BattleActionRequest): Promise<BattleActionResult> {
    const response = await fetch(`${this.baseUrl}/api/game/battle/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: this.sessionId,
        ...req
      })
    });
    return response.json();
  }

  async explore(req: ExploreRequest): Promise<ExploreResult> {
    const response = await fetch(`${this.baseUrl}/api/game/dungeon/explore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: this.sessionId,
        ...req
      })
    });
    return response.json();
  }

  // ... other API methods
}
```

### 7.3 PostMessage API (Phase 3 — blockchain integration)

For Phase 3 (blockchain integration), the game and React frontend will communicate via `window.postMessage` for wallet events:

```typescript
// Game → React: "battle won, mint this familiar"
window.parent.postMessage({ type: 'GAME_EVENT', event: 'battle_won', data: { familiarId: '...' } }, '*');

// React → Game: "wallet connected, here's your address"
gameIframe.contentWindow.postMessage({ type: 'WALLET_CONNECTED', address: '0x...' }, '*');
```

Not needed for MVP. Documenting for Phase 3 planning.

---

## 8. File Structure (target)

```
packages/
└── game-logic/
    ├── package.json
    ├── tsconfig.json
    └── src/
        ├── types/
        │   ├── battle.ts                # BattleFamiliar, BattleAction, StatusEffect, etc.
        │   ├── exploration.ts           # Area, Room, DungeonState, Inventory, etc.
        │   ├── gameState.ts             # GameState (save/load shape with version)
        │   └── api.ts                   # API request/response types
        ├── data/
        │   ├── familiars.ts             # 5 common familiars + 3 boss familiars
        │   ├── abilities.ts             # 8 abilities
        │   ├── areas.ts                 # 3 area definitions with room layouts
        │   ├── items.ts                 # Consumable item definitions
        │   └── mappers.ts               # D1 row → data mappers (Phase 3)
        └── utils/
            ├── battleEngine.ts          # Damage calc, status effects, turn resolution
            ├── enemyAI.ts               # Enemy decision logic
            ├── dungeonEngine.ts         # Room navigation, encounter/treasure rolls
            ├── mathUtils.ts             # Seeded RNG, clamp, lerp helpers
            └── validation.ts            # Action validation logic

game/src/
├── config.ts                    # Game config (updated with all scenes)
├── main.ts                      # Entry point
├── api/
│   └── gameApiClient.ts         # HTTP client for backend API
├── scenes/
│   ├── BootScene.ts             # Load data, check auth, transition to WorldMap
│   ├── WorldMapScene.ts         # Display areas, unlock status, area selection
│   ├── PartySelectScene.ts      # Choose 2 familiars from collection
│   ├── ExplorationScene.ts      # Room navigation, handle API responses
│   ├── BattleScene.ts           # 1v1 combat with swap mechanic, send actions to API
│   └── DungeonFailScene.ts      # "You were defeated" screen, return to WorldMap
├── ui/
│   ├── HealthBar.ts             # HP/MP bar with tween animation
│   ├── AbilityButton.ts         # Ability card with MP cost, cooldown, disabled state
│   ├── BattleLog.ts             # Scrolling battle event log
│   ├── FamiliarCard.ts          # Familiar display with stats
│   ├── DamageNumber.ts          # Floating damage/heal numbers
│   ├── ActionPanel.ts           # Battle action buttons
│   ├── SwapButton.ts            # Swap active familiar button
│   ├── RoomDisplay.ts           # Room description + exit buttons
│   ├── InventoryPanel.ts        # Modal: items, currency, use items
│   └── PartyStatusPanel.ts      # Party HP/MP during exploration
└── sprites/
    └── FamiliarSprite.ts        # Placeholder sprite renderer

backend/src/
├── index.ts                     # Hono app (existing)
├── routes/
│   ├── assets.ts                # Existing
│   ├── auth.ts                  # Existing
│   ├── balances.ts              # Existing
│   ├── collection.ts            # Existing
│   ├── metadata.ts              # Existing
│   └── game.ts                  # NEW: Game API endpoints
├── game/
│   ├── handlers/
│   │   ├── battle.ts            # Battle action handler
│   │   ├── dungeon.ts           # Dungeon exploration handler
│   │   └── state.ts             # Game state save/load handler
│   └── services/
│       ├── battleService.ts     # Battle resolution logic (uses shared package)
│       ├── dungeonService.ts    # Dungeon exploration logic (uses shared package)
│       └── stateService.ts      # State persistence logic (D1 queries)
└── utils/
    └── imx.ts                   # Existing

frontend/src/
├── components/
│   └── game/
│       └── GameCanvas.tsx       # iframe embed (existing)
└── ...
```

**Key changes:**
- **Shared package** (`packages/game-logic/`) — game logic used by both backend and frontend
- **Backend game routes** (`backend/src/routes/game.ts`) — API endpoints
- **Backend game handlers** (`backend/src/game/handlers/`) — request/response handling
- **Backend game services** (`backend/src/game/services/`) — business logic (uses shared package)
- **Frontend API client** (`game/src/api/gameApiClient.ts`) — HTTP client for backend
- **No local save manager** — all persistence goes through backend API

---

## 9. Implementation Order

Each step builds on the previous. Target: working dungeon loop in Step 8.

| Step | What | Files | Depends on |
|------|------|-------|------------|
| **1** | Shared package setup | `packages/game-logic/` (package.json, tsconfig, types, data, utils) | — |
| **2** | D1 migration (game state tables) | `backend/migrations/0002_game_state.sql` | — |
| **3** | Backend game API (state save/load) | `backend/src/routes/game.ts`, `backend/src/game/services/stateService.ts` | Step 2 |
| **4** | Backend game API (dungeon exploration) | `backend/src/game/handlers/dungeon.ts`, `backend/src/game/services/dungeonService.ts` | Steps 1+3 |
| **5** | Backend game API (battle resolution) | `backend/src/game/handlers/battle.ts`, `backend/src/game/services/battleService.ts` | Steps 1+3 |
| **6** | Frontend API client | `game/src/api/gameApiClient.ts` | Step 3 |
| **7** | BattleScene (visual battle, 1v1 with swap) | `scenes/BattleScene.ts`, `ui/HealthBar.ts`, `ui/AbilityButton.ts`, `ui/BattleLog.ts`, `ui/ActionPanel.ts`, `ui/DamageNumber.ts`, `ui/SwapButton.ts` | Steps 5+6 |
| **8** | ExplorationScene (room navigation) | `scenes/ExplorationScene.ts`, `ui/RoomDisplay.ts`, `ui/InventoryPanel.ts`, `ui/PartyStatusPanel.ts` | Steps 4+6 |
| **9** | Game flow (WorldMap → PartySelect → Dungeon → Battle) | `scenes/WorldMapScene.ts`, `scenes/PartySelectScene.ts`, `scenes/DungeonFailScene.ts`, `config.ts` | Steps 7+8 |
| **10** | React integration (same-origin build) | `frontend/src/components/game/GameCanvas.tsx`, update `App.tsx` | Step 9 |
| **11** | Polish + balance | Tuning numbers, edge cases, room layouts for other 2 areas, battle log improvements | Step 9 |

### Parallelization opportunity

Steps 4 and 5 are independent (dungeon API vs battle API) — can be built in parallel:
- Lane A: Steps 1 → 3 → 4 (dungeon API)
- Lane B: Steps 1 → 3 → 5 (battle API)
- Merge → Step 6 (API client) → Steps 7+8 (scenes)

Steps 7 and 8 are also independent (battle UI vs exploration UI) — can be built in parallel worktrees:
- Lane A: Steps 6 → 7 (battle scene)
- Lane B: Steps 6 → 8 (exploration scene)
- Merge → Step 9 (game flow scenes)

### Backend-first approach

**Why backend first?**
- Backend is the source of truth for game logic
- Frontend is a thin rendering layer
- Easier to test backend in isolation (no Phaser dependency)
- API contract is defined early, frontend can mock responses during development

**Development workflow:**
1. Implement shared package (types, data, utils)
2. Implement backend API endpoints
3. Test backend with curl/Postman
4. Implement frontend API client
5. Implement frontend scenes (consume API)

---

## 10. Testing Strategy

### Unit tests (shared package — pure logic)

**Location:** `packages/game-logic/src/utils/__tests__/`

| Test | What it verifies |
|------|-----------------|
| Damage formula | Basic attack, ability multiplier, defense reduction, critical hit, minimum 1 damage |
| Turn order (queued) | Speed-based resolution, tie-breaking, both actions queued then resolved |
| Status effects | Application, duration tick-down, removal, multiplier vs flat value semantics |
| Enemy AI | Heal when low, buff when available, attack fallback |
| Level scaling | Stat scaling formula, level bounds |
| Run chance | Formula: 50% + ((player_speed - enemy_speed) * 5)%, clamped to 5-95%, disabled for boss battles |
| Item usage | Consumable applies correct effect, removes item from inventory, consumes turn |
| Swap mechanic | Swap changes active familiar, doesn't cost action, can swap once per turn |
| Multi-effect abilities | ShadowStrike applies damage then debuff in order, debuff skipped if target KO'd |
| Action validation | Reject invalid actions (insufficient MP, invalid targets, KO'd familiars) |
| Seeded RNG | Deterministic results with same seed, good distribution |

### Unit tests (backend services)

**Location:** `backend/src/game/services/__tests__/`

| Test | What it verifies |
|------|-----------------|
| Battle service | Full battle resolution flow, state updates, reward distribution |
| Dungeon service | Room navigation, encounter rolls, treasure rolls, state updates |
| State service | Save/load game state, version checking, migration |
| Validation | Action validation before processing |

### Integration tests (backend API)

**Location:** `backend/src/routes/__tests__/game.test.ts`

| Test | What it verifies |
|------|-----------------|
| POST /api/game/state/save | Save game state to D1, retrieve it |
| POST /api/game/state/load | Load game state, handle missing state |
| POST /api/game/dungeon/enter | Create dungeon session, initialize state |
| POST /api/game/dungeon/explore | Room navigation, encounter/treasure rolls |
| POST /api/game/dungeon/exit | Exit dungeon, update game state |
| POST /api/game/battle/action | Resolve battle action, update battle state |
| POST /api/game/battle/swap | Swap active familiar |
| Full dungeon run | Enter → explore → battle → win → continue → boss → win → exit |
| Dungeon fail flow | Enter → battle → lose → fail → lose inventory |
| Action validation | Reject invalid actions (insufficient MP, invalid targets) |

### Unit tests (frontend API client)

**Location:** `game/src/api/__tests__/gameApiClient.test.ts`

| Test | What it verifies |
|------|-----------------|
| API client methods | All methods call correct endpoints with correct payloads |
| Error handling | Network errors, API errors, timeout handling |
| Request/response types | Type safety for all API calls |

### Integration tests (scene transitions)

**Location:** `game/src/scenes/__tests__/`

| Test | What it verifies |
|------|-----------------|
| Full dungeon run | WorldMap → PartySelect → Explore rooms → Encounter → Battle → Win → Continue → Boss → Win → WorldMap |
| Dungeon fail flow | Enter dungeon → Encounter → Lose → DungeonFail → WorldMap (inventory lost) |
| Early exit flow | Enter dungeon → Explore rooms → Exit early → WorldMap (inventory kept) |
| Save/load | Save mid-dungeon, reload, state matches (room, HP, inventory) |
| Area unlock | Defeat boss in area 1 → area 2 becomes accessible |
| Collection growth | Defeat boss → base familiar added to playerFamiliars |

### Manual QA checklist

- [ ] Party selection allows choosing exactly 2 familiars from 5 common starters
- [ ] Party selection prevents choosing same familiar twice
- [ ] Room navigation shows correct exits for each room
- [ ] Dead ends force backtracking
- [ ] Random encounters trigger at correct rates
- [ ] Treasure drops at correct rates (weighted selection)
- [ ] Rooms stay cleared after event resolution
- [ ] Battle works with 1v1 + swap mechanic
- [ ] Swap button switches active familiar (once per turn, no action cost)
- [ ] Items can be used in battle
- [ ] HP persists between rooms for active familiar
- [ ] Items can be used between rooms (inventory panel)
- [ ] Inventory accumulates during dungeon run
- [ ] Losing battle = lose all inventory
- [ ] Exiting early = keep all inventory
- [ ] Boss battle is mandatory when entering boss room
- [ ] Boss defeat unlocks base familiar for collection
- [ ] Boss defeat unlocks next area
- [ ] HP/MP fully restored after leaving dungeon (win or lose)
- [ ] Game state persists across page reload (backend save/load)
- [ ] Game state is validated (can't manipulate via dev tools)
- [ ] Game embeds correctly in React frontend (same-origin)
- [ ] No console errors in production build
- [ ] API calls are batched efficiently (one call per action)
- [ ] Error states are handled gracefully (network errors, API errors)

---

## 11. Key Engineering Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Architecture | Backend-mediated (client-server) | Security: all RNG, battle resolution, and state persistence run server-side. Prevents client manipulation. |
| Code sharing | Shared package (`packages/game-logic/`) | Single source of truth for game logic. Backend and frontend use identical code. |
| RNG | Server-side seeded RNG | Player can't predict or manipulate random outcomes. Deterministic for debugging. |
| State persistence | D1 database (not localStorage) | Authoritative state, no client-side manipulation. Survives browser cache clears. |
| API design | One call per action | Batches resolution (player action + enemy action + state update) into single call. Reduces latency while maintaining security. |
| Authentication | Anonymous for MVP, blockchain for Phase 3 | MVP: generate anonymousId in localStorage. Phase 3: migrate to wallet-based auth. |
| Battle logic location | Shared package, executed by backend | Testable without Phaser, reusable by backend. Backend is authoritative. |
| Dungeon logic location | Shared package, executed by backend | Testable without Phaser, reusable by backend. Backend is authoritative. |
| State management | Backend D1 + client cache | Backend is source of truth. Client caches for display, but doesn't mutate. |
| Rendering | Phaser Graphics primitives (no sprites) | MVP speed — art comes later |
| Turn system | Queued action resolution (both sides pick, then resolve by speed) | Simpler UX than interleaved, still strategic. Player picks action, watches resolution. |
| Combat format | 1v1 with swap (not 2v1 simultaneous) | Cleaner UI, simpler battle engine, swap adds strategy without complexity |
| Swap mechanic | Once per turn, no action cost | Encourages tactical switching without punishing the player |
| Enemy AI | Priority-based decision tree targeting active familiar | Simple, predictable, testable — no ML needed. Runs server-side. |
| Starting familiars | 5 common familiars, player picks 2 | All players start equal, collection grows by defeating bosses |
| Collection growth | Boss defeat unlocks base familiar | Rewards progression, gives players reason to tackle harder areas |
| Dungeon structure | Pre-determined branching rooms | More intentional than random generation, easier to balance, allows dead ends and exploration |
| Room clearing | Rooms stay cleared until dungeon exit | Prevents grinding, makes backtracking safe, simpler state management |
| Push-your-luck mechanic | Lose inventory on death, keep on exit | Creates meaningful risk/reward decisions, encourages strategic retreats |
| HP persistence | Active familiar HP carries between rooms, full heal on exit | Makes dungeon a continuous challenge, consumables become valuable |
| Status effect values | Multiplier for buff/debuff, flat for DoT/HoT | Clear semantics, easy to implement, matches common RPG patterns |
| Boss familiars | Pre-scaled versions of existing familiars | Reuse data, simpler implementation, still challenging |
| Room encounters | Random chance per room, only on first entry | Keeps exploration unpredictable without being frustrating |
| Boss gating | Must defeat boss to unlock next area | Clear progression, ensures player is prepared for harder content |
| Save versioning | `version: number` field in GameState | Future-proof against schema changes, can migrate or reject old saves |
| Auto-save triggers | After battle, on room entry, on area switch, on page close | Covers all critical state changes, prevents progress loss |
| Action validation | Backend validates all actions before processing | Prevents illegal moves (insufficient MP, invalid targets, etc.) |
| Session management | UUID-based sessions (gameStateId, dungeonSessionId, battleSessionId) | Track state across API calls, enable concurrent sessions |
| Error handling | Client handles network errors, API errors, timeout | Graceful degradation, retry logic, user-friendly error messages |
| Offline support | None (web-based, continuous connection) | Simplifies architecture, ensures state consistency |
