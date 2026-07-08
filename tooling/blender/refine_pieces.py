"""Refine raw TripoSR meshes into web-ready Chaturanga pieces (Blender headless).

For each raw GLB from tooling/triposr_run.py (dense, vertex-coloured, Y-up) this:
  - joins + cleans the mesh, recalculates normals, smooth-shades
  - optionally rotates it upright (ROTX/ROTZ env, degrees) and grounds it to z=0
  - decimates to ~TARGET_FACES for the web
  - keeps the baked vertex colours (wires a Color-Attribute -> Base Color material)
  - exports web/assets/models/<key>.glb  (export_yup, vertex colours on)
  - renders a Cycles-CPU QA contact sheet (_refine_preview.png)

Run:
  blender --background --python tooling/blender/refine_pieces.py -- <IN_DIR> <OUT_DIR> [key ...]
Env knobs: ROTX, ROTZ (deg), TARGET_FACES (default 28000).
"""
import bpy, sys, os, math

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
IN_DIR = argv[0] if argv else r"C:\Users\navg\DailyApps\Chaturanga\tooling\TripoSR\out"
OUT_DIR = argv[1] if len(argv) > 1 else r"C:\Users\navg\DailyApps\Chaturanga\web\assets\models"
KEYS = argv[2:] if len(argv) > 2 else None
ROTX = math.radians(float(os.environ.get("ROTX", "0")))
ROTZ = math.radians(float(os.environ.get("ROTZ", "0")))
TARGET_FACES = int(os.environ.get("TARGET_FACES", "28000"))
os.makedirs(OUT_DIR, exist_ok=True)


def reset():
    bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete()
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.images, bpy.data.objects):
        for d in list(coll):
            try: coll.remove(d)
            except Exception: pass


def only(o):
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True)
    bpy.context.view_layer.objects.active = o


def import_and_join(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    meshes = [o for o in new if o.type == 'MESH']
    if not meshes:
        return None
    bpy.ops.object.select_all(action='DESELECT')
    for m in meshes:
        m.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()
    o = bpy.context.active_object
    # drop any parent empties, bake world transform into the mesh
    only(o)
    bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return o


def clean(o):
    only(o)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.remove_doubles(threshold=0.0004)
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    bpy.ops.object.shade_smooth()


def decimate(o, target):
    f = len(o.data.polygons)
    if f > target:
        m = o.modifiers.new('dec', 'DECIMATE'); m.ratio = max(0.05, target / f)
        only(o); bpy.ops.object.modifier_apply(modifier='dec')


def orient_ground(o):
    if ROTX or ROTZ:
        o.rotation_euler = (ROTX, 0.0, ROTZ)
        only(o); bpy.ops.object.transform_apply(rotation=True)
    only(o)
    xs = [(o.matrix_world @ v.co) for v in o.data.vertices]
    minx = min(p.x for p in xs); maxx = max(p.x for p in xs)
    miny = min(p.y for p in xs); maxy = max(p.y for p in xs)
    minz = min(p.z for p in xs)
    o.location.x -= (minx + maxx) / 2
    o.location.y -= (miny + maxy) / 2
    o.location.z -= minz
    bpy.ops.object.transform_apply(location=True)


def vcolor_material(o, name):
    mat = bpy.data.materials.new(name); mat.use_nodes = True
    nt = mat.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new("ShaderNodeOutputMaterial"); out.location = (400, 0)
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled"); bsdf.location = (120, 0)
    try:
        bsdf.inputs["Roughness"].default_value = 0.45
    except Exception:
        pass
    ca = o.data.color_attributes
    if len(ca):
        vc = nt.nodes.new("ShaderNodeVertexColor"); vc.location = (-160, 0)
        vc.layer_name = ca[0].name
        nt.links.new(vc.outputs["Color"], bsdf.inputs["Base Color"])
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    o.data.materials.clear(); o.data.materials.append(mat)


def export(o, key):
    only(o)
    kw = dict(filepath=os.path.join(OUT_DIR, key + ".glb"), export_format='GLB',
              use_selection=True, export_yup=True)
    try:
        bpy.ops.export_scene.gltf(export_vertex_color='ACTIVE', **kw)
    except TypeError:
        bpy.ops.export_scene.gltf(**kw)


def render_preview(objs):
    ivory = bpy.data.materials.new("prev"); ivory.use_nodes = True
    for i, o in enumerate(objs):
        # normalize height ~2 for a tidy row
        h = max((o.matrix_world @ v.co).z for v in o.data.vertices) or 1
        s = 2.0 / h
        o.scale = (s, s, s); o.location = ((i - (len(objs) - 1) / 2) * 2.4, 0, 0)
        only(o); bpy.ops.object.transform_apply(scale=True, location=True)
    bpy.ops.object.camera_add(location=(0, -12, 6.2), rotation=(math.radians(62), 0, 0))
    bpy.context.scene.camera = bpy.context.active_object
    bpy.ops.object.light_add(type='SUN', location=(4, -5, 8)); bpy.context.active_object.data.energy = 4
    bpy.ops.object.light_add(type='AREA', location=(-4, -3, 5)); bpy.context.active_object.data.energy = 400
    w = bpy.data.worlds.new("w"); bpy.context.scene.world = w; w.use_nodes = True
    w.node_tree.nodes["Background"].inputs[0].default_value = (0.05, 0.04, 0.03, 1)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 20
    sc.render.resolution_x = 1800; sc.render.resolution_y = 520
    sc.render.filepath = os.path.join(OUT_DIR, "_refine_preview.png")
    bpy.ops.render.render(write_still=True)


def main():
    keys = KEYS or [os.path.splitext(f)[0] for f in os.listdir(IN_DIR) if f.endswith(".glb")]
    built = []
    for key in keys:
        path = os.path.join(IN_DIR, key + ".glb")
        if not os.path.exists(path):
            print("MISSING", path); continue
        reset()
        o = import_and_join(path)
        if not o:
            print("NO MESH", key); continue
        clean(o)
        decimate(o, TARGET_FACES)
        orient_ground(o)
        vcolor_material(o, key)
        export(o, key)
        print("REFINED", key, "faces", len(o.data.polygons),
              "size", os.path.getsize(os.path.join(OUT_DIR, key + ".glb")))
    # re-import finals for a clean preview row
    reset()
    for key in keys:
        p = os.path.join(OUT_DIR, key + ".glb")
        if os.path.exists(p):
            o = import_and_join(p)
            if o:
                built.append(o)
    if built:
        render_preview(built)
        print("PREVIEW", os.path.join(OUT_DIR, "_refine_preview.png"))


main()
