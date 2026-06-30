#!/usr/bin/env python3
"""Split the NYC Neighborhood Passport reference image into uniform square stamp assets.

Layout: 4 columns × 3 rows (left-to-right, top-to-bottom), matching the official poster.
Each output is a square containing only the stamp illustration and artist name.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "public" / "passport" / "all-stamps.png"
OUT = ROOT / "public" / "passport" / "stamps"

# Grid order from the official reference image (row-major, 4 columns).
STAMPS: list[tuple[str, int]] = [
    ("anagh-banerjee", 0),
    ("stephanie-gamarra", 1),
    ("aya-karpinska", 2),
    ("tijay-mohammed", 3),
    ("autumn-morgan", 4),
    ("hoda-ramy", 5),
    ("camila-rosa", 6),
    ("sonni", 7),
    ("misha-tyutyunik", 8),
    ("vash", 9),
    ("aashita-verma", 10),
    ("dawn-xintong-yang", 11),
]

COLS = 4
ROWS = 3
CREAM = (245, 240, 230)
TARGET_SIZE = 480
# Shrink each cell horizontally so neighboring stamp/name bleed is excluded.
HORIZONTAL_INSET_RATIO = 0.20


def find_red_name_band(cell: np.ndarray) -> tuple[int, int]:
    """Return (first_red_row, last_red_row) for the bold artist name."""
    h, w, _ = cell.shape
    red_rows: list[int] = []
    for y in range(h):
        row = cell[y]
        red_px = ((row[:, 0] > 150) & (row[:, 1] < 95) & (row[:, 2] < 95)).sum()
        if red_px > w * 0.12:
            red_rows.append(y)
    if not red_rows:
        return int(h * 0.55), int(h * 0.62)
    return min(red_rows), max(red_rows)


def crop_stamp_and_name(cell: np.ndarray) -> tuple[int, int, int, int]:
    h, w, _ = cell.shape
    cream = (cell[:, :, 0] > 235) & (cell[:, :, 1] > 230) & (cell[:, :, 2] > 215)

    top = 0
    for y in range(h):
        if (~cream[y]).sum() > w * 0.04:
            top = max(0, y - 8)
            break

    red_start, red_end = find_red_name_band(cell)
    bottom = min(h, red_end + 20)

    # Blue numbered details start immediately below the red name.
    for y in range(red_end + 4, h):
        row = cell[y]
        blue_px = ((row[:, 2] > 110) & (row[:, 0] < 120) & (row[:, 1] < 130)).sum()
        if blue_px > w * 0.12:
            bottom = min(bottom, y - 4)
            break

    inset = int(w * HORIZONTAL_INSET_RATIO)
    h_left = inset
    h_right = w - inset

    region = ~cream[top:bottom, h_left:h_right]
    cols = np.where(region.any(axis=0))[0]
    if len(cols):
        left = max(h_left, h_left + int(cols[0]) - 6)
        right = min(h_right, h_left + int(cols[-1]) + 12)
    else:
        left, right = h_left, h_right

    return left, top, right, bottom


def to_square(image: Image.Image, size: int) -> Image.Image:
    w, h = image.size
    side = max(w, h)
    canvas = Image.new("RGB", (side, side), CREAM)
    canvas.paste(image, ((side - w) // 2, (side - h) // 2))
    return canvas.resize((size, size), Image.Resampling.LANCZOS)


def main() -> None:
    if not SRC.exists():
        raise SystemExit(f"Missing source image: {SRC}")

    OUT.mkdir(parents=True, exist_ok=True)
    img = Image.open(SRC).convert("RGB")
    w, h = img.size
    cw, ch = w // COLS, h // ROWS
    arr = np.array(img)

    raw_crops: list[Image.Image] = []
    for _stamp_id, idx in STAMPS:
        row, col = divmod(idx, COLS)
        cell = arr[row * ch : (row + 1) * ch, col * cw : (col + 1) * cw]
        left, top, right, bottom = crop_stamp_and_name(cell)
        crop = Image.fromarray(cell[top:bottom, left:right])
        raw_crops.append(crop)

    for (stamp_id, _), crop in zip(STAMPS, raw_crops, strict=True):
        square = to_square(crop, TARGET_SIZE)
        square.save(OUT / f"{stamp_id}.png", optimize=True)

    to_square(raw_crops[0], TARGET_SIZE).save(OUT / "unknown.png", optimize=True)

    print(f"Wrote {len(STAMPS) + 1} square stamps ({TARGET_SIZE}px) to {OUT}")


if __name__ == "__main__":
    main()
