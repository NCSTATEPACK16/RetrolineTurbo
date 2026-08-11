# Spec C — Vehicle Bake Pipeline & Renderer Consumption: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bake real CC0 car models into a packed PNG atlas through headless Blender, and rewire the Renderer to draw them on the discrete scale ladder with anchored overlays.

**Architecture:** Blender renders each car at 3 steering angles × 12 ladder steps × N colours, body and wheels on separate passes, area-downscaled from 2× and clamped to the shared palette. Anchor points are projected out of the 3D scene rather than hand-authored. A Python packer emits a POT atlas plus the manifest Spec B's parser already accepts. The Renderer quantises to the ladder and composes overlays.

**Tech Stack:** Blender 5.2.0 LTS (headless CLI), Python 3 + Pillow, TypeScript, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-10-c-vehicle-bake-pipeline.md`
**Requires:** Spec B complete (`ladder.ts`, `SpriteComposer.ts`, `AtlasManifest.ts`, `CarFrameSet.ts`, `flipX`).

## Global Constraints

- **Blender is at `/Applications/Blender.app/Contents/MacOS/Blender`** — installed but **not on PATH**.
- **Engine id is `BLENDER_EEVEE`.** ⚠️ `BLENDER_EEVEE_NEXT` **does not exist in 5.2** and raises on assignment. That id was 4.2–4.5 only. Verified on this machine 2026-08-10.
- **OBJ import is `bpy.ops.wm.obj_import`.** ⚠️ `bpy.ops.import_scene.obj` was removed in 5.x. FBX/glTF remain `bpy.ops.import_scene.fbx` / `.gltf`.
- **Set `view_settings.view_transform = 'Standard'`** — the default is `AgX` and will desaturate everything.
- **Set `render.film_transparent = True`** — defaults `False`, and sprites need alpha.
- **Freestyle line thickness defaults to `3.0`** — must be set to `1.0`. Colour defaults to black; Blender colours are **linear**, so convert sRGB hex before assigning.
- **Only 3 steering angles are authored** (0°, 15°, 30°). The mirrored three come from Spec B's runtime `flipX`. The older 5-angle spec is superseded.
- **Never rotate sprites.** Body roll is the vertical-offset trick. Free rotation is the Mode-7 look the project avoids (research §1c) and `RenderBackend` has no rotation by design.
- **No per-frame allocation and no per-frame string construction** in the car draw path. (hard rule 4)
- **Licences:** CC0/CC-BY/OFL only. Rejected and not to be substituted: Quaternius via poly.pizza pages showing CC-BY 3.0; Spriters Resource Top Gear rips (copyrighted); KenPixel via FontStruct/onlinewebfonts mirrors (CC-BY-SA).
- Tests: `npm test`. Build gate: `npm run build`. Commit after every task.

---

### Task 1: Acquire and verify CC0 models

**Files:**
- Create: `art/models/` (downloaded packs)
- Create: `art/models/LICENSES.md`
- Modify: `.gitignore` if the packs are large

**Interfaces:**
- Produces: at least one verified GT/tourer model with separate wheel objects and a symmetric body, at a known path. Task 3 imports it.

⚠️ **This task needs network access and nothing else in this plan can start without it.**

- [ ] **Step 1: Download the two vetted packs**

| Pack | URL | Licence |
|---|---|---|
| Kenney **Car Kit** (45 assets) | https://kenney.nl/assets/car-kit | CC0 |
| RGS_Dev **Free Low Poly Vehicles** (~22) | https://rgsdev.itch.io/free-low-poly-vehicles-pack | CC0 |

Both ship **separated wheels**; RGS_Dev additionally separates colours by material, which is what makes the tint work cheap.

- [ ] **Step 2: Record provenance**

```markdown
<!-- art/models/LICENSES.md -->
# Third-party 3D model licences

| Pack | Source URL | Licence | Downloaded | Attribution |
|---|---|---|---|---|
| Kenney Car Kit | https://kenney.nl/assets/car-kit | CC0 1.0 | YYYY-MM-DD | Not required |
| RGS_Dev Free Low Poly Vehicles | https://rgsdev.itch.io/free-low-poly-vehicles-pack | CC0 1.0 | YYYY-MM-DD | Not required ("Credit is not needed") |

