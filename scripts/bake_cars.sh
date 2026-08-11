#!/usr/bin/env bash
# Bake car sprites: Blender render -> palette clamp -> atlas.
#
# Two interpreters on purpose. Blender 5.2 bundles its own Python 3.13 with no
# Pillow, so the render stage runs there with the standard library only, and the
# image stages run under the project venv. Installing Pillow into the app bundle
# would break on every Blender upgrade.
#
#   npm run bake:cars                    # default model
#   npm run bake:cars -- --car muscle --model "art/models/.../Muscle.fbx"
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

BLENDER="${BLENDER:-/Applications/Blender.app/Contents/MacOS/Blender}"
PY="${PY:-$ROOT/.venv/bin/python}"
MODEL_DEFAULT="art/models/rgs_dev_free-low-poly-vehicles/Free Low Poly Vehicles Pack by Rgsdev/Sports/Sports.fbx"

MODEL="$MODEL_DEFAULT"
CAR="sports"
COLORS="red,blue"
EXTRA=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --model)  MODEL="$2"; shift 2 ;;
    --car)    CAR="$2";   shift 2 ;;
    --colors) COLORS="$2"; shift 2 ;;
    *)        EXTRA+=("$1"); shift ;;
  esac
done

[[ -x "$BLENDER" ]] || { echo "Blender not found at $BLENDER (override with BLENDER=)" >&2; exit 1; }
[[ -x "$PY"      ]] || { echo "venv missing: python3 -m venv .venv && .venv/bin/pip install -r scripts/requirements.txt" >&2; exit 1; }
[[ -f "$MODEL"   ]] || { echo "model not found: $MODEL (packs are gitignored; see art/models/LICENSES.md)" >&2; exit 1; }

echo "==> rendering $CAR ($COLORS)"
"$BLENDER" --background --python scripts/render_car_sprites.py -- \
  --model "$MODEL" --car "$CAR" --colors "$COLORS" "${EXTRA[@]+"${EXTRA[@]}"}" \
  | grep -E '^(BAKE_OK|Error)' || true

echo "==> palette clamp"
"$PY" scripts/postprocess_cars.py

echo "==> packing atlas"
"$PY" scripts/pack_atlas.py --src art/build/cars --id cars --out public/assets/sprites
