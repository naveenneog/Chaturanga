"""Render a raw mesh from the 4 side axes (+X,-X,+Y,-Y) + top, world up = +Z, tiled.
Used to read a TripoSR mesh's native orientation so we can set the correct fix rotation.

  blender -b --python tooling/blender/axis_views.py -- <glb> <out_png>
"""
import bpy, sys, os, math
from mathutils import Vector

A = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
GLB, OUT = os.path.abspath(A[0]), os.path.abspath(A[1])


def reset():
    bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete()
    for c in (bpy.data.meshes, bpy.data.materials, bpy.data.cameras):
        for d in list(c):
            try: c.remove(d)
            except Exception: pass


def import_join():
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=GLB)
    ms = [o for o in bpy.data.objects if o not in before and o.type == 'MESH']
    bpy.ops.object.select_all(action='DESELECT')
    for m in ms: m.select_set(True)
    bpy.context.view_layer.objects.active = ms[0]
    if len(ms) > 1: bpy.ops.object.join()
    o = bpy.context.active_object
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return o


reset()
o = import_join()
bpy.ops.object.shade_smooth()
m = bpy.data.materials.new("iv"); m.use_nodes = True
b = m.node_tree.nodes.get("Principled BSDF")
b.inputs["Base Color"].default_value = (0.85, 0.75, 0.55, 1); b.inputs["Roughness"].default_value = 0.45
o.data.materials.clear(); o.data.materials.append(m)

ws = [o.matrix_world @ v.co for v in o.data.vertices]
mn = Vector((min(p.x for p in ws), min(p.y for p in ws), min(p.z for p in ws)))
mx = Vector((max(p.x for p in ws), max(p.y for p in ws), max(p.z for p in ws)))
ctr = (mn + mx) / 2
rad = max(mx - mn)

sc = bpy.context.scene
sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 12
w = bpy.data.worlds.new("w"); sc.world = w; w.use_nodes = True
w.node_tree.nodes["Background"].inputs[0].default_value = (0.14, 0.13, 0.12, 1)
bpy.ops.object.light_add(type='SUN', location=(5, -6, 9)); bpy.context.active_object.data.energy = 4

dirs = [("+X", Vector((1, 0, 0))), ("-X", Vector((-1, 0, 0))),
        ("+Y", Vector((0, 1, 0))), ("-Y", Vector((0, -1, 0))), ("+Z", Vector((0, 0, 1)))]
paths = []
for tag, ax in dirs:
    cam = bpy.data.cameras.new(tag); cam.type = 'ORTHO'; cam.ortho_scale = rad * 1.15
    co = bpy.data.objects.new(tag, cam); sc.collection.objects.link(co); sc.camera = co
    co.location = ctr + ax * (rad * 3 + 2)
    up = 'Z' if tag != "+Z" else 'Y'
    co.rotation_mode = 'QUATERNION'
    co.rotation_quaternion = (ctr - co.location).to_track_quat('-Z', up)
    sc.render.resolution_x = 420; sc.render.resolution_y = 560
    p = OUT.replace(".png", f".{tag}.png"); sc.render.filepath = p
    bpy.ops.render.render(write_still=True); paths.append((tag, p))

# tile with PIL
try:
    from PIL import Image, ImageDraw
    ims = [(t, Image.open(p).convert("RGB")) for t, p in paths]
    cw, ch = 420, 560
    sheet = Image.new("RGB", (cw * len(ims), ch), (20, 20, 20))
    d = ImageDraw.Draw(sheet)
    for i, (t, im) in enumerate(ims):
        sheet.paste(im, (i * cw, 0)); d.text((i * cw + 8, 8), t, fill=(255, 220, 120))
    sheet.save(OUT); print("SHEET", OUT)
except Exception as e:
    print("tile failed", e)