## Rejected sources — do not substitute
- **Quaternius Cars Bundle** — CC0 on the bundle page, but some individual
  poly.pizza pages serve CC-BY 3.0. Only acceptable via the itch/OpenGameArt CC0
  listing, verified per file.
- **The Spriters Resource Top Gear / Top Gear 2 rips** — copyrighted Kemco/Gremlin
  art. Reference only, for proportions and steering-angle counts. Never in the build.
- **"KenPixel" via FontStruct / onlinewebfonts mirrors** — served CC-BY-SA. Kenney
  fonts only from kenney.nl.
```

- [ ] **Step 3: Verify the three unknowns the research flags**

```bash
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
  --python-expr "
import bpy
bpy.ops.wm.obj_import(filepath='art/models/<pack>/<car>.obj')
for o in bpy.data.objects:
    if o.type != 'MESH': continue
    print(o.name, 'tris=', sum(len(p.vertices) - 2 for p in o.data.polygons))
print('objects:', [o.name for o in bpy.data.objects])
"
```

Confirm: (1) wheels are **separate objects**, not merged into the body; (2) poly counts are sane (both packs leave them unpublished — measure, do not assume); (3) the body is **symmetric**, since Spec B's runtime flip depends on it.

- [ ] **Step 4: Commit**

```bash
git add art/models/LICENSES.md .gitignore
git commit -m "chore(assets): add CC0 car models with recorded provenance"
```

---

### Task 2: Shared image operations

**Files:**
- Create: `scripts/imageops.py`
- Modify: `scripts/prep_backgrounds.py:87-122`
- Test: `scripts/test_imageops.py`

**Interfaces:**
- Produces: `downscale_box(im, w, h)`, `quantise_adaptive(im, colors)`, `quantise_fixed(im, palette_hexes)`, `load_palette(path)`. Tasks 3 and 4 consume all four.

⚠️ **The two callers need different quantisation and both must stay available.** Backgrounds use **adaptive** median-cut so each plate gets its own optimal palette; car sprites need a **fixed** clamp against `palette.json` so every vehicle shares one ramp set. Conflating them silently re-palettes the backgrounds — a regression that looks like a successful run.

- [ ] **Step 1: Write the failing test**

```python
# scripts/test_imageops.py
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
    assert 40 <= len(hexes) <= 48
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python3 -m pytest scripts/test_imageops.py`
Expected: FAIL — `imageops` not found.

- [ ] **Step 3: Implement**

```python
#!/usr/bin/env python3
"""Shared image operations for the asset bake scripts.

Two quantisation modes, deliberately kept distinct:
  * adaptive - each background plate gets its own optimal 48-colour palette
  * fixed    - every car/prop clamps to the shared master palette so they match

Conflating them would silently re-palette the backgrounds.
"""
import json
import pathlib

from PIL import Image


def downscale_box(im: Image.Image, w: int, h: int) -> Image.Image:
    """Area-average downscale. Nearest would alias source dither into noise."""
    return im.resize((max(1, w), max(1, h)), Image.BOX)


def quantise_adaptive(im: Image.Image, colors: int = 48) -> Image.Image:
    """Median-cut with a per-image palette. Used for backdrop plates."""
    return im.quantize(colors=colors, method=Image.MEDIANCUT, dither=Image.NONE).convert("RGB")


def _palette_image(hexes: list[str]) -> Image.Image:
    pal = Image.new("P", (1, 1))
    flat: list[int] = []
    for h in hexes:
        flat += [int(h[1:3], 16), int(h[3:5], 16), int(h[5:7], 16)]
    flat += [0] * (768 - len(flat))
    pal.putpalette(flat)
    return pal


def quantise_fixed(im: Image.Image, hexes: list[str]) -> Image.Image:
    """Clamp to an exact palette. Used for every car and prop sprite."""
    return im.convert("RGB").quantize(palette=_palette_image(hexes), dither=Image.NONE)


