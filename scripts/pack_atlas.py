#!/usr/bin/env python3
"""Pack baked sprite frames into a power-of-two atlas plus a runtime manifest.

  python3 scripts/pack_atlas.py --src art/build/cars --id cars --out public/assets/sprites

Emits exactly the schema `parseAtlasManifest` (src/engine/AtlasManifest.ts) already
accepts, so the loader needs no changes. Reused by Spec D for props/effects/ui.

Frames are laid out shelf-wise, largest first, with each car's steps contiguous.
Sprites drawn together end up physically adjacent, which helps texture-cache
locality on the blit path.
"""
import argparse
import json
import pathlib
import re

from PIL import Image

# 2px of transparent margin, plus a 1px duplicate of the border pixel inside it.
# Nearest-neighbour sampling at a fractional ratio can reach a pixel past the
# frame; the bleed makes that pixel the frame's own colour rather than a
# neighbour's, and the remaining gutter keeps the two bleeds apart.
GUTTER = 2
BLEED = 1
MAX_SIDE = 2048  # iOS Safari renders an over-cap canvas unusable, with no error

FRAME_NAME = re.compile(r"^(?P<car>.+)_(?P<color>[^_]+)_a(?P<angle>\d+)_s(?P<step>\d+)$")


def parse_name(stem: str) -> dict | None:
    m = FRAME_NAME.match(stem)
    if not m:
        return None
    return {
        "id": stem,
        "car": m["car"],
        "color": m["color"],
        "angle": int(m["angle"]),
        "step": int(m["step"]),
    }


def _next_pot(v: int) -> int:
    p = 1
    while p < v:
        p <<= 1
    return p


def _shelf_layout(sizes: list[tuple[int, int]], width: int) -> tuple[list[tuple[int, int]], int]:
    """Place each frame on the current shelf, opening a new one when it overflows.

    Returns the positions and the total height used. Frames arrive largest-first,
    which is what keeps a shelf packer close to optimal here.
    """
    positions: list[tuple[int, int]] = []
    x = y = shelf_h = 0
    for w, h in sizes:
        cell_w, cell_h = w + GUTTER + BLEED * 2, h + GUTTER + BLEED * 2
        if x + cell_w > width:
            x, y, shelf_h = 0, y + shelf_h, 0
        positions.append((x + BLEED, y + BLEED))
        x += cell_w
        shelf_h = max(shelf_h, cell_h)
    return positions, y + shelf_h


def _bleed_edges(atlas: Image.Image, frame: Image.Image, x: int, y: int) -> None:
    w, h = frame.size
    atlas.paste(frame.crop((0, 0, w, 1)), (x, y - BLEED))       # top
    atlas.paste(frame.crop((0, h - 1, w, h)), (x, y + h))       # bottom
    atlas.paste(frame.crop((0, 0, 1, h)), (x - BLEED, y))       # left
    atlas.paste(frame.crop((w - 1, 0, w, h)), (x + w, y))       # right
    for cx, cy, sx, sy in (
        (x - BLEED, y - BLEED, 0, 0),
        (x + w, y - BLEED, w - 1, 0),
        (x - BLEED, y + h, 0, h - 1),
        (x + w, y + h, w - 1, h - 1),
    ):
        atlas.putpixel((cx, cy), frame.getpixel((sx, sy)))


def pack(src_dir, atlas_id: str) -> tuple[dict, Image.Image]:
    src = pathlib.Path(src_dir)
    anchors_path = src / "anchors.json"
    anchors = json.loads(anchors_path.read_text()) if anchors_path.is_file() else {}

    entries = []
    for png in sorted(src.glob("*.png")):
        meta = parse_name(png.stem)
        if meta is None:
            continue  # not a ladder frame; ignore rather than guess
        image = Image.open(png).convert("RGBA")
        meta["w"], meta["h"] = image.size
        meta["anchors"] = anchors.get(f"a{meta['angle']}", {})
        entries.append((meta, image))
    if not entries:
        raise SystemExit(f"no parseable frames in {src}")

    # Each car's 12 steps contiguous largest-to-smallest, then the next angle,
    # then the next colour, with that car's overlay parts after its bodies.
    entries.sort(key=lambda e: (e[0]["car"], e[0]["color"], e[0]["angle"], e[0]["step"]))
    sizes = [(m["w"], m["h"]) for m, _ in entries]

    width = _next_pot(max(w for w, _ in sizes) + GUTTER + BLEED * 2)
    while True:
        positions, used_h = _shelf_layout(sizes, width)
        height = _next_pot(used_h)
        if width <= MAX_SIDE and height <= MAX_SIDE:
            # A squarer atlas wastes less; widen while that still fits.
            if height > width and width * 2 <= MAX_SIDE:
                width *= 2
                continue
            break
        if width >= MAX_SIDE:
            raise SystemExit(
                f"atlas '{atlas_id}' needs {width}x{height}, over the {MAX_SIDE}px cap — "
                "drop a colour variant or a ladder step; the runtime cannot recover "
                "from an oversize atlas"
            )
        width *= 2

    atlas = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    frames = []
    for (meta, image), (x, y) in zip(entries, positions):
        atlas.paste(image, (x, y))
        _bleed_edges(atlas, image, x, y)
        frames.append({**meta, "x": x, "y": y})

    manifest = {
        "id": atlas_id,
        "file": f"sprites/{atlas_id}.png",  # relative to /assets/, as backdrops are
        "width": width,
        "height": height,
        "frames": frames,
    }
    return manifest, atlas


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True)
    ap.add_argument("--id", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    root = pathlib.Path(__file__).resolve().parent.parent
    manifest, atlas = pack(root / args.src, args.id)
    out_dir = root / args.out
    out_dir.mkdir(parents=True, exist_ok=True)
    atlas.save(out_dir / f"{args.id}.png")
    (out_dir / f"{args.id}.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(
        f"PACK_OK {len(manifest['frames'])} frames -> "
        f"{manifest['width']}x{manifest['height']} {out_dir / (args.id + '.png')}"
    )


if __name__ == "__main__":
    main()
