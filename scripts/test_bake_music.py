import json, pathlib, sys
import pytest
sys.path.append(str(pathlib.Path(__file__).resolve().parent))
from bake_music import build_manifest, pick_ogg_args


def test_manifest_shape(tmp_path):
    out = tmp_path / "music"
    out.mkdir()
    (out / "chase.ogg").write_bytes(b"x")
    (out / "chase.mp3").write_bytes(b"x")
    m = build_manifest(out, {"chase": 128.5})
    assert m["tracks"] == [
        {"id": "chase", "ogg": "chase.ogg", "mp3": "chase.mp3", "seconds": 128.5}
    ]


def test_manifest_skips_tracks_missing_an_encoding(tmp_path):
    out = tmp_path / "music"
    out.mkdir()
    (out / "half.ogg").write_bytes(b"x")  # no .mp3 sibling
    assert build_manifest(out, {"half": 10.0})["tracks"] == []


# Encoder availability varies by ffmpeg build -- Homebrew's ffmpeg 8.x carries
# libopus but not libvorbis -- so the choice is probed, not hardcoded.
VORBIS_AND_OPUS = " A....D libvorbis  Vorbis\n A....D libopus  Opus\n"
OPUS_ONLY = " A....D libopus  Opus\n A..X.D vorbis  Vorbis (native)\n"


def test_prefers_libvorbis_when_available():
    assert pick_ogg_args(VORBIS_AND_OPUS)[:2] == ["-c:a", "libvorbis"]


def test_falls_back_to_libopus():
    assert pick_ogg_args(OPUS_ONLY)[:2] == ["-c:a", "libopus"]


def test_refuses_the_experimental_native_vorbis_encoder():
    # A silently-worse soundtrack is harder to notice than a failed bake.
    with pytest.raises(RuntimeError):
        pick_ogg_args(" A..X.D vorbis  Vorbis (native)\n")
