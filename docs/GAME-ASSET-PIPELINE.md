# Game Asset Pipeline — Placeholder Assets via ComfyUI

> **Status:** In Progress — workflow verified, test sprite generated.
> **Approach:** All placeholder art generated via ComfyUI MCP + ImageMagick (deterministic
> layout/assembly). No Python tooling. No git commits (worktree on `step-1-2-game-integration`
> is dirty with unrelated in-progress work; versioning left to the developer).
> **Date:** 2026-07-31 (updated 2026-08-01)

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
- Custom nodes installed: ComfyUI-Manager, `comfyui_ipadapter_plus` v2.0.0,
  `comfyui-rmbg` v3.1.0.
- Saved workflows: `Text-To-Image Simple.json`, `Image-Edit Qwen.json`,
  `Logo Text-To-Image Simple.json`, `Sprite Pose Generator.json`.
- IPAdapter models downloaded: `ip-adapter-plus_sdxl_vit-h.safetensors` (models/ipadapter/),
  `CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors` (models/clip_vision/).
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
   - `IPAdapterUnifiedLoader` (preset "PLUS (high strength)") — outputs: 0=MODEL, 1=IPADAPTER dict.
   - `IPAdapter` — inputs: `model` from CheckpointLoaderSimple (output 0), `ipadapter` from
     IPAdapterUnifiedLoader (output 1), `image` from LoadImage. Weight ~0.6–0.8.
   - `CheckpointLoaderSimple` **DreamShaperXL** → KSampler (steps ~25, cfg ~5.5,
     euler or dpmpp_2m), square canvas (e.g. 768x768).
   - `BiRefNetRMBG` → `SaveImage` for transparent output.
3. Restart the container after installing the pack (`podman restart comfyui-cu126`), or ask the agent to.

### Agent

1. ~~Install **`ComfyUI-RMBG`** (registry `comfyui-rmbg`) via MCP~~ — DONE
2. ~~Download IPAdapter models via `download_model`~~ — DONE
   - `sdxl_models/ip-adapter-plus_sdxl_vit-h.safetensors` → `models/ipadapter/`
   - `models/image_encoder/model.safetensors` →
     `models/clip_vision/CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors`
3. Generate the 11 base character renders (DreamShaperXL, solid flat background) and
   stage them into ComfyUI's input dir for the `LoadImage` reference.

### Workflow wiring (corrected)

The IPAdapterUnifiedLoader has **two outputs** that must be wired correctly:
- Output 0 (MODEL): feeds into IPAdapter's `model` input
- Output 1 (IPADAPTER dict): feeds into IPAdapter's `ipadapter` input

**CRITICAL:** The IPAdapter node's `model` input must come from the **CheckpointLoaderSimple**
(output 0), NOT from the IPAdapterUnifiedLoader. The IPAdapterUnifiedLoader output 0 is a
patched model that already has IPAdapter applied — connecting it again causes errors.

Correct wiring:
```
CheckpointLoaderSimple (output 0: MODEL) → IPAdapter (model input)
IPAdapterUnifiedLoader (output 1: IPADAPTER) → IPAdapter (ipadapter input)
LoadImage (output 0: IMAGE) → IPAdapter (image input)
IPAdapter (output 0: MODEL) → KSampler (model input)
```

### Approach A: Individual Pose Generation (Recommended)

Generate each pose separately for consistent framing and quality, then assemble with ImageMagick.

**Workflow settings:**
- Canvas: 512x512 per pose (smaller, faster, consistent framing)
- IPAdapter weight: 0.65 (allows pose variation while maintaining character)
- Steps: 25, CFG: 5.5, Sampler: euler, Scheduler: simple
- Background removal: BiRefNetRMBG (auto-downloads on first use)

**Prompt template:**
```
Positive: "small {affinity} {creature_type} familiar, quadrupedal beast with {feature},
  {color_palette}, full body visible, {pose_description}, centered, white background,
  game sprite, magical creature"

Negative: "human, humanoid, person, costume, armor, helmet, blurry, low quality,
  deformed, cropped, head only, close-up, overlapping, multiple views, watermark, text"
```

