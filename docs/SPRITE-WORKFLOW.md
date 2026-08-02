# Sprite Generation Workflow

## Environment

- ComfyUI: `comfyui-cu126` podman container, http://localhost:8188
- Data dir: `/home/bigbrotha/Projects/graphics/graphics-model/ComfyUI`
- Checkpoint: `DreamShaperXL.safetensors`
- Custom nodes: `comfyui_ipadapter_plus`, `comfyui-rmbg`
- IPAdapter models: `models/ipadapter/ip-adapter-plus_sdxl_vit-h.safetensors`,
  `models/clip_vision/CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors`
- Restart container via `podman restart comfyui-cu126` only.

## Spritesheet spec

- Frame: 64x64. One spritesheet per animation, single horizontal row.
- Frames per anim: idle 4 / walk 6 / attack 4 / hurt 2 / die 4 / cast 4.
- Naming: `<entityId>_<anim>.png` (e.g. `yellowFighter_idle.png` = 256x64 for 4 frames).
- Phaser load: `this.load.spritesheet('yellowFighter_idle', 'assets/sprites/familiars/yellowFighter/yellowFighter_idle.png', { frameWidth: 64, frameHeight: 64 })`.

## Workflow (API format)

```json
{
  "1":  { "class_type": "LoadImage",              "inputs": { "image": "<reference>.png" } },
  "2":  { "class_type": "IPAdapterUnifiedLoader",  "inputs": { "model": ["5",0], "preset": "PLUS (high strength)" } },
  "3":  { "class_type": "IPAdapter",               "inputs": { "model": ["5",0], "ipadapter": ["2",1], "image": ["1",0], "weight": 0.65, "weight_type": "standard", "start_at": 0, "end_at": 1 } },
  "4":  { "class_type": "KSampler",                "inputs": { "model": ["3",0], "positive": ["11",0], "negative": ["12",0], "latent_image": ["8",0], "steps": 25, "cfg": 5.5, "sampler_name": "euler", "scheduler": "simple", "seed": 0, "denoise": 1 } },
  "5":  { "class_type": "CheckpointLoaderSimple",  "inputs": { "ckpt_name": "DreamShaperXL.safetensors" } },
  "8":  { "class_type": "EmptyLatentImage",        "inputs": { "width": 512, "height": 512, "batch_size": 1 } },
  "9":  { "class_type": "BiRefNetRMBG",            "inputs": { "image": ["10",0], "model": "BiRefNet-general", "background": "Alpha", "sensitivity": 1, "mask_blur": 0, "mask_offset": 0, "invert_output": false, "refine_foreground": false } },
  "10": { "class_type": "VAEDecode",               "inputs": { "samples": ["4",0], "vae": ["5",2] } },
  "11": { "class_type": "CLIPTextEncode",          "inputs": { "clip": ["5",1], "text": "<POSE_PROMPT>" } },
  "12": { "class_type": "CLIPTextEncode",          "inputs": { "clip": ["5",1], "text": "human, humanoid, person, costume, armor, helmet, blurry, low quality, deformed, cropped, head only, close-up, overlapping, multiple views, watermark, text, inconsistent colors, color bleeding, wrong colors" } },
  "13": { "class_type": "SaveImage",               "inputs": { "images": ["9",0], "filename_prefix": "<entityId>_<anim>_<frameN>" } }
}
```

### Wiring

```
5 (CheckpointLoader) ──output 0 (MODEL)──▶ 2 (IPAdapterUnifiedLoader, model)
5 (CheckpointLoader) ──output 0 (MODEL)──▶ 3 (IPAdapter, model)
5 (CheckpointLoader) ──output 2 (VAE)────▶ 10 (VAEDecode, vae)
2 (IPAdapterUnifiedLoader) ──output 1 (IPADAPTER dict)──▶ 3 (IPAdapter, ipadapter)
1 (LoadImage) ──output 0 (IMAGE)──▶ 3 (IPAdapter, image)
3 (IPAdapter) ──output 0 (MODEL)──▶ 4 (KSampler, model)
4 (KSampler) ──output 0 (LATENT)──▶ 10 (VAEDecode, samples)
10 (VAEDecode) ──output 0 (IMAGE)──▶ 9 (BiRefNetRMBG, image)
9 (BiRefNetRMBG) ──output 0 (IMAGE)──▶ 13 (SaveImage, images)
```

