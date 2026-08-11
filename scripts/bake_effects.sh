#!/usr/bin/env bash
# Bake the alpha-blended effect frames and pack them into effects.png.
#
# No Blender stage: dust, flame and streaks are 2D shapes a few pixels across,
# drawn directly with Pillow (see scripts/render_effects.py for why).
#
#   npm run bake:effects
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PY="${PY:-$ROOT/.venv/bin/python}"
[[ -x "$PY" ]] || { echo "venv missing: python3 -m venv .venv && .venv/bin/pip install -r scripts/requirements.txt" >&2; exit 1; }

"$PY" scripts/render_effects.py
"$PY" scripts/pack_atlas.py --src art/build/effects --id effects --out public/assets/sprites