def load_palette(path: str | pathlib.Path) -> list[str]:
    """Flatten the nested master palette into a list of hex strings."""
    doc = json.loads(pathlib.Path(path).read_text())
    out: list[str] = []

    def walk(v: object) -> None:
        if isinstance(v, str):
            out.append(v)
        elif isinstance(v, list):
            for x in v:
                walk(x)
        elif isinstance(v, dict):
            for x in v.values():
                walk(x)

    walk(doc)
    return out
```

- [ ] **Step 4: Refactor prep_backgrounds.py to use it**

Replace the inline downscale and quantise at `prep_backgrounds.py:87-122` with `downscale_box(...)` and `quantise_adaptive(...)`. **Behaviour must be identical.**

- [ ] **Step 5: Verify the backgrounds are byte-identical**

```bash
md5 public/assets/backgrounds/*.png > /tmp/before.md5
python3 scripts/prep_backgrounds.py
md5 public/assets/backgrounds/*.png | diff /tmp/before.md5 -
```

Expected: **no diff.** A diff here means the refactor changed the plates — the exact regression this step exists to catch.

- [ ] **Step 6: Commit**

```bash
git add scripts/imageops.py scripts/test_imageops.py scripts/prep_backgrounds.py
git commit -m "refactor(scripts): extract shared image ops with adaptive and fixed quantise"
```

---

### Task 3: Blender car sprite renderer

**Files:**
- Create: `scripts/render_car_sprites.py`
- Modify: `package.json` (add a discoverable npm script)

**Interfaces:**
- Consumes: `imageops` (Task 2), `art/models/` (Task 1), `src/assets/palette.json`.
- Produces: `art/build/cars/<car>_<color>_a<angle>_s<step>.png` plus `art/build/cars/anchors.json`. Task 4 packs them.

- [ ] **Step 1: Write the scene-setup script**

```python
#!/usr/bin/env python3
"""Bake low-poly car models into the 12-step sprite ladder.

Run headless:
  /Applications/Blender.app/Contents/MacOS/Blender --background \
    --python scripts/render_car_sprites.py -- --model art/models/gt.obj \
    --car gt --colors red,blue --out art/build/cars

Note the `--` separator: args after it go to this script, not to Blender.

Blender 5.2 facts (probed 2026-08-10, correcting the 3.6-era research):
  * engine id is BLENDER_EEVEE; BLENDER_EEVEE_NEXT does NOT exist and raises
  * view_transform defaults to AgX and MUST be set to Standard
  * film_transparent defaults False
  * Freestyle thickness defaults to 3.0, colour to black; colours are LINEAR
  * OBJ import is bpy.ops.wm.obj_import (import_scene.obj was removed in 5.x)
"""
import argparse
import json
import math
import pathlib
import sys

import bpy
from bpy_extras.object_utils import world_to_camera_view

sys.path.append(str(pathlib.Path(__file__).resolve().parent))
from imageops import downscale_box, load_palette, quantise_fixed  # noqa: E402
from PIL import Image  # noqa: E402

# Must match src/math/ladder.ts LADDER exactly.
LADDER = [120, 96, 76, 60, 48, 38, 30, 24, 19, 15, 12, 10]
ANGLES = [0, 15, 30]  # mirrored at runtime via flipX (research §3c)
ROOT = pathlib.Path(__file__).resolve().parent.parent


def srgb_to_linear(c: float) -> float:
    """Blender colour sockets are linear; palette hexes are sRGB."""
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_to_linear(h: str) -> tuple[float, float, float]:
    return tuple(srgb_to_linear(int(h[i : i + 2], 16) / 255) for i in (1, 3, 5))


def setup_scene(outline_hex: str) -> None:
    sc = bpy.context.scene
    sc.render.engine = "BLENDER_EEVEE"          # NOT _NEXT — absent in 5.2
    sc.view_settings.view_transform = "Standard"  # default AgX desaturates
    sc.render.film_transparent = True             # defaults False
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGBA"
    sc.eevee.taa_render_samples = 16

    # 1px dark silhouette outline for the crisp 16-bit read.
    sc.render.use_freestyle = True
    vl = bpy.context.view_layer
    ls = vl.freestyle_settings.linesets.new("outline")
    ls.select_silhouette = True
    ls.select_border = True
    ls.select_crease = False   # crease detection is noisy on low-poly
    ls.linestyle.thickness = 1.0            # default is 3.0
    ls.linestyle.color = hex_to_linear(outline_hex)


def setup_camera(roof_height: float, distance: float) -> bpy.types.Object:
    """Rear-quarter-high chase cam. Long lens flattens the car like a distant view."""
    cam_data = bpy.data.cameras.new("chase")
    cam_data.type = "PERSP"
    cam_data.lens = 55.0  # 50-65mm per research §3d — inference, tune at the gate
    cam = bpy.data.objects.new("chase", cam_data)
    bpy.context.collection.objects.link(cam)
    bpy.context.scene.camera = cam

    cam.location = (0.0, -distance, roof_height * 1.35)
    cam.rotation_euler = (math.radians(90 - 10), 0.0, 0.0)  # pitch down ~10deg
    return cam


def project_anchors(cam: bpy.types.Object) -> dict[str, list[float]]:
    """Normalised 0..1 overlay attachment points, straight out of the 3D scene."""
    sc = bpy.context.scene
    out: dict[str, list[float]] = {}
    for obj in bpy.data.objects:
        if not obj.name.startswith("anchor_"):
            continue
        co = world_to_camera_view(sc, cam, obj.matrix_world.translation)
        # world_to_camera_view returns y-up; sprite space is y-down.
        out[obj.name.removeprefix("anchor_")] = [round(co.x, 4), round(1.0 - co.y, 4)]
    return out


def render_step(path: pathlib.Path, width: int, height: int, palette: list[str]) -> None:
    """Render at 2x, area-downscale, then clamp to the master palette."""
    sc = bpy.context.scene
    sc.render.resolution_x = width * 2
    sc.render.resolution_y = height * 2
    sc.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)

    im = Image.open(path).convert("RGBA")
    im = downscale_box(im, width, height)
    alpha = im.getchannel("A")
    rgb = quantise_fixed(im.convert("RGB"), palette).convert("RGB")
    rgb.putalpha(alpha)
    rgb.save(path)


def main() -> None:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True)
    ap.add_argument("--car", required=True)
    ap.add_argument("--colors", default="red,blue")
    ap.add_argument("--out", default="art/build/cars")
    args = ap.parse_args(argv)

    palette = load_palette(ROOT / "src" / "assets" / "palette.json")
    outline = json.loads((ROOT / "src" / "assets" / "palette.json").read_text())["outline"]

    bpy.ops.wm.read_factory_settings(use_empty=True)
    setup_scene(outline)
    bpy.ops.wm.obj_import(filepath=args.model)  # import_scene.obj is gone in 5.x

    body = max((o for o in bpy.data.objects if o.type == "MESH"),
               key=lambda o: len(o.data.polygons))
    roof = body.dimensions.z
    cam = setup_camera(roof, distance=roof * 8)

    out_dir = ROOT / args.out
    out_dir.mkdir(parents=True, exist_ok=True)
    anchors: dict[str, dict[str, list[float]]] = {}

    for color in args.colors.split(","):
        apply_body_color(body, color, palette)   # see Step 2
        for ai, angle in enumerate(ANGLES):
            body.rotation_euler.z = math.radians(angle)
            anchors[f"a{ai}"] = project_anchors(cam)
            for si, w in enumerate(LADDER):
                h = round(w * 0.6)
                render_step(out_dir / f"{args.car}_{color}_a{ai}_s{si}.png", w, h, palette)

    (out_dir / "anchors.json").write_text(json.dumps(anchors, indent=2))
    print(f"baked {len(args.colors.split(','))} colours x {len(ANGLES)} angles x {len(LADDER)} steps")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Add the shading and colour functions**

Add `apply_body_color(body, color, palette)`: set the body material to the 5-step ramp for that hue from `palette.json`, using **either** pure `Emission` **or** Principled + `Shader-to-RGB → ColorRamp` with 2–3 **hard** stops driven by one key light. Avoid smooth specular — glossy gradients fight the palette and read modern. With a fixed palette clamp downstream, lighting's only job is choosing which of the 5 ramp steps a face lands on.

Add one sun key from upper-front-left at low strength, and flat mid-grey ambient so shadows never go muddy.

Render **body and wheels on separate passes** (move wheels to their own collection and toggle `hide_render`) so overlays register independently.

- [ ] **Step 3: Run the bake**

```bash
/Applications/Blender.app/Contents/MacOS/Blender --background \
  --python scripts/render_car_sprites.py -- \
  --model art/models/<pack>/<car>.obj --car gt --colors red,blue --out art/build/cars
```

Expected: 2 × 3 × 12 = **72 PNGs** plus `anchors.json`.

- [ ] **Step 4: Eyeball the output**

Open the 120px and 10px frames. The large one must show a readable 5-step ramp and a 1px outline; the small one will collapse to ~3 tones, which is correct and expected. If everything is grey and washed out, `view_transform` did not take.

- [ ] **Step 5: Add the npm script**

```json
"bake:cars": "/Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/render_car_sprites.py --"
```

- [ ] **Step 6: Commit**

```bash
git add scripts/render_car_sprites.py package.json
git commit -m "feat(bake): add headless Blender car sprite renderer for the 12-step ladder"
```

---

### Task 4: Atlas packer

**Files:**
- Create: `scripts/pack_atlas.py`
- Test: `scripts/test_pack_atlas.py`
- Create: `public/assets/sprites/cars.png`, `public/assets/sprites/cars.json`

**Interfaces:**
- Consumes: `art/build/cars/*.png` + `anchors.json` (Task 3).
- Produces: a POT atlas ≤2048×2048 and a manifest that **Spec B's `parseAtlasManifest` accepts unchanged**. Reused by Spec D for props/effects/ui.

- [ ] **Step 1: Write the failing test**

```python
# scripts/test_pack_atlas.py
import json

from PIL import Image

from pack_atlas import pack


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
            assert max(gap_x, gap_y) >= 2


def test_anchors_are_normalised(tmp_path):
    meta, _ = pack(_frames(tmp_path), atlas_id="cars")
    for f in meta["frames"]:
        for pt in f["anchors"].values():
            assert 0.0 <= pt[0] <= 1.0 and 0.0 <= pt[1] <= 1.0


def test_frames_are_ordered_largest_to_smallest_per_car(tmp_path):
    meta, _ = pack(_frames(tmp_path), atlas_id="cars")
    steps = [f["step"] for f in meta["frames"]]
    assert steps == sorted(steps)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python3 -m pytest scripts/test_pack_atlas.py`
Expected: FAIL — `pack_atlas` not found.

- [ ] **Step 3: Implement**

`pack(src_dir, atlas_id)` returns `(manifest_dict, PIL.Image)`:

- Parse `<car>_<color>_a<angle>_s<step>.png` filenames into the manifest's `car`/`color`/`angle`/`step` keys.
- **Order frames** each car's 12 steps contiguous largest→smallest, then next angle, then next colour, with that car's overlays immediately after its bodies. Frames drawn together end up physically adjacent, which helps texture-cache locality.
- **Shelf-pack** with a **≥2px transparent gutter**, growing the atlas in powers of two.
- **1px edge bleed:** duplicate the outermost opaque row/column outward, so nearest-neighbour sampling at a fractional ratio cannot pull in a neighbour's pixels.
- **Fail loudly above 2048×2048.** This is the one place that *should* fail closed — the runtime cannot recover from an oversize atlas, and iOS Safari renders an over-cap canvas unusable with no error.
- Emit the manifest in Spec B's exact schema: `{id, file, width, height, frames:[{id,x,y,w,h,car,color,angle,step,anchors}]}`, with `file` relative to `/assets/`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `python3 -m pytest scripts/test_pack_atlas.py`
Expected: PASS (5 tests)

- [ ] **Step 5: Pack the real atlas and check the round trip**

```bash
python3 scripts/pack_atlas.py --src art/build/cars --id cars --out public/assets/sprites
```

Then add a TS test using the real output as a golden fixture — this is what stops the bake script and the loader drifting apart:

```ts
// src/engine/AtlasManifest.golden.test.ts
import { describe, it, expect } from 'vitest';
import { parseAtlasManifest } from './AtlasManifest.js';
import doc from '../../public/assets/sprites/cars.json' with { type: 'json' };

describe('baked cars.json', () => {
  it('is accepted by the runtime parser with no frames dropped', () => {
    const meta = parseAtlasManifest(doc)!;
    expect(meta).not.toBeNull();
    expect(meta.frames.length).toBe((doc as { frames: unknown[] }).frames.length);
  });

  it('fits the iOS-safe cap', () => {
    const meta = parseAtlasManifest(doc)!;
    expect(meta.width).toBeLessThanOrEqual(2048);
    expect(meta.height).toBeLessThanOrEqual(2048);
  });
});
```

- [ ] **Step 6: Commit**

```bash
git add scripts/pack_atlas.py scripts/test_pack_atlas.py public/assets/sprites src/engine/AtlasManifest.golden.test.ts
git commit -m "feat(bake): pack car sprites into a POT atlas with gutter and edge bleed"
```

---

### Task 5: Surface steer and skid to the renderer

**Files:**
- Modify: `src/types/engine.ts:39-44`
- Modify: `src/physics/Vehicle.ts:47-57`
- Test: `src/physics/Vehicle.test.ts`

**Interfaces:**
- Produces: `PlayerState` gains `readonly steer: number` (−1..1) and `readonly skidding: boolean`. Task 6 consumes both.

**The seam decision:** `Vehicle.skidding` already exists (`Vehicle.ts:57`) but is not surfaced. `PlayerState` is a deliberately narrow read-only view and its source comment says so. **Widen `PlayerState`** rather than passing `Vehicle` directly — the expedient choice would erode a boundary drawn on purpose.

- [ ] **Step 1: Write the failing test**

```ts
// add to src/physics/Vehicle.test.ts
it('exposes steer and skid state through the read-only PlayerState view', () => {
  const v = new Vehicle();
  const state: PlayerState = v;           // must typecheck
  expect(typeof state.steer).toBe('number');
  expect(state.steer).toBeGreaterThanOrEqual(-1);
  expect(state.steer).toBeLessThanOrEqual(1);
  expect(typeof state.skidding).toBe('boolean');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/physics/Vehicle.test.ts`
Expected: FAIL — `steer` is not on `PlayerState`.

- [ ] **Step 3: Widen the interface**

```ts
// src/types/engine.ts
export interface PlayerState {
  readonly z: number;
  readonly x: number;
  readonly speed: number;
  readonly gear: number;
  /** Normalised steering input, -1 (full left) .. 1 (full right). */
  readonly steer: number;
  /** True while the car is in a skid — selects the skid sprite frame. */
  readonly skidding: boolean;
}
```

Add a `get steer()` to `Vehicle` returning the last applied normalised steer. `skidding` already exists.

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: PASS. Any other `PlayerState` implementer (test stubs) needs the two new fields.

- [ ] **Step 5: Commit**

```bash
git add src/types/engine.ts src/physics/Vehicle.ts src/physics/Vehicle.test.ts
git commit -m "feat(physics): surface steer and skid state through PlayerState"
```

---

### Task 6: Renderer consumes the ladder and the overlays

**Files:**
- Modify: `src/engine/Renderer.ts:238-254`
- Modify: `src/engine/Traffic.ts:1-12`
- Test: `src/engine/Renderer.test.ts`

**Interfaces:**
- Consumes: `ladderStepFor`, `OVERLAY_CULL_STEP` (Spec B Task 1), `overlayDest` (Spec B Task 2), `CarFrameSet` (Spec B Task 5), `PlayerState.steer/.skidding` (Task 5).

- [ ] **Step 1: Write the failing tests**

```ts
// add to src/engine/Renderer.test.ts
describe('scale ladder quantisation', () => {
  it('gives nearby z values an IDENTICAL width — the anti-shimmer property', () => {
    const backend = new RecordingBackend();
    const track = stubTrack((i) => (i === 20 || i === 21 ? [{ name: 'tree', offset: -1.4 }] : []));
    new Renderer(DEFAULT_TRACK_CONFIG, atlas).render(camAt(0), track, backend);
    const trees = backend.sprites.filter(isTree);
    expect(trees).toHaveLength(2);
    expect(trees[0]!.dw).toBe(trees[1]!.dw);
  });

  it('still draws a much nearer sprite on a larger step', () => {
    const backend = new RecordingBackend();
    // Segments 5 and 60 are far enough apart to straddle several ladder steps.
    const track = stubTrack((i) => (i === 5 || i === 60 ? [{ name: 'tree', offset: -1.4 }] : []));
    new Renderer({ ...DEFAULT_TRACK_CONFIG, drawDistance: 80 }, atlas).render(camAt(0), track, backend);
    const trees = backend.sprites.filter(isTree);
    expect(trees[1]!.dw).toBeGreaterThan(trees[0]!.dw);
  });
});