**CRITICAL:** IPAdapter `model` input comes from CheckpointLoader (node 5), NOT from IPAdapterUnifiedLoader.

## Prompts

### Base reference (one-time per creature)

```
Positive: "small {affinity} {creature_type} familiar, quadrupedal beast with {feature},
  {color_palette}, full body, centered, white background, game sprite style,
  magical creature, fierce but cute, chibi animal"
Negative: "human, humanoid, person, girl, boy, costume, armor, helmet, firefighter,
  blurry, low quality, deformed, ugly, watermark, text"
```

### Per-pose

```
Positive: "small {affinity} {creature_type} familiar, quadrupedal beast with {feature},
  {color_palette}, full body visible, {pose_description}, centered, white background,
  game sprite, magical creature"
Negative: "human, humanoid, person, costume, armor, helmet, blurry, low quality,
  deformed, cropped, head only, close-up, overlapping, multiple views, watermark, text,
  inconsistent colors, color bleeding, wrong colors"
```

### Creature designs

| ID | Affinity | Type | Features | Colors |
|----|----------|------|----------|--------|
| whiteDog | Light | celestial hound | glowing white fur, star-pattern markings | white, silver, gold |
| yellowFighter | Fire | flame fox | flame fur, ember eyes, fire tail | yellow, orange, red |
| aquaSprite | Water | water serpent | translucent scales, water droplets | blue, cyan, white |
| leafBunny | Earth | moss rabbit | leaf ears, vine tail, flower spots | green, brown, pink |
| sparkMouse | Wind | storm mouse | electric fur, spark trails, wing-ears | cyan, white, yellow |

### Pose prompts

| Anim | Frames | Pose descriptions |
|------|--------|-------------------|
| idle | 4 | `"standing still, neutral pose, facing forward"` / `"standing, slight head tilt"` / `"standing, tail flicking"` / `"standing, alert pose"` |
| walk | 6 | `"walking, left front paw forward"` / `"walking, mid-stride"` / `"walking, right front paw forward"` / `"walking, mid-stride opposite"` / `"walking, back paw pushing off"` / `"walking, about to plant front paw"` |
| attack | 4 | `"attacking, lunging forward, mouth open"` / `"attacking, fire breath"` / `"attacking, pouncing"` / `"attacking, claws extended"` |
| hurt | 2 | `"hurt pose, flinching, defensive"` / `"hurt pose, recoiling"` |
| die | 4 | `"falling down, defeated pose"` / `"collapsed, eyes closed"` / `"lying down, still"` / `"faded, translucent"` |
| cast | 4 | `"casting spell, arms raised, magical energy"` / `"casting, glowing aura"` / `"casting, energy beam"` / `"casting, summoning circle"` |

## Execution steps

### 1. Generate base reference

Run workflow with reference prompt. Output → stage as input for pose generations.

### 2. Generate pose frames

For each frame, run workflow with pose prompt. Change `filename_prefix` and `seed` per frame.
Move output after each generation:

```bash
mv graphics-model/ComfyUI/output/<filename>.png \
   game/public/assets/sprites/familiars/<entityId>/<entityId>_<anim>_<frameN>.png
```

### 3. Assemble spritesheet

```bash
cd game/public/assets/sprites/familiars/<entityId>

# Resize individual frames to 64x64 first (better quality)
for i in 0 1 2 3; do
  magick <entityId>_<anim>_$i.png -resize 64x64\! <entityId>_<anim>_${i}_64.png
done

# Assemble horizontal spritesheet
magick <entityId>_<anim>_0_64.png <entityId>_<anim>_1_64.png <entityId>_<anim>_2_64.png <entityId>_<anim>_3_64.png \
  +append <entityId>_<anim>.png

# Verify
identify <entityId>_<anim>.png
# Expected: PNG 256x64 for 4-frame anim, 384x64 for 6-frame walk
```

### 4. Verify in Phaser build

```bash
cd game && npm run type-check && npm run build
```

Confirm Vite copies `public/` → `dist/` and spritesheets load without errors.

---

## Video-Based Idle Animation Workflow

For idle animations, we generate a seamless looping video using LTX-2.3 with First-Last Frame (FLF) control, then extract frames to build the spritesheet. This produces more natural motion than individual pose generation.

### Environment

