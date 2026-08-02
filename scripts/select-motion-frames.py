#!/usr/bin/env python3
"""
Analyze video frames and select frames based on motion peaks.

Usage:
    select-motion-frames.py <frames_dir> [--count N] [--output OUTPUT_DIR]

Selects frames at motion peaks (local maxima in consecutive frame MAE)
to capture the full animation cycle rather than arbitrary intervals.
"""

import argparse
import os
import sys
from pathlib import Path

import numpy as np
from PIL import Image


def load_frames(frames_dir: str) -> list[np.ndarray]:
    """Load all PNG frames from directory, sorted by name."""
    frames = []
    frame_files = sorted(Path(frames_dir).glob("f_*.png"))

    if not frame_files:
        print(f"Error: No frames found in {frames_dir}", file=sys.stderr)
        sys.exit(1)

    for f in frame_files:
        img = Image.open(f).convert("RGB")
        frames.append(np.array(img).astype(float))

    return frames


def compute_motion(frames: list[np.ndarray]) -> list[float]:
    """Compute MAE between consecutive frames."""
    motion = []
    for i in range(len(frames) - 1):
        mae = np.abs(frames[i] - frames[i + 1]).mean()
        motion.append(mae)
    return motion


def find_peaks(motion: list[float], min_mae: float = 5.0) -> list[tuple[int, float]]:
    """Find local maxima in motion curve."""
    peaks = []
    for i in range(1, len(motion) - 1):
        if motion[i] > motion[i - 1] and motion[i] > motion[i + 1] and motion[i] > min_mae:
            peaks.append((i + 1, motion[i]))  # frame number (1-indexed), MAE

    # Sort by MAE descending
    peaks.sort(key=lambda x: x[1], reverse=True)
    return peaks


def select_frames(
    frames: list[np.ndarray], count: int, min_mae: float = 5.0
) -> list[int]:
    """Select N frames: frame 1 (start/loop point) + top N-1 motion peaks."""
    motion = compute_motion(frames)
    peaks = find_peaks(motion, min_mae)

    # Always include frame 1 (loop anchor)
    selected = [1]

    # Add top motion peaks
    for frame_num, _ in peaks[: count - 1]:
        if frame_num not in selected:
            selected.append(frame_num)

    selected.sort()
    return selected


def copy_selected_frames(
    frames_dir: str, selected: list[int], output_dir: str
) -> None:
    """Copy selected frames to output directory with sequential naming."""
    os.makedirs(output_dir, exist_ok=True)

    for i, frame_num in enumerate(selected, 1):
        src = Path(frames_dir) / f"f_{frame_num:03d}.png"
        dst = Path(output_dir) / f"f_{i:03d}.png"

        if not src.exists():
            print(f"Warning: Frame {frame_num} not found", file=sys.stderr)
            continue

        # Copy file
        with open(src, "rb") as f_in:
            with open(dst, "wb") as f_out:
                f_out.write(f_in.read())


def main():
    parser = argparse.ArgumentParser(
        description="Select frames based on motion peaks"
    )
    parser.add_argument("frames_dir", help="Directory containing extracted frames")
    parser.add_argument(
        "--count", type=int, default=12, help="Number of frames to select (default: 12)"
    )
    parser.add_argument(
        "--output",
        default=None,
        help="Output directory for selected frames (default: <frames_dir>_selected)",
    )
    parser.add_argument(
        "--min-mae",
        type=float,
        default=5.0,
        help="Minimum MAE threshold for peak detection (default: 5.0)",
    )

    args = parser.parse_args()

    # Default output directory
    if args.output is None:
        args.output = f"{args.frames_dir.rstrip('/')}_selected"

    print(f"Loading frames from {args.frames_dir}...")
    frames = load_frames(args.frames_dir)
    print(f"Loaded {len(frames)} frames")

    print(f"Analyzing motion and selecting {args.count} frames...")
    selected = select_frames(frames, args.count, args.min_mae)

    print(f"Selected frames: {selected}")

    # Show motion stats
    motion = compute_motion(frames)
    print(f"\nMotion stats:")
    print(f"  Mean consecutive MAE: {np.mean(motion):.2f}")
    print(f"  Max consecutive MAE: {np.max(motion):.2f}")
    print(f"  Motion peaks found: {len(find_peaks(motion, args.min_mae))}")

    # Copy selected frames
    print(f"\nCopying selected frames to {args.output}/")
    copy_selected_frames(args.frames_dir, selected, args.output)

    print(f"Done! Selected {len(selected)} frames")


if __name__ == "__main__":
    main()
