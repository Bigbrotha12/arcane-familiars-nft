# Asset Generation Prompts

> **Purpose:** Reproducibility log — every generated asset maps to its prompt, seed, workflow settings,
> and source ComfyUI output file. Re-run any asset by feeding the recorded prompt + seed back through
> the workflow below.
>
> **Status:** Portraits for all 10 familiars generated 2026-08-15 via ComfyUI MCP + ImageMagick.
> **Date:** 2026-08-15
>
> **2026-08-15 (update):** `leafBunny` portrait regenerated (original output had three bunnies in a
> spritesheet layout); 9 room backgrounds added (3 per area). See **LeafBunny Regeneration** and
> **Room Backgrounds** sections below.

## Environment

- ComfyUI 0.27.1 (podman container `comfyui-cu126`, http://localhost:8188), data dir
  `/home/bigbrotha/Projects/graphics/graphics-model/ComfyUI`.
- Checkpoint: `DreamShaperXL.safetensors` (SDXL).
- Custom nodes: `comfyui_ipadapter_plus`, `comfyui-rmbg` (BiRefNetRMBG).
- Workflow: direct txt2img (no IPAdapter — single portrait per creature, no cross-frame consistency needed)
  → BiRefNetRMBG for transparent cutout.
- Assembly: ImageMagick (`magick`).

## Workflow settings (all portraits)

- Canvas: **512x512**
- Steps: **25**, CFG: **5.5**, Sampler: **euler**, Scheduler: **simple**, denoise: **1**
- Seed: per-creature (below)
- Post-gen: BiRefNetRMBG (model `BiRefNet-general`, background `Alpha`, sensitivity 1)
- Final: resized to **256x256** transparent PNG, named `<id>_portrait.png`

### Shared negative prompt

```
human, humanoid, person, costume, armor, helmet, firefighter, blurry, low quality, deformed, ugly, watermark, text, inconsistent colors, color bleeding, wrong colors, multiple views, cropped
```

## Creatures

### Starters

| ID | Affinity | Seed | Prompt |
|----|----------|------|--------|
| whiteDog | Light | 1000 | `small Light celestial hound familiar, quadrupedal beast with glowing white fur, star-pattern markings, white, silver, gold, full body visible, centered, white background, game sprite, magical creature, fierce but cute, chibi animal, clean vector style game art, front facing portrait` |
| yellowFighter | Fire | 1137 | `small Fire flame fox familiar, quadrupedal beast with flame fur, ember eyes, fire tail, yellow, orange, red, full body visible, centered, white background, game sprite, magical creature, fierce but cute, chibi animal, clean vector style game art, front facing portrait` |
| aquaSprite | Water | 1274 | `small Water water serpent familiar, quadrupedal beast with translucent scales, water droplets, blue, cyan, white, full body visible, centered, white background, game sprite, magical creature, fierce but cute, chibi animal, clean vector style game art, front facing portrait` |
| leafBunny | Earth | 1411 | `small Earth moss rabbit familiar, quadrupedal beast with leaf ears, vine tail, flower spots, green, brown, pink, full body visible, centered, white background, game sprite, magical creature, fierce but cute, chibi animal, clean vector style game art, front facing portrait` |
| sparkMouse | Wind | 1548 | `small Wind storm mouse familiar, quadrupedal beast with electric fur, spark trails, wing-ears, cyan, white, yellow, full body visible, centered, white background, game sprite, magical creature, fierce but cute, chibi animal, clean vector style game art, front facing portrait` |

### Enemies

| ID | Affinity | Seed | Prompt |
|----|----------|------|--------|
| tideTurtle | Water | 1685 | `small Water tide turtle familiar, quadrupedal beast with sturdy shell with tide marks, gentle eyes, teal, blue, cream, full body visible, centered, white background, game sprite, magical creature, fierce but cute, chibi animal, clean vector style game art, front facing portrait` |
| shadowCat | Dark | 1822 | `small Dark shadow cat familiar, quadrupedal beast with wispy shadow fur, glowing eyes, elongated tail, deep purple, black, violet, full body visible, centered, white background, game sprite, magical creature, fierce but cute, chibi animal, clean vector style game art, front facing portrait` |

### Bosses

| ID | Affinity | Seed | Prompt |
|----|----------|------|--------|
| meadowGuardian | Light | 1959 | `majestic Light ancient stag guardian familiar, mossy antlers with blooming flowers, glowing aura, white, gold, soft green, full body visible, centered, white background, game sprite, legendary magical creature, imposing yet appealing, clean vector style game art, front facing portrait` |
| caveWarden | Water | 2096 | `majestic Water crystal-armored warden familiar, translucent crystal armor, gem-like scales, glowing core, icy blue, cyan, crystal white, full body visible, centered, white background, game sprite, legendary magical creature, imposing yet appealing, clean vector style game art, front facing portrait` |
| shadowLord | Dark | 2233 | `majestic Dark shadow lord beast familiar, flowing shadow mane, burning violet eyes, dark crown of mist, deep indigo, black, violet, full body visible, centered, white background, game sprite, legendary magical creature, imposing yet appealing, clean vector style game art, front facing portrait` |

## Output file mapping

Each asset's source render (512x512, before resize):

| Asset | Source ComfyUI output |
|-------|----------------------|
| `whiteDog/whiteDog_portrait.png` | `ComfyUI/output/whiteDog_portrait_00001_.png` |
| `yellowFighter/yellowFighter_portrait.png` | `ComfyUI/output/yellowFighter_portrait_00001_.png` |
| `aquaSprite/aquaSprite_portrait.png` | `ComfyUI/output/aquaSprite_portrait_00001_.png` |
| `leafBunny/leafBunny_portrait.png` | `ComfyUI/output/leafBunny_portrait_00001_.png` |
| `sparkMouse/sparkMouse_portrait.png` | `ComfyUI/output/sparkMouse_portrait_00001_.png` |
| `tideTurtle/tideTurtle_portrait.png` | `ComfyUI/output/tideTurtle_portrait_00001_.png` |
| `shadowCat/shadowCat_portrait.png` | `ComfyUI/output/shadowCat_portrait_00001_.png` |
| `meadowGuardian/meadowGuardian_portrait.png` | `ComfyUI/output/meadowGuardian_portrait_00001_.png` |
| `caveWarden/caveWarden_portrait.png` | `ComfyUI/output/caveWarden_portrait_00001_.png` |
| `shadowLord/shadowLord_portrait.png` | `ComfyUI/output/shadowLord_portrait_00001_.png` |

## Repro recipe

To regenerate one asset exactly: build the workflow with the creature's prompt, the shared negative
prompt, `seed` = the creature's seed, and the settings above. Save via `SaveImage` with
`filename_prefix` = `<id>_portrait`; then:

```bash
magick <id>_portrait_00001_.png -resize 256x256 \
  game/public/assets/sprites/familiars/<id>/<id>_portrait.png
```

---

## LeafBunny Regeneration (2026-08-15)

Original `leafBunny` render (seed 1411) produced three bunnies in a spritesheet layout instead of a
single centered character. Regenerated with an anti-duplication prompt and stronger negative.

### Workflow settings (leafBunny only)

- Canvas: **512x512**, Steps: **28**, CFG: **6.0**, Sampler: **euler**, Scheduler: **simple**, denoise: **1**
- Seed: **8844**
- Post-gen: BiRefNetRMBG (`BiRefNet-general`, background `Alpha`, sensitivity 1)
- Final: resized to **256x256** transparent PNG

### Positive prompt

```
single small Earth moss rabbit familiar, exactly one rabbit, one lone magical creature standing alone,
quadrupedal beast with leaf ears, vine tail, flower spots, green, brown, pink, full body visible,
centered, white background, game sprite, magical creature, fierce but cute, chibi animal, clean vector
style game art, front facing portrait
```

### Negative prompt (leafBunny only — extended)

```
human, humanoid, person, costume, armor, helmet, firefighter, blurry, low quality, deformed, ugly,
watermark, text, inconsistent colors, color bleeding, wrong colors, multiple views, cropped, multiple
animals, multiple rabbits, two animals, three animals, group of animals, spritesheet, duplicated character
```

### Source files

| Asset | Source ComfyUI output |
|-------|----------------------|
| `leafBunny/leafBunny_portrait.png` | `ComfyUI/output/leafBunny_portrait_00257_.png` (512x512, before resize) |

---

## Room Backgrounds (2026-08-15)

9 room interiors (3 per area), generated as full scenes — no background removal (opaque 768x576).

### Workflow settings (all rooms)

- Canvas: **768x576** (4:3), Steps: **28**, CFG: **6.5**, Sampler: **euler**, Scheduler: **simple**, denoise: **1**
- No BiRefNetRMBG (backgrounds are full-bleed scenes)
- Final: copied as-is to `game/public/assets/rooms/<area>/room-<NN>.png`

### Shared negative prompt (rooms)

```
characters, creatures, humans, animals, people, monsters, text, watermark, low quality, blurry,
deformed, cropped, overlapping, jpeg artifacts
```

### Prompts by room

| Area | Room | Seed | Prompt |
|------|------|------|--------|
| verdant-meadow | room-01 | 3001 | `sunlit verdant meadow interior room, cozy woodland clearing, soft green grass, wildflowers, mossy rocks, gentle magical glow, warm inviting light, cheerful and safe, 2D illustrated game background, painterly game art, no characters` |
| verdant-meadow | room-02 | 3002 | `sunlit verdant meadow interior room, flower-filled field with tall grass, a small pond, butterflies, warm morning light, soft magical particles, cheerful and safe, 2D illustrated game background, painterly game art, no characters` |
| verdant-meadow | room-03 | 3003 | `verdant meadow interior room at the edge of a forest, large old oak tree, glowing mushrooms, warm golden hour light, soft magical atmosphere, cheerful and safe, 2D illustrated game background, painterly game art, no characters` |
| crystal-caves | room-01 | 4001 | `glowing crystal cave interior room, shimmering icy blue crystals jutting from walls, underground lake reflection, teal and cyan light, ethereal magical atmosphere, 2D illustrated game background, painterly game art, no characters` |
| crystal-caves | room-02 | 4002 | `crystal cave interior room with a central glowing geode, sparkling gem clusters, mineral stalactites, soft cyan bioluminescent light, mysterious but beautiful, 2D illustrated game background, painterly game art, no characters` |
| crystal-caves | room-03 | 4003 | `deep crystal cave interior room, frozen underground spring, ice formations and azure crystals, shimmering reflections, ethereal teal glow, 2D illustrated game background, painterly game art, no characters` |
| shadow-forest | room-01 | 5001 | `dark enchanted shadow forest interior room, deep indigo fog, twisted ancient trees, glowing violet mushrooms, faint moonlight through canopy, mysterious magical atmosphere, 2D illustrated game background, painterly game art, no characters` |
| shadow-forest | room-02 | 5002 | `shadow forest interior room, gnarled dark trees, purple glowing flora, misty floor, eerie violet and blue light, mysterious magical atmosphere, 2D illustrated game background, painterly game art, no characters` |
| shadow-forest | room-03 | 5003 | `shadow forest interior room around a dark ancient shrine, deep indigo shadows, floating violet wisps, ruined stone arch, ominous magical atmosphere, 2D illustrated game background, painterly game art, no characters` |

### Output file mapping

| Asset | Source ComfyUI output |
|-------|----------------------|
| `rooms/verdant-meadow/room-01.png` | `ComfyUI/output/verdant-meadow_room-01_00001_.png` |
| `rooms/verdant-meadow/room-02.png` | `ComfyUI/output/verdant-meadow_room-02_00001_.png` |
| `rooms/verdant-meadow/room-03.png` | `ComfyUI/output/verdant-meadow_room-03_00001_.png` |
| `rooms/crystal-caves/room-01.png` | `ComfyUI/output/crystal-caves_room-01_00001_.png` |
| `rooms/crystal-caves/room-02.png` | `ComfyUI/output/crystal-caves_room-02_00001_.png` |
| `rooms/crystal-caves/room-03.png` | `ComfyUI/output/crystal-caves_room-03_00001_.png` |
| `rooms/shadow-forest/room-01.png` | `ComfyUI/output/shadow-forest_room-01_00001_.png` |
| `rooms/shadow-forest/room-02.png` | `ComfyUI/output/shadow-forest_room-02_00001_.png` |
| `rooms/shadow-forest/room-03.png` | `ComfyUI/output/shadow-forest_room-03_00001_.png` |