**Pose descriptions:**
| Animation | Frames | Pose Prompt |
|-----------|--------|-------------|
| idle | 4 | `"standing still, neutral pose, facing forward"` / `"standing, slight head tilt"` / `"standing, tail flicking"` / `"standing, alert pose"` |
| walk | 4-6 | `"walking, left front paw forward"` / `"walking, mid-stride"` / `"walking, right front paw forward"` / `"walking, mid-stride opposite"` |
| attack | 4 | `"attacking, lunging forward, mouth open"` / `"attacking, fire breath"` / `"attacking, pouncing"` / `"attacking, claws extended"` |
| hurt | 2 | `"hurt pose, flinching, defensive"` / `"hurt pose, recoiling"` |
| die | 4 | `"falling down, defeated pose"` / `"collapsed, eyes closed"` / `"lying down, still"` / `"faded, translucent"` |
| cast | 4 | `"casting spell, arms raised, magical energy"` / `"casting, glowing aura"` / `"casting, energy beam"` / `"casting, summoning circle"` |

**File naming:** `<entityId>_<anim>_<frameN>.png` (e.g., `yellowFighter_idle_0.png`)

**Post-generation file movement:**
```bash
mv <COMFYUI_OUTPUT_DIR>/<filename>.png \
   game/public/assets/sprites/familiars/<entityId>/<entityId>_<anim>_<frameN>.png
```

**Final assembly (ImageMagick, after all frames generated):**
```bash
# Create spritesheet from individual frames (horizontal layout)
magick yellowFighter_idle_0.png yellowFighter_idle_1.png yellowFighter_idle_2.png yellowFighter_idle_3.png \
  +append yellowFighter_idle.png

# Resize to 64x64 frames for Phaser (4 frames = 256x64 spritesheet)
magick yellowFighter_idle.png -resize 256x64\! yellowFighter_idle_64.png

# Or resize individual frames first, then assemble (better quality)
for i in 0 1 2 3; do
  magick yellowFighter_idle_$i.png -resize 64x64\! yellowFighter_idle_${i}_64.png
done
magick yellowFighter_idle_0_64.png yellowFighter_idle_1_64.png yellowFighter_idle_2_64.png yellowFighter_idle_3_64.png \
  +append yellowFighter_idle_64.png
```

**Production notes:**
- Generate at 512x512 for quality, resize to 64x64 for final spritesheet
- Use `-resize 64x64\!` (with `!`) to force exact dimensions (ignores aspect ratio)
- Individual frame resize before assembly gives better quality than resizing the full spritesheet
- Final Phaser spritesheet: 256x64 for 4-frame idle animation

### Post-generation file movement (legacy multi-pose approach)

After each successful generation, move the output file to the project's sprite directory:
```bash
mv <COMFYUI_OUTPUT_DIR>/<filename>.png \
   game/public/assets/sprites/familiars/<entityId>/<entityId>_<anim>.png
```

Example:
```bash
mv graphics-model/ComfyUI/output/yellowFighter_walk_00001_.png \
   game/public/assets/sprites/familiars/yellowFighter/yellowFighter_walk.png
```

Naming convention: `<entityId>_<anim>.png` (snake_case, matching `packages/game-logic`).

Fallback pose path (zero installs): adapt `Image-Edit Qwen.json` — swap `LoadImage`
reference, set per-pose edit instruction in `TextEncodeQwenImageEditPlus`, save as
`Sprite Pose Generator.json`. Lower quality/consistency than IP-Adapter.

## Verification log

- **2026-08-01:** Custom nodes installed (IPAdapter Plus v2.0.0, RMBG v3.1.0).
- **2026-08-01:** IPAdapter models downloaded (~4.5GB total).
- **2026-08-01:** Workflow wiring corrected — IPAdapterUnifiedLoader output 1 (IPADAPTER dict)
  must feed IPAdapter's `ipadapter` input; CheckpointLoader output 0 (MODEL) feeds IPAdapter's
  `model` input.
