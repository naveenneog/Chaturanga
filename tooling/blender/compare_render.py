"""Render two GLBs side by side for comparison (Blender headless, Cycles CPU), keeping
each model's own materials. Normalizes both to the same height and shoots a 3/4 view.

  blender -b --python tooling/blender/compare_render.py -- <glbA> <labelA> <glbB> <labelB> <out.png>
(labels are only for your reference in the console; no text is drawn — Blender has no PIL.)
"""
import bpy, sys, os, math
from mathutils import Vector, Matrix

A = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
GLB_A, LAB_A, GLB_B, LAB_B, OUT = A[0], A[1], A[2], A[3], os.path.abspath(A[4])


def reset():
    bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete()
    for c in (bpy.data.meshes, bpy.data.materials, bpy.data.images, bpy.data.cameras):
        for d in list(c):
            try: c.remove(d)
            except Exception: pass


def import_join(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.abspath(path))
    ms = [o for o in bpy.data.objects if o not in before and o.type == 'MESH']
    if not ms:
        return None
    bpy.ops.object.select_all(action='DESELECT')
    for m in ms: m.select_set(True)
    bpy.context.view_layer.objects.active = ms[0]
    if len(ms) > 1: bpy.ops.object.join()
    o = bpy.context.active_object
    o.data.transform(o.matrix_world); o.matrix_world.identity(); o.data.update()
    return o


def place(o, x):
    ws = [o.matrix_world @ v.co for v in o.data.vertices]
    hz = max(p.z for p in ws) - min(p.z for p in ws)
    s = 2.4 / (hz or 1)
    o.data.transform(Matrix.Diagonal((s, s, s, 1)))
    o.data.update()
    ws = [o.matrix_world @ v.co for v in o.data.vertices]
    minz = min(p.z for p in ws)
    cx = (min(p.x for p in ws) + max(p.x for p in ws)) / 2
    cy = (min(p.y for p in ws) + max(p.y for p in ws)) / 2
    o.data.transform(Matrix.Translation((x - cx, -cy, -minz)))
    o.data.update()
    bpy.ops.object.shade_smooth()


reset()
a = import_join(GLB_A); place(a, -1.8)
b = import_join(GLB_B); place(b, 1.8)
print("LOADED", LAB_A, "verts", len(a.data.vertices) if a else 0,
      "|", LAB_B, "verts", len(b.data.vertices) if b else 0)

sc = bpy.context.scene
sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 28
sc.render.film_transparent = False
w = bpy.data.worlds.new("w"); sc.world = w; w.use_nodes = True
w.node_tree.nodes["Background"].inputs[0].default_value = (0.12, 0.11, 0.10, 1)
bpy.ops.object.light_add(type='SUN', location=(4, -6, 9)); bpy.context.active_object.data.energy = 4.5
bpy.ops.object.light_add(type='AREA', location=(-5, -4, 6)); bpy.context.active_object.data.energy = 700

target = Vector((0, 0, 1.1))
cam = bpy.data.cameras.new("c"); cam.lens = 55
co = bpy.data.objects.new("c", cam); sc.collection.objects.link(co); sc.camera = co
co.location = target + Vector((0, -8.5, 1.9))
co.rotation_mode = 'QUATERNION'
co.rotation_quaternion = (target - co.location).to_track_quat('-Z', 'Z')
sc.render.resolution_x = 1400; sc.render.resolution_y = 780
sc.render.filepath = OUT
bpy.ops.render.render(write_still=True)
print("COMPARE", OUT)