describe('player steering frames', () => {
  const cases: [number, boolean, number, boolean][] = [
    // steer, skidding, expectedAngleIdx, expectedFlipX
    [0, false, 0, false],
    [0.3, false, 1, false],
    [0.9, false, 2, false],
    [-0.3, false, 1, true],
    [-0.9, false, 2, true],
  ];
  it.each(cases)('steer=%s skid=%s -> angle %s flip %s', (steer, skid, angle, flip) => {
    expect(selectCarFrame(steer, skid)).toEqual({ angle, flipX: flip });
  });

  it('overrides everything with the skid frame', () => {
    expect(selectCarFrame(0.9, true).skid).toBe(true);
  });
});

describe('overlay culling', () => {
  it('drops overlays once the car is too small to show them', () => {
    expect(overlaysVisible(OVERLAY_CULL_STEP - 1)).toBe(true);
    expect(overlaysVisible(OVERLAY_CULL_STEP)).toBe(false);
    expect(overlaysVisible(OVERLAY_CULL_STEP + 1)).toBe(false);
  });
});
```

⚠️ `Renderer.test.ts:230` currently asserts `toBeGreaterThan` between segments 30 and 5. Under quantisation that holds **only if those two z values land on different ladder steps.** The fix is to move the segments far enough apart (as above), **not** to loosen the assertion to `toBeGreaterThanOrEqual` — that would delete the test's meaning. The neighbouring monotonicity assertion at `:233-244` stays valid because a step ladder is monotonic.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/engine/Renderer.test.ts`
Expected: FAIL — `selectCarFrame` and `overlaysVisible` do not exist; widths are continuous.

