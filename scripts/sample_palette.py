#!/usr/bin/env python3
"""Report the dominant colours of each shipped backdrop plate.

The master palette's sky ramps are derived from the plates rather than invented,
because the plates are already on screen and already look right (spec A §2).
Re-run this after changing a plate and hand-accept the values into
src/assets/palette.json — this script deliberately does not write that file.

Usage: python3 scripts/sample_palette.py [--top N]
"""
import argparse
import pathlib
from collections import Counter

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
PLATES = ROOT / "public" / "assets" / "backgrounds"


def dominants(path: pathlib.Path, top: int) -> list[tuple[str, float]]:
    im = Image.open(path).convert("RGB")
    # Right half is a mirror of the left (prep_backgrounds.py) — sample once.
    im = im.crop((0, 0, im.width // 2, im.height))
    total = im.width * im.height
    counts = Counter(im.getdata())
    return [("#%02x%02x%02x" % rgb, 100 * n / total) for rgb, n in counts.most_common(top)]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--top", type=int, default=12)
    args = ap.parse_args()

    for path in sorted(PLATES.glob("*.png")):
        im = Image.open(path)
        print(f"\n== {path.name}  {im.width}x{im.height}")
        for hex_code, pct in dominants(path, args.top):
            print(f"   {hex_code}  {pct:5.2f}%")


if __name__ == "__main__":
    main()
