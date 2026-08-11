#!/usr/bin/env python3
"""Bake a low-poly car model into the 12-step sprite ladder, headless.

Run:
  /Applications/Blender.app/Contents/MacOS/Blender --background \
    --python scripts/render_car_sprites.py -- \
    --model "art/models/.../Sports.fbx" --car sports --colors red,blue

Note the `--` separator: args after it go to this script, not to Blender.

This script emits RAW oversampled frames only. It deliberately does NOT import
Pillow: Blender 5.2 bundles Python 3.13 with no PIL, and installing into the app
bundle would break on every Blender upgrade. `scripts/postprocess_cars.py` runs
afterwards under the project venv and does the downscale + palette clamp using
the shared `imageops` module. `npm run bake:cars` chains the two.

Blender 5.2 facts (probed 2026-08-10, correcting the 3.6-era research):
  * engine id is BLENDER_EEVEE; BLENDER_EEVEE_NEXT does NOT exist and raises
  * view_transform defaults to AgX and MUST be set to Standard
  * film_transparent defaults False
  * Freestyle thickness defaults to 3.0, colour to black; colours are LINEAR
  * OBJ import is bpy.ops.wm.obj_import (import_scene.obj was removed in 5.x);
    FBX remains bpy.ops.import_scene.fbx
"""
import argparse
import json
import math
import pathlib
import re
import sys

import bpy
import mathutils
from bpy_extras.object_utils import world_to_camera_view

# Must match src/math/ladder.ts LADDER exactly.
LADDER = [120, 96, 76, 60, 48, 38, 30, 24, 19, 15, 12, 10]
ANGLES = [0, 15, 30]  # mirrored at runtime via flipX (research §3c)
FILL = 0.92  # fraction of the frame the car spans; the rest is the outline's room
SUPERSAMPLE = 2  # render at 2x, area-downscale in postprocess
LENS_MM = 55.0  # 50-65mm per research §3d — long lens flattens like a distant view
PITCH_DEG = 10.0  # chase-cam downward tilt
ROOT = pathlib.Path(__file__).resolve().parent.parent

# The car is authored nose-down-(-Y). The chase camera sits at -Y looking +Y, so
# the rig carries a 180 degrees base yaw to point the nose away from the camera.
# Steering then subtracts, because +Z is counter-clockwise seen from above and
# screen-right is +X: yaw = BASE_YAW - angle turns the car to screen right.
BASE_YAW = 180.0

# Shading rig. These are tuned against the measured tone histogram of the a0
# frame, not by eye: the target is most of the bodywork on the base and key-lit
# steps, shadows below, and the highlight confined to edges (<10% of the car).
# The first version used KEY_ENERGY = 3.0, which clipped every lit face to 1.0 —
# invisible while the ramp topped out at ramp[3], but it blew the whole car out
# to the highlight the moment ramp[4] was added.
KEY_ENERGY = 1.8
AMBIENT = 0.15
FILL_ENERGY = 0.9  # opposite-side fill; without it every face is either key-lit or ambient
RIM_STRENGTH = 0.55
RIM_POWER = 2.0


def srgb_to_linear(c: float) -> float:
    """Blender colour sockets are linear; palette hexes are sRGB."""
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_to_linear(h: str) -> tuple[float, float, float, float]:
    r, g, b = (srgb_to_linear(int(h[i : i + 2], 16) / 255) for i in (1, 3, 5))
    return (r, g, b, 1.0)


# --------------------------------------------------------------------------
# Materials
#
# Every material is emissive. With a fixed-palette clamp downstream, lighting's
# only job is choosing WHICH of the 5 ramp steps a face lands on -- so the paint
# materials run one diffuse key through Shader-to-RGB into a CONSTANT-
# interpolation ColorRamp (hard stops, no gradient), and everything else is a
# flat unlit swatch. Smooth specular would fight the palette and read modern.
# --------------------------------------------------------------------------


def _blank_material(name: str) -> tuple[bpy.types.Material, object, object]:
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    nodes.clear()
    out = nodes.new("ShaderNodeOutputMaterial")
    out.location = (400, 0)
    return mat, nodes, links