- **Model**: LTX-2.3 22B Q4_K_S GGUF (~12GB VRAM)
- **Resolution**: 384×384 → final 64×64 per frame
- **Duration**: 2 seconds @ 24fps = 49 frames
- **Loop**: First and last frames pinned to the reference pose (FLF strength 0.65)
- **Custom nodes**: ComfyUI-LTXVideo, ComfyUI-GGUF, ComfyUI-VideoHelperSuite, ComfyUI-RMBG

### Workflow

#### 1. Generate Video

Use the FLF workflow (`/tmp/flf_min2.json` or ComfyUI saved workflow) with:
- **Reference image**: The creature's main pose (e.g., `YellowFighter_Main.png`)
- **Prompt**: "dynamic idle animation, gentle breathing, subtle weight shift, tail sway, ear twitch, floating embers, front-facing, stable camera, seamless loop, clean full body view, character moves naturally"
- **FLF strength**: 0.65 (allows motion while anchoring loop seam)

The workflow outputs an h264 MP4 video with the animation loop.

#### 2. Extract and Select Frames

Extract all frames from the video, then select N frames based on motion peaks:

```bash
# Extract all frames
ffmpeg -i video.mp4 frames/f_%03d.png

# Analyze motion and select frames
python3 scripts/select-motion-frames.py frames/ --count 12
```

The script computes pairwise MAE between consecutive frames and selects frames at motion peaks (local maxima in the motion curve). This captures the full animation cycle rather than arbitrary intervals.

#### 3. Remove Backgrounds

Upload selected frames to ComfyUI and run BiRefNet background removal:

```bash
# Upload frames (via ComfyUI API or UI)
# Run remove_background workflow on each frame
# Output: transparent PNG cutouts
```

#### 4. Assemble Spritesheet

```bash
python3 scripts/assemble-spritesheet.py \
  --input cutouts/ \
  --output yellowFighter_idle.png \
  --frame-size 64
```

The script:
- Trims each cutout to alpha bounds
- Scales proportionally to fit within frame size
- Centers on transparent canvas
- Concatenates horizontally

#### 5. Generate Preview

```bash
bash scripts/generate-preview.sh yellowFighter_idle.png preview.gif
```

Creates an animated GIF for visual review.

### Frame Count Guidelines

- **4 frames**: Minimal, subtle motion (MAE 8-28 between frames)
- **8 frames**: Good balance, captures breathing/sway
- **12 frames**: Smooth, full motion cycle (recommended for idle)
- **16+ frames**: Very smooth, but larger spritesheet

### Troubleshooting

**Video too static**: Reduce FLF strength (0.65 → 0.5) or strengthen prompt with motion keywords.

**OOM errors**: Reduce resolution (384 → 320) or duration (2s → 1.5s). The 22B model requires ~12GB VRAM minimum.

**Loop seam visible**: The FLF node pins first/last frames but h264 compression introduces drift. Acceptable MAE < 6 for seamless loop at 64×64.

**Background removal artifacts**: BiRefNet may capture semi-transparent halos. Check alpha distribution; 1-2% halo pixels is acceptable.

### Scripts

All helper scripts are in `scripts/`:

- `select-motion-frames.py` - Analyze video frames and select based on motion peaks
- `assemble-spritesheet.py` - Build spritesheet from transparent cutouts
- `generate-preview.sh` - Create animated GIF preview
- `extract-frames.sh` - Extract all frames from video

### Example: Yellow Fighter Idle

```bash
# 1. Generate video via ComfyUI (FLF workflow)
# Output: LTX2_00001.mp4 (49 frames, 384×384, 2s)

# 2. Extract and select 12 frames
bash scripts/extract-frames.sh LTX2_00001.mp4 frames/
python3 scripts/select-motion-frames.py frames/ --count 12 --output selected/

# 3. Remove backgrounds (via ComfyUI)
# Upload selected/ frames, run remove_background, save to cutouts/

# 4. Assemble spritesheet
python3 scripts/assemble-spritesheet.py \
  --input cutouts/ \
  --output game/public/assets/sprites/familiars/yellowFighter/idle2/yellowFighter_idle_video.png \
  --frame-size 64

# 5. Preview
bash scripts/generate-preview.sh \
  game/public/assets/sprites/familiars/yellowFighter/idle2/yellowFighter_idle_video.png \
  preview.gif
```

Result: 768×64 spritesheet (12 frames × 64px) with transparent backgrounds.
