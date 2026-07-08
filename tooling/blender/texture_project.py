"""Project a concept image onto a TripoSR mesh as its texture (Blender headless).

TripoSR gives a correct 3D silhouette but a soft surface. The photoreal detail lives
in the original gpt-image concept. This orients/ground the raw mesh, frames an
orthographic camera on its "front", and assigns per-vertex UVs = that camera's
projection so the concept image becomes the surface texture (razor-sharp from the
front; back faces get a mirrored projection, acceptable for board pieces). Exports a
web-ready GLB with the image embedded, plus a 3/4 QA preview.

Run:
  blender -b --python tooling/blender/texture_project.py -- <raw_glb> <concept_img> <out_glb> <preview_png>
Env: ROTX ROTY ROTZ (deg, applied X->Y->Z), CAM (-Y default; front axis the concept faces),
     TARGET_FACES (28000), ASPECT (w/h of concept, default 0.6667).
"""
import bpy, sys, os, math
from mathutils import Vector, Matrix, Euler
from bpy_extras.object_utils import world_to_camera_view

A = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
RAW, CONCEPT, OUT, PREVIEW = (os.path.abspath(A[0]), os.path.abspath(A[1]),
                              os.path.abspath(A[2]), os.path.abspath(A[3]))
ROT = (math.radians(float(os.environ.get("ROTX", "0"))),
       math.radians(float(os.environ.get("ROTY", "0"))),
       math.radians(float(os.environ.get("ROTZ", "0"))))
CAM = os.environ.get("CAM", "-Y")
TARGET_FACES = int(os.environ.get("TARGET_FACES", "28000"))
ASPECT = float(os.environ.get("ASPECT", str(1024 / 1536)))


def reset():
    bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete()
    for c in (bpy.data.meshes, bpy.data.materials, bpy.data.images, bpy.data.cameras):
        for d in list(c):
            try: c.remove(d)
            except Exception: pass


def only(o):
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True)
    bpy.context.view_layer.objects.active = o


def import_join():
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=RAW)
    meshes = [o for o in bpy.data.objects if o not in before and o.type == 'MESH']
    bpy.ops.object.select_all(action='DESELECT')
    for m in meshes: m.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1: bpy.ops.object.join()
    o = bpy.context.active_object
    # bake world transform into mesh data (reliable in --background, unlike operators)
    o.data.transform(o.matrix_world)
    o.matrix_world = Matrix()
    o.data.update()
    return o


def bbox(o):
    ws = [o.matrix_world @ v.co for v in o.data.vertices]
    mn = Vector((min(p.x for p in ws), min(p.y for p in ws), min(p.z for p in ws)))
    mx = Vector((max(p.x for p in ws), max(p.y for p in ws), max(p.z for p in ws)))
    return mn, mx


def orient_ground(o):
    mn0, mx0 = bbox(o)
    print("DBG ROT(deg)=", [round(math.degrees(r), 1) for r in ROT], "CAM=", CAM,
          "z_before=", round(mn0.z, 2), round(mx0.z, 2))
    # rotate + ground by transforming mesh DATA directly (operators no-op headless)
    o.data.transform(Euler(ROT, 'XYZ').to_matrix().to_4x4())
    o.data.update()
    vs = [v.co for v in o.data.vertices]
    minx = min(v.x for v in vs); maxx = max(v.x for v in vs)
    miny = min(v.y for v in vs); maxy = max(v.y for v in vs)
    minz = min(v.z for v in vs)
    o.data.transform(Matrix.Translation((-(minx + maxx) / 2, -(miny + maxy) / 2, -minz)))
    o.data.update()
    mn1, mx1 = bbox(o)
    print("DBG z_after=", round(mn1.z, 2), round(mx1.z, 2),
          "y_after=", round(mn1.y, 2), round(mx1.y, 2))


def clean_decimate(o):
    only(o); bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.remove_doubles(threshold=0.0004)
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    bpy.ops.object.shade_smooth()
    f = len(o.data.polygons)
    if f > TARGET_FACES:
        m = o.modifiers.new('d', 'DECIMATE'); m.ratio = max(0.05, TARGET_FACES / f)
        only(o); bpy.ops.object.modifier_apply(modifier='d')


def make_axis_cameras(o):
    mn, mx = bbox(o)
    ctr = (mn + mx) / 2
    size = mx - mn
    dist = max(size) * 3 + 3
    scale = max(size.z, size.x, size.y) * 1.02
    fwd = {"+X": Vector((1, 0, 0)), "-X": Vector((-1, 0, 0)),
           "+Y": Vector((0, 1, 0)), "-Y": Vector((0, -1, 0))}[CAM]
    cams = {}
    for sign in (1, -1):
        cam = bpy.data.cameras.new("c"); cam.type = 'ORTHO'
        cam.ortho_scale = scale; cam.sensor_fit = 'VERTICAL'
        co = bpy.data.objects.new("c", cam); bpy.context.scene.collection.objects.link(co)
        co.location = ctr + fwd * sign * dist
        co.rotation_mode = 'QUATERNION'
        co.rotation_quaternion = (ctr - co.location).to_track_quat('-Z', 'Z')
        cams[sign] = co
    return cams, ctr, size, fwd


