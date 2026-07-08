"""Quick multi-view QA render of a single GLB (Blender headless, Cycles CPU).

Usage:
  blender --background --python tooling/blender/inspect_glb.py -- <glb_path> <out_png> [vcolor|ivory]
Renders three framed views (front / 3-quarter / side) side by side so mesh quality
and orientation are easy to judge.
"""
import bpy, sys, os, math
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
GLB = os.path.abspath(argv[0])
OUT = os.path.abspath(argv[1])
SHADE = argv[2] if len(argv) > 2 else "vcolor"


def reset():
    bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete()
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.images):
        for d in list(coll):
            try: coll.remove(d)
            except Exception: pass


def import_join():
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=GLB)
    meshes = [o for o in bpy.data.objects if o not in before and o.type == 'MESH']
    bpy.ops.object.select_all(action='DESELECT')
    for m in meshes: m.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1: bpy.ops.object.join()
    o = bpy.context.active_object
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return o


def frame_obj(o):
    # normalize to height 2, centre at origin, base at z=0
    ws = [o.matrix_world @ v.co for v in o.data.vertices]
    minz = min(p.z for p in ws); maxz = max(p.z for p in ws)
    cx = (min(p.x for p in ws) + max(p.x for p in ws)) / 2
    cy = (min(p.y for p in ws) + max(p.y for p in ws)) / 2
    s = 2.0 / max(1e-3, (maxz - minz))
    o.scale = (s, s, s)
    o.location = (-cx * s, -cy * s, -minz * s)
    bpy.ops.object.transform_apply(location=True, scale=True)


def mat_ivory(o):
    m = bpy.data.materials.new("ivory"); m.use_nodes = True
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (0.86, 0.76, 0.55, 1)
    b.inputs["Roughness"].default_value = 0.42
    o.data.materials.clear(); o.data.materials.append(m)


def main():
    reset()
    o = import_join()
    frame_obj(o)
    if SHADE == "ivory":
        mat_ivory(o)
    bpy.ops.object.shade_smooth()

    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 24
    sc.render.film_transparent = False
    world = bpy.data.worlds.new("w"); sc.world = world; world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.13, 0.12, 0.11, 1)
    bpy.ops.object.light_add(type='SUN', location=(4, -6, 9)); bpy.context.active_object.data.energy = 4.5
    bpy.ops.object.light_add(type='AREA', location=(-5, -3, 5)); bpy.context.active_object.data.energy = 500

    # three camera angles around the piece (which stands on +z, ~2 tall)
    target = Vector((0, 0, 1.0))
    angles = [(-90, "front"), (-45, "34"), (0, "side")]  # degrees around Z
    tiles = []
    for i, (deg, tag) in enumerate(angles):
        a = math.radians(deg)
        r = 6.0
        cam = bpy.data.cameras.new("c"); camo = bpy.data.objects.new("c", cam)
        sc.collection.objects.link(camo)
        camo.location = (math.cos(a) * r, math.sin(a) * r, 2.4)
        d = target - camo.location
        camo.rotation_euler = (math.atan2(math.hypot(d.x, d.y), d.z) + 0 * math.pi, 0,
                               math.atan2(d.y, d.x) + math.pi / 2)
        # point camera at target using track: simpler via look-at
        camo.rotation_mode = 'QUATERNION'
        camo.rotation_quaternion = d.to_track_quat('-Z', 'Z')
        sc.camera = camo
        sc.render.resolution_x = 600; sc.render.resolution_y = 760
        p = OUT.replace(".png", f".{tag}.png")
        sc.render.filepath = p
        bpy.ops.render.render(write_still=True)
        tiles.append(p)
    print("VIEWS", tiles)


main()
