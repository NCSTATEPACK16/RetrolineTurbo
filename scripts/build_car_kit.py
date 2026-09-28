#!/usr/bin/env python3
"""Build the v2 modular car kit (PRD section 8/10) and export it as one glTF.

Run (reproducible, headless, no add-ons, no downloads):
  npm run bake:kit
which is
  /Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
    --python scripts/build_car_kit.py -- --out public/assets/cars/kit.glb

Every part is built from code with bmesh: boxes, prisms and low-sided
cylinders, flat shaded, so the cars read as chunky sprites at 240 lines.
Colours come only from src/assets/palette.json (the palette clamp); the
in-game palette shader then snaps every lit pixel to the same palette.

Conventions (Blender, Z-up, metres):
  * the car's nose points +Y (glTF/three: -Z), the rear -Y, ground at Z=0
  * each part is a root object whose glTF extras carry {"part": "<slot>.<id>"}
  * bodies carry mount empties (extras {"mount": "<role>"}): engine, spoiler,
    exhaust and wheel_fl / wheel_fr / wheel_rl / wheel_rr. Other parts are
    authored around their own origin, which snaps onto the matching mount
  * wheels are one wheel, axle along X, centred on the origin
  * exhausts carry a "flame" empty where the boost flame sits
  * material names are roles the game re-skins: paint (recoloured per car),
    trim, chrome, glass, tyre, light
"""
import argparse
import json
import math
import pathlib
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

ROOT = pathlib.Path(__file__).resolve().parent.parent
PALETTE = json.loads((ROOT / "src/assets/palette.json").read_text())


def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_rgba(h):
    h = h.lstrip("#")
    return tuple(srgb_to_linear(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4)) + (1.0,)


MATERIALS = {
    "paint": PALETTE["body"]["red"][2],
    "trim": PALETTE["chrome"][0],
    "chrome": PALETTE["chrome"][3],
    "glass": PALETTE["body"]["blue"][1],
    "tyre": PALETTE["outline"],
    "light": PALETTE["ui"]["gold"],
}
MAT_ORDER = list(MATERIALS)


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for name, hexcol in MATERIALS.items():
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        bsdf = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
        bsdf.inputs["Base Color"].default_value = hex_rgba(hexcol)
        bsdf.inputs["Roughness"].default_value = 1.0
        bsdf.inputs["Metallic"].default_value = 0.0
        m.diffuse_color = hex_rgba(hexcol)


class Builder:
    """Accumulates primitives into one bmesh, each face tagged with a material role."""

    def __init__(self):
        self.bm = bmesh.new()

    def _tag(self, verts, mat):
        faces = {f for v in verts for f in v.link_faces}
        idx = MAT_ORDER.index(mat)
        for f in faces:
            f.material_index = idx
            f.smooth = False
        return verts

    def box(self, size, center, mat, taper=None):
        """Axis-aligned box. `taper` = (axis_sign_y, dz_top, dx_top): pull the top
        edge at the +Y (1) or -Y (-1) end down by dz and in by dx, for noses and tails."""
        m = Matrix.Translation(Vector(center)) @ Matrix.Diagonal(Vector((*size, 1.0)))
        verts = bmesh.ops.create_cube(self.bm, size=1.0, matrix=m)["verts"]
        if taper:
            sign, dz, dx = taper
            cy, cz = center[1], center[2]
            for v in verts:
                if (v.co.y - cy) * sign > 0 and v.co.z > cz:
                    v.co.z -= dz
                    v.co.x -= math.copysign(dx, v.co.x - center[0])
        return self._tag(verts, mat)

    def cylinder(self, radius, depth, center, mat, axis="X", segments=8, radius2=None):
        rot = {"X": Matrix.Rotation(math.pi / 2, 4, "Y"), "Y": Matrix.Rotation(math.pi / 2, 4, "X"), "Z": Matrix.Identity(4)}[axis]
        m = Matrix.Translation(Vector(center)) @ rot
        verts = bmesh.ops.create_cone(
            self.bm, cap_ends=True, cap_tris=False, segments=segments,
            radius1=radius, radius2=radius if radius2 is None else radius2, depth=depth, matrix=m,
        )["verts"]
        return self._tag(verts, mat)

    def finish(self, name, part):
        mesh = bpy.data.meshes.new(name)
        self.bm.normal_update()
        self.bm.to_mesh(mesh)
        self.bm.free()
        for mat in MAT_ORDER:
            mesh.materials.append(bpy.data.materials[mat])
        obj = bpy.data.objects.new(name, mesh)
        obj["part"] = part
        bpy.context.scene.collection.objects.link(obj)
        return obj


