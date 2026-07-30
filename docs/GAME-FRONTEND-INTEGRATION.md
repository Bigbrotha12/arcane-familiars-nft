# Game-Frontend Integration Plan

## Objective

Replace the current iframe-based game embedding with a direct Phaser 4 import into the React frontend, add a game toolbar with save/exit functionality, handle edge cases gracefully, and later layer on HTML HUD overlays for Battle and Exploration screens.

---

## Current Architecture

```
Browser
  └── React Frontend (port 8080)
        └── /app/game → <GameCanvas />
              └── <iframe src="http://localhost:3000" />
                    └── Phaser 4 Game (port 3000, standalone app)
```

**Problems:**
- Two dev servers required
- No shared state (wallet, auth, user data)
- CORS concerns
- Game has no HTML UI chrome — full dark canvas, no navigation controls

---

## Target Architecture

```
Browser
  └── React Frontend (port 8080, single dev server)
        └── /play/game → <PlayLayout> → <GamePage>
              ├── <Nav /> (reused from main app)
              ├── Game toolbar (← Exit dropdown, 💾 Save, title)
              └── <div id="game-container">
                    └── Phaser 4 Game (mounted via createGame())
              └── React HUD overlays (Battle + Exploration, future phase)
```

---

## Phase 1: Game Package Refactoring

### 1a — Rename game package

**File:** `game/package.json`

Set `"name": "@arcane-familiars/game"` to follow monorepo workspace conventions (matches existing `packages/game-logic` pattern).

### 1b — Create typed event system

**File:** `game/src/events.ts`

```ts
export enum GameEvent {
  STATE_UPDATED    = 'game:stateUpdated',
  SAVE_GAME        = 'game:save',
  SAVE_COMPLETE    = 'game:saveComplete',
  EXIT_GAME        = 'game:exit',
  BATTLE_STARTED   = 'game:battleStarted',
  BATTLE_ENDED     = 'game:battleEnded',
  SCENE_CHANGED    = 'game:sceneChanged',
}

export interface FamiliarState {
  id: string
  name: string
  hp: number
  maxHp: number
  mp: number
  maxMp: number
  attack: number
  defense: number
  speed: number
  arcane: number
  affinity: string
}

export interface GameStateSnapshot {
  familiars: FamiliarState[]
  currency: number
  battleCount: number
  wins: number
  currentScene: string
  areaName?: string
  roomName?: string
}
```

### 1c — Create EventBus singleton

**File:** `game/src/event-bus.ts`

```ts
type Listener = (...args: any[]) => void

class EventBus {
  private listeners = new Map<string, Set<Listener>>()

  on(event: string, fn: Listener): void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set())
    this.listeners.get(event)!.add(fn)
  }

  off(event: string, fn: Listener): void {
    this.listeners.get(event)?.delete(fn)
  }

  emit(event: string, ...args: any[]): void {
    this.listeners.get(event)?.forEach(fn => fn(...args))
  }

  clear(): void {
    this.listeners.clear()
  }
}

export const gameEventBus = new EventBus()
```

### 1d — Create barrel export

**File:** `game/src/index.ts`

```ts
export { createGame, destroyGame } from './main'
export { gameEventBus } from './event-bus'
export { GameEvent } from './events'
export type { GameStateSnapshot, FamiliarState } from './events'
```

### 1e — Refactor main.ts

**File:** `game/src/main.ts`

Replace the side-effect `new Phaser.Game(gameConfig)` with exported functions:

```ts
import Phaser from 'phaser'
import { gameConfig, GAME_WIDTH, GAME_HEIGHT } from '@/config'

export function createGame(parentId: string): Phaser.Game {
  return new Phaser.Game({
    ...gameConfig,
    parent: parentId,
  })
}

export function destroyGame(game: Phaser.Game): void {
  game.destroy(true)
}

// Standalone mode: auto-init when loaded directly (not imported by frontend)
if (typeof window !== 'undefined' && document.getElementById('game-container')) {
  createGame('game-container')
}
```

### 1f — Wire EventBus into Phaser scenes

Each scene that needs to communicate with React HUD (future phase) or respond to save/exit events:

**Pattern applied per scene** (`BattleScene`, `ExplorationScene`, `WorldMapScene`):

