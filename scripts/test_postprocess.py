"""Run with: .venv/bin/python -m pytest scripts/test_postprocess.py

Guards the one thing Spec D changed about the car postprocess: anchors.json went
from unconditionally required to required only when there is something to anchor.
Cars emit overlay parts and cannot be placed without it; props are plain
billboards and legitimately have none.
"""
import json
import sys

import pytest
from PIL import Image

import postprocess_cars


def _run(tmp_path, monkeypatch, argv):
    monkeypatch.setattr(postprocess_cars, "ROOT", tmp_path)
    monkeypatch.setattr(sys, "argv", ["postprocess_cars.py", *argv])
    postprocess_cars.main()


@pytest.fixture
def tree(tmp_path):
    (tmp_path / "src" / "assets").mkdir(parents=True)
    (tmp_path / "src" / "assets" / "palette.json").write_text(
        json.dumps({"a": "#ff0000", "b": "#00ff00", "c": "#0000ff"})
    )
    (tmp_path / "raw").mkdir()
    return tmp_path


def _frame(tree, name, opaque=True):
    im = Image.new("RGBA", (24, 24), (255, 0, 0, 255 if opaque else 0))
    if not opaque:
        im.putpixel((12, 12), (255, 0, 0, 255))
    im.save(tree / "raw" / f"{name}.png")


def test_props_postprocess_without_an_anchors_file(tree, monkeypatch):
    _frame(tree, "palm_std_a0_s0")
    _frame(tree, "lamp_post_std_a0_s2")
    _run(tree, monkeypatch, ["--src", "raw", "--out", "out"])
    assert (tree / "out" / "palm_std_a0_s0.png").is_file()
    # It still writes the (empty) anchors file so pack_atlas has one shape to read.
    assert json.loads((tree / "out" / "anchors.json").read_text()) == {}


def test_cars_still_refuse_to_place_overlays_without_anchors(tree, monkeypatch):
    _frame(tree, "gt_red_a0_s0")
    _frame(tree, "gt-wheelBL_std_a0_s0", opaque=False)
    with pytest.raises(SystemExit, match="anchors.json missing"):
        _run(tree, monkeypatch, ["--src", "raw", "--out", "out"])


def test_downscales_by_the_supersample_factor(tree, monkeypatch):
    _frame(tree, "palm_std_a0_s0")
    _run(tree, monkeypatch, ["--src", "raw", "--out", "out"])
    assert Image.open(tree / "out" / "palm_std_a0_s0.png").size == (
        24 // postprocess_cars.SUPERSAMPLE,
        24 // postprocess_cars.SUPERSAMPLE,
    )
