#!/usr/bin/env python3
"""Downscale and palette-clamp the raw Blender car renders.

  python3 scripts/postprocess_cars.py --src art/build/cars/raw --out art/build/cars

This is the second half of `render_car_sprites.py`, split off because Blender 5.2
bundles its own Python 3.13 with no Pillow, and installing into the app bundle
would break on every Blender upgrade. `npm run bake:cars` chains the two.

Two things happen here that must not be reordered:
  1. area-downscale from the 2x render — Pillow's BOX filter is alpha-correct,
     so edge pixels keep their colour instead of fringing toward transparent black
  2. clamp to the master palette — FIXED, never adaptive, so every car shares one
     ramp set (see imageops' module docstring)

Alpha is then hard-thresholded. Semi-transparent edge pixels would be blended by
the canvas even with `imageSmoothingEnabled = false`, which is exactly the soft
edge the chunky retro look is avoiding.
"""
import argparse
import json
import pathlib
import re
import sys

sys.path.append(str(pathlib.Path(__file__).resolve().parent))
from imageops import downscale_box, load_palette, quantise_fixed  # noqa: E402
from PIL import Image  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parent.parent
SUPERSAMPLE = 2  # must match render_car_sprites.py
ALPHA_CUTOFF = 128


# Overlay parts are baked on the body's full canvas so they line up with it, then
# cropped here — a full-canvas brake light is ~200 opaque pixels in 12,600, and
# 36 of those would cost as much atlas area as an entire colour variant.
OVERLAY_PART = re.compile(r"-(wheel[FB][LR]|brake)_")
FRAME_NAME = re.compile(r"^(?P<car>.+)_(?P<color>[^_]+)_a(?P<angle>\d+)_s(?P<step>\d+)$")


def process(src: pathlib.Path, dst: pathlib.Path, palette: list[str]) -> tuple[float, float] | None:
    """Downscale, clamp, threshold; crop overlay parts.

    Returns the crop's centre normalised against the UNCROPPED canvas, which is
    precisely the anchor the runtime needs to put the part back where Blender drew
    it. Deriving the anchor from the crop rather than from the projected empty
    makes the registration exact by construction. None for full-body frames.
    """
    im = Image.open(src).convert("RGBA")
    w = max(1, round(im.width / SUPERSAMPLE))
    h = max(1, round(im.height / SUPERSAMPLE))
    im = downscale_box(im, w, h)

    alpha = im.getchannel("A").point(lambda v: 255 if v >= ALPHA_CUTOFF else 0)
    rgb = quantise_fixed(im.convert("RGB"), palette).convert("RGB")
    rgb.putalpha(alpha)

    centre: tuple[float, float] | None = None
    if OVERLAY_PART.search(src.name):
        box = alpha.getbbox()
        if box is None:
            raise SystemExit(f"{src.name} is fully transparent — the pass rendered nothing")
        centre = (round((box[0] + box[2]) / 2 / w, 4), round((box[1] + box[3]) / 2 / h, 4))
        rgb = rgb.crop(box)

    rgb.save(dst)
    return centre


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default="art/build/cars/raw")
    ap.add_argument("--out", default="art/build/cars")
    args = ap.parse_args()

    src_dir = ROOT / args.src
    out_dir = ROOT / args.out
    if not src_dir.is_dir():
        raise SystemExit(f"no raw renders at {src_dir} — run the Blender bake first")
    out_dir.mkdir(parents=True, exist_ok=True)

    palette = load_palette(ROOT / "src" / "assets" / "palette.json")
    frames = sorted(src_dir.glob("*.png"))
    if not frames:
        raise SystemExit(f"no PNGs in {src_dir}")

    anchors_path = src_dir / "anchors.json"
    if not anchors_path.is_file():
        raise SystemExit("anchors.json missing — the packer cannot place overlays")
    anchors = json.loads(anchors_path.read_text())

    # Crop centres are scale-invariant, so the largest step of each angle is the
    # one measured: it has the most pixels and therefore the least rounding error.
    best_step: dict[str, int] = {}
    for png in frames:
        centre = process(png, out_dir / png.name, palette)
        m, p = FRAME_NAME.match(png.stem), OVERLAY_PART.search(png.name)
        if centre is None or not m or not p:
            continue
        part = p.group(1)
        key, step = f"a{int(m['angle'])}", int(m["step"])
        if step <= best_step.get(f"{key}:{part}", 1 << 30):
            best_step[f"{key}:{part}"] = step
            anchors.setdefault(key, {})[part] = list(centre)

    (out_dir / "anchors.json").write_text(json.dumps(anchors, indent=2) + "\n")
    print(f"POST_OK {len(frames)} frames -> {out_dir}")


if __name__ == "__main__":
    main()
