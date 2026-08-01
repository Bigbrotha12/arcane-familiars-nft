# Game Asset Pipeline — Placeholder Assets via ComfyUI

> **Status:** Deferred — plan only, implementation on hold.
> **Approach:** All placeholder art generated via ComfyUI MCP + ImageMagick (deterministic
> layout/assembly). No Python tooling. No git commits (worktree on `step-1-2-game-integration`
> is dirty with unrelated in-progress work; versioning left to the developer).
> **Date:** 2026-07-31

## Goal

Create a logical asset directory structure under `game/public/assets/` for sprites
(familiars, enemies, NPCs), scenes, rooms, tilesets, UI, effects, items, audio, and
fonts — populated with ComfyUI-generated placeholder images that are immediately usable
in the Phaser pipeline (correct spritesheet geometry, correct scene/room sizes).

## Environment

- Game: Phaser 4 + Vite + TypeScript, `game/`, 800x600 canvas.
- ComfyUI 0.27.1 in podman container `comfyui-cu126` (http://localhost:8188),
  data dir `/home/bigbrotha/Projects/graphics/graphics-model/ComfyUI`.
  Container lifecycle is owned by podman — never use the MCP stop/start/restart tools.
- Checkpoints available: `DreamShaperXL.safetensors` (SDXL — chosen for all art),
  `SD1.5/dreamshaper_8.safetensors`, `anythingelseV4_v45.safetensors`.
- Custom nodes currently installed: only ComfyUI-Manager.
- Existing saved workflows: `Text-To-Image Simple.json`, `Image-Edit Qwen.json`,
  `Logo Text-To-Image Simple.json`.
- ImageMagick 7 (`convert`/`magick`) available for assembly. Python present but NOT used.

## Directory structure

```
game/public/assets/
├── README.md            # conventions: naming, spritesheet spec, affinity colors, Phaser load patterns
├── PROMPTS.md           # reproducibility: asset → prompt → source ComfyUI output file (written during gen)
├── sprites/
│   ├── familiars/
│   │   ├── whiteDog/        # Light
│   │   ├── yellowFighter/   # Fire
│   │   ├── aquaSprite/      # Water
│   │   ├── leafBunny/       # Earth
│   │   ├── sparkMouse/      # Wind
│   │   └── bosses/
│   │       ├── meadowGuardian/
│   │       ├── caveWarden/
│   │       └── shadowLord/
│   │       # each familiar dir: <id>_idle/_walk/_attack/_hurt/_die/_cast.png + <id>_portrait.png
│   ├── enemies/            # tideTurtle/, shadowCat/ (idle, attack)
│   ├── npcs/               # npc_general/
│   ├── effects/            # sparkle particle, hit flash
│   ├── items/              # potion, ether, coin
│   └── ui/
│       ├── buttons/        # default, hover, disabled
│       ├── panels/
│       ├── badges/         # affinity badges (6)
│       └── icons/          # hp bar, mp bar
├── scenes/                # 800x600 backgrounds
│   ├── world-map.png
│   ├── party-select.png
│   ├── dungeon-fail.png
│   ├── battle/            # verdant-meadow, crystal-caves, shadow-forest
│   └── exploration/       # verdant-meadow, crystal-caves, shadow-forest
├── rooms/                 # 800x600 interiors
│   ├── verdant-meadow/    # room-01..03.png
│   ├── crystal-caves/     # room-01..03.png
│   └── shadow-forest/     # room-01..03.png
├── tilesets/              # dungeon-tiles.png (exact 8x4 grid of 32px tiles)
├── audio/music/           # empty, tracked via .gitkeep
├── audio/sfx/             # empty, tracked via .gitkeep
└── fonts/                 # empty, tracked via .gitkeep
```

### Spritesheet spec

- Frame size: **64x64** (documented in README; real art may raise this later).
- One spritesheet per animation, single row of frames:
  idle 4f / walk 6f / attack 4f / hurt 2f / die 4f / cast 4f.
- Naming: `<entityId>_<anim>.png` (snake_case ids matching `packages/game-logic`).
- Phaser loading: `this.load.spritesheet('whiteDog_idle', 'assets/sprites/familiars/whiteDog/whiteDog_idle.png', { frameWidth: 64, frameHeight: 64 })`.

### Affinity colors (from DESIGN.md / GAME-IMPLEMENTATION.md)

Light `#FBBF24`, Dark `#7C5CFC`, Fire `#F97316`, Water `#3B82F6`, Earth `#10B981`, Wind `#22D3EE`.

### Familiar roster

| ID | Affinity | Role |
|----|----------|------|
| whiteDog | Light | starter |
| yellowFighter | Fire | starter |
| aquaSprite | Water | starter |
| leafBunny | Earth | starter |
| sparkMouse | Wind | starter |
| meadowGuardian | Light | boss (Verdant Meadow) |
| caveWarden | Water | boss (Crystal Caves) |
| shadowLord | Dark | boss (Shadow Forest) |
| tideTurtle | Water | enemy (Crystal Caves) |
| shadowCat | Dark | enemy (Shadow Forest) |
| npc_general | — | NPC placeholder |

Areas: Verdant Meadow (green), Crystal Caves (icy blue), Shadow Forest (deep indigo).

## ComfyUI prep — division of labor

### Developer (ComfyUI workflow adjustments)

1. Install node pack **`ComfyUI_IPAdapter_plus`** (git `cubiq/ComfyUI_IPAdapter_plus`).
2. Build + save a workflow as **`Sprite Pose Generator.json`**:
   - `LoadImage` — base-character reference (square).
   - `IPAdapterUnifiedLoader` (preset "PLUS (high strength)") → `IPAdapter` (weight ~0.6–0.8)
     → positive conditioning of the KSampler.
   - `CheckpointLoaderSimple` **DreamShaperXL** → KSampler (steps ~25, cfg ~5.5,
     euler or dpmpp_2m), square canvas (e.g. 768x768).
   - Optional: `BiRefNetRMBG` → `SaveImage` for transparent output.
3. Restart the container after installing the pack (`podman restart comfyui-cu126`), or ask the agent to.

### Agent

1. Install **`ComfyUI-RMBG`** (registry `comfyui-rmbg`) via MCP, then
   `podman restart comfyui-cu126` (podman owns lifecycle — never the MCP restart tool),
   verify `BiRefNetRMBG` loads. BiRefNet model auto-downloads on first use.
2. Download Path-B models via `download_model` (HuggingFace `h94/IP-Adapter`):
   - `sdxl_models/ip-adapter-plus_sdxl_vit-h.safetensors` → `models/ipadapter/`
   - `models/image_encoder/model.safetensors` →
     `models/clip_vision/CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors`
3. Generate the 11 base character renders (DreamShaperXL, solid flat background) and
   stage them into ComfyUI's input dir for the `LoadImage` reference.

Fallback pose path (zero installs): adapt `Image-Edit Qwen.json` — swap `LoadImage`
reference, set per-pose edit instruction in `TextEncodeQwenImageEditPlus`, save as
`Sprite Pose Generator.json`. Lower quality/consistency than IP-Adapter.

## Steps (each: surveyor → implement → code-reviewer)

1. **Directory structure** — tree above + `README.md` + `.gitkeep`. Pure file creation, no ComfyUI.
2. **Creature sprites** — per creature: 1 base render (reference/portrait/idle frames) +
   4 walk poses + 4 attack poses = 9 generations x 11 creatures ≈ 99 gens (batchable,
   ~30–50 min GPU). `hurt/die/cast` assembled as static placeholders. Assembly via
   ImageMagick: transparency (RMBG or chroma-key `-fuzz -transparent`) → trim/scale to
   64x64 → `+append` → `<id>_<anim>.png`. `PROMPTS.md` records asset → prompt → output file.
3. **Scenes, rooms, tileset** — ~19 background gens at 768x576 (4:3, SDXL-safe 64-multiple)
   → resize to 800x600; tile motifs → exact 8x4 grid of 32px tiles.
4. **UI, effects, items** — ~10 gens (buttons, panel, badges, hp/mp bars, sparkle, hit
   flash, potion, ether, coin) + resize.
5. **Verify** — `identify` all PNGs (dimensions, spritesheet grid math), `npm run
   type-check` + `npm run build` in `game/`, confirm Vite copies `public/` → `dist/`.

## Constraints

- No Python tooling anywhere.
- No git commits; leave the `step-1-2-game-integration` worktree untouched.
- Single checkpoint (DreamShaperXL) for all art — no `clear_vram` needed between runs.
- Container restart only via `podman restart comfyui-cu126`.