```ts
import { gameEventBus } from '@/event-bus'
import { GameEvent } from '@/events'

class BattleScene extends Phaser.Scene {
  create() {
    // Emit state to React HUD
    gameEventBus.emit(GameEvent.SCENE_CHANGED, { scene: 'battle' })
    gameEventBus.emit(GameEvent.BATTLE_STARTED, { enemyId })

    // Listen for save requests from React toolbar
    gameEventBus.on(GameEvent.SAVE_GAME, this.handleSave)
  }

  private handleSave = async () => {
    await saveGameState(/* current state */)
    gameEventBus.emit(GameEvent.SAVE_COMPLETE, { success: true })
  }

  shutdown() {
    gameEventBus.off(GameEvent.SAVE_GAME, this.handleSave)
    gameEventBus.emit(GameEvent.BATTLE_ENDED)
  }
}
```

### 1g — Add workspace dependency

**File:** `frontend/package.json`

```json
"dependencies": {
  "@arcane-familiars/game": "*",
  ...
}
```

---

## Phase 2: Vite Alias Resolution

### Problem

The game code uses `@/` imports (9 occurrences across 5 files: `main.ts`, `BattleScene.ts`, `ExplorationScene.ts`, `WorldMapScene.ts`, `PartySelectScene.ts`). The frontend also uses `@/` pointing to `frontend/src/`. When the frontend's Vite processes game source files, `@/config` must resolve to `game/src/config`, not `frontend/src/config`.

### Solution: Conditional Vite plugin

**File:** `frontend/vite.config.ts`

```ts
import type { Plugin } from 'vite'
import path from 'node:path'
import fs from 'node:fs'

function resolveGameAtAlias(): Plugin {
  const gameSrc = path.resolve(__dirname, '../game/src')
  const gameLogicSrc = path.resolve(__dirname, '../packages/game-logic/src')
  const frontendSrc = path.resolve(__dirname, './src')

  return {
    name: 'resolve-game-at-alias',
    resolveId(source, importer) {
      if (!source.startsWith('@/')) return null

      // If importing from game source, resolve @/ to game/src
      if (importer?.startsWith(gameSrc)) {
        const rel = source.slice(2)
        const candidates = [
          path.resolve(gameSrc, rel),
          path.resolve(gameLogicSrc, rel),
        ]
        for (const candidate of candidates) {
          for (const ext of ['', '.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx']) {
            if (fs.existsSync(candidate + ext)) {
              return candidate + ext
            }
          }
        }
      }

      // Otherwise resolve to frontend/src (original behavior)
      return null // let Vite's built-in alias handle it
    },
  }
}
```

Remove the existing simple `@` → `src` alias from `resolve.alias` and replace with this plugin.

### Verification

After Phase 2, a `console.log(await import('@arcane-familiars/game'))` from any frontend module should successfully resolve `createGame`, `destroyGame`, `gameEventBus`, and `GameEvent`.

---

## Phase 3: Routing & Layout

### 3a — Create PlayLayout

**File:** `frontend/src/components/layout/PlayLayout.tsx`

A thin wrapper that reuses the existing `Nav` component (with its Home/Play/Collection links and Connect Wallet button) but omits the `Footer`:

```tsx
import { Outlet } from 'react-router-dom'
import Nav from './Nav'

export default function PlayLayout() {
  return (
    <div className="min-h-screen flex flex-col bg-surface-primary">
      <Nav />
      <main className="flex-1 flex flex-col">
        <Outlet />
      </main>
    </div>
  )
}
```

### 3b — Update route table

**File:** `frontend/src/App.tsx`

Add the `/play` route tree alongside existing routes:

```tsx
import PlayLayout from './components/layout/PlayLayout'
import GamePage from './components/Game/GamePage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/app" element={<Layout />}>
          <Route index element={<ComingSoon />} />
          <Route path="game" element={<Navigate to="/play/game" replace />} />
          <Route path="collection" element={<ComingSoon />} />
          {/* ... other routes */}
        </Route>
        <Route path="/play" element={<PlayLayout />}>
          <Route index element={<Navigate to="/play/game" replace />} />
          <Route path="game" element={<GamePage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
```