def flat_material(name: str, hexcolor: str) -> bpy.types.Material:
    """Unlit swatch — exactly one palette colour, immune to the lighting rig."""
    mat, nodes, links = _blank_material(name)
    em = nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = hex_to_linear(hexcolor)
    links.new(em.outputs["Emission"], nodes["Material Output"].inputs["Surface"])
    return mat


def transparent_material(name: str) -> bpy.types.Material:
    """Fully transparent — used to isolate one material into its own pass."""
    mat, nodes, links = _blank_material(name)
    tr = nodes.new("ShaderNodeBsdfTransparent")
    links.new(tr.outputs["BSDF"], nodes["Material Output"].inputs["Surface"])
    # Blender 4.2+ replaced blend_method with surface_render_method; the default
    # DITHERED renders a Transparent BSDF as opaque, which silently turns the
    # brake-light pass back into a whole car.
    if hasattr(mat, "surface_render_method"):
        mat.surface_render_method = "BLENDED"
    else:
        mat.blend_method = "BLEND"
    return mat


def cel_material(name: str, ramp: list[str]) -> bpy.types.Material:
    """Hard-stopped cel shading across the WHOLE 5-step palette ramp.

    An earlier version used only ramp[1..3]. Holding back both ends cost the car
    its darkest shadow and — worse — its highlight, so nothing on the bodywork
    ever caught the light and the sprite read flat and muddy next to 16-bit
    reference art. All five steps are now in play:

        ramp[0] core shadow   ramp[1] shadow   ramp[2] base
        ramp[3] key-lit       ramp[4] highlight

    A Fresnel term is mixed into the lighting factor so glancing angles ride up
    the ramp. That is the bright rim along the roof and shoulder line that
    separates the car from the road — the single biggest readability win, and
    the reason hand-painted arcade sprites never look like flat vector shapes.
    """
    mat, nodes, links = _blank_material(name)
    diff = nodes.new("ShaderNodeBsdfDiffuse")
    diff.inputs["Color"].default_value = (1.0, 1.0, 1.0, 1.0)
    diff.location = (-900, 0)
    s2rgb = nodes.new("ShaderNodeShaderToRGB")
    s2rgb.location = (-700, 0)

    fres = nodes.new("ShaderNodeFresnel")
    fres.inputs["IOR"].default_value = 1.45
    fres.location = (-900, -200)
    rim = nodes.new("ShaderNodeMath")  # squeeze the rim into a narrow edge band
    rim.operation = "POWER"
    rim.inputs[1].default_value = RIM_POWER
    rim.location = (-700, -200)
    rim_gain = nodes.new("ShaderNodeMath")
    rim_gain.operation = "MULTIPLY"
    rim_gain.inputs[1].default_value = RIM_STRENGTH
    rim_gain.location = (-560, -200)
    mix = nodes.new("ShaderNodeMath")
    mix.operation = "ADD"
    mix.location = (-400, -100)

    ramp_node = nodes.new("ShaderNodeValToRGB")
    ramp_node.location = (-300, 0)
    cr = ramp_node.color_ramp
    cr.interpolation = "CONSTANT"  # hard bands, never a gradient
    cr.elements[0].position = 0.0
    cr.elements[0].color = hex_to_linear(ramp[0])   # core shadow
    cr.elements[1].position = 0.16
    cr.elements[1].color = hex_to_linear(ramp[1])   # shadow
    for pos, idx in ((0.38, 2), (0.66, 3), (0.88, 4)):
        cr.elements.new(pos).color = hex_to_linear(ramp[idx])

    em = nodes.new("ShaderNodeEmission")
    em.location = (0, 0)

    links.new(diff.outputs["BSDF"], s2rgb.inputs["Shader"])
    links.new(fres.outputs["Fac"], rim.inputs[0])
    links.new(s2rgb.outputs["Color"], mix.inputs[0])
    links.new(rim.outputs["Value"], rim_gain.inputs[0])
    links.new(rim_gain.outputs["Value"], mix.inputs[1])
    links.new(mix.outputs["Value"], ramp_node.inputs["Fac"])
    links.new(ramp_node.outputs["Color"], em.inputs["Color"])
    links.new(em.outputs["Emission"], nodes["Material Output"].inputs["Surface"])
    return mat


