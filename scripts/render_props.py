#!/usr/bin/env python3
"""Bake roadside props into a SPARSE sprite ladder, headless.

Run:
  /Applications/Blender.app/Contents/MacOS/Blender --background \
    --python scripts/render_props.py -- \
    --out art/build/props/raw --steps 0,2,4,6,8,10

Note the `--` separator: args after it go to this script, not to Blender.

This is a thin wrapper over `render_car_sprites.py`. It reuses that module's
scene, lighting, outline and material machinery unchanged — same EEVEE setup,
same flat cel shading, same 1px Freestyle silhouette, same palette clamp
downstream — which is the whole reason Spec D runs after Spec C. Props that went
through a second, parallel pipeline would not share the cars' read.

Three things differ from the car bake, all of them because a prop is not a car:

  * ONE angle. A car steers; a lamp post does not. Props are billboards.
  * A SPARSE ladder. A prop is seen briefly across a narrow distance range, so
    baking all 12 rungs spends atlas on frames nobody looks at. Six is plenty;
    `CarFrameSet.nearestStep` snaps a request onto a baked rung at runtime.
  * A level camera. The chase cam's 10 degrees downward tilt is framing for
    something on the road surface ahead. A prop stands beside the road and is
    seen very nearly side-on, so tilting down onto it would read as looking
    down at scenery from a helicopter.

Like the car script this emits RAW oversampled frames only — Blender 5.2 bundles
a Python with no Pillow. `scripts/postprocess_props.py` does the downscale and
palette clamp afterwards under the project venv.
"""
import argparse
import math
import pathlib
import re
import sys

import bpy
import mathutils

sys.path.append(str(pathlib.Path(__file__).resolve().parent))
from render_car_sprites import (  # noqa: E402
    FILL,
    LADDER,
    SUPERSAMPLE,
    flat_material,
    glass_material,
    import_model,
    measure_framing,
    render_step,
    setup_lighting,
    setup_scene,
    world_bbox,
)

ROOT = pathlib.Path(__file__).resolve().parent.parent
RACING = "art/models/kenney_racing-kit/Models/OBJ format"
NATURE = "art/models/kenney_nature-kit/Models/OBJ format"

PITCH_DEG = 2.0   # nearly level; a prop stands beside the road, not on it
LENS_MM = 55.0    # same long lens as the cars, so perspective matches

# Sprite name -> source model. The sprite names must already exist in
# SPRITE_MANIFEST (src/assets/spriteManifest.ts): the manifest registers the name
# and the procedural fallback, this bake supplies the appearance.
#
# `yaw` turns the model to face the road. It is not cosmetic: the Kenney kit
# models are authored facing +Y and the camera looks from -Y, so at yaw 0 a
# grandstand presents its blank back wall and bakes as a featureless grey slab.
# `roles` overrides the slot-name vocabulary per prop, for the cases where the
# modeller's name does not say what the surface is for (the billboard's face is
# a texture slot named after the sponsor, not after a colour).
PROPS = [
    {"name": "lamp_post", "model": f"{RACING}/lightPostLarge.obj"},
    {"name": "median_post", "model": f"{RACING}/pylon.obj"},
    {"name": "grandstand", "model": f"{RACING}/grandStandAwning.obj", "yaw": 180.0},
    {"name": "palm", "model": f"{NATURE}/tree_palm.obj"},
    {"name": "billboard_sponsor", "model": f"{RACING}/billboard.obj", "yaw": 180.0,
     "roles": {"tankco": "hazard", "bark": "dark"}},
]


def prop_materials(objs: list, pal: dict, slot_names: dict[str, list[str]],
                   overrides: dict[str, str] | None = None) -> None:
    """Repaint the Kenney kits' material slots from the master palette, by role.

    Both kits name slots by what the thing *is* — 'woodBark', 'leafsGreen',
    'grey', 'pylon', 'red', 'road' — so the mapping is a vocabulary translation
    rather than a guess. Everything is a flat unlit swatch: props are small on
    screen and a cel ramp across four visible pixels is wasted shading. The
    Freestyle outline is what makes them read, not the interior tones.
    """
    chrome, foliage = pal["chrome"], pal["foliage"]
    mats = {
        "bark": flat_material("prop_bark", pal["trunk"]),
        "leaf": flat_material("prop_leaf", foliage[1]),
        "leaf_hi": flat_material("prop_leaf_hi", foliage[2]),
        "metal": flat_material("prop_metal", chrome[2]),
        "dark": flat_material("prop_dark", chrome[0]),
        "road": flat_material("prop_road", pal["road"]["surfaceA"]),
        "hazard": flat_material("prop_hazard", pal["ui"]["gold"]),
        "red": flat_material("prop_red", pal["kerb"]["red"]),
        "white": flat_material("prop_white", pal["kerb"]["white"]),
        "lamp": flat_material("prop_lamp", chrome[4]),
        "glass": glass_material("prop_glass", chrome),
    }

    over = {k.lower(): v for k, v in (overrides or {}).items()}
    unknown = set(over.values()) - set(mats)
    if unknown:
        raise SystemExit(f"role override names no such material: {sorted(unknown)}")

    def role(slot_name: str):
        if slot_name.lower() in over:
            return mats[over[slot_name.lower()]]
        # Whole-word matching, as the car script does: substring tests alias
        # ('red' inside 'covered') and a mis-role is invisible here but obvious
        # on the sprite.
        words = set(re.findall(r"[a-z]+", re.sub(r"([a-z])([A-Z])", r"\1 \2", slot_name).lower()))
        if words & {"glass", "window", "windows"}:
            return mats["glass"]
        if words & {"bark", "wood", "trunk", "branch"}:
            return mats["bark"]
        if words & {"leafs", "leaves", "leaf", "foliage", "green"}:
            return mats["leaf"]
        if words & {"pylon", "cone", "orange", "yellow"}:
            return mats["hazard"]
        if words & {"red"}:
            return mats["red"]
        if words & {"white", "light", "lights"}:
            return mats["lamp"]
        if words & {"road", "asphalt", "tarmac"}:
            return mats["road"]
        if words & {"grey", "gray", "metal", "steel", "silver"}:
            return mats["metal"]
        return mats["dark"]  # _defaultMat and anything unnamed

    for obj in objs:
        names = slot_names.get(obj.name, [])
        for i in range(len(obj.data.materials)):
            original = names[i] if i < len(names) else ""
            obj.data.materials[i] = role(original or "default")