Note: The old `/app/game` route redirects to `/play/game` for backward compatibility. `GameCanvas.tsx` (iframe approach) is deleted.

### 3c — Update Nav link

**File:** `frontend/src/components/layout/Nav.tsx`

Change the "Play" link target:

```tsx
<Link to="/play/game">Play</Link>
```

Also update Hero.tsx if it links to `/app/game`:

```tsx
<Link to="/play/game"><Button>Start Playing</Button></Link>
```

---

## Phase 4: GamePage Component

### 4a — GamePage.tsx

**File:** `frontend/src/components/Game/GamePage.tsx`

Core structure:

```tsx
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useBlocker } from 'react-router-dom'
import type { GameStateSnapshot } from '@arcane-familiars/game'
import { GameEvent, gameEventBus } from '@arcane-familiars/game'
import Modal from '../ui/Modal'
import { toast } from '../ui/Toast' // utility component for save confirmations

export default function GamePage() {
  const navigate = useNavigate()
  const containerRef = useRef<HTMLDivElement>(null)
  const gameRef = useRef<Phaser.Game | null>(null)
  const [gameState, setGameState] = useState<GameStateSnapshot | null>(null)
  const [showExitModal, setShowExitModal] = useState(false)
  const [exitAction, setExitAction] = useState<'save-and-exit' | 'exit-no-save' | null>(null)

  // Mount Phaser game
  useEffect(() => {
    async function init() {
      const { createGame } = await import('@arcane-familiars/game')
      if (containerRef.current && !gameRef.current) {
        gameRef.current = createGame('game-container')
      }
    }
    init()

    // Subscribe to game state updates
    const onStateUpdate = (state: GameStateSnapshot) => setGameState(state)
    const onSaveComplete = (result: { success: boolean }) => {
      if (result.success) {
        toast.success('Game saved!')
      } else {
        toast.error('Save failed. Please try again.')
      }
    }

    gameEventBus.on(GameEvent.STATE_UPDATED, onStateUpdate)
    gameEventBus.on(GameEvent.SAVE_COMPLETE, onSaveComplete)

    return () => {
      if (gameRef.current) {
        gameRef.current.destroy(true)
        gameRef.current = null
      }
      gameEventBus.off(GameEvent.STATE_UPDATED, onStateUpdate)
      gameEventBus.off(GameEvent.SAVE_COMPLETE, onSaveComplete)
      gameEventBus.clear()
    }
  }, [])

  // ... (toolbar handlers, exit flow, useGameGuard)
  // See detailed sections below

  return (
    <div className="relative flex-1 flex flex-col bg-[#0A0A0F]">
      {/* Game Toolbar */}
      <GameToolbar
        gameState={gameState}
        onSave={handleSave}
        onExitClick={() => setShowExitModal(true)}
      />

      {/* Game canvas container */}
      <div ref={containerRef} id="game-container" className="flex-1 relative" />

      {/* Exit confirmation modal */}
      {showExitModal && (
        <ExitModal
          onSaveAndExit={handleSaveAndExit}
          onExitWithoutSave={handleExitWithoutSave}
          onCancel={() => setShowExitModal(false)}
          saving={exitAction === 'save-and-exit'}
        />
      )}
    </div>
  )
}
```

### 4b — Game Toolbar Subcomponents

**GameToolbar.tsx** — the bar between Nav and canvas:

```
┌─────────────────────────────────────────────────────────────┐
│  ← Exit          Arcane Familiars              💾 Save      │
└─────────────────────────────────────────────────────────────┘
```

```tsx
import Button from '../ui/Button'

interface GameToolbarProps {
  gameState: GameStateSnapshot | null
  onSave: () => void
  onExitClick: () => void
}

export default function GameToolbar({ gameState, onSave, onExitClick }: GameToolbarProps) {
  return (
    <div className="flex items-center justify-between px-4 py-2 bg-surface-primary border-b border-border">
      {/* Left: Exit */}
      <Button variant="ghost" size="sm" onClick={onExitClick}>
        ← Exit
      </Button>

      {/* Center: title + area info */}
      <div className="flex items-center gap-3">
        <span className="font-display text-sm font-semibold text-text-primary">
          Arcane Familiars
        </span>
        {gameState?.areaName && (
          <>
            <span className="text-text-muted">·</span>
            <span className="font-body text-xs text-text-secondary">
              {gameState.areaName}
            </span>
          </>
        )}
        {gameState?.roomName && (
          <span className="font-mono text-xs text-text-muted tabular-nums">
            {gameState.roomName}
          </span>
        )}
      </div>

      {/* Right: Save */}
      <Button variant="ghost" size="sm" onClick={onSave}>
        💾 Save
      </Button>
    </div>
  )
}
```

