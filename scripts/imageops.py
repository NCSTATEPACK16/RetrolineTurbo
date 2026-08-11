#!/usr/bin/env python3
"""Shared image operations for the asset bake scripts.

Two quantisation modes, deliberately kept distinct:
  * adaptive - each background plate gets its own optimal 48-colour palette
  * fixed    - every car/prop clamps to the shared master palette so they match

Conflating them would silently re-palette the backgrounds.
"""
import json
import pathlib

from PIL import Image


def downscale_box(im: Image.Image, w: int, h: int) -> Image.Image:
    """Area-average downscale. Nearest would alias source dither into noise."""
    return im.resize((max(1, w), max(1, h)), Image.BOX)


def quantise_adaptive(im: Image.Image, colors: int = 48) -> Image.Image:
    """Median-cut with a per-image palette. Used for backdrop plates."""
    return im.quantize(colors=colors, method=Image.MEDIANCUT, dither=Image.NONE).convert("RGB")


def _palette_image(hexes: list[str]) -> Image.Image:
    pal = Image.new("P", (1, 1))
    flat: list[int] = []
    for h in hexes:
        flat += [int(h[1:3], 16), int(h[3:5], 16), int(h[5:7], 16)]
    flat += [0] * (768 - len(flat))
    pal.putpalette(flat)
    return pal


def quantise_fixed(im: Image.Image, hexes: list[str]) -> Image.Image:
    """Clamp to an exact palette. Used for every car and prop sprite."""
    return im.convert("RGB").quantize(palette=_palette_image(hexes), dither=Image.NONE)


def load_palette(path: str | pathlib.Path) -> list[str]:
    """Flatten the nested master palette into a list of hex strings."""
    doc = json.loads(pathlib.Path(path).read_text())
    out: list[str] = []

    def walk(v: object) -> None:
        if isinstance(v, str):
            out.append(v)
        elif isinstance(v, list):
            for x in v:
                walk(x)
        elif isinstance(v, dict):
            for x in v.values():
                walk(x)

    walk(doc)
    return out