- [ ] **Step 3: Export the pure selectors**

```ts
// src/engine/Renderer.ts
import { ladderStepFor, LADDER, OVERLAY_CULL_STEP } from '../math/ladder.js';

export interface CarFrameChoice { angle: number; flipX: boolean; skid: boolean }

/**
 * Steering-frame selection. Three authored angles (0, 15, 30 degrees) cover
 * both directions via horizontal flip (research §3c), which halves the atlas.
 */
export function selectCarFrame(steer: number, skidding: boolean): CarFrameChoice {
  const mag = Math.abs(steer);
  const angle = mag > 0.5 ? 2 : mag > 0.1 ? 1 : 0;
  return { angle, flipX: steer < 0, skid: skidding };
}

/** Nobody sees an exhaust tip on a 24px car (research §4b). */
export function overlaysVisible(step: number): boolean {
  return step < OVERLAY_CULL_STEP;
}
```

- [ ] **Step 4: Quantise in blit**

Replace `Renderer.ts:238-246`:

```ts
  private blit(backend: RenderBackend, f: SpriteFrame, rec: ProjRecord, offset: number, camera: Camera, roadHalfWidth: number): void {
    const scale = scaleFor(camera.focalLength, rec.relZ);
    // The provisional world->px term now only picks a ladder step; it no longer
    // scales the blit, so the drawn size is always one of 12 pre-baked widths.
    const ideal = scale * f.w * (LOGICAL_WIDTH / 2) * (roadHalfWidth / DEFAULT_CAMERA_HEIGHT);
    const step = ladderStepFor(ideal);
    const dw = LADDER[step]!;
    const dh = dw * (f.h / f.w);
    const cx = rec.x + rec.w * offset;
    const dx = cx - dw * (f.anchorX / f.w);
    const dy = rec.y - dh * (f.anchorY / f.h);
    backend.drawSprite(this.atlas.image, f.x, f.y, f.w, f.h, dx, dy, dw, dh, rec.maxy);
  }
```