- **2026-08-01:** Test sprite generated — `yellowFighter_walk.png` (768x768, transparent BG).
  File moved to `game/public/assets/sprites/familiars/yellowFighter/yellowFighter_walk.png`.
- **2026-08-01:** Approach A tested — individual pose generation with 512x512 canvas.
  - Base reference: flame-furred fox creature (not humanoid)
  - Idle pose: `yellowFighter_idle_0.png` (512x512, transparent BG, full body visible)
  - IPAdapter weight 0.65 maintains character consistency while allowing pose variation
  - File moved to `game/public/assets/sprites/familiars/yellowFighter/yellowFighter_idle_0.png`
- **2026-08-01:** Idle animation test complete — 4 frames generated + assembled into spritesheet.
  - Frames: `yellowFighter_idle_0.png` through `yellowFighter_idle_3.png` (512x512 each)
  - Spritesheet: `yellowFighter_idle.png` (2048x512, 4 frames horizontal)
  - Resized for Phaser: `yellowFighter_idle_64.png` (256x64, 4 × 64x64 frames)
  - Result: Consistent character design, full body visible, transparent BG, subtle pose variations
  - Minor issue: Frame 3 has blue/white artifacts on ears (prompt "alert pose" introduced unexpected colors)
  - Workflow adjustment: Add "inconsistent colors, color bleeding" to negative prompt
  - **Workflow validated:** Approach A works for production. Ready to generate all 11 familiars.

## Steps (each: surveyor → implement → code-reviewer)

1. **Directory structure** — tree above + `README.md` + `.gitkeep`. Pure file creation, no ComfyUI.
2. **Creature sprites** — per creature: 1 base render (reference) + individual pose generations
   using IPAdapter (Approach A). Assembly via ImageMagick: `+append` frames → `<id>_<anim>.png`.
   - **Design requirement:** Familiars are magical creatures (quadrupedal beasts), NOT humanoid.
     Use creature-focused prompts: "quadrupedal beast with flame fur", "small fire creature", etc.
     Negative prompt must exclude: "human, humanoid, person, costume, armor, helmet".
   - **Test completed:** yellowFighter idle frame (Approach A, 512x512, transparent BG).
     Reference: flame-furred fox creature. Output: `yellowFighter_idle_0.png`.
3. **Scenes, rooms, tileset** — ~19 background gens at 768x576 (4:3, SDXL-safe 64-multiple)
   → resize to 800x600; tile motifs → exact 8x4 grid of 32px tiles.
4. **UI, effects, items** — ~10 gens (buttons, panel, badges, hp/mp bars, sparkle, hit
   flash, potion, ether, coin) + resize.
5. **Verify** — `identify` all PNGs (dimensions, spritesheet grid math), `npm run
   type-check` + `npm run build` in `game/`, confirm Vite copies `public/` → `dist/`.

## Reference: Sprite Pose Generator workflow (API format)

### Approach A: Individual Pose Generation (512x512 canvas)