def project_uvs(o, cams, fwd):
    scene = bpy.context.scene
    scene.render.resolution_x = int(1000 * ASPECT); scene.render.resolution_y = 1000
    me = o.data
    uvl = me.uv_layers.new(name="proj")
    # per-vertex projection from each of the two opposing cameras
    proj = {1: {}, -1: {}}
    for v in me.vertices:
        wco = o.matrix_world @ v.co
        for sign, cam in cams.items():
            cc = world_to_camera_view(scene, cam, wco)
            proj[sign][v.index] = (cc.x, cc.y)
    # each face samples the camera it faces most head-on (two-sided, no grey backs)
    for poly in me.polygons:
        sign = 1 if poly.normal.dot(fwd) >= 0 else -1
        table = proj[sign]
        for li in poly.loop_indices:
            uvl.data[li].uv = table[me.loops[li].vertex_index]


def assign_concept_material(o):
    img = bpy.data.images.load(CONCEPT)
    mat = bpy.data.materials.new("concept"); mat.use_nodes = True
    nt = mat.node_tree
    for n in list(nt.nodes): nt.nodes.remove(n)
    out = nt.nodes.new("ShaderNodeOutputMaterial"); out.location = (500, 0)
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled"); bsdf.location = (200, 0)
    bsdf.inputs["Roughness"].default_value = 0.5
    tex = nt.nodes.new("ShaderNodeTexImage"); tex.location = (-150, 0)
    tex.image = img; tex.extension = 'EXTEND'  # clamp -> ivory edge, never repeat
    uv = nt.nodes.new("ShaderNodeUVMap"); uv.location = (-380, 0); uv.uv_map = "proj"
    nt.links.new(uv.outputs["UV"], tex.inputs["Vector"])
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    o.data.materials.clear(); o.data.materials.append(mat)


def render_preview(o):
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 20
    w = bpy.data.worlds.new("w"); sc.world = w; w.use_nodes = True
    w.node_tree.nodes["Background"].inputs[0].default_value = (0.12, 0.11, 0.10, 1)
    bpy.ops.object.light_add(type='SUN', location=(4, -6, 9)); bpy.context.active_object.data.energy = 4
    bpy.ops.object.light_add(type='AREA', location=(-5, -4, 5)); bpy.context.active_object.data.energy = 500
    mn, mx = bbox(o); ctr = (mn + mx) / 2; h = mx.z - mn.z
    cam = bpy.data.cameras.new("v"); cam.lens = 55
    co = bpy.data.objects.new("v", cam); sc.collection.objects.link(co); sc.camera = co
    co.rotation_mode = 'QUATERNION'
    sc.render.resolution_x = 560; sc.render.resolution_y = 760
    # orbit around the piece so both textured sides + base are visible
    for deg, tag in [(35, "a"), (150, "b"), (255, "c")]:
        a = math.radians(deg); r = h * 1.7
        co.location = ctr + Vector((math.cos(a) * r, math.sin(a) * r, h * 0.35))
        co.rotation_quaternion = (ctr - co.location).to_track_quat('-Z', 'Z')
        sc.render.filepath = PREVIEW.replace(".png", f".{tag}.png")
        bpy.ops.render.render(write_still=True)


def export(o):
    only(o)
    # JPEG-compress the embedded texture -> much smaller GLB for the web/mobile
    common = dict(filepath=OUT, export_format='GLB', use_selection=True, export_yup=True)
    try:
        bpy.ops.export_scene.gltf(export_image_format='JPEG', export_jpeg_quality=85, **common)
    except TypeError:
        try:
            bpy.ops.export_scene.gltf(export_image_format='JPEG', **common)
        except TypeError:
            bpy.ops.export_scene.gltf(**common)


def downscale_concept(max_px=1024):
    """Cap the projected texture size before export (Blender-side, no PIL)."""
    for img in bpy.data.images:
        if img.source == 'FILE' and max(img.size) > max_px and img.size[0] and img.size[1]:
            w, h = img.size
            s = max_px / max(w, h)
            img.scale(int(w * s), int(h * s))


def main():
    reset()
    o = import_join()
    orient_ground(o)
    clean_decimate(o)
    cams, ctr, size, fwd = make_axis_cameras(o)
    project_uvs(o, cams, fwd)
    assign_concept_material(o)
    downscale_concept(1024)
    export(o)
    render_preview(o)
    print("PROJECTED", OUT, "faces", len(o.data.polygons))
    print("PREVIEW", PREVIEW)


main()
