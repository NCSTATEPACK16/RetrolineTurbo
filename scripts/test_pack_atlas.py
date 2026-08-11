"""Run with: .venv/bin/python -m pytest scripts/test_pack_atlas.py"""
import json

import pytest
from PIL import Image

from pack_atlas import GUTTER, pack


def _frames(tmp_path, n=8):
    for i in range(n):
        Image.new("RGBA", (20 + i, 12 + i), (255, 0, 0, 255)).save(
            tmp_path / f"gt_red_a0_s{i}.png"
        )
    (tmp_path / "anchors.json").write_text(json.dumps({"a0": {"wheelBL": [0.18, 0.92]}}))
    return tmp_path


def test_atlas_is_power_of_two_and_within_the_ios_safe_cap(tmp_path):
    meta, img = pack(_frames(tmp_path), atlas_id="cars")
    assert img.width & (img.width - 1) == 0
    assert img.height & (img.height - 1) == 0
    assert img.width <= 2048 and img.height <= 2048
    assert meta["width"] == img.width and meta["height"] == img.height


def test_no_two_frames_overlap(tmp_path):
    meta, _ = pack(_frames(tmp_path), atlas_id="cars")
    boxes = [(f["x"], f["y"], f["x"] + f["w"], f["y"] + f["h"]) for f in meta["frames"]]
    for i, a in enumerate(boxes):
        for b in boxes[i + 1 :]:
            assert a[2] <= b[0] or b[2] <= a[0] or a[3] <= b[1] or b[3] <= a[1]


def test_every_frame_has_at_least_a_two_pixel_gutter(tmp_path):
    meta, _ = pack(_frames(tmp_path), atlas_id="cars")
    boxes = [(f["x"], f["y"], f["x"] + f["w"], f["y"] + f["h"]) for f in meta["frames"]]
    for i, a in enumerate(boxes):
        for b in boxes[i + 1 :]:
            gap_x = max(b[0] - a[2], a[0] - b[2])
            gap_y = max(b[1] - a[3], a[1] - b[3])
            assert max(gap_x, gap_y) >= GUTTER


def test_anchors_are_normalised(tmp_path):
    meta, _ = pack(_frames(tmp_path), atlas_id="cars")
    for f in meta["frames"]:
        assert f["anchors"], "every frame must carry its angle's anchors"
        for pt in f["anchors"].values():
            assert 0.0 <= pt[0] <= 1.0 and 0.0 <= pt[1] <= 1.0


def test_frames_are_ordered_largest_to_smallest_per_car(tmp_path):
    meta, _ = pack(_frames(tmp_path), atlas_id="cars")
    steps = [f["step"] for f in meta["frames"]]
    assert steps == sorted(steps)


def test_filename_fields_are_parsed_into_the_manifest(tmp_path):
    meta, _ = pack(_frames(tmp_path, n=1), atlas_id="cars")
    f = meta["frames"][0]
    assert (f["id"], f["car"], f["color"], f["angle"], f["step"]) == (
        "gt_red_a0_s0", "gt", "red", 0, 0,
    )


def test_pixels_land_at_the_recorded_rectangle(tmp_path):
    """The manifest is only useful if it actually describes the image."""
    meta, img = pack(_frames(tmp_path, n=3), atlas_id="cars")
    for f in meta["frames"]:
        assert img.getpixel((f["x"], f["y"]))[3] == 255
        assert img.getpixel((f["x"] + f["w"] - 1, f["y"] + f["h"] - 1))[3] == 255


def test_edge_bleed_duplicates_the_border_outward(tmp_path):
    """Nearest-neighbour sampling at a fractional ratio can reach one pixel past
    the frame; without a bleed it would pull in the neighbour's pixels."""
    meta, img = pack(_frames(tmp_path, n=1), atlas_id="cars")
    f = meta["frames"][0]
    assert img.getpixel((f["x"] - 1, f["y"]))[:3] == img.getpixel((f["x"], f["y"]))[:3]
    right = f["x"] + f["w"]
    assert img.getpixel((right, f["y"]))[:3] == img.getpixel((right - 1, f["y"]))[:3]


def test_oversize_input_fails_loudly_rather_than_truncating(tmp_path):
    """iOS Safari renders an over-cap canvas unusable with no error, so this is
    the one place the pipeline must fail closed."""
    for i in range(40):
        Image.new("RGBA", (500, 500), (0, 0, 255, 255)).save(
            tmp_path / f"gt_red_a0_s{i}.png"
        )
    (tmp_path / "anchors.json").write_text(json.dumps({"a0": {}}))
    with pytest.raises(SystemExit, match="2048"):
        pack(tmp_path, atlas_id="cars")


def test_manifest_file_path_is_relative_to_the_assets_root(tmp_path):
    meta, _ = pack(_frames(tmp_path, n=1), atlas_id="cars")
    assert meta["file"] == "sprites/cars.png"
    assert meta["id"] == "cars"