def glass_material(name: str, chrome: list[str]) -> bpy.types.Material:
    """Two-tone glass: dark body with a Fresnel glint along the glancing edge.

    One flat grey pane reads as a hole cut in the car. The glint is what makes it
    read as glass at 120px.
    """
    mat, nodes, links = _blank_material(name)
    fres = nodes.new("ShaderNodeFresnel")
    fres.inputs["IOR"].default_value = 1.6
    fres.location = (-500, 0)
    ramp_node = nodes.new("ShaderNodeValToRGB")
    ramp_node.location = (-300, 0)
    cr = ramp_node.color_ramp
    cr.interpolation = "CONSTANT"
    cr.elements[0].position = 0.0
    cr.elements[0].color = hex_to_linear(chrome[0])  # deep glass
    cr.elements[1].position = 0.45
    cr.elements[1].color = hex_to_linear(chrome[1])  # mid pane
    cr.elements.new(0.78).color = hex_to_linear(chrome[3])  # glint
    em = nodes.new("ShaderNodeEmission")
    em.location = (0, 0)
    links.new(fres.outputs["Fac"], ramp_node.inputs["Fac"])
    links.new(ramp_node.outputs["Color"], em.inputs["Color"])
    links.new(em.outputs["Emission"], nodes["Material Output"].inputs["Surface"])
    return mat


# --------------------------------------------------------------------------
# Scene
# --------------------------------------------------------------------------


def setup_scene(outline_hex: str) -> None:
    sc = bpy.context.scene
    sc.render.engine = "BLENDER_EEVEE"            # NOT _NEXT — absent in 5.2
    sc.view_settings.view_transform = "Standard"  # default AgX desaturates
    sc.render.film_transparent = True             # defaults False
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGBA"
    sc.render.filter_size = 0.0  # no reconstruction blur; we downscale ourselves
    if hasattr(sc, "eevee"):
        sc.eevee.taa_render_samples = 16

    # 1px dark silhouette outline for the crisp 16-bit read. Thickness is scaled
    # with the supersample factor so it lands on exactly 1px after downscaling.
    sc.render.use_freestyle = True
    vl = bpy.context.view_layer
    vl.use_freestyle = True
    ls = vl.freestyle_settings.linesets.new("outline")
    ls.select_silhouette = True
    ls.select_border = True
    ls.select_crease = False  # crease detection is noisy on low-poly
    ls.linestyle.thickness = 1.0 * SUPERSAMPLE  # default is 3.0
    ls.linestyle.color = hex_to_linear(outline_hex)[:3]


def setup_lighting(height: float) -> None:
    """Key, fill, and flat ambient. Only the paint reacts; the rest is unlit emission.

    The fill is not optional. With a key alone, a low-poly car's flat faces are
    bimodal — each one either points at the key or sits at ambient — so the
    histogram empties out in the middle and the car reads as two tones with
    nothing in between. The fill is what populates the base step.
    """
    def sun(name: str, energy: float, pitch: float, yaw: float) -> None:
        data = bpy.data.lights.new(name, type="SUN")
        data.energy = energy
        data.angle = 0.0  # hard terminator — a soft one blurs the ramp stops
        obj = bpy.data.objects.new(name, data)
        bpy.context.collection.objects.link(obj)
        obj.location = (0.0, 0.0, height * 4)
        obj.rotation_euler = (math.radians(pitch), 0.0, math.radians(yaw))

    # Key from behind-above-left: the chase camera sees the car's rear, so the
    # key has to come from the camera's side or the visible face is the dark one.
    sun("key", KEY_ENERGY, 50.0, -35.0)
    sun("fill", FILL_ENERGY, 65.0, 45.0)

    world = bpy.data.worlds.new("flat")
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (AMBIENT, AMBIENT, AMBIENT * 1.1, 1.0)
    bg.inputs["Strength"].default_value = 1.0
    bpy.context.scene.world = world


