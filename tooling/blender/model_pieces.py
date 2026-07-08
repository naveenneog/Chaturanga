"""Model carved Chaturanga pieces in Blender (headless) -> glTF (.glb).

v2: controlled primitive/silhouette modelling (metaballs were too blobby).
 - Padati : helmeted foot-soldier with a spear (turned body + head + helmet)
 - Gaja   : war-elephant (rounded body, segmented curling trunk, ears, tusks, legs, howdah)
 - Ashva  : horse head + arched neck from an extruded silhouette, mane, ears, base

Run: blender --background --python tooling/blender/model_pieces.py
"""
import bpy, math, os

OUT = r"C:\Users\navg\DailyApps\Chaturanga\web\assets\models"
PREVIEW = os.path.join(OUT, "_preview.png")
os.makedirs(OUT, exist_ok=True)


def reset():
    bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete()
    for coll in (bpy.data.meshes, bpy.data.metaballs, bpy.data.curves, bpy.data.materials):
        for d in list(coll):
            try: coll.remove(d)
            except Exception: pass


def cone(r1, r2, depth, loc, verts=32, rot=None):
    bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r1, radius2=r2, depth=depth, location=loc)
    o = bpy.context.active_object
    if rot: o.rotation_euler = rot
    for p in o.data.polygons: p.use_smooth = True
    return o


def ball(r, loc, scale=(1, 1, 1), seg=24):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=loc, segments=seg, ring_count=seg // 2)
    o = bpy.context.active_object; o.scale = scale
    for p in o.data.polygons: p.use_smooth = True
    return o


def box(sx, sy, sz, loc, rot=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.active_object; o.scale = (sx, sy, sz)
    if rot: o.rotation_euler = rot
    return o


def join(objs, name):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    o = bpy.context.active_object; o.name = name
    bpy.ops.object.select_all(action='DESELECT')
    return o


def finish(o, subsurf=1, decimate=0.5, smooth=True):
    if smooth:
        for p in o.data.polygons: p.use_smooth = True
    if subsurf:
        m = o.modifiers.new('s', 'SUBSURF'); m.levels = subsurf; m.render_levels = subsurf
    b = o.modifiers.new('b', 'BEVEL'); b.width = 0.006; b.segments = 2
    if decimate:
        d = o.modifiers.new('d', 'DECIMATE'); d.ratio = decimate
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True)
    bpy.context.view_layer.objects.active = o
    for mod in list(o.modifiers):
        try: bpy.ops.object.modifier_apply(modifier=mod.name)
        except Exception: pass
    minz = min((o.matrix_world @ v.co).z for v in o.data.vertices)
    o.location.z -= minz
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bpy.ops.object.select_all(action='DESELECT')
    return o


def face_extrude(profile_xz, thickness, name):
    verts = [(x, 0.0, z) for (x, z) in profile_xz]
    faces = [list(range(len(verts)))]
    me = bpy.data.meshes.new(name); me.from_pydata(verts, [], faces); me.update()
    o = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(o)
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True)
    bpy.context.view_layer.objects.active = o
    sol = o.modifiers.new('solid', 'SOLIDIFY'); sol.thickness = thickness; sol.offset = 0
    bpy.ops.object.modifier_apply(modifier='solid')
    return o


def export(o, fname):
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True)
    bpy.context.view_layer.objects.active = o
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, fname), export_format='GLB',
                              use_selection=True, export_yup=True)


def build_padati():
    parts = [
        cone(0.34, 0.30, 0.10, (0, 0, 0.05)),
        cone(0.24, 0.16, 0.10, (0, 0, 0.15)),
        ball(0.20, (0, 0, 0.44), (1, 1, 1.45)),
        cone(0.16, 0.19, 0.06, (0, 0, 0.62)),
        ball(0.135, (0, 0, 0.76)),
        cone(0.14, 0.0, 0.17, (0, 0, 0.90)),
        cone(0.02, 0.02, 0.95, (0.30, 0, 0.48), verts=10),
        cone(0.05, 0.0, 0.13, (0.30, 0, 1.0), verts=12),
    ]
    return finish(join(parts, "padati"), subsurf=1, decimate=0.45)


def build_gaja():
    parts = []
    parts.append(ball(0.5, (0, 0, 0.55), (1.35, 1.0, 0.92)))
    parts.append(ball(0.34, (0, 0.5, 0.62), (1.0, 0.85, 0.95)))
    trunk_pts = [(0, 0.72, 0.5), (0, 0.82, 0.34), (0, 0.86, 0.18), (0, 0.82, 0.05), (0, 0.72, -0.02), (0, 0.6, -0.02)]
    for i, (x, y, z) in enumerate(trunk_pts):
        parts.append(ball(0.16 - i * 0.017, (x, y, z)))
    for s in (1, -1):
        ear = ball(0.26, (s * 0.34, 0.44, 0.66), (0.18, 0.85, 1.0)); ear.rotation_euler = (0, math.radians(s * 18), 0); parts.append(ear)
    for s in (1, -1):
        parts.append(cone(0.05, 0.0, 0.3, (s * 0.14, 0.66, 0.34), verts=12, rot=(math.radians(60), 0, 0)))
    for sx in (1, -1):
        for sy in (1, -1):
            parts.append(cone(0.15, 0.13, 0.42, (sx * 0.3, sy * 0.26, 0.2)))
    parts.append(box(0.62, 0.6, 0.1, (0, -0.12, 0.98)))
    for sx in (1, -1):
        for sy in (1, -1):
            parts.append(cone(0.028, 0.028, 0.26, (sx * 0.22, -0.12 + sy * 0.22, 1.14), verts=8))
    parts.append(box(0.56, 0.54, 0.07, (0, -0.12, 1.28)))
    return finish(join(parts, "gaja"), subsurf=1, decimate=0.4)