### 4c — Exit Modal

**ExitModal.tsx** — a styled modal that provides the two exit options:

```tsx
import Modal from '../ui/Modal'
import Button from '../ui/Button'
import { useState } from 'react'

interface ExitModalProps {
  onSaveAndExit: () => void
  onExitWithoutSave: () => void
  onCancel: () => void
  saving: boolean
}

export default function ExitModal({ onSaveAndExit, onExitWithoutSave, onCancel, saving }: ExitModalProps) {
  const [confirmDangerous, setConfirmDangerous] = useState(false)

  if (confirmDangerous) {
    return (
      <Modal onClose={onCancel}>
        <div className="p-6 text-center">
          <p className="font-display text-lg font-semibold text-text-primary mb-2">
            Unsaved Progress
          </p>
          <p className="font-body text-sm text-text-secondary mb-6">
            Any unsaved progress will be lost. Are you sure you want to leave without saving?
          </p>
          <div className="flex justify-center gap-3">
            <Button variant="ghost" onClick={() => setConfirmDangerous(false)}>
              Cancel
            </Button>
            <Button variant="secondary" onClick={onExitWithoutSave}>
              Leave Anyway
            </Button>
          </div>
        </div>
      </Modal>
    )
  }

  return (
    <Modal onClose={onCancel}>
      <div className="p-6">
        <p className="font-display text-lg font-semibold text-text-primary mb-4">
          Leave Game?
        </p>
        <div className="space-y-3">
          <Button
            className="w-full"
            onClick={onSaveAndExit}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save & Exit'}
          </Button>
          <Button
            variant="ghost"
            className="w-full"
            onClick={() => setConfirmDangerous(true)}
          >
            Exit Without Saving
          </Button>
          <Button variant="ghost" className="w-full" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  )
}
```

### 4d — Save flow

In `GamePage.tsx`:

```tsx
const [saving, setSaving] = useState(false)

const handleSave = () => {
  setSaving(true)
  gameEventBus.emit(GameEvent.SAVE_GAME)
  // SAVE_COMPLETE event handler clears saving state
}

// In the SAVE_COMPLETE handler:
gameEventBus.on(GameEvent.SAVE_COMPLETE, () => setSaving(false))
```

### 4e — Exit flow

```tsx
const handleSaveAndExit = async () => {
  setExitAction('save-and-exit')
  gameEventBus.emit(GameEvent.SAVE_GAME)

  // Wait for save to complete
  const onSaveComplete = (result: { success: boolean }) => {
    gameEventBus.off(GameEvent.SAVE_COMPLETE, onSaveComplete)
    if (gameRef.current) {
      gameEventBus.emit(GameEvent.EXIT_GAME)
      gameRef.current.destroy(true)
      gameRef.current = null
    }
    navigate('/play')
  }

  gameEventBus.on(GameEvent.SAVE_COMPLETE, onSaveComplete)

  // Timeout fallback (5s) — navigate even if save hangs
  setTimeout(() => {
    gameEventBus.off(GameEvent.SAVE_COMPLETE, onSaveComplete)
    if (gameRef.current) {
      gameRef.current.destroy(true)
      gameRef.current = null
    }
    navigate('/play')
  }, 5000)
}

const handleExitWithoutSave = () => {
  if (gameRef.current) {
    gameEventBus.emit(GameEvent.EXIT_GAME)
    gameRef.current.destroy(true)
    gameRef.current = null
  }
  navigate('/play')
}
```

### 4f — useGameGuard hook

**File:** `frontend/src/components/Game/useGameGuard.ts`

Handles three edge case scenarios:

```tsx
import { useEffect } from 'react'
import { useBlocker } from 'react-router-dom'
import { GameEvent, gameEventBus } from '@arcane-familiars/game'

interface UseGameGuardOptions {
  onShowExitModal: () => void
  onAutoSave: () => void
}

export function useGameGuard({ onShowExitModal, onAutoSave }: UseGameGuardOptions) {
  // 1. Browser tab close / refresh — native prompt
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [])

  // 2. Tab visibility change — auto-save
  useEffect(() => {
    const handler = () => {
      if (document.hidden) {
        onAutoSave()
      }
    }
    document.addEventListener('visibilitychange', handler)
    return () => document.removeEventListener('visibilitychange', handler)
  }, [onAutoSave])

  // 3. React Router back/forward — show styled modal
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      currentLocation.pathname !== nextLocation.pathname
  )

  useEffect(() => {
    if (blocker.state === 'blocked') {
      onShowExitModal()
    }
  }, [blocker.state, onShowExitModal])

  return { blocker }
}
```

Integration in `GamePage`:

```tsx
const { blocker } = useGameGuard({
  onShowExitModal: () => setShowExitModal(true),
  onAutoSave: () => gameEventBus.emit(GameEvent.SAVE_GAME),
})
```

When user resolves the exit modal with "Save & Exit" or "Exit Without Saving", call `blocker.proceed()`. On "Cancel", call `blocker.reset()`.

---

## Phase 5: HUD Overlays (Future)

### Architecture

React components listen to `GameEvent.STATE_UPDATED` for periodic state snapshots from Phaser scenes. User actions (clicking an attack button, selecting an ability) emit events back to Phaser.

### 5a — Event contract for Battle HUD

| Direction | Event | Payload | Description |
|-----------|-------|---------|-------------|
| Phaser → React | `BATTLE_STARTED` | `{ enemyId, enemyName, enemyHp, enemyMaxHp, playerFamiliars }` | Battle begins |
| Phaser → React | `STATE_UPDATED` | `GameStateSnapshot` | Periodic tick (HP/MP changes, new log entries) |
| Phaser → React | `BATTLE_ENDED` | `{ outcome: 'victory'\|'defeat'\|'fled', rewards }` | Battle over |
| React → Phaser | `SAVE_GAME` | — | Save current state |
| React → Phaser | `PLAYER_ACTION` | `{ action: 'attack'\|'defend'\|'ability'\|'item'\|'swap'\|'run', payload?: any }` | Player battle input |
| React → Phaser | `EXIT_GAME` | — | Game is being torn down |

### 5b — Event contract for Exploration HUD

| Direction | Event | Payload | Description |
|-----------|-------|---------|-------------|
| Phaser → React | `STATE_UPDATED` | `GameStateSnapshot` (includes `areaName`, `roomName`, `familiarStates`, `roomLog`) | Current exploration state |
| Phaser → React | `SCENE_CHANGED` | `{ scene: 'exploration'\|'world_map'\|'party_select' }` | Scene transition |
| React → Phaser | `NAVIGATE_ROOM` | `{ direction: 'north'\|'south'\|'east'\|'west' }` | Room movement |
| React → Phaser | `COLLECT_TREASURE` | — | Take treasure |
| React → Phaser | `FLEE_ENCOUNTER` | — | Flee from enemy |
| React → Phaser | `START_BATTLE` | — | Engage enemy |

### 5c — HUD component structure (proposed)

```
components/Game/
├── GamePage.tsx            (existing)
├── GameToolbar.tsx         (existing)
├── ExitModal.tsx           (existing)
├── useGameGuard.ts         (existing)
├── hud/
│   ├── BattleHUD.tsx       (wraps all battle overlays)
│   ├── EnemyPanel.tsx      (enemy HP/MP bar, name, sprite area)
│   ├── PartyPanel.tsx      (player familiar HP/MP bars)
│   ├── ActionBar.tsx       (Attack, Defend, Ability, Item, Swap, Run)
│   ├── AbilityPanel.tsx    (modal: ability list with MP costs)
│   ├── ItemPanel.tsx       (modal: inventory items)
│   ├── BattleLog.tsx       (scrollable text log)
│   ├── BattleOutcome.tsx   (victory/defeat/fled overlay)
│   ├── ExplorationHUD.tsx  (wraps all exploration overlays)
│   ├── MiniMap.tsx         (room dots, player position, boss marker)
│   ├── RoomInfo.tsx        (room name, type badge, description)
│   └── RoomLog.tsx         (event history panel)
```