def world_bbox(objs: list[bpy.types.Object]) -> tuple:
    """Min/max corner of the combined world-space bounding box."""
    pts = [o.matrix_world @ mathutils.Vector(c) for o in objs for c in o.bound_box]
    lo = mathutils.Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = mathutils.Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return lo, hi


def setup_camera(objs: list[bpy.types.Object]) -> bpy.types.Object:
    """Rear-quarter-high chase cam, aimed exactly at the car's bounding-box centre.

    Aiming at the centre is what puts the car in the middle of every frame without
    a per-frame shift term; the framing itself is solved analytically in
    `measure_framing`, not eyeballed.
    """
    cam_data = bpy.data.cameras.new("chase")
    cam_data.type = "PERSP"
    cam_data.lens = LENS_MM
    cam_data.sensor_fit = "HORIZONTAL"  # keeps FOV independent of resolution
    cam = bpy.data.objects.new("chase", cam_data)
    bpy.context.collection.objects.link(cam)
    bpy.context.scene.camera = cam

    lo, hi = world_bbox(objs)
    centre = (lo + hi) / 2.0
    distance = (hi.y - lo.y) * 2.6
    p = math.radians(PITCH_DEG)
    cam.location = centre + mathutils.Vector(
        (0.0, -distance * math.cos(p), distance * math.sin(p))
    )
    cam.rotation_euler = (math.radians(90 - PITCH_DEG), 0.0, 0.0)
    return cam


def measure_framing(cam: bpy.types.Object, objs: list[bpy.types.Object]) -> tuple[float, float]:
    """Half-extents of the car on the sensor, in millimetres, at the current pose.

    Working in camera space rather than in normalised device coordinates keeps this
    independent of the render resolution — which is the whole point, because the
    resolution is what we are about to derive from it.
    """
    inv = cam.matrix_world.inverted()
    half_w = half_h = 0.0
    for o in objs:
        if o.hide_render and o.type == "MESH":
            pass  # visibility is a per-pass concern; frame for the whole car
        for corner in o.bound_box:
            v = inv @ (o.matrix_world @ mathutils.Vector(corner))
            depth = -v.z
            if depth <= 1e-6:
                continue  # behind the camera; cannot contribute to the frame
            half_w = max(half_w, abs(v.x) * LENS_MM / depth)
            half_h = max(half_h, abs(v.y) * LENS_MM / depth)
    return half_w, half_h


# --------------------------------------------------------------------------
# Model
# --------------------------------------------------------------------------


def import_model(path: pathlib.Path) -> None:
    ext = path.suffix.lower()
    if ext == ".fbx":
        bpy.ops.import_scene.fbx(filepath=str(path))
    elif ext == ".obj":
        bpy.ops.wm.obj_import(filepath=str(path))  # import_scene.obj is gone in 5.x
    elif ext in (".glb", ".gltf"):
        bpy.ops.import_scene.gltf(filepath=str(path))
    else:
        raise SystemExit(f"unsupported model format: {path}")


def classify() -> tuple[bpy.types.Object, list[bpy.types.Object]]:
    """Body is the densest mesh; wheels are the meshes naming themselves so."""
    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    if not meshes:
        raise SystemExit("no mesh objects imported")
    body = max(meshes, key=lambda o: len(o.data.polygons))
    wheels = [o for o in meshes if o is not body and "wheel" in o.name.lower()]
    return body, wheels


def build_rig(objs: list[bpy.types.Object]) -> bpy.types.Object:
    """Parent every part to one empty so steering yaw rotates the car as a unit.

    Rotating the body alone would leave the wheels behind — the kind of bug that
    only shows up on the 30 degrees frame.
    """
    pivot = bpy.data.objects.new("pivot", None)
    bpy.context.collection.objects.link(pivot)
    for o in objs:
        o.parent = pivot
        o.matrix_parent_inverse = pivot.matrix_world.inverted()
    return pivot