def build_ashva():
    profile = [
        (-0.20, 0.30), (-0.26, 0.55), (-0.28, 0.82), (-0.22, 1.04), (-0.10, 1.16),
        (0.02, 1.14), (0.05, 1.20), (0.20, 1.10), (0.36, 0.99), (0.42, 0.85),
        (0.40, 0.75), (0.26, 0.72), (0.17, 0.64), (0.13, 0.5), (0.02, 0.4), (-0.08, 0.33),
    ]
    head = face_extrude(profile, 0.34, "ashva_head")
    parts = [head]
    for s in (1, -1):
        parts.append(cone(0.06, 0.0, 0.2, (s * 0.09, 0.0, 1.22), verts=10, rot=(math.radians(-10), 0, 0)))
    for i, z in enumerate([0.5, 0.66, 0.82, 0.98, 1.1]):
        parts.append(ball(0.085 - i * 0.006, (-0.2 + i * 0.02, 0, z), (0.5, 0.6, 1.1)))
    parts.append(cone(0.36, 0.30, 0.1, (0, 0, 0.05)))
    parts.append(cone(0.24, 0.18, 0.1, (0, 0, 0.15)))
    return finish(join(parts, "ashva"), subsurf=1, decimate=0.5)


# ---------------- Ratha — chariot (tower with crenellations) ----------------
def build_ratha():
    parts = [
        cone(0.34, 0.30, 0.10, (0, 0, 0.05)),
        cone(0.26, 0.20, 0.10, (0, 0, 0.15)),
        cone(0.20, 0.22, 0.55, (0, 0, 0.45)),          # tower body
        cone(0.27, 0.27, 0.08, (0, 0, 0.74)),          # top rim
    ]
    for i in range(4):
        a = i / 4 * math.tau + math.pi / 4
        parts.append(box(0.11, 0.11, 0.14, (math.cos(a) * 0.18, math.sin(a) * 0.18, 0.82)))
    return finish(join(parts, "ratha"), subsurf=1, decimate=0.5)


# ---------------- Mantri — minister / counsellor ----------------
def build_mantri():
    parts = [
        cone(0.35, 0.30, 0.10, (0, 0, 0.05)),
        cone(0.26, 0.17, 0.12, (0, 0, 0.16)),
        cone(0.16, 0.13, 0.55, (0, 0, 0.48)),          # slender body
        cone(0.13, 0.22, 0.14, (0, 0, 0.82)),          # bell top
        ball(0.10, (0, 0, 0.94)),                       # head knob
    ]
    for i in range(7):                                  # coronet of beads
        a = i / 7 * math.tau
        parts.append(ball(0.045, (math.cos(a) * 0.15, math.sin(a) * 0.15, 0.9)))
    parts.append(ball(0.05, (0, 0, 1.02)))              # finial
    return finish(join(parts, "mantri"), subsurf=1, decimate=0.5)


# ---------------- Raja — king (with a chhatra parasol) ----------------
def build_raja():
    parts = [
        cone(0.37, 0.31, 0.10, (0, 0, 0.05)),
        cone(0.27, 0.18, 0.12, (0, 0, 0.16)),
        cone(0.17, 0.14, 0.62, (0, 0, 0.5)),           # tall body
        cone(0.14, 0.24, 0.14, (0, 0, 0.88)),          # shoulders / bell
        ball(0.11, (0, 0, 1.0)),                        # head
        cone(0.025, 0.025, 0.12, (0, 0, 1.12), verts=10),   # parasol pole
        ball(0.15, (0, 0, 1.2), (1, 1, 0.5)),           # chhatra dome
        cone(0.04, 0.0, 0.1, (0, 0, 1.3), verts=10),    # finial
    ]
    return finish(join(parts, "raja"), subsurf=1, decimate=0.5)


def render_preview(objs):
    mat = bpy.data.materials.new("ivory"); mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (0.85, 0.74, 0.52, 1)
    bsdf.inputs["Roughness"].default_value = 0.5
    for i, o in enumerate(objs):
        o.location.x = (i - (len(objs) - 1) / 2) * 1.5
        o.rotation_euler = (0, 0, math.radians(30))
        o.data.materials.clear(); o.data.materials.append(mat)
    bpy.ops.object.camera_add(location=(0, -10.5, 5.2), rotation=(math.radians(62), 0, 0))
    bpy.context.scene.camera = bpy.context.active_object
    bpy.ops.object.light_add(type='SUN', location=(3, -4, 6)); bpy.context.active_object.data.energy = 5
    bpy.ops.object.light_add(type='AREA', location=(-3, -2, 3)); bpy.context.active_object.data.energy = 300
    world = bpy.data.worlds.new("w"); bpy.context.scene.world = world; world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.06, 0.04, 0.02, 1)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 24
    sc.render.resolution_x = 1600; sc.render.resolution_y = 460
    sc.render.filepath = PREVIEW
    bpy.ops.render.render(write_still=True)


def main():
    reset()
    built = []
    for name, fn in [("padati", build_padati), ("gaja", build_gaja), ("ashva", build_ashva),
                     ("ratha", build_ratha), ("mantri", build_mantri), ("raja", build_raja)]:
        o = fn(); export(o, name + ".glb"); built.append(o)
        print("SIZE", name, os.path.getsize(os.path.join(OUT, name + ".glb")))
    render_preview(built)
    print("PREVIEW", PREVIEW)


main()