def empty(name, parent, loc, role_key, role):
    e = bpy.data.objects.new(name, None)
    e.empty_display_size = 0.2
    e.location = loc
    e.parent = parent
    e[role_key] = role
    bpy.context.scene.collection.objects.link(e)
    return e


def mounts(body, pid, wheel_x, wheel_y_front, wheel_y_rear, wheel_z, engine, spoiler, exhaust):
    tag = pid.replace(".", "_")
    empty(f"mount_engine_{tag}", body, engine, "mount", "engine")
    empty(f"mount_spoiler_{tag}", body, spoiler, "mount", "spoiler")
    empty(f"mount_exhaust_{tag}", body, exhaust, "mount", "exhaust")
    for key, x, y in (("fl", -wheel_x, wheel_y_front), ("fr", wheel_x, wheel_y_front),
                      ("rl", -wheel_x, wheel_y_rear), ("rr", wheel_x, wheel_y_rear)):
        empty(f"mount_wheel_{key}_{tag}", body, (x, y, wheel_z), "mount", f"wheel_{key}")


# ---- bodies ---------------------------------------------------------------

def body_roadster():
    """Low and sleek: long tapered nose, small cockpit set back."""
    b = Builder()
    b.box((1.8, 4.1, 0.42), (0, 0, 0.5), "paint", taper=(1, 0.18, 0.12))
    b.box((1.9, 0.9, 0.3), (0, -1.75, 0.55), "paint")  # rear haunches
    b.box((1.25, 1.3, 0.34), (0, -0.35, 0.88), "glass", taper=(1, 0.2, 0.1))
    b.box((1.7, 0.12, 0.14), (0, 2.02, 0.42), "trim")  # grille
    for x in (-0.65, 0.65):
        b.box((0.32, 0.08, 0.1), (x, 2.04, 0.56), "light")
    obj = b.finish("body_roadster", "body.roadster")
    mounts(obj, "body.roadster", 0.98, 1.3, -1.3, 0.34, (0, 1.0, 0.71), (0, -1.95, 0.7), (0, -2.12, 0.42))
    return obj


def body_brick():
    """Tall and boxy: heavy, wide, big glasshouse."""
    b = Builder()
    b.box((2.0, 4.2, 0.62), (0, 0, 0.6), "paint")
    b.box((1.75, 2.1, 0.55), (0, -0.4, 1.18), "paint")
    b.box((1.8, 1.6, 0.4), (0, -0.4, 1.2), "glass")
    b.box((2.06, 0.2, 0.22), (0, 2.08, 0.42), "trim")  # bumper
    b.box((2.06, 0.2, 0.22), (0, -2.08, 0.42), "trim")
    for x in (-0.7, 0.7):
        b.box((0.36, 0.08, 0.16), (x, 2.1, 0.72), "light")
    obj = b.finish("body_brick", "body.brick")
    mounts(obj, "body.brick", 1.04, 1.35, -1.35, 0.36, (0, 1.2, 0.91), (0, -1.9, 1.46), (0.55, -2.16, 0.4))
    return obj


def body_wedge():
    """A doorstop: knife-edge nose rising to a squared-off tail."""
    b = Builder()
    b.box((1.85, 4.0, 0.62), (0, 0, 0.6), "paint", taper=(1, 0.46, 0.05))
    b.box((1.3, 1.2, 0.32), (0, -0.55, 1.02), "glass", taper=(1, 0.25, 0.12))
    b.box((1.9, 0.14, 0.3), (0, -2.02, 0.62), "trim")
    for x in (-0.6, 0.6):
        b.box((0.4, 0.06, 0.06), (x, 2.0, 0.3), "light")
    obj = b.finish("body_wedge", "body.wedge")
    mounts(obj, "body.wedge", 0.97, 1.25, -1.3, 0.34, (0, 0.2, 0.76), (0, -1.85, 0.91), (0, -2.1, 0.5))
    return obj


# ---- wheels ---------------------------------------------------------------