def nose_direction(body: bpy.types.Object, slot_names: list[str]) -> float:
    """+1 if the car's nose points +Y, -1 if it points -Y.

    Read off the headlight faces rather than assumed: the two vetted packs do not
    agree on handedness, and getting this backwards silently swaps front and rear
    wheels — which only shows up as overlays landing on the wrong axle.
    """
    ys = [
        (body.matrix_world @ p.center).y
        for p in body.data.polygons
        if p.material_index < len(slot_names)
        and "light" in slot_names[p.material_index].lower()
        and "rear" not in slot_names[p.material_index].lower()
        and "tail" not in slot_names[p.material_index].lower()
    ]
    if not ys:
        return -1.0  # no headlights to ask; assume the pack's common -Y nose
    return 1.0 if sum(ys) / len(ys) > 0 else -1.0


def wheel_anchor_names(wheels: list[bpy.types.Object], nose_sign: float) -> dict[str, str]:
    """Map each wheel object to its anchor name (wheelFL, wheelBR, ...)."""
    out: dict[str, str] = {}
    for w in wheels:
        c = w.matrix_world.translation
        front = (c.y * nose_sign) > 0
        out[w.name] = f"wheel{'F' if front else 'B'}{'L' if c.x > 0 else 'R'}"
    return out


def make_anchors(pivot: bpy.types.Object, body: bpy.types.Object,
                 wheels: list[bpy.types.Object], names: dict[str, str]) -> list[bpy.types.Object]:
    """Empties at every overlay attachment point, parented into the steering rig.

    Wheel anchors come straight out of the wheel objects' own centres, so they
    cannot drift from the geometry. Exhaust and brake lights are derived from the
    body's bounding box rear face.
    """
    made: list[bpy.types.Object] = []

    def add(name: str, loc: tuple[float, float, float]) -> None:
        e = bpy.data.objects.new(f"anchor_{name}", None)
        bpy.context.collection.objects.link(e)
        e.location = loc
        e.parent = pivot
        e.matrix_parent_inverse = pivot.matrix_world.inverted()
        made.append(e)

    for w in wheels:
        c = w.matrix_world.translation
        add(names[w.name], (c.x, c.y, c.z))

    corners = [body.matrix_world @ v.co for v in body.data.vertices]
    max_y = max(v.y for v in corners)
    max_x = max(v.x for v in corners)
    min_z = min(v.z for v in corners)
    max_z = max(v.z for v in corners)
    rear_z = min_z + (max_z - min_z) * 0.45  # tail-light band height
    add("exhaust", (max_x * 0.45, max_y, min_z + (max_z - min_z) * 0.12))
    add("brakeL", (max_x * 0.62, max_y, rear_z))
    add("brakeR", (-max_x * 0.62, max_y, rear_z))
    return made


def snapshot_slot_names(objs: list[bpy.types.Object]) -> dict[str, list[str]]:
    """Record each object's ORIGINAL material names, once, before any repaint.

    Roles must always be decided from the modeller's names. Deciding them from
    whatever is currently in the slot means the second colour variant re-roles the
    first one's output -- and the palette material named 'trim' then matches the
    wheel-'rim' rule, quietly turning the car's black roof trim into chrome.
    """
    return {o.name: [(m.name if m else "") for m in o.data.materials] for o in objs}


