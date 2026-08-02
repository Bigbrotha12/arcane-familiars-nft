#!/usr/bin/env python3
"""
Assemble a horizontal spritesheet from transparent PNG cutouts.

Usage:
    assemble-spritesheet.py --input INPUT_DIR --output OUTPUT.png [--frame-size 64]

For each input image:
- Trim to alpha bounds
- Scale proportionally to fit within frame size
- Center on transparent canvas
- Concatenate horizontally
"""

import argparse
import os
import sys
from pathlib import Path

import numpy as np
from PIL import Image


def process_frame(img: Image.Image, frame_size: int) -> Image.Image:
    """Trim, scale, and center a frame."""
    # Convert to RGBA if needed
    if img.mode != "RGBA":
        img = img.convert("RGBA")

    arr = np.array(img)
    alpha = arr[:, :, 3]

    # Find bounding box of non-transparent pixels
    rows = np.any(alpha > 0, axis=1)
    cols = np.any(alpha > 0, axis=0)

    if not rows.any() or not cols.any():
        # Empty frame, return blank
        return Image.new("RGBA", (frame_size, frame_size), (0, 0, 0, 0))

    rmin, rmax = np.where(rows)[0][[0, -1]]
    cmin, cmax = np.where(cols)[0][[0, -1]]

    # Crop to bounding box
    cropped = img.crop((cmin, rmin, cmax + 1, rmax + 1))

    # Resize to fit within frame size, preserving aspect ratio
    w, h = cropped.size
    scale = min(frame_size / w, frame_size / h)
    new_w, new_h = int(w * scale), int(h * scale)
    resized = cropped.resize((new_w, new_h), Image.Resampling.LANCZOS)

    # Center on frame_size x frame_size canvas
    canvas = Image.new("RGBA", (frame_size, frame_size), (0, 0, 0, 0))
    offset_x = (frame_size - new_w) // 2
    offset_y = (frame_size - new_h) // 2
    canvas.paste(resized, (offset_x, offset_y), resized)

    return canvas


def assemble_spritesheet(
    input_dir: str, output_path: str, frame_size: int
) -> None:
    """Assemble all PNGs in input_dir into a horizontal spritesheet."""
    # Load and process all frames
    frame_files = sorted(Path(input_dir).glob("*.png"))

    if not frame_files:
        print(f"Error: No PNG files found in {input_dir}", file=sys.stderr)
        sys.exit(1)

    print(f"Processing {len(frame_files)} frames...")
    cells = []

    for i, frame_file in enumerate(frame_files, 1):
        print(f"  [{i}/{len(frame_files)}] {frame_file.name}")
        img = Image.open(frame_file)
        cell = process_frame(img, frame_size)
        cells.append(cell)

    # Assemble spritesheet
    sheet_width = frame_size * len(cells)
    sheet = Image.new("RGBA", (sheet_width, frame_size), (0, 0, 0, 0))

    for i, cell in enumerate(cells):
        sheet.paste(cell, (i * frame_size, 0), cell)

    # Save
    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
    sheet.save(output_path)
    print(f"\nSpritesheet saved: {sheet_width}x{frame_size} ({len(cells)} frames)")
    print(f"Output: {output_path}")


def main():
    parser = argparse.ArgumentParser(
        description="Assemble spritesheet from transparent PNG cutouts"
    )
    parser.add_argument(
        "--input", required=True, help="Directory containing PNG cutouts"
    )
    parser.add_argument("--output", required=True, help="Output spritesheet path")
    parser.add_argument(
        "--frame-size", type=int, default=64, help="Frame size in pixels (default: 64)"
    )

    args = parser.parse_args()

    if not os.path.isdir(args.input):
        print(f"Error: Input directory not found: {args.input}", file=sys.stderr)
        sys.exit(1)

    assemble_spritesheet(args.input, args.output, args.frame_size)


if __name__ == "__main__":
    main()