def wheels(pid, radius, width, segments, hub):
    b = Builder()
    b.cylinder(radius, width, (0, 0, 0), "tyre", segments=segments)
    b.cylinder(radius * hub, width + 0.04, (0, 0, 0), "chrome", segments=segments)
    return b.finish(pid.replace(".", "_"), pid)


# ---- engines, spoilers, exhausts ------------------------------------------

def engine_scoop():
    b = Builder()
    b.box((0.7, 0.8, 0.16), (0, 0, 0.08), "paint", taper=(1, 0.1, 0.0))
    b.box((0.5, 0.06, 0.08), (0, 0.38, 0.1), "trim")
    return b.finish("engine_scoop", "engine.scoop")


def engine_blower():
    b = Builder()
    b.box((0.8, 0.9, 0.2), (0, 0, 0.1), "chrome")
    for x in (-0.2, 0.2):
        b.cylinder(0.14, 0.4, (x, 0.15, 0.4), "chrome", axis="Z", segments=6)
        b.box((0.26, 0.26, 0.06), (x, 0.15, 0.63), "trim")
    return b.finish("engine_blower", "engine.blower")


def engine_vents():
    b = Builder()
    for i in range(4):
        b.box((1.0, 0.1, 0.06), (0, -0.3 + i * 0.2, 0.03), "trim")
    return b.finish("engine_vents", "engine.vents")


def spoiler_lip():
    b = Builder()
    b.box((1.7, 0.3, 0.1), (0, 0, 0.05), "paint", taper=(-1, 0.0, 0.0))
    return b.finish("spoiler_lip", "spoiler.lip")


def spoiler_wing():
    b = Builder()
    for x in (-0.6, 0.6):
        b.box((0.08, 0.14, 0.34), (x, 0, 0.17), "trim")
    b.box((1.9, 0.45, 0.08), (0, -0.05, 0.38), "paint")
    return b.finish("spoiler_wing", "spoiler.wing")


def spoiler_tower():
    b = Builder()
    for x in (-0.45, 0.45):
        b.box((0.1, 0.12, 0.7), (x, 0, 0.35), "chrome")
    b.box((2.0, 0.55, 0.1), (0, -0.05, 0.74), "paint")
    for x in (-1.0, 1.0):
        b.box((0.06, 0.6, 0.3), (x, -0.05, 0.68), "trim")  # endplates
    return b.finish("spoiler_tower", "spoiler.tower")


def exhaust(pid, pipes, radius, length, flame_y):
    b = Builder()
    for x in pipes:
        b.cylinder(radius, length, (x, -length / 2 + 0.1, 0), "chrome", axis="Y", segments=6)
        b.cylinder(radius * 0.6, 0.02, (x, -length + 0.09, 0), "tyre", axis="Y", segments=6)
    obj = b.finish(pid.replace(".", "_"), pid)
    empty(f"flame_{pid.replace('.', '_')}", obj, (0, flame_y, 0), "flame", 1)
    return obj


def build():
    parts = [
        body_roadster(), body_brick(), body_wedge(),
        wheels("wheels.stock", 0.34, 0.32, 8, 0.55),
        wheels("wheels.chunky", 0.42, 0.44, 6, 0.45),
        wheels("wheels.slick", 0.31, 0.4, 10, 0.6),
        engine_scoop(), engine_blower(), engine_vents(),
        spoiler_lip(), spoiler_wing(), spoiler_tower(),
        exhaust("exhaust.single", [0.0], 0.1, 0.4, -0.45),
        exhaust("exhaust.twin", [-0.3, 0.3], 0.09, 0.35, -0.4),
        exhaust("exhaust.stack", [-0.45, -0.15, 0.15, 0.45], 0.07, 0.3, -0.35),
    ]
    # Lay the parts out in a row so the .blend is inspectable; the game ignores root offsets.
    for i, p in enumerate(parts):
        p.location.x = i * 3.0
    return parts


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="public/assets/cars/kit.glb")
    args = ap.parse_args(argv)
    out = (ROOT / args.out).resolve()
    out.parent.mkdir(parents=True, exist_ok=True)

    reset_scene()
    parts = build()
    bpy.ops.export_scene.gltf(
        filepath=str(out), export_format="GLB", export_extras=True, export_yup=True,
        export_apply=True, export_materials="EXPORT", export_animations=False,
    )
    tris = sum(sum(len(poly.vertices) - 2 for poly in p.data.polygons) for p in parts)
    print(f"KIT_OK {out} parts={len(parts)} tris={tris}")


main()