def assign_materials(body: bpy.types.Object, wheels: list[bpy.types.Object],
                     color: str, pal: dict, slot_names: dict[str, list[str]]) -> None:
    """Repaint the pack's material slots with palette-driven ones, by role.

    RGS_Dev separates a vehicle by function -- 'body red', 'windows', 'tires',
    'rear lights' and so on -- which is exactly what makes the recolour cheap:
    only the paint slots change per colour variant.
    """
    ramp = pal["body"][color]
    chrome = pal["chrome"]
    paint = cel_material(f"paint_{color}", ramp)
    glass = glass_material("glass", chrome)
    # Dark panels take the paint's own darkest step, not a neutral black. Pure
    # #101018 merged roof, air dam and outline into one silhouette-swallowing
    # void; a tinted dark keeps them reading as part of the same car, which is
    # how 16-bit sprite art handles shadow.
    trim = flat_material(f"trim_{color}", ramp[0])
    lamp = flat_material("lamp", chrome[4])
    tail = flat_material("tail", pal["ui"]["red"])
    rim = flat_material("rim", chrome[3])
    tyre = flat_material("tyre", chrome[0])

    def role(slot_name: str) -> bpy.types.Material:
        # Whole-word matching: substring tests alias ('rim' inside 'trim'), and a
        # mis-role is invisible in the script but obvious on the sprite.
        words = set(re.findall(r"[a-z]+", slot_name.lower()))
        if words & {"window", "windows", "glass"}:
            return glass
        if words & {"tail", "taillight", "taillights", "brake"} or (
            "rear" in words and words & {"light", "lights"}
        ):
            return tail
        if words & {"light", "lights", "headlight", "headlights"}:
            return lamp
        if words & {"tire", "tires", "tyre", "tyres"}:
            return tyre
        if words & {"wheel", "wheels", "rim", "rims"}:
            return rim
        if words & {"black", "interior", "grill", "grille"}:
            return trim
        return paint  # every remaining 'body <colour>' slot is paint

    for obj in [body, *wheels]:
        names = slot_names.get(obj.name, [])
        for i in range(len(obj.data.materials)):
            original = names[i] if i < len(names) else ""
            if original:
                obj.data.materials[i] = role(original)


def isolate_tail_lights(body: bpy.types.Object, pal: dict) -> list:
    """Swap every non-tail-light slot for transparent, returning the old list.

    Gives the brake-light overlay its true geometric shape instead of a guessed
    quad, in one extra pass rather than a whole extra body set.
    """
    saved = [body.data.materials[i] for i in range(len(body.data.materials))]
    clear = transparent_material("clear")
    glow = flat_material("glow", pal["ui"]["red"])
    for i, mat in enumerate(saved):
        body.data.materials[i] = glow if mat is not None and mat.name.startswith("tail") else clear
    return saved


def restore_materials(body: bpy.types.Object, saved: list) -> None:
    for i, mat in enumerate(saved):
        body.data.materials[i] = mat


# --------------------------------------------------------------------------
# Render
# --------------------------------------------------------------------------


def project_anchors(cam: bpy.types.Object, anchors: list[bpy.types.Object]) -> dict:
    """Normalised 0..1 overlay attachment points, straight out of the 3D scene."""
    sc = bpy.context.scene
    out: dict[str, list[float]] = {}
    for obj in anchors:
        co = world_to_camera_view(sc, cam, obj.matrix_world.translation)
        # world_to_camera_view returns y-up; sprite space is y-down.
        out[obj.name.removeprefix("anchor_")] = [round(co.x, 4), round(1.0 - co.y, 4)]
    return out


def set_visible(objs: list[bpy.types.Object], shown: list[bpy.types.Object]) -> None:
    for o in objs:
        o.hide_render = o not in shown


def render_step(path: pathlib.Path, width: int, height: int, outline: bool = True) -> None:
    """Render one frame. `outline=False` for passes that isolate a material.

    Freestyle traces geometry and ignores material alpha, so leaving it on for the
    brake pass would ink the silhouette of the whole (invisible) car around two
    tail lights.
    """
    sc = bpy.context.scene
    sc.render.use_freestyle = outline
    sc.render.resolution_x = max(1, width * SUPERSAMPLE)
    sc.render.resolution_y = max(1, height * SUPERSAMPLE)
    sc.render.resolution_percentage = 100
    sc.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)


