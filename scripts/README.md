# Sprite Generation Scripts

Helper scripts for the video-based idle animation workflow. See [docs/SPRITE-WORKFLOW.md](../docs/SPRITE-WORKFLOW.md) for the full process.

## Scripts

### extract-frames.sh

Extract all frames from a video file.

```bash
bash scripts/extract-frames.sh <video> <output_dir>
```

**Example:**
```bash
bash scripts/extract-frames.sh LTX2_00001.mp4 frames/
```

### select-motion-frames.py

Analyze video frames and select frames based on motion peaks. Computes pairwise MAE between consecutive frames and selects frames at local maxima in the motion curve.

```bash
python3 scripts/select-motion-frames.py <frames_dir> [--count N] [--output OUTPUT_DIR] [--min-mae THRESHOLD]
```

**Options:**
- `--count N`: Number of frames to select (default: 12)
- `--output DIR`: Output directory for selected frames (default: `<frames_dir>_selected`)
- `--min-mae FLOAT`: Minimum MAE threshold for peak detection (default: 5.0)

**Example:**
```bash
python3 scripts/select-motion-frames.py frames/ --count 12 --output selected/
```

### assemble-spritesheet.py

Assemble a horizontal spritesheet from transparent PNG cutouts. Trims each frame to alpha bounds, scales proportionally, centers on canvas, and concatenates horizontally.

```bash
python3 scripts/assemble-spritesheet.py --input INPUT_DIR --output OUTPUT.png [--frame-size 64]
```

**Options:**
- `--input DIR`: Directory containing PNG cutouts
- `--output FILE`: Output spritesheet path
- `--frame-size INT`: Frame size in pixels (default: 64)

**Example:**
```bash
python3 scripts/assemble-spritesheet.py \
  --input cutouts/ \
  --output game/public/assets/sprites/familiars/yellowFighter/idle2/yellowFighter_idle_video.png \
  --frame-size 64
```

### generate-preview.sh

Generate animated GIF preview from a spritesheet.

```bash
bash scripts/generate-preview.sh <spritesheet> <output.gif> [fps]
```

**Options:**
- `fps`: Frames per second for the preview (default: 12)

**Example:**
```bash
bash scripts/generate-preview.sh \
  game/public/assets/sprites/familiars/yellowFighter/idle2/yellowFighter_idle_video.png \
  preview.gif \
  12
```

## Complete Workflow Example

```bash
# 1. Generate video via ComfyUI (FLF workflow)
# Output: LTX2_00001.mp4

# 2. Extract all frames
bash scripts/extract-frames.sh LTX2_00001.mp4 frames/

# 3. Select 12 frames based on motion peaks
python3 scripts/select-motion-frames.py frames/ --count 12 --output selected/

# 4. Remove backgrounds (via ComfyUI remove_background workflow)
# Upload selected/ frames to ComfyUI, run remove_background, save to cutouts/

# 5. Assemble spritesheet
python3 scripts/assemble-spritesheet.py \
  --input cutouts/ \
  --output game/public/assets/sprites/familiars/yellowFighter/idle2/yellowFighter_idle_video.png \
  --frame-size 64

# 6. Generate preview
bash scripts/generate-preview.sh \
  game/public/assets/sprites/familiars/yellowFighter/idle2/yellowFighter_idle_video.png \
  preview.gif
```

## Dependencies

- **Python 3.10+** with `numpy` and `Pillow`
- **ffmpeg** (for video extraction and GIF generation)
- **ImageMagick** (for spritesheet cropping in preview script)

Install Python dependencies:
```bash
pip install numpy Pillow
```
