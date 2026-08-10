#!/usr/bin/env python3
"""
Turn the Gemini-generated skyline panoramas into engine-ready parallax strips.

Source art (art/source/*.png) arrives ~2800x1536 with a magenta chroma letterbox
top and bottom, dithered 1px gradients, and — for the desert/coastal plates —
foreground content below the horizon that would fight the engine's own road.

Per asset this script:
  1. detects and crops the magenta letterbox (chroma key),
  2. crops to the horizon band configured in ASSETS (drops road/water foreground),
  3. area-downscales to TARGET_W (dither averages into smooth bands — nearest
     neighbour would alias it into noise at this ratio),
  4. quantises to a small adaptive palette for the chunky retro read + tiny files,
  5. mirrors the plate onto itself so it wraps seamlessly,
  6. writes public/assets/backgrounds/<id>.png plus a shared manifest.json.

Each plate is TARGET_W wide and holds the art at TARGET_W/2 followed by its
horizontal mirror. That makes column 0 and the last column identical, so the
engine can wrap the plate with no seam — and the art sits at ~1:1 pixel density
against the 480px logical framebuffer.

Usage:  python3 scripts/prep_backgrounds.py
"""
from __future__ import annotations

import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC_DIR = ROOT / "art" / "source"
OUT_DIR = ROOT / "public" / "assets" / "backgrounds"

TARGET_W = 960          # 2x LOGICAL_WIDTH — pans a full screen before mirroring
PALETTE_COLORS = 48     # adaptive palette; keeps the retro banding, shrinks the file

# `bottom_frac` is the fraction of the de-letterboxed art to keep, measured from
# its top. It cuts the plate at the horizon so no foreground road/water ships.
ASSETS = [
    {
        "id": "city_night",
        "file": "City Nightscape Skyline.png",
        "name": "City Nightscape",
        "bottom_frac": 0.76,   # keep sky + skyline + the lit ground strip
    },
    {
        "id": "coastal_sunset",
        "file": "Coastal Sunset Skyline.png",
        "name": "Coastal Sunset",
        "bottom_frac": 0.72,   # cut at the waterline; drop the reflections
    },
    {
        "id": "desert_canyon",
        "file": "Desert Canyon & Sunset Skyline.png",
        "name": "Desert Canyon",
        "bottom_frac": 0.70,   # keep mesas + desert floor; drop the painted road
    },
]


def is_chroma(px) -> bool:
    """Magenta chroma-key pixel (the generator's letterbox fill)."""
    r, g, b = px[:3]
    return r > 200 and b > 200 and g < 80


def chroma_box(im: Image.Image) -> tuple[int, int]:
    """(top, bottom) rows of the real art, excluding full-width chroma rows."""
    w, h = im.size
    px = im.load()
    xs = range(0, w, 16)

    def chroma_row(y: int) -> bool:
        return sum(1 for x in xs if is_chroma(px[x, y])) / len(xs) > 0.98

    top = 0
    while top < h and chroma_row(top):
        top += 1
    bottom = h - 1
    while bottom > top and chroma_row(bottom):
        bottom -= 1
    return top, bottom + 1


def prep(asset: dict) -> dict:
    src = SRC_DIR / asset["file"]
    im = Image.open(src).convert("RGB")
    top, bottom = chroma_box(im)
    art = im.crop((0, top, im.width, bottom))

    keep_h = max(1, round(art.height * asset["bottom_frac"]))
    art = art.crop((0, 0, art.width, keep_h))

    half_w = TARGET_W // 2
    target_h = max(1, round(art.height * half_w / art.width))
    small = art.resize((half_w, target_h), Image.BOX)
    small = small.quantize(colors=PALETTE_COLORS, method=Image.MEDIANCUT, dither=Image.NONE).convert("RGB")

    # Mirror onto itself: column 0 == last column, so the plate wraps seamlessly.
    plate = Image.new("RGB", (TARGET_W, target_h))
    plate.paste(small, (0, 0))
    plate.paste(small.transpose(Image.FLIP_LEFT_RIGHT), (half_w, 0))

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out = OUT_DIR / f"{asset['id']}.png"
    plate.save(out, optimize=True)

    sky = plate.getpixel((0, 0))

    return {
        "id": asset["id"],
        "name": asset["name"],
        "file": f"backgrounds/{asset['id']}.png",
        "width": plate.width,
        "height": plate.height,
        "skyColor": "#%02x%02x%02x" % sky,  # fills the gap above a short plate
        "source": asset["file"],
        "sourceCrop": {"top": top, "bottom": bottom, "keptFraction": asset["bottom_frac"]},
        "bytes": out.stat().st_size,
    }


def main() -> None:
    if not SRC_DIR.is_dir():
        raise SystemExit(f"source art not found: {SRC_DIR}")
    entries = [prep(a) for a in ASSETS]
    manifest = OUT_DIR / "manifest.json"
    manifest.write_text(json.dumps({"backgrounds": entries}, indent=2) + "\n")
    for e in entries:
        print(f"{e['id']:16s} {e['width']}x{e['height']:<4d} {e['bytes'] / 1024:7.1f} KB  <- {e['source']}")
    print(f"manifest: {manifest.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
