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

It also bakes a *near* parallax strip per plate (Spec D §3). The plates are
opaque, so a layer drawn behind one would be invisible; depth instead comes from
a transparent ridge drawn *over* the plate and panned faster (BACKDROP_NEAR_SPEED).
The strip is built from the source layer's alpha mask only — never its colours —
and filled from tones sampled out of the plate it sits on. Deriving the fill from
the plate is what keeps a near ridge from clashing with a city night, a hot-pink
sunset and a desert canyon in turn; a mask also survives the crop with no
resampling at all, so the silhouette stays crisp.

Usage:  python3 scripts/prep_backgrounds.py
"""
from __future__ import annotations

import json
from collections import Counter
from pathlib import Path

from PIL import Image

from imageops import downscale_box, quantise_adaptive

ROOT = Path(__file__).resolve().parent.parent
SRC_DIR = ROOT / "art" / "source"
NEAR_SRC_DIR = SRC_DIR / "parallax_near"
OUT_DIR = ROOT / "public" / "assets" / "backgrounds"

TARGET_W = 960          # 2x LOGICAL_WIDTH — pans a full screen before mirroring
PALETTE_COLORS = 48     # adaptive palette; keeps the retro banding, shrinks the file

NEAR_H = 48             # rows of ridge kept above the horizon (spec caps at 78)
NEAR_RIM = 2            # rows of lit edge along each column's skyline
NEAR_BODY_MUL = 0.45    # body darkened off the sampled plate tone, so it reads near
NEAR_RIM_MUL = 1.35     # rim lifted off the same tone — a ridge catching the light

# `bottom_frac` is the fraction of the de-letterboxed art to keep, measured from
# its top. It cuts the plate at the horizon so no foreground road/water ships.
# `near` names the alpha layer in art/source/parallax_near/ used as the ridge mask.
ASSETS = [
    {
        "id": "city_night",
        "file": "City Nightscape Skyline.png",
        "name": "City Nightscape",
        "bottom_frac": 0.76,   # keep sky + skyline + the lit ground strip
        "near": "BackgroundMountain_01.png",
    },
    {
        "id": "coastal_sunset",
        "file": "Coastal Sunset Skyline.png",
        "name": "Coastal Sunset",
        "bottom_frac": 0.72,   # cut at the waterline; drop the reflections
        "near": "BackgroundMuntain02.png",
    },
    {
        "id": "desert_canyon",
        "file": "Desert Canyon & Sunset Skyline.png",
        "name": "Desert Canyon",
        "bottom_frac": 0.70,   # keep mesas + desert floor; drop the painted road
        "near": "BackgroundMountain_01.png",
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


def _scale(rgb: tuple[int, int, int], mul: float) -> tuple[int, int, int]:
    return tuple(max(0, min(255, round(c * mul))) for c in rgb)  # type: ignore[return-value]


def near_tones(plate: Image.Image) -> tuple[tuple[int, int, int], tuple[int, int, int]]:
    """(body, rim) for the ridge, both derived from the plate's own pixels.

    Body comes from the darkest of the plate's frequent colours so the ridge is
    always the darkest thing on screen — that is what makes a silhouette read at
    speed. Rim comes from the band just above the horizon, which is the light the
    ridge would actually be catching.
    """
    art = plate.crop((0, 0, plate.width // 2, plate.height))  # right half is a mirror
    common = [rgb for rgb, _ in Counter(art.getdata()).most_common(24)]
    darkest = min(common, key=lambda c: 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2])

    band = art.crop((0, round(art.height * 0.7), art.width, art.height))
    lit = Counter(band.getdata()).most_common(1)[0][0]
    return _scale(darkest, NEAR_BODY_MUL), _scale(lit, NEAR_RIM_MUL)


def near_strip(asset: dict, plate: Image.Image) -> tuple[Image.Image, str] | None:
    """Two-tone ridge with alpha, mirrored to wrap. None when no source is named."""
    name = asset.get("near")
    if not name:
        return None
    src_path = NEAR_SRC_DIR / name
    if not src_path.is_file():
        raise SystemExit(f"near-layer source not found: {src_path}")

    src = Image.open(src_path).convert("RGBA")
    mask = src.getchannel("A").point(lambda a: 255 if a > 128 else 0)
    box = mask.getbbox()
    if box is None:
        raise SystemExit(f"near-layer source is fully transparent: {src_path}")
    mask = mask.crop(box)
    # Keep the top NEAR_H rows only — the strip's base sits on the horizon and
    # everything below it is painted over by the ground band, so cropping instead
    # of resampling costs nothing and keeps the ridge at 1:1 pixels.
    mask = mask.crop((0, 0, mask.width, min(NEAR_H, mask.height)))

    body, rim = near_tones(plate)
    half_w, h = mask.size
    art = Image.new("RGBA", (half_w, h), (0, 0, 0, 0))
    mpx, apx = mask.load(), art.load()
    for x in range(half_w):
        depth = 0
        for y in range(h):
            if not mpx[x, y]:
                continue
            apx[x, y] = (*(rim if depth < NEAR_RIM else body), 255)
            depth += 1

    strip = Image.new("RGBA", (half_w * 2, h), (0, 0, 0, 0))
    strip.paste(art, (0, 0))
    strip.paste(art.transpose(Image.FLIP_LEFT_RIGHT), (half_w, 0))
    return strip, name


def prep(asset: dict) -> dict:
    src = SRC_DIR / asset["file"]
    im = Image.open(src).convert("RGB")
    top, bottom = chroma_box(im)
    art = im.crop((0, top, im.width, bottom))

    keep_h = max(1, round(art.height * asset["bottom_frac"]))
    art = art.crop((0, 0, art.width, keep_h))

    half_w = TARGET_W // 2
    target_h = max(1, round(art.height * half_w / art.width))
    small = downscale_box(art, half_w, target_h)
    small = quantise_adaptive(small, PALETTE_COLORS)

    # Mirror onto itself: column 0 == last column, so the plate wraps seamlessly.
    plate = Image.new("RGB", (TARGET_W, target_h))
    plate.paste(small, (0, 0))
    plate.paste(small.transpose(Image.FLIP_LEFT_RIGHT), (half_w, 0))

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out = OUT_DIR / f"{asset['id']}.png"
    plate.save(out, optimize=True)

    sky = plate.getpixel((0, 0))

    entry = {
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

    built = near_strip(asset, plate)
    if built:
        strip, near_src = built
        near_out = OUT_DIR / f"{asset['id']}_near.png"
        strip.save(near_out, optimize=True)
        entry["near"] = {
            "file": f"backgrounds/{asset['id']}_near.png",
            "width": strip.width,
            "height": strip.height,
            "source": near_src,
            "bytes": near_out.stat().st_size,
        }
    return entry


def main() -> None:
    if not SRC_DIR.is_dir():
        raise SystemExit(f"source art not found: {SRC_DIR}")
    entries = [prep(a) for a in ASSETS]
    manifest = OUT_DIR / "manifest.json"
    manifest.write_text(json.dumps({"backgrounds": entries}, indent=2) + "\n")
    for e in entries:
        print(f"{e['id']:16s} {e['width']}x{e['height']:<4d} {e['bytes'] / 1024:7.1f} KB  <- {e['source']}")
        n = e.get("near")
        if n:
            print(f"{'  near':16s} {n['width']}x{n['height']:<4d} {n['bytes'] / 1024:7.1f} KB  <- {n['source']}")
    print(f"manifest: {manifest.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
