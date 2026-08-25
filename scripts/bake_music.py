#!/usr/bin/env python3
"""Transcode source music into web-sized OGG + MP3 and emit a manifest.

Source tracks are CC0 but ship as 19-56 MB WAV/FLAC, which would blow plan.md
§12's download budget on a single track. ffmpeg does the transcode; this script
owns the encoding settings and the manifest contract so TypeScript has one
shape to parse -- the same split as imageops.py vs. the atlas manifest.

Both encodings are required per track: OGG for Firefox/Chrome, MP3 for Safari.
A track missing either is dropped from the manifest rather than shipped broken.
"""
import argparse, json, pathlib, subprocess, sys

OGG_QUALITY = "4"      # ~128kbps VBR -- transparent enough for a game bed
OPUS_BITRATE = "112k"  # Opus is ~15% more efficient than Vorbis at equal quality
MP3_BITRATE = "128k"
SRC_SUFFIXES = {".wav", ".flac", ".mp3", ".ogg"}
ROOT = pathlib.Path(__file__).resolve().parent.parent

# Which encoder fills the .ogg slot, in preference order. Not a fixed choice:
# ffmpeg builds vary in what they bundle, and Homebrew's ffmpeg 8.x ships no
# libvorbis at all -- only libopus and the native `vorbis` encoder, which is
# flagged experimental and sounds materially worse at this bitrate. Both
# preferred encoders play in every browser that can open an Ogg container, and
# Safari (which cannot) is served the MP3 either way.
OGG_ENCODERS = (
    ("libvorbis", ["-c:a", "libvorbis", "-q:a", OGG_QUALITY]),
    ("libopus", ["-c:a", "libopus", "-b:a", OPUS_BITRATE]),
)


def track_id(src: pathlib.Path) -> str:
    """Filename -> manifest id. Lowercased with spaces folded to underscores so
    the id is safe as both a URL path segment and a TypeScript map key."""
    return src.stem.lower().replace(" ", "_")


def probe_seconds(src: pathlib.Path) -> float:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", str(src)],
        capture_output=True, text=True, check=True)
    return round(float(out.stdout.strip()), 2)


def available_encoders() -> str:
    return subprocess.run(["ffmpeg", "-hide_banner", "-encoders"],
                          capture_output=True, text=True, check=True).stdout


def pick_ogg_args(listing: str) -> list[str]:
    """First encoder from OGG_ENCODERS that this ffmpeg build actually has.

    Fails loudly rather than falling back to the experimental native `vorbis`
    encoder: a silently-worse soundtrack is harder to notice than a failed bake.
    """
    for name, args in OGG_ENCODERS:
        if f" {name} " in listing:
            return args
    raise RuntimeError(
        "ffmpeg has none of " + ", ".join(n for n, _ in OGG_ENCODERS)
        + " -- install one (brew install ffmpeg --with-libvorbis, or any build "
          "carrying libopus) before running the music bake.")


def transcode(src: pathlib.Path, out_dir: pathlib.Path, ogg_args: list[str]) -> None:
    stem = track_id(src)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(src),
                    *ogg_args, str(out_dir / f"{stem}.ogg")], check=True)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(src),
                    "-c:a", "libmp3lame", "-b:a", MP3_BITRATE,
                    str(out_dir / f"{stem}.mp3")], check=True)


def build_manifest(out_dir: pathlib.Path, durations: dict[str, float]) -> dict:
    tracks = []
    for tid in sorted(durations):
        ogg, mp3 = out_dir / f"{tid}.ogg", out_dir / f"{tid}.mp3"
        if not (ogg.exists() and mp3.exists()):
            continue
        tracks.append({"id": tid, "ogg": ogg.name, "mp3": mp3.name,
                       "seconds": durations[tid]})
    return {"tracks": tracks}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default=str(ROOT / "art" / "music"))
    ap.add_argument("--out", default=str(ROOT / "public" / "assets" / "music"))
    args = ap.parse_args(argv)

    src_dir, out_dir = pathlib.Path(args.src), pathlib.Path(args.out)
    if not src_dir.is_dir():
        print(f"no source dir: {src_dir}", file=sys.stderr)
        return 1
    out_dir.mkdir(parents=True, exist_ok=True)

    ogg_args = pick_ogg_args(available_encoders())
    print(f"ogg encoder: {ogg_args[1]}")

    durations: dict[str, float] = {}
    for src in sorted(src_dir.iterdir()):
        if src.suffix.lower() not in SRC_SUFFIXES:
            continue
        print(f"==> {src.name}")
        transcode(src, out_dir, ogg_args)
        durations[track_id(src)] = probe_seconds(src)

    manifest = build_manifest(out_dir, durations)
    (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"{len(manifest['tracks'])} track(s) -> {out_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