⚠️ Once the PNG atlas is live this must select `frameSet.frame(color, angle, step)` and draw **that step's frame at its native size**, rather than scaling a single source frame. Until then the ladder alone removes the crawl.

- [ ] **Step 5: Draw the player car with steering and overlays**

`drawPlayerCar` takes arguments for the first time. Use `selectCarFrame`, pass `flipX` through to `drawSprite`, and draw wheels/exhaust/brake-lights via `overlayDest` into a pre-allocated `Rect` (**no per-frame allocation**). Brake lights are an **overlay quad**, not a whole extra body set.

**Body roll:** nudge the sprite 1–2px vertically and swap to the 30° frame. **Never rotate** — that is the Mode-7 look the project avoids, and `RenderBackend` has no rotation.

- [ ] **Step 6: Give traffic an integer variant**

Add `variant: number` to `TrafficCar` (`Traffic.ts:1`) alongside the existing `sprite: string`, which stays for the procedural fallback and track-file compatibility.

⚠️ `drawSprites` (`Renderer.ts:221-236`) is **O(drawDistance × cars)** — 300 × 4 = 1200 iterations/frame today, because it rescans the whole traffic array for every visible segment. At 4 cars that is fine; the research's scenario is ~60, which would be 18,000. **If car count goes past ~12, bucket cars by segment index before the draw pass.** Do not ship the naive loop at scale.