def main() -> None:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True)
    ap.add_argument("--car", required=True)
    ap.add_argument("--colors", default="red,blue")
    ap.add_argument("--out", default="art/build/cars/raw")
    ap.add_argument("--steps", default="", help="comma-separated ladder indices; default all")
    args = ap.parse_args(argv)

    pal = json.loads((ROOT / "src" / "assets" / "palette.json").read_text())
    colors = [c for c in args.colors.split(",") if c]
    unknown = [c for c in colors if c not in pal["body"]]
    if unknown:
        raise SystemExit(f"no body ramp in palette.json for: {unknown}")
    steps = [int(s) for s in args.steps.split(",") if s] or list(range(len(LADDER)))

    bpy.ops.wm.read_factory_settings(use_empty=True)
    setup_scene(pal["outline"])
    import_model(pathlib.Path(args.model))

    body, wheels = classify()
    if not wheels:
        raise SystemExit(
            "no separate wheel objects — this model cannot do the overlay passes"
        )
    parts = [body, *wheels]
    slot_names = snapshot_slot_names(parts)
    # The nose is wherever the headlight faces are; asking the geometry beats
    # assuming a handedness that varies between packs.
    nose_sign = nose_direction(body, slot_names[body.name])
    wnames = wheel_anchor_names(wheels, nose_sign)
    pivot = build_rig(parts)
    anchors = make_anchors(pivot, body, wheels, wnames)

    cam = setup_camera(parts)
    setup_lighting(body.dimensions.z)

    # Solve the framing once, for every steering angle, before rendering anything.
    #
    # All three angles must share ONE world-to-pixel scale, or the car would swell
    # and shrink as it steered. A yawed car is wider on screen, so instead of
    # letting it grow it gets a proportionally wider CANVAS at the same scale:
    # the sensor widens with the car, and the ladder width tracks it. The
    # straight-ahead frame is therefore exactly LADDER[step] px wide, and the
    # turned frames are a little wider — which is why Task 6 draws each frame at
    # its native size rather than forcing every frame to the ladder width.
    frames_mm: list[tuple[float, float]] = []
    for angle in ANGLES:
        pivot.rotation_euler.z = math.radians(BASE_YAW - angle)
        bpy.context.view_layer.update()
        frames_mm.append(measure_framing(cam, parts))
    base_w = frames_mm[0][0]
    if base_w <= 0.0:
        raise SystemExit("camera framing failed: car projects to zero width")

    out_dir = ROOT / args.out
    out_dir.mkdir(parents=True, exist_ok=True)
    anchor_doc: dict[str, dict] = {}

    for ai, angle in enumerate(ANGLES):
        pivot.rotation_euler.z = math.radians(BASE_YAW - angle)
        half_w, half_h = frames_mm[ai]
        cam.data.sensor_width = 2.0 * half_w / FILL
        width_ratio = half_w / base_w
        height_ratio = half_h / base_w
        bpy.context.view_layer.update()

        for si in steps:
            w = max(1, round(LADDER[si] * width_ratio))
            h = max(1, round(LADDER[si] * height_ratio))
            if si == steps[0]:
                # Anchors are resolution-independent within an angle, so project
                # them once the sensor and aspect for this angle are settled.
                bpy.context.scene.render.resolution_x = w * SUPERSAMPLE
                bpy.context.scene.render.resolution_y = h * SUPERSAMPLE
                anchor_doc[f"a{ai}"] = project_anchors(cam, anchors)

            # Body pass — wheels hidden so the overlay can register over the wells.
            set_visible(parts, [body])
            for color in colors:
                assign_materials(body, wheels, color, pal, slot_names)
                render_step(out_dir / f"{args.car}_{color}_a{ai}_s{si}.png", w, h)

            # Wheel passes — one sprite PER wheel. Reusing a single wheel at all
            # four anchors looks wrong: the far wheels are smaller, higher, and on
            # a turned car show the rim face while the near ones show tread.
            for wheel in wheels:
                set_visible(parts, [wheel])
                render_step(out_dir / f"{args.car}-{wnames[wheel.name]}_std_a{ai}_s{si}.png", w, h)

            # Brake pass — the tail-light geometry alone, as an overlay quad.
            set_visible(parts, [body])
            saved = isolate_tail_lights(body, pal)
            render_step(out_dir / f"{args.car}-brake_std_a{ai}_s{si}.png", w, h, outline=False)
            restore_materials(body, saved)

    (out_dir / "anchors.json").write_text(json.dumps(anchor_doc, indent=2) + "\n")
    total = (len(colors) + len(wheels) + 1) * len(ANGLES) * len(steps)
    print(f"BAKE_OK wrote {total} frames to {out_dir}")


if __name__ == "__main__":
    main()