### 5d — Disabling Phaser-native UI

When a HUD overlay is active, the corresponding Phaser UI should be hidden to avoid duplication:

```ts
// In Phaser scene:
if (overlaysEnabled) {
  this.battleUI.setVisible(false) // hide Phaser UI, let React handle it
} else {
  this.battleUI.setVisible(true) // fallback: Phaser handles it
}
```

The Phaser game checks a flag (set via EventBus) to determine whether to render its own UI.

---

## Edge Case: Graceful Game Handling

| Scenario | Mechanism | Behavior |
|----------|-----------|----------|
| **Refresh / Tab close** | `window.beforeunload` | Browser-native prompt: "Leave? Progress may be lost." User choice. |
| **React Router back/forward** | `useBlocker` (react-router-dom v6) | Styled modal: "Save & Leave" / "Leave Without Saving" (with confirmation) / "Cancel". Navigation only after user decision. |
| **Browser tab switch** | `document.visibilitychange` | Auto-save via API when tab hidden. Silent resume on return. |
| **Browser crash** | N/A | Last auto-save is recovery point. Game loads latest state on startup. |
| **Save timeout** | 5s fallback timer | If save API hangs, exit proceeds anyway. User can always recover from last save. |
| **Double-mount (React StrictMode)** | Ref guard | `gameRef.current` check prevents creating two Phaser instances. |

---

## Files Changed: Complete Summary

| File | Action |
|------|--------|
| `game/package.json` | Rename to `@arcane-familiars/game` |
| `game/src/events.ts` | **New** — Event enums + state interfaces |
| `game/src/event-bus.ts` | **New** — Typed EventBus singleton |
| `game/src/index.ts` | **New** — Barrel export |
| `game/src/main.ts` | Refactor to export `createGame`/`destroyGame` + standalone guard |
| `game/src/scenes/BattleScene.ts` | Wire EventBus (SAVE_GAME, emit STATE_UPDATED) |
| `game/src/scenes/ExplorationScene.ts` | Wire EventBus (SAVE_GAME, emit STATE_UPDATED) |
| `game/src/scenes/WorldMapScene.ts` | Wire EventBus (SAVE_GAME, emit STATE_UPDATED) |
| `frontend/package.json` | Add `"@arcane-familiars/game": "*"` dep |
| `frontend/vite.config.ts` | Add `resolveGameAtAlias` plugin |
| `frontend/src/App.tsx` | Add `/play` route tree, redirect `/app/game` → `/play/game` |
| `frontend/src/components/layout/PlayLayout.tsx` | **New** — Nav-only layout for game pages |
| `frontend/src/components/layout/Nav.tsx` | Update "Play" link to `/play/game` |
| `frontend/src/components/layout/LandingPage.tsx` | Update Hero "Start Playing" link to `/play/game` |
| `frontend/src/components/Game/GameCanvas.tsx` | **Delete** — replaced by GamePage |
| `frontend/src/components/Game/GamePage.tsx` | **New** — mounts Phaser, toolbar, exit modal, game guard |
| `frontend/src/components/Game/GameToolbar.tsx` | **New** — top bar with Exit, title, Save |
| `frontend/src/components/Game/ExitModal.tsx` | **New** — styled exit dialog with confirmation |
| `frontend/src/components/Game/useGameGuard.ts` | **New** — beforeunload + blocker + visibility save |

---

## Implementation Order

```
Phase 1a ──── 1b ──── 1c ──── 1d ──── 1e
                                         │
Phase 2 ─────────────────────────────────┤
                                         │
Phase 3a ──── 3b ──── 3c ───────────────┤
                                         │
Phase 4a ──── 4b ──── 4c ──── 4d ──── 4e ──── 4f
                                         │
Phase 5 ─────────────────────────────────┘ (separate follow-up)
```

Each phase is gated on the previous. Phase 1-4 deliver a working game page with direct embedding, toolbar, and edge case handling. Phase 5 (HUD overlays) builds on the event bus foundation and is a separate, incremental effort.