```json
{
  "1": { "class_type": "LoadImage", "inputs": { "image": "reference.png" } },
  "2": { "class_type": "IPAdapterUnifiedLoader", "inputs": {
    "model": ["5", 0], "preset": "PLUS (high strength)"
  }},
  "3": { "class_type": "IPAdapter", "inputs": {
    "end_at": 1, "image": ["1", 0], "ipadapter": ["2", 1],
    "model": ["5", 0], "start_at": 0, "weight": 0.65, "weight_type": "standard"
  }},
  "4": { "class_type": "KSampler", "inputs": {
    "cfg": 5.5, "denoise": 1, "latent_image": ["8", 0], "model": ["3", 0],
    "negative": ["12", 0], "positive": ["11", 0],
    "sampler_name": "euler", "scheduler": "simple", "seed": 0, "steps": 25
  }},
  "5": { "class_type": "CheckpointLoaderSimple", "inputs": {
    "ckpt_name": "DreamShaperXL.safetensors"
  }},
  "8": { "class_type": "EmptyLatentImage", "inputs": {
    "batch_size": 1, "height": 512, "width": 512
  }},
  "9": { "class_type": "BiRefNetRMBG", "inputs": {
    "background": "Alpha", "image": ["10", 0], "invert_output": false,
    "mask_blur": 0, "mask_offset": 0, "model": "BiRefNet-general",
    "refine_foreground": false, "sensitivity": 1
  }},
  "10": { "class_type": "VAEDecode", "inputs": {
    "samples": ["4", 0], "vae": ["5", 2]
  }},
  "11": { "class_type": "CLIPTextEncode", "inputs": {
    "clip": ["5", 1], "text": "<pose prompt>"
  }},
  "12": { "class_type": "CLIPTextEncode", "inputs": {
    "clip": ["5", 1], "text": "human, humanoid, person, costume, armor, helmet, blurry, low quality, deformed, cropped, head only, close-up, overlapping, multiple views, watermark, text, inconsistent colors, color bleeding, wrong colors"
  }},
  "13": { "class_type": "SaveImage", "inputs": {
    "filename_prefix": "<entityId>_<anim>_<frameN>", "images": ["9", 0]
  }}
}
```

**Node connections summary:**
- Node 5 (CheckpointLoader) → Node 2 (IPAdapterUnifiedLoader, model input)
- Node 5 (CheckpointLoader) → Node 3 (IPAdapter, model input)
- Node 2 (IPAdapterUnifiedLoader, output 1) → Node 3 (IPAdapter, ipadapter input)
- Node 1 (LoadImage) → Node 3 (IPAdapter, image input)
- Node 3 (IPAdapter) → Node 4 (KSampler, model input)
- Node 4 (KSampler) → Node 10 (VAEDecode, samples input)
- Node 5 (CheckpointLoader, output 2) → Node 10 (VAEDecode, vae input)
- Node 10 (VAEDecode) → Node 9 (BiRefNetRMBG, image input)
- Node 9 (BiRefNetRMBG) → Node 13 (SaveImage, images input)

### Prompt templates

**Base reference (one-time per creature):**
```
Positive: "small {affinity} {creature_type} familiar, quadrupedal beast with {feature},
  {color_palette}, full body, centered, white background, game sprite style,
  magical creature, fierce but cute, chibi animal"
Negative: "human, humanoid, person, girl, boy, costume, armor, helmet, firefighter,
  blurry, low quality, deformed, ugly, watermark, text"
```

**Per-pose generation:**
```
Positive: "small {affinity} {creature_type} familiar, quadrupedal beast with {feature},
  {color_palette}, full body visible, {pose_description}, centered, white background,
  game sprite, magical creature"
Negative: "human, humanoid, person, costume, armor, helmet, blurry, low quality,
  deformed, cropped, head only, close-up, overlapping, multiple views, watermark, text,
  inconsistent colors, color bleeding, wrong colors"
```

**Creature design examples:**
| Entity ID | Affinity | Creature Type | Features | Colors |
|-----------|----------|---------------|----------|--------|
| whiteDog | Light | celestial hound | glowing white fur, star-pattern markings | white, silver, gold |
| yellowFighter | Fire | flame fox | flame fur, ember eyes, fire tail | yellow, orange, red |
| aquaSprite | Water | water serpent | translucent scales, water droplets | blue, cyan, white |
| leafBunny | Earth | moss rabbit | leaf ears, vine tail, flower spots | green, brown, pink |
| sparkMouse | Wind | storm mouse | electric fur, spark trails, wing-ears | cyan, white, yellow |

## Constraints

- No Python tooling anywhere.
- No git commits; leave the `step-1-2-game-integration` worktree untouched.
- Single checkpoint (DreamShaperXL) for all art — no `clear_vram` needed between runs.
- Container restart only via `podman restart comfyui-cu126`.
