#!/usr/bin/env bash
# Bake roadside props: Blender render -> palette clamp -> atlas.
#
# Same two-interpreter split as bake_cars.sh and for the same reason: Blender
# 5.2 bundles its own Python with no Pillow, so the render stage runs there with
# the standard library only and the image stages run under the project venv.
#
#   npm run bake:props                      # all five props, sparse ladder
#   npm run bake:props -- --only palm       # iterate on one
#   npm run bake:props -- --steps 0,2,4     # fewer rungs while iterating
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

BLENDER="${BLENDER:-/Applications/Blender.app/Contents/MacOS/Blender}"
PY="${PY:-$ROOT/.venv/bin/python}"

[[ -x "$BLENDER" ]] || { echo "Blender not found at $BLENDER (override with BLENDER=)" >&2; exit 1; }
[[ -x "$PY"      ]] || { echo "venv missing: python3 -m venv .venv && .venv/bin/pip install -r scripts/requirements.txt" >&2; exit 1; }

echo "==> rendering props"
"$BLENDER" --background --python scripts/render_props.py -- "$@" \
  | grep -E '^(BAKE_OK|SystemExit)' || true

echo "==> palette clamp"
"$PY" scripts/postprocess_cars.py --src art/build/props/raw --out art/build/props

echo "==> packing atlas"
"$PY" scripts/pack_atlas.py --src art/build/props --id props --out public/assets/sprites
