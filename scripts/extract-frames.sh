#!/bin/bash
# Extract all frames from a video file
# Usage: extract-frames.sh <video> <output_dir>

set -e

if [ $# -lt 2 ]; then
    echo "Usage: $0 <video> <output_dir>"
    exit 1
fi

VIDEO="$1"
OUTPUT_DIR="$2"

if [ ! -f "$VIDEO" ]; then
    echo "Error: Video file not found: $VIDEO"
    exit 1
fi

mkdir -p "$OUTPUT_DIR"

echo "Extracting frames from $VIDEO..."
ffmpeg -loglevel error -i "$VIDEO" "$OUTPUT_DIR/f_%03d.png"

FRAME_COUNT=$(ls -1 "$OUTPUT_DIR"/f_*.png 2>/dev/null | wc -l)
echo "Extracted $FRAME_COUNT frames to $OUTPUT_DIR/"
