#!/bin/bash
# Generate animated GIF preview from a spritesheet
# Usage: generate-preview.sh <spritesheet> <output.gif> [fps]

set -e

if [ $# -lt 2 ]; then
    echo "Usage: $0 <spritesheet> <output.gif> [fps]"
    exit 1
fi

SPRITESHEET="$1"
OUTPUT="$2"
FPS="${3:-12}"

if [ ! -f "$SPRITESHEET" ]; then
    echo "Error: Spritesheet not found: $SPRITESHEET"
    exit 1
fi

# Get spritesheet dimensions
WIDTH=$(identify -format "%w" "$SPRITESHEET")
HEIGHT=$(identify -format "%h" "$SPRITESHEET")

# Calculate frame size (assume square frames)
FRAME_SIZE=$HEIGHT
FRAME_COUNT=$((WIDTH / FRAME_SIZE))

echo "Spritesheet: ${WIDTH}x${HEIGHT} ($FRAME_COUNT frames)"
echo "Generating preview GIF at ${FPS}fps..."

# Create temp directory for frames
TMPDIR=$(mktemp -d)
trap "rm -rf $TMPDIR" EXIT

# Extract frames
magick "$SPRITESHEET" -crop "${FRAME_SIZE}x${FRAME_SIZE}" "$TMPDIR/frame_%03d.png"

# Scale to preview size (192px wide)
PREVIEW_WIDTH=192

# Generate GIF
ffmpeg -loglevel error -framerate "$FPS" -i "$TMPDIR/frame_%03d.png" \
    -vf "scale=${PREVIEW_WIDTH}:-1" \
    "$OUTPUT"

echo "Preview saved: $OUTPUT"