def setup_prop_camera(objs: list):
    """Level, road-side view aimed at the prop's bounding-box centre.

    Distance is driven by the prop's largest horizontal extent rather than its
    depth (as the car cam does), because props range from an 8px post to a
    48px grandstand and framing off depth alone would put the grandstand's ends
    outside the sensor.
    """
    cam_data = bpy.data.cameras.new("roadside")
    cam_data.type = "PERSP"
    cam_data.lens = LENS_MM
    cam_data.sensor_fit = "HORIZONTAL"
    cam = bpy.data.objects.new("roadside", cam_data)
    bpy.context.collection.objects.link(cam)
    bpy.context.scene.camera = cam

    lo, hi = world_bbox(objs)
    centre = (lo + hi) / 2.0
    span = max(hi.x - lo.x, hi.y - lo.y, hi.z - lo.z)
    distance = span * 3.0
    p = math.radians(PITCH_DEG)
    cam.location = centre + mathutils.Vector(
        (0.0, -distance * math.cos(p), distance * math.sin(p))
    )
    cam.rotation_euler = (math.radians(90 - PITCH_DEG), 0.0, 0.0)
    return cam


def bake_prop(prop: dict, pal: dict, steps: list[int], out_dir: pathlib.Path) -> int:
    model = ROOT / prop["model"]
    if not model.is_file():
        raise SystemExit(
            f"model not found: {model}\n"
            "The Kenney packs are gitignored; re-download per art/models/LICENSES.md."
        )

    bpy.ops.wm.read_factory_settings(use_empty=True)
    setup_scene(pal["outline"])
    import_model(model)

    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    if not meshes:
        raise SystemExit(f"no mesh objects imported from {model}")
    yaw = float(prop.get("yaw", 0.0))
    if yaw:
        for o in meshes:
            o.rotation_euler.z += math.radians(yaw)
        bpy.context.view_layer.update()

    slot_names = {o.name: [(m.name if m else "") for m in o.data.materials] for o in meshes}
    prop_materials(meshes, pal, slot_names, prop.get("roles"))

    cam = setup_prop_camera(meshes)
    setup_lighting(max(o.dimensions.z for o in meshes))
    bpy.context.view_layer.update()

    half_w, half_h = measure_framing(cam, meshes)
    if half_w <= 0.0:
        raise SystemExit(f"camera framing failed for {prop['name']}: zero width")
    cam.data.sensor_width = 2.0 * half_w / FILL
    aspect = half_h / half_w
    bpy.context.view_layer.update()

    # The ladder rung is the frame's WIDTH, exactly as it is for cars. That is not
    # a stylistic choice: Renderer.blit derives its ideal size from the frame's
    # width and picks a step with ladderStepFor(idealWidthPx), so a height-indexed
    # bake would put every prop on the wrong rung. A tall prop is therefore taller
    # than its rung — a lamp post at s0 is 120x248 — which is correct, and also
    # why props bake a sparse ladder rather than all twelve rungs.
    for si in steps:
        w = max(2, round(LADDER[si]))
        h = max(2, round(w * aspect))
        render_step(out_dir / f"{prop['name']}_std_a0_s{si}.png", w, h)
    return len(steps)


def main() -> None:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="art/build/props/raw")
    ap.add_argument("--steps", default="0,2,4,6,8,10",
                    help="comma-separated ladder indices; props bake every other rung")
    ap.add_argument("--only", default="", help="comma-separated prop names, for iterating on one")
    args = ap.parse_args(argv)

    import json
    pal = json.loads((ROOT / "src" / "assets" / "palette.json").read_text())
    steps = [int(s) for s in args.steps.split(",") if s]
    bad = [s for s in steps if not 0 <= s < len(LADDER)]
    if bad:
        raise SystemExit(f"steps outside the ladder: {bad}")

    wanted = {n for n in args.only.split(",") if n}
    props = [p for p in PROPS if not wanted or p["name"] in wanted]
    if wanted - {p["name"] for p in props}:
        raise SystemExit(f"unknown prop names: {sorted(wanted - {p['name'] for p in PROPS})}")

    out_dir = ROOT / args.out
    out_dir.mkdir(parents=True, exist_ok=True)

    total = 0
    for prop in props:
        total += bake_prop(prop, pal, steps, out_dir)
    print(f"BAKE_OK wrote {total} frames for {len(props)} props to {out_dir}")
    print(f"         supersample={SUPERSAMPLE} steps={steps}")


if __name__ == "__main__":
    main()
