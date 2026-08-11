"""Run with: python3 -m pytest scripts/test_imageops.py"""
from PIL import Image

from imageops import downscale_box, load_palette, quantise_adaptive, quantise_fixed


def test_downscale_box_area_averages_rather_than_sampling():
    im = Image.new("RGB", (4, 4))
    im.putdata([(0, 0, 0)] * 8 + [(255, 255, 255)] * 8)
    out = downscale_box(im, 2, 2)
    assert out.size == (2, 2)
    # Area averaging preserves both extremes as distinct rows.
    assert out.getpixel((0, 0)) != out.getpixel((0, 1))


def test_quantise_fixed_uses_only_palette_colours():
    palette = ["#ff0000", "#00ff00", "#0000ff"]
    im = Image.new("RGB", (8, 8), (250, 10, 10))
    out = quantise_fixed(im, palette)
    assert set(out.convert("RGB").getdata()) <= {(255, 0, 0), (0, 255, 0), (0, 0, 255)}


def test_quantise_adaptive_picks_its_own_palette():
    im = Image.linear_gradient("L").convert("RGB")
    out = quantise_adaptive(im, 8)
    assert len(set(out.convert("RGB").getdata())) <= 8


def test_load_palette_flattens_nested_ramps():
    hexes = load_palette("src/assets/palette.json")
    assert all(h.startswith("#") and len(h) == 7 for h in hexes)
    assert 40 <= len(hexes) <= 52