- [ ] **Step 7: Run the full suite**

Run: `npm test`
Expected: PASS after updating the two segment indices noted in Step 1.

- [ ] **Step 8: Commit**

```bash
git add src/engine/Renderer.ts src/engine/Renderer.test.ts src/engine/Traffic.ts
git commit -m "feat(render): quantise sprites to the scale ladder and compose anchored overlays"
```

---

### Task 7: Full gate

- [ ] **Step 1: Suite and build**

Run: `npm test && npm run build`
Expected: both green.

- [ ] **Step 2: Human visual gate**

`npm run dev`, then work the spec's §11:

1. The player car is a real rendered GT, not a rectangle.
2. **Shimmer check — the reason this spec exists.** Approach a traffic car from maximum draw distance at full speed, then repeat at crawl. Pixels must not crawl or wink at either. Research §3b notes the documented OutRun "sprite zoom bug" was *"only noticeable when driving at low speeds"* — **low speed is the real test.**
3. **Step-pop check.** Watch a car cross the ladder's large end. If pops show, add steps at the large end (cheap — the geometric tail is where area is small). **Do not add interpolation**; that reintroduces the exact defect this spec exists to fix.
4. **Overlay registration — the classic failure.** Turn hard **left** and confirm wheels and exhaust stay attached. That is `ax → 1 − ax` doing its job; detachment means the flip mirror is wrong.
5. Overlays must disappear cleanly at distance, not pop.
6. The car reads against all three plates and its palette sits with the road.

- [ ] **Step 3: Record**

Update `active-plan.md` with the new test count and tick the Spec C items. If the F1 silhouette is still outstanding, record it as the queued follow-up it is.

- [ ] **Step 4: Commit**

```bash
git add active-plan.md
git commit -m "chore(plan): record Spec C completion and visual gate outcome"
```

---

## Self-Review Notes

**Spec coverage:** §2 acquisition → Task 1. §3 Blender API → Task 3 (constants block + script header). §4 render script → Task 3. §5 anchors → Task 3 (`project_anchors`). §6 imageops + packer → Tasks 2, 4. §7 colour variants → Task 3 (`apply_body_color`); the load-time tint-cache escalation is documented in the spec and needs no task until `cars.png` approaches the cap. §8 renderer → Tasks 5, 6. §9 test breakage → called out inline in Task 6 Step 1.

**Open item:** Task 3 Step 2 describes `apply_body_color` rather than giving its body, because the exact material graph depends on how the chosen pack authors its materials (RGS_Dev separates colours by material; Kenney may not). Inspect the model first, then write it — this is a genuine dependency on Task 1's findings, not a placeholder.
