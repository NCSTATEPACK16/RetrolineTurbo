#!/usr/bin/env python3
"""Draw the alpha-blended effect frames and pack them into effects.png.

  python3 scripts/render_effects.py --out art/build/effects
  python3 scripts/pack_atlas.py --src art/build/effects --id effects --out public/assets/sprites

No Blender here, deliberately. Dust, flame and speed streaks are 2D shapes a few
pixels across; putting them through a 3D bake would buy nothing and cost the
control over exact pixel placement that they need at this size.

Frames are named for `pack_atlas.py`'s schema (`<name>_std_a0_s<step>`), where the
step index is an ANIMATION frame rather than a ladder rung — effects are drawn at
a fixed screen size, so there is no scale ladder to walk. `Effects.render` walks
the strip with particle age.

Two rules from the research are load-bearing here:
  * every colour comes from palette.json — effects clamp to the master palette
    exactly as cars and props do, or they read as a different game's particles
  * no dithering. These sprites are 6-14px across, with no room for a pattern to
    resolve, so a dither is just noise that shimmers as the sprite moves.

The opacity RAMP is not baked. Each frame is drawn at full alpha and faded at
runtime via `drawSprite(..., alpha)`, because the fade is a function of particle
age and of speed — the plan's rule is to bake opacity only where it is constant.
"""
from __future__ import annotations

import argparse
import json
import pathlib
import sys

sys.path.append(str(pathlib.Path(__file__).resolve().parent))
from imageops import load_palette, quantise_fixed  # noqa: E402
from PIL import Image, ImageDraw  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parent.parent


def _canvas(w: int, h: int) -> tuple[Image.Image, ImageDraw.ImageDraw]:
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    return im, ImageDraw.Draw(im)


def dust_frames(pal: dict) -> list[Image.Image]:
    """A skid puff: small and tight, growing and breaking up as it ages.

    Grey rather than brown — the car is skidding on tarmac, and a brown puff
    reads as a rally game. Tones come from the chrome ramp, which is the
    palette's only neutral ladder.
    """
    chrome = pal["chrome"]
    out = []
    # (size, blobs) — the puff coarsens rather than simply scaling, so the strip
    # reads as smoke breaking up instead of one shape being zoomed.
    plan = [
        (8, [(3, 4, 3, chrome[2]), (5, 3, 2, chrome[3])]),
        (12, [(4, 7, 4, chrome[1]), (7, 4, 3, chrome[2]), (9, 7, 2, chrome[3])]),
        (14, [(4, 9, 4, chrome[1]), (9, 6, 4, chrome[2]), (5, 4, 2, chrome[3]), (12, 9, 2, chrome[1])]),
    ]
    for size, blobs in plan:
        im, d = _canvas(size, size)
        for cx, cy, r, hexcolor in blobs:
            d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=hexcolor)
        out.append(im)
    return out


def flame_frames(pal: dict) -> list[Image.Image]:
    """An exhaust bark on the gear change: a short tongue, gone in three frames.

    Built from the UI gold/red rather than a new hue, so it sits in the same
    palette as the tail lights it fires next to.
    """
    gold, red = pal["ui"]["gold"], pal["ui"]["red"]
    hot = pal["chrome"][4]
    out = []
    for i, (w, h) in enumerate(((10, 6), (8, 5), (6, 4))):
        im, d = _canvas(w, h)
        d.polygon([(0, h - 1), (w // 2, 0), (w - 1, h - 1)], fill=red)
        d.polygon([(2, h - 1), (w // 2, 1), (w - 3, h - 1)], fill=gold)
        if i == 0:
            d.rectangle((w // 2 - 1, h - 3, w // 2, h - 1), fill=hot)  # core
        out.append(im)
    return out


def streak_frames(pal: dict) -> list[Image.Image]:
    """One vertical speed streak. A single frame: it does not animate, it fades.

    Drawn as a hard 2px bar with a lighter core rather than a soft gradient,
    because a gradient is exactly the modern-vector read the art direction bans
    and it would not survive the palette clamp anyway.
    """
    chrome = pal["chrome"]
    im, d = _canvas(2, 20)
    d.rectangle((0, 0, 1, 19), fill=chrome[3])
    d.rectangle((0, 4, 0, 15), fill=chrome[4])
    return [im]


BUILDERS = {"dust": dust_frames, "flame": flame_frames, "streak": streak_frames}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="art/build/effects")
    args = ap.parse_args()

    pal = json.loads((ROOT / "src" / "assets" / "palette.json").read_text())
    palette = load_palette(ROOT / "src" / "assets" / "palette.json")

    out_dir = ROOT / args.out
    out_dir.mkdir(parents=True, exist_ok=True)

    total = 0
    for name, build in BUILDERS.items():
        for step, frame in enumerate(build(pal)):
            # Clamp exactly as the car and prop postprocess does: quantise RGB
            # against the master palette, then hard-threshold alpha. A soft edge
            # would be blended by the canvas even with imageSmoothingEnabled off.
            alpha = frame.getchannel("A").point(lambda v: 255 if v >= 128 else 0)
            rgb = quantise_fixed(frame.convert("RGB"), palette).convert("RGB")
            rgb.putalpha(alpha)
            rgb.save(out_dir / f"{name}_std_a0_s{step}.png")
            total += 1
    print(f"EFFECTS_OK wrote {total} frames to {out_dir}")


if __name__ == "__main__":
    main()
