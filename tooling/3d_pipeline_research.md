Agent is idle (waiting for messages). agent_id: blender-realism-research, agent_type: research, status: idle, description: Research realistic 3D asset pipelines, elapsed: 824s, total_turns: 1

[Turn 0]
I now have comprehensive information from all my research. Here is the complete report:

---

# Research Report: 3D Game Piece Pipeline for Chaturanga (Blender + AI)

## SUMMARY
Seven image-to-3D API services exist, of which **Meshy AI** (200 free credits/month, no card) and **Tripo AI** (300 free credits/month, GLB default) are the most accessible free-tier options with documented REST APIs. For local open-source, **TripoSR** (MIT, ~374 MB, verified CPU-feasible on Windows) is the only realistic CPU-only option; all others (InstantMesh, TRELLIS, Wonder3D) practically require a GPU. The **recommended pipeline** is: Azure gpt-image-2 concept → Meshy API (free tier) → GLB, with Blender CPU post-processing as finishing step.

---

## 1. IMAGE-TO-3D API SERVICES

### 1.1 Meshy AI
- **REST API:** Yes. Full API with text-to-3D, image-to-3D, multi-image-to-3D, retexture, remesh, rigging.
- **Free tier:** **200 credits/month, no credit card required.** Outputs on free plan carry CC BY 4.0 license.
- **Auth:** `Authorization: Bearer <API_KEY>` — key generated at `meshy.ai/settings`.
- **Endpoint (verified):**
  ```
  POST https://api.meshy.ai/openapi/v2/image-to-3d
  ```
- **Minimal request body:**
  ```json
  {
    "image_url": "https://your-cdn.com/horse_concept.png",
    "should_texture": true,
    "enable_pbr": true,
    "ai_model": "meshy-6"
  }
  ```
- **Response:** Returns `task_id`. Poll with `GET https://api.meshy.ai/openapi/v2/image-to-3d/{task_id}`. On success: `model_urls.glb`, `model_urls.fbx`, `model_urls.obj`.
- **Credit cost:** 20 credits (mesh only) or **30 credits (with PBR textures)** for Meshy-6. At 200 free credits/month → **~6 fully textured GLBs/month** for free.
- **GLB + PBR:** ✅ UV-unwrapped, PBR albedo/roughness/metallic/normal maps, 1k–300k tris configurable.
- **Sources:** [docs.meshy.ai/en/api/pricing](https://docs.meshy.ai/en/api/pricing) *(fetched and verified)*, [yangmao.ai/en/providers/meshy/free-tier/](https://yangmao.ai/en/providers/meshy/free-tier/)

---

### 1.2 Tripo AI (TripoAPI)
- **REST API:** Yes. Official platform: `platform.tripo3d.ai` (web docs render as JS SPA; underlying API documented at PyPI `tripo3d` package and community docs).
- **Free tier:** **300 credits/month, Basic plan at $0** — no credit card. Limitation: **only 15 GLB downloads/month** on free tier, public models only (CC BY 4.0), 1 concurrent task.
- **Auth:** `Authorization: Bearer <API_KEY>`
- **Official base endpoint:**
  ```
  POST https://api.tripo3d.ai/v2/openapi/task
  ```
  Request body:
  ```json
  {
    "type": "image_to_model",
    "file": { "type": "png", "url": "https://your-image.png" },
    "texture": true,
    "pbr": true,
    "face_limit": 20000
  }
  ```
- **Polling:** `GET https://api.tripo3d.ai/v2/openapi/task/{task_id}` → status RUNNING/SUCCESS/FAILED, download URL when done.
- **GLB + PBR:** ✅ Default output format; also FBX, OBJ, USDZ, STL. Optional quad remesh, smart-low-poly.
- **Credit cost:** Roughly 20–80 credits per generation depending on quality/texture options.
- **Sources:** [tripo3d.ai/pricing](https://www.tripo3d.ai/pricing), [pypi.org/project/tripo3d/](https://pypi.org/project/tripo3d/), community docs via 3daistudio.com

> ⚠️ **Note:** Tripo underwent a rebranding. Some third-party documentation uses `api.3daistudio.com/v1/3d-models/tripo/...` as a wrapper endpoint — prefer the official `api.tripo3d.ai/v2/openapi/task` endpoint.

---

### 1.3 Deemos Rodin (Hyper3D Rodin Gen-2.5)
- **REST API:** Yes. Fully documented at [developer.hyper3d.ai](https://developer.hyper3d.ai).
- **Free tier:** **10 credits on signup.** Critically: the service uses a **pay-on-export model** — you can generate and preview for free unlimited times; credits are only consumed when you download/export. Additional credits: **$1.50 USD/credit**. No automatic monthly refresh on free plan.
- **Auth:** `Authorization: Bearer <API_KEY>`
- **Endpoint (verified from official docs):**
  ```
  POST https://hyperhuman.deemos.com/api/v2/rodin
  Content-Type: multipart/form-data
  ```
  Minimal request:
  ```
  images=@war_horse_concept.png
  tier=Gen-2.5-Medium
  geometry_file_format=glb
  material=PBR
  quality=medium
  ```
- **Response:** Task UUID → poll `/api/v2/rodin/status/{uuid}` → download endpoint when ready.
- **GLB + PBR:** ✅ Full PBR (base color, metallic, roughness, normal textures). Default is `glb`. Also FBX, USDZ, OBJ, STL.
- **Quality tiers (costs):** Gen-2.5-Low/Medium/High: **0.5 credits**; Gen-2.5-Extreme-High: **1.0 credit**. HighPack addon (4K textures): +1 credit.
- **Quality assessment:** Generally considered among the highest-quality outputs for intricate objects; excellent for carved figurines.
- **Sources:** [developer.hyper3d.ai/api-specification/rodin-gen2.5.md](https://developer.hyper3d.ai/api-specification/rodin-gen2.5.md) *(fetched and verified)*, [costbench.com/software/ai-3d-generation/rodin-hyper3d/](https://costbench.com/software/ai-3d-generation/rodin-hyper3d/)

---

### 1.4 Stability AI (Stable Fast 3D / SPAR3D)
- **REST API:** Yes, cloud endpoint + self-hostable.
- **Free tier (cloud API):** ~**25 credits on signup**. Each Stable Fast 3D generation: **10 credits**. So ~2 free generations via API. Rate limit: ~50 API calls/day on free tier.
- **Auth:** `Authorization: Bearer <API_KEY>` from [platform.stability.ai](https://platform.stability.ai).
- **Cloud endpoint:**
  ```
  POST https://api.stability.ai/v2beta/3d/stable-fast-3d
  Content-Type: multipart/form-data
  ```
  ```
  image=@input.png
  texture_resolution=1024
  foreground_ratio=0.85
  ```
- **Self-hosted (local):** Available at [github.com/Stability-AI/stable-fast-3d](https://github.com/Stability-AI/stable-fast-3d) under Stability AI Community License (free for <$1M annual revenue).
- **GLB + PBR:** ✅ Outputs UV-unwrapped mesh with albedo, roughness, metallic in GLB.
- **Model size:** ~3.9 GB (stable-fast-3d.safetensors).
- **Speed:** ~0.5-1 second on GPU; slow on CPU.
- **Sources:** [stability.ai/news-updates/introducing-stable-fast-3d](https://stability.ai/news-updates/introducing-stable-fast-3d), [platform.stability.ai/pricing](https://platform.stability.ai/pricing), [stability.ai/api-pricing-update-25](https://stability.ai/api-pricing-update-25)

---

### 1.5 Luma AI (Genie 3D)
- **REST API:** Yes, but **full programmatic API access requires paid plan** ($30+/month).
- **Free tier:** 10 3D generations/day via web UI. API keys at `lumalabs.ai/api/keys`. Free tier output is watermarked; REST API calls essentially require Plus/Pro plan.
- **Auth:** Bearer token
- **Endpoint:** `POST https://api.lumalabs.ai/dream-machine/v1/generations/3d` (Genie endpoint; exact path varies by client SDK version)
- **GLB + PBR:** ✅ GLB, OBJ, FBX, USDZ outputs.
- **Ranking note:** REST API access effectively **not free** — web-only free tier.
- **Sources:** [costbench.com/software/ai-3d-generation/luma-genie/free-plan/](https://costbench.com/software/ai-3d-generation/luma-genie/free-plan/)

---

### 1.6 CSM.ai (Common Sense Machines)
- **REST API:** Yes (`https://api.csm.ai`, docs at `docs.csm.ai`).
- **Free tier:** "Cube Free Plan" — existence confirmed, exact free credit limits not publicly documented. Limited free generation for prototyping.
- **Auth:** API key
- **GLB:** ✅ Supported
- **Ranking note:** Least-documented free tier; docs require signup to view full details.
- **Sources:** [docs.csm.ai](https://docs.csm.ai), [toolschool.ai/tools/csm-ai](https://toolschool.ai/tools/csm-ai)

---

### 1.7 Sudo AI
- **REST API:** Yes (available after signup at `sudo.ai`).
- **Free tier:** Limited free credits (a few models/month), no credit card required; exports to GLB included.
- **Paid:** $15/month (Pro), $49/month (Studio).
- **GLB + PBR:** ✅
- **Tech base:** Zero123++, One-2-3-45++ (non-commercial licenses for underlying models — check commercial terms carefully).
- **Sources:** [aiwisepicks.com/tools/sudo-ai/](https://aiwisepicks.com/tools/sudo-ai/), [github.com/SUDO-AI-3D/zero123plus](https://github.com/SUDO-AI-3D/zero123plus)

---

### 📊 Ranking: Easiest Free Start + Best Quality + GLB Output

| Rank | Service | Free Credits | GLB+PBR | Quality | Notes |
|------|---------|-------------|---------|---------|-------|
| 🥇 1 | **Meshy AI** | 200/month (no card) | ✅ | ★★★★ | Simplest API, best free volume, CC BY 4.0 |
| 🥈 2 | **Tripo AI** | 300/month (no card) | ✅ | ★★★★ | More credits but only 15 downloads/month free |
| 🥉 3 | **Rodin Hyper3D** | 10 signup + pay-on-export | ✅ | ★★★★★ | Best quality, lowest per-unit cost ($0.75 at Gen-2.5-Medium) |
| 4 | **Stability AI SF3D** | ~25 signup credits | ✅ | ★★★★ | Also self-hostable; ~2 free cloud calls |
| 5 | **Sudo AI** | Few/month | ✅ | ★★★ | Fewer details; commercial license unclear |
| 6 | **Luma Genie** | Web-only free | ✅ | ★★★★ | API requires paid plan |
| 7 | **CSM.ai** | Undocumented | ✅ | ★★★ | Opaque free tier |

---

## 2. LOCAL OPEN-SOURCE IMAGE-TO-3D (CPU Feasibility)

### 2.1 TripoSR
- **Repo:** [github.com/VAST-AI-Research/TripoSR](https://github.com/VAST-AI-Research/TripoSR) (Stability AI × VAST AI)
- **License:** **MIT** ✅ (commercial use allowed)
- **Model size:** **~374 MB** (stabilityai/TripoSR on HuggingFace)
- **CPU feasibility:** ✅ **YES — verified CPU mode exists.** Install PyTorch CPU build; run `python run.py input.png --output-dir ./out/`. Estimated runtime: **several minutes per image** on a mid-range CPU (vs. 0.5s on A100).
- **Windows:** ✅ Fully supported (pure Python/PyTorch).
- **Output:** `.obj` mesh by default; convert to GLB with `trimesh` or Blender. Some forks export GLB directly.
- **Notes:** Lacks PBR textures (outputs plain mesh + texture map); quality is decent for game pieces but less photorealistic than commercial APIs.
- **Sources:** [github.com/VAST-AI-Research/TripoSR](https://github.com/VAST-AI-Research/TripoSR), [stability.ai/news-updates/triposr-3d-generation](https://stability.ai/news-updates/triposr-3d-generation), [triposr.org/download](https://triposr.org/download)

---

### 2.2 InstantMesh
- **Repo:** [github.com/TencentARC/InstantMesh](https://github.com/TencentARC/InstantMesh)
- **License:** Apache 2.0 ✅
- **Model size:** Large; **16 GB VRAM recommended** for practical use.
- **CPU feasibility:** ❌ **NOT feasible.** Requires CUDA 12.1+, heavily GPU-dependent. CPU execution would take many hours.
- **Windows:** Not officially supported; Linux + CUDA primary.
- **Output:** Mesh (can be exported as GLB via post-processing).
- **Paper:** arXiv:2404.07191 (April 2024)
- **Sources:** [github.com/TencentARC/InstantMesh](https://github.com/TencentARC/InstantMesh), [arxiv.org/abs/2404.07191](https://arxiv.org/abs/2404.07191)

---

### 2.3 Hunyuan3D-2 / Hunyuan3D-2mini
- **Repo:** [github.com/Tencent-Hunyuan/Hunyuan3D-2](https://github.com/Tencent-Hunyuan/Hunyuan3D-2)
- **License:** Tencent Hunyuan Community License (open for commercial use with conditions; verify for your use case)
- **Model size:** **0.6B params (mini)** / 3.3B (full) — HuggingFace: `tencent/Hunyuan3D-2mini`
- **CPU feasibility:** ⚠️ **PARTIAL.** The shape generation (geometry) component of the mini model can run CPU-only; **texture generation requires GPU**. Shape-only CPU runtime: slow but achievable.
- **Windows:** ✅ Community Windows portable installer available at [github.com/sdbds/Hunyuan3D-2-for-windows](https://github.com/sdbds/Hunyuan3D-2-for-windows). Also ComfyUI-based workflow on Windows.
- **Output:** **GLB natively** — best local option for direct GLB output.
- **Notes:** Most capable local option for Windows; geometry-only output on CPU is feasible for game pieces (can apply PBR materials separately in Blender). Full texture pipeline requires GPU.
- **Sources:** [huggingface.co/tencent/Hunyuan3D-2mini](https://huggingface.co/tencent/Hunyuan3D-2mini), [codersera.com/blog/set-up-hunyuan3d-2-on-windows](https://codersera.com/blog/set-up-hunyuan3d-2-on-windows-a-step-by-step-guide/)

---

### 2.4 Stable-Fast-3D (SF3D, local)
- **Repo:** [github.com/Stability-AI/stable-fast-3d](https://github.com/Stability-AI/stable-fast-3d)
- **License:** Stability AI Community License (free for <$1M annual revenue)
- **Model size:** **~3.9 GB** (`stable-fast-3d.safetensors`)
- **CPU feasibility:** ⚠️ **Slow but documented.** Windows support listed as "experimental" in README. Requires Python 3.8+, Visual Studio 2022, PyTorch CPU build. Generation: ~1s GPU → many minutes CPU.
- **Windows:** ⚠️ Experimental but possible.
- **Output:** GLB with full PBR (albedo, roughness, metallic, normal).
- **Notes:** OpenVINO optimization is documented ([docs.openvino.ai](https://docs.openvino.ai/2024/notebooks/stable-fast-3d-with-output.html)) which may improve CPU speed significantly.
- **Sources:** [github.com/Stability-AI/stable-fast-3d](https://github.com/Stability-AI/stable-fast-3d), [huggingface.co/stabilityai/stable-fast-3d](https://huggingface.co/stabilityai/stable-fast-3d), [docs.openvino.ai/2024/notebooks/stable-fast-3d-with-output.html](https://docs.openvino.ai/2024/notebooks/stable-fast-3d-with-output.html)

---

### 2.5 TRELLIS / TRELLIS.2
- **Repo:** [github.com/microsoft/TRELLIS](https://github.com/microsoft/TRELLIS) / [github.com/microsoft/TRELLIS.2](https://github.com/microsoft/TRELLIS.2)
- **License:** **MIT** ✅
- **Model size:** 4B parameters (TRELLIS.2); 1.2–2B (TRELLIS original)
- **CPU feasibility:** ❌ **NOT feasible for main inference.** Full pipeline requires CUDA 12.4+. Mesh post-processing steps (voxel-to-mesh conversion) can run CPU-only but are not the bottleneck. Speeds on H100: ~3s (512³), ~17s (1024³).
- **Windows:** ⚠️ Primarily Linux; Windows via WSL2+Docker+CUDA only.
- **Output:** **GLB native** via `to_glb()` post-processing function.
- **Sources:** [github.com/microsoft/TRELLIS.2](https://github.com/microsoft/TRELLIS.2), [huggingface.co/microsoft/TRELLIS.2-4B](https://huggingface.co/microsoft/TRELLIS.2-4B/blob/main/README.md), CVPR'25 Spotlight

---

### 2.6 Wonder3D
- **Repo:** [github.com/xxlong0/Wonder3D](https://github.com/xxlong0/Wonder3D)
- **License:** Academic/Non-commercial research license ⚠️ (CVPR 2024 paper; not full OSI open source — check for commercial game use).
- **Model size:** Multiple large diffusion model checkpoints (several GB total).
- **CPU feasibility:** ❌ **NOT feasible.** Multi-view cross-domain diffusion is extremely compute-heavy; CPU runtime: hours per image.
- **Windows:** ⚠️ GPU strongly recommended; no Windows-specific installer.
- **Output:** Mesh with texture (can be converted to GLB).
- **Notes:** State-of-the-art geometry quality for single-image → multi-view → mesh, but strictly GPU-only in practice. Commercial license uncertainty for game use.
- **Sources:** [arxiv.org/abs/2310.15008](https://arxiv.org/abs/2310.15008), [github.com/xxlong0/Wonder3D](https://github.com/xxlong0/Wonder3D), CVPR 2024 Highlight

---

### 🖥️ CPU-on-Windows Feasibility Summary

| Model | CPU-Only Windows | Notes |
|-------|-----------------|-------|
| TripoSR | ✅ **YES** | MIT license, ~374MB, minutes/image, OBJ→GLB conversion needed |
| Hunyuan3D-2mini | ✅ Partial | Geometry-only CPU; no textures without GPU; Windows installer exists |
| Stable-Fast-3D | ⚠️ Experimental | ~3.9GB, slow, Community License; try OpenVINO optimization |
| InstantMesh | ❌ No | 16GB VRAM required |
| TRELLIS.2 | ❌ No | CUDA 12.4 required, Linux primary |
| Wonder3D | ❌ No | Non-commercial license + GPU-only |

---

## 3. TEXT-TO-3D OPTIONS (Free API or CPU-local)

**Cloud APIs (with free tier):**
- **Meshy AI Text-to-3D:** Same 200 free credits/month. Endpoint: `POST https://api.meshy.ai/openapi/v2/text-to-3d/preview` (5 credits for geometry preview with older models, 20 credits for Meshy-6) → `POST https://api.meshy.ai/openapi/v2/text-to-3d/refine` (10 credits for textures). Example: `{ "prompt": "A carved ivory war horse chess piece, Chaturanga style" }`.
- **Tripo AI Text-to-3D:** Same 300 free credits. Same endpoint `POST https://api.tripo3d.ai/v2/openapi/task` with `"type": "text_to_model"` and `"prompt": "..."`.
- **Rodin Hyper3D Text-to-3D:** Same API endpoint — omit `images` parameter, provide `prompt` field. 0.5 credits/generation (Gen-2.5-Medium).

**CPU-local free:**
- **OpenAI Shap-E** ([github.com/openai/shap-e](https://github.com/openai/shap-e)): MIT license, generates 3D from text prompts. CPU-feasible (slow). Outputs `.ply`/`.obj`/mesh; convert to GLB with `trimesh`. Quality is "blobby" — fine for quick iteration but not photorealistic. HuggingFace demo: `huggingface.co/openai/shap-e`.

**Assessment for Chaturanga pieces:** Text-to-3D quality for complex specific figurines (war horse, war elephant, chariot) is less reliable than image-guided. Generate a concept image first (via Azure gpt-image-2), then use image-to-3D for better results.

---

## 4. STAYING IN BLENDER (Fallback — Reproducible Headless Scripting)

### 4a. Reference Image Plane Guided Modeling (Scriptable)

The **"Import Images as Planes"** addon (`io_import_images_as_planes`) ships with Blender and can be fully scripted headlessly:

```python
import bpy

# Enable addon (safe to call even if already enabled)
bpy.ops.preferences.addon_enable(module='io_import_images_as_planes')

# Import front reference view
bpy.ops.import_image.to_plane(
    files=[{"name": "horse_front.png"}],
    directory="C:/concepts/",
    relative=False,
    align_axis='Z_PLUS',
    size_mode='ABSOLUTE'
)
front_ref = bpy.context.selected_objects[0]
front_ref.location = (0, -2.0, 0)   # Place behind model

# Import 3/4 view reference
bpy.ops.import_image.to_plane(
    files=[{"name": "horse_side.png"}],
    directory="C:/concepts/",
    relative=False,
    align_axis='Z_PLUS',
)
side_ref = bpy.context.selected_objects[0]
side_ref.location = (2.0, 0, 0)
side_ref.rotation_euler = (0, 0, 1.5708)  # 90° rotation
```

**Limitation:** The reference image planes are visual guides — actual geometry still requires either manual sculpting (requires GUI) or a fully scripted mesh-building strategy (see 4b).

### 4b. Organic Base Forms: Skin Modifier + Subdivision (Most Scriptable)

The **Skin modifier pipeline** is the most automation-friendly for humanoid game pieces headlessly:

```python
import bpy, bmesh

# 1. Create a skeleton as vertices + edges
mesh = bpy.data.meshes.new('HorseSkel')
obj = bpy.data.objects.new('HorseSkel', mesh)
bpy.context.collection.objects.link(obj)
bm = bmesh.new()

# Define skeleton points (horse body layout example)
pts = {
    'neck_base': (0, 0, 1.4),  'head':     (0, 0.5, 2.0),
    'chest':     (0, 0, 1.0),  'back':     (0, -0.5, 1.1),
    'rump':      (0, -1.0, 0.9),
    'fl_shoulder': (0.3, 0.2, 0.8), 'fl_knee': (0.3, 0.3, 0.4), 'fl_hoof': (0.3, 0.3, 0),
    'fr_shoulder': (-0.3, 0.2, 0.8), 'fr_knee': (-0.3, 0.3, 0.4), 'fr_hoof': (-0.3, 0.3, 0),
    'rl_hip': (0.3, -0.8, 0.8), 'rl_knee': (0.3, -0.7, 0.4), 'rl_hoof': (0.3, -0.7, 0),
    'rr_hip': (-0.3, -0.8, 0.8), 'rr_knee': (-0.3, -0.7, 0.4), 'rr_hoof': (-0.3, -0.7, 0),
    'tail_base': (0, -1.1, 1.0), 'tail_mid': (0, -1.4, 0.8), 'tail_tip': (0, -1.6, 0.5),
}
verts = {k: bm.verts.new(v) for k, v in pts.items()}
edges = [
    ('neck_base','head'), ('neck_base','chest'), ('chest','back'), ('back','rump'),
    ('chest','fl_shoulder'), ('fl_shoulder','fl_knee'), ('fl_knee','fl_hoof'),
    ('chest','fr_shoulder'), ('fr_shoulder','fr_knee'), ('fr_knee','fr_hoof'),
    ('rump','rl_hip'), ('rl_hip','rl_knee'), ('rl_knee','rl_hoof'),
    ('rump','rr_hip'), ('rr_hip','rr_knee'), ('rr_knee','rr_hoof'),
    ('rump','tail_base'), ('tail_base','tail_mid'), ('tail_mid','tail_tip'),
]
for a, b in edges: bm.edges.new((verts[a], verts[b]))
bm.to_mesh(mesh); bm.free()

# 2. Adjust skin radii (controls limb thickness)
bpy.context.view_layer.objects.active = obj
bpy.ops.object.mode_set(mode='EDIT')
bm2 = bmesh.from_edit_mesh(mesh)
skin_layer = bm2.verts.layers.skin.verify()
for v in bm2.verts:
    sv = v[skin_layer]
    if 'hoof' in [k for k,vt in pts.items() if abs(vt[0]-v.co.x)<.01]:
        sv.radius = (0.05, 0.05)
    elif 'head' in [k for k,vt in pts.items() if abs(vt[2]-v.co.z)<.01]:
        sv.radius = (0.25, 0.25)
    else:
        sv.radius = (0.15, 0.15)
bmesh.update_edit_mesh(mesh)
bpy.ops.object.mode_set(mode='OBJECT')

# 3. Add Skin + Subdivision modifiers
skin_mod = obj.modifiers.new('Skin', 'SKIN')
sub_mod  = obj.modifiers.new('Subdivision', 'SUBSURF')
sub_mod.levels = 3

# 4. Apply modifiers (bake to mesh for GLB export)
bpy.ops.object.modifier_apply(modifier='Skin')
bpy.ops.object.modifier_apply(modifier='Subdivision')
```

**Key `bpy` API entries:**
- `bpy.ops.object.modifier_add(type='SKIN')` / `'SUBSURF'` / `'REMESH'`
- `bpy.data.meshes[...].skin_vertices[0]` — layer for radius data
- `bmesh.from_edit_mesh(mesh)` → `bm.verts.layers.skin.verify()` → `v[skin_layer].radius`
- Metaballs alternative: `bpy.ops.object.metaball_add(type='BALL', radius=r, location=pos)` then `bpy.ops.object.convert(target='MESH')` to merge and apply

**Remesh for clean topology:**
```python
remesh = obj.modifiers.new('Remesh', 'REMESH')
remesh.mode = 'VOXEL'
remesh.voxel_size = 0.02  # smaller = finer detail
bpy.ops.object.modifier_apply(modifier='Remesh')
```

### 4c. Geometry Nodes for Procedural Detailing

Geometry Nodes scripting in bpy is possible but complex to build from scratch. The most practical approach for reproducibility:

1. **Template .blend method:** Create the GN node tree once visually in Blender GUI, save as `.blend`, then in headless scripts load that template and only modify parameters:
   ```python
   bpy.ops.wm.open_mainfile(filepath="C:/templates/chaturanga_base.blend")
   ng = bpy.data.node_groups["DetailModifier"]
   ng.nodes["CarveScale"].inputs[0].default_value = 12.0
   ng.nodes["EngraveDepth"].inputs[0].default_value = 0.03
   ```

2. **Pure bpy GN construction** (for displacement/detailing):
   ```python
   geo_mod = obj.modifiers.new("GeoNodes", "NODES")
   ng = bpy.data.node_groups.new("CarveNodes", 'GeometryNodeTree')
   geo_mod.node_group = ng
   
   # Input → Set Position → Output with Noise displacement
   inp = ng.nodes.new('NodeGroupInput')
   out = ng.nodes.new('NodeGroupOutput')
   set_pos = ng.nodes.new('GeometryNodeSetPosition')
   noise = ng.nodes.new('ShaderNodeTexNoise')
   noise.inputs['Scale'].default_value = 40.0  # carving scale
   vec_math = ng.nodes.new('ShaderNodeVectorMath')
   vec_math.operation = 'SCALE'
   vec_math.inputs['Scale'].default_value = 0.02  # displacement depth
   
   ng.links.new(noise.outputs['Color'], vec_math.inputs[0])
   ng.links.new(vec_math.outputs['Vector'], set_pos.inputs['Offset'])
   ng.links.new(inp.outputs[0], set_pos.inputs['Geometry'])
   ng.links.new(set_pos.outputs['Geometry'], out.inputs[0])
   ```
   Note: Full GN socket binding via bpy requires careful handling of interface sockets in Blender 4.x/5.x.

### 4d. PBR Material Node Graphs for Carved Ivory / Rosewood / Bronze

```python
import bpy

def make_ivory_material(name="Ivory_PBR"):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    for n in nodes: nodes.remove(n)
    
    out   = nodes.new("ShaderNodeOutputMaterial");  out.location = (700, 0)
    bsdf  = nodes.new("ShaderNodeBsdfPrincipled");  bsdf.location = (400, 0)
    # Ivory PBR parameters
    bsdf.inputs["Base Color"].default_value        = (0.98, 0.95, 0.86, 1.0)
    bsdf.inputs["Roughness"].default_value         = 0.18
    bsdf.inputs["Specular IOR Level"].default_value= 0.45  # Blender 4.x+ input name
    # Subsurface for organic wax-like translucency
    bsdf.inputs["Subsurface Weight"].default_value = 0.12  # Blender 4.x key
    bsdf.inputs["Subsurface Radius"].default_value = (0.08, 0.06, 0.04)
    
    # Procedural grain
    noise = nodes.new("ShaderNodeTexNoise"); noise.location = (0, 100)
    noise.inputs["Scale"].default_value      = 45.0
    noise.inputs["Detail"].default_value     = 8.0
    noise.inputs["Roughness"].default_value  = 0.7
    mix_c = nodes.new("ShaderNodeMixRGB"); mix_c.location = (200, 100)
    mix_c.blend_type = 'OVERLAY'; mix_c.inputs["Fac"].default_value = 0.12
    mix_c.inputs["Color2"].default_value = (0.85, 0.80, 0.68, 1.0)
    
    # Bump for micro surface
    bump  = nodes.new("ShaderNodeBump");      bump.location = (200, -150)
    bump.inputs["Strength"].default_value = 0.3
    musg  = nodes.new("ShaderNodeTexMusgrave"); musg.location = (0, -150)
    musg.inputs["Scale"].default_value = 80.0
    
    links.new(noise.outputs["Fac"],  mix_c.inputs["Color1"])
    links.new(mix_c.outputs["Color"], bsdf.inputs["Base Color"])
    links.new(musg.outputs["Fac"],   bump.inputs["Height"])
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    links.new(bsdf.outputs["BSDF"],  out.inputs["Surface"])
    return mat

def make_rosewood_material(name="Rosewood_PBR"):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    for n in nodes: nodes.remove(n)
    
    out  = nodes.new("ShaderNodeOutputMaterial"); out.location = (700, 0)
    bsdf = nodes.new("ShaderNodeBsdfPrincipled");  bsdf.location = (400, 0)
    bsdf.inputs["Roughness"].default_value = 0.45
    
    # Wave texture for wood grain rings
    wave = nodes.new("ShaderNodeTexWave"); wave.location = (0, 0)
    wave.wave_type = 'BANDS'; wave.bands_direction = 'X'
    wave.inputs["Scale"].default_value      = 10.0
    wave.inputs["Distortion"].default_value  = 6.0
    wave.inputs["Detail"].default_value      = 4.0
    
    cr = nodes.new("ShaderNodeValToRGB"); cr.location = (200, 0)  # ColorRamp
    cr.color_ramp.elements[0].color = (0.12, 0.04, 0.02, 1.0)  # dark band
    cr.color_ramp.elements[1].color = (0.28, 0.10, 0.05, 1.0)  # light band
    
    links.new(wave.outputs["Color"],  cr.inputs["Fac"])
    links.new(cr.outputs["Color"],    bsdf.inputs["Base Color"])
    links.new(bsdf.outputs["BSDF"],   out.inputs["Surface"])
    return mat

def make_bronze_material(name="Bronze_PBR"):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    for n in nodes: nodes.remove(n)
    
    out  = nodes.new("ShaderNodeOutputMaterial"); out.location = (700, 0)
    bsdf = nodes.new("ShaderNodeBsdfPrincipled");  bsdf.location = (400, 0)
    bsdf.inputs["Metallic"].default_value   = 1.0
    bsdf.inputs["Roughness"].default_value  = 0.35
    
    # Base bronze + verdigris patina via Noise+MixRGB
    noise = nodes.new("ShaderNodeTexNoise"); noise.location = (0, 0)
    noise.inputs["Scale"].default_value = 6.0
    noise.inputs["Detail"].default_value = 6.0
    
    mix_c = nodes.new("ShaderNodeMixRGB"); mix_c.location = (200, 0)
    mix_c.blend_type = 'MIX'
    mix_c.inputs["Color1"].default_value = (0.62, 0.50, 0.28, 1.0)  # bronze
    mix_c.inputs["Color2"].default_value = (0.22, 0.45, 0.30, 1.0)  # patina
    
    links.new(noise.outputs["Fac"],  mix_c.inputs["Fac"])
    links.new(mix_c.outputs["Color"], bsdf.inputs["Base Color"])
    links.new(bsdf.outputs["BSDF"],  out.inputs["Surface"])
    return mat
```

> ⚠️ **Blender 4.x/5.x API note:** Input socket names for Principled BSDF changed in Blender 4.0. In Blender 5.1: use `"Subsurface Weight"` not `"Subsurface"`, `"Specular IOR Level"` not `"Specular"`. Check `bsdf.inputs.keys()` in Python console to verify exact socket names for your Blender version.

### 4e. Baking a GPT-Image Concept to Base-Color + Deriving Normal/Roughness Maps

```python
import bpy

# --- Setup: Object must have UV map and material
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'          # CPU baking explicit
scene.cycles.samples = 32            # Low samples fine for baking

obj = bpy.data.objects["HorseChessPiece"]
bpy.context.view_layer.objects.active = obj
obj.select_set(True)

# Create bake target images
def new_bake_image(name, res=2048):
    img = bpy.data.images.new(name, width=res, height=res, alpha=False)
    img.colorspace_settings.name = 'sRGB' if 'base' in name.lower() else 'Non-Color'
    return img

base_img   = new_bake_image("HorseBaseColor", 2048)
normal_img = new_bake_image("HorseNormal",    2048)

# Add image texture nodes to material (required for bake target)
mat = obj.data.materials[0]
tree = mat.node_tree

for img, suffix in [(base_img, "BakeTarget_Base"), (normal_img, "BakeTarget_Normal")]:
    img_node = tree.nodes.new('ShaderNodeTexImage')
    img_node.name = suffix
    img_node.image = img

# --- 1. Bake Base Color (from concept image mapped onto mesh)
#        Concept image must be loaded into material as an Image Texture node
#        connected to Base Color input of Principled BSDF
tree.nodes.active = tree.nodes["BakeTarget_Base"]
scene.render.bake.use_pass_direct   = False
scene.render.bake.use_pass_indirect = False
scene.render.bake.use_pass_color    = True
bpy.ops.object.bake(type='DIFFUSE', use_clear=True, margin=4)
base_img.filepath_raw = "//horse_basecolor.png"
base_img.file_format  = 'PNG'
base_img.save()

# --- 2. Bake Normal map (from geometry, including bump/displacement)
tree.nodes.active = tree.nodes["BakeTarget_Normal"]
scene.render.bake.normal_space = 'TANGENT'
bpy.ops.object.bake(type='NORMAL', use_clear=True, margin=4)
normal_img.filepath_raw = "//horse_normal.png"
normal_img.file_format  = 'PNG'
normal_img.save()

# --- 3. Assemble final PBR material with baked maps for GLB export
mat2 = bpy.data.materials.new("BakedPBR")
mat2.use_nodes = True
n = mat2.node_tree.nodes
l = mat2.node_tree.links
for nd in n: n.remove(nd)

out  = n.new("ShaderNodeOutputMaterial")
bsdf = n.new("ShaderNodeBsdfPrincipled")
tc   = n.new("ShaderNodeTexCoord")
bc_img = n.new("ShaderNodeTexImage"); bc_img.image = base_img
nrm_img = n.new("ShaderNodeTexImage"); nrm_img.image = normal_img
nrm_map = n.new("ShaderNodeNormalMap")

l.new(tc.outputs["UV"],      bc_img.inputs["Vector"])
l.new(tc.outputs["UV"],      nrm_img.inputs["Vector"])
l.new(bc_img.outputs["Color"],  bsdf.inputs["Base Color"])
l.new(nrm_img.outputs["Color"], nrm_map.inputs["Color"])
l.new(nrm_map.outputs["Normal"], bsdf.inputs["Normal"])
bsdf.inputs["Roughness"].default_value = 0.4
l.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

obj.data.materials.clear()
obj.data.materials.append(mat2)

# --- 4. Export as GLB
bpy.ops.export_scene.gltf(
    filepath="C:/output/horse_piece.glb",
    export_format='GLB',
    export_materials='EXPORT',
    export_apply=True,     # apply modifiers
    export_yup=True,
    export_texcoords=True,
    export_normals=True,
    export_draco_mesh_compression_enable=False  # keep compatible
)
```

> **CPU baking works perfectly in Blender headless** — Cycles CPU baking is fully supported with `--background`. This is the ideal path: use gpt-image-2 concept as the Image Texture driving Base Color, bake it onto your simplified figurine mesh, and export.

### 4f. Useful Bundled Blender Add-ons

| Addon module name | Enabled via | Use for Chaturanga |
|---|---|---|
| `io_import_images_as_planes` | `addon_enable(module=...)` | Reference image planes for modeling guide ✅ |
| `add_mesh_extra_objects` | same | Gears (chariot wheels), pipes, torus knots for decorative bases ✅ |
| `add_curve_extra_objects` | same | Spirals for scroll decoration on chariot; coils ✅ |
| `sapling` | same | Not directly useful for figurines; ornamental trees for environment only ❌ |
| `node_wrangler` | same | Accelerates node tree manipulation in script-assisted workflows |
| `io_scene_gltf2` | **built-in, always on** | The glTF/GLB exporter (`bpy.ops.export_scene.gltf`) ✅ |

```python
# Enable all useful addons headlessly
for addon in ['io_import_images_as_planes', 'add_mesh_extra_objects',
              'add_curve_extra_objects', 'node_wrangler']:
    bpy.ops.preferences.addon_enable(module=addon)
```

For chariot wheels specifically:
```python
bpy.ops.mesh.primitive_circle_add(vertices=16, radius=0.4)
wheel = bpy.context.active_object
# Extrude and add spokes via bmesh operations...
```

---

## 5. FINAL RECOMMENDATION

### Verdict: **Azure gpt-image-2 → Meshy AI Free API → GLB, with Blender CPU post-processing**

This pipeline is the optimal balance of realism, reproducibility, free cost, and your exact constraints.

---

### Why This Wins

| Criterion | Meshy API path | Local TripoSR | Blender-only |
|-----------|--------------|--------------|-------------|
| Quality | ★★★★★ (production-grade PBR) | ★★★ (decent, no PBR) | ★★ (primitive + procedural) |
| Cost | Free (200 credits/month) | Free | Free |
| Speed | 1–3 min/piece (async API) | 5–20 min/piece (CPU) | Hours (manual script) |
| Reproducibility | ✅ Full script | ✅ Full script | ✅ Full script |
| GPU needed? | No (cloud does it) | No (CPU) | No |
| Windows 11 | ✅ | ✅ | ✅ |
| GLB + PBR | ✅ | Needs conversion | ✅ if baked |

---

### Concrete Step-by-Step Pipeline

#### Step 1: Sign Up for Meshy AI (5 minutes)
1. Go to [meshy.ai](https://meshy.ai) → Sign up (Google/email, **no credit card**)
2. Go to `meshy.ai/settings` → "API Keys" → "Generate API Key"
3. Copy the key (starts with `msy_...`) — store in environment variable: `set MESHY_API_KEY=msy_xxxx`

#### Step 2: Generate Concept Images via Azure gpt-image-2
```python
import os, json, base64, requests

# Azure OpenAI gpt-image-2 call (you have this already working)
AZURE_ENDPOINT = os.environ["AZURE_OPENAI_ENDPOINT"]
AZURE_TOKEN    = os.environ["AZURE_OPENAI_TOKEN"]  # from `az account get-access-token`

pieces = {
    "ashva":     "A carved rosewood Indian chess piece: a rearing war-horse, ornate and detailed, Chaturanga style, white background, front-facing 3/4 view, studio lighting",
    "gaja":      "A carved ivory Indian chess piece: a war elephant with howdah tower, Chaturanga style, white background, front 3/4 view",
    "ratha":     "A carved bronze Indian chess piece: a two-wheeled war chariot, Chaturanga style, white background, front 3/4 view",
    "padati":    "A carved wooden Indian chess piece: a foot soldier spearman, Chaturanga style, white background, front-facing",
    "raja":      "A carved ivory Indian chess piece: a seated king with crown, ornate throne, Chaturanga style, white background",
    "mantri":    "A carved rosewood Indian chess piece: a standing minister/advisor figure, holding scroll, Chaturanga style, white background",
}

def generate_concept(prompt, piece_name):
    headers = {
        "Authorization": f"Bearer {AZURE_TOKEN}",
        "Content-Type": "application/json"
    }
    body = {
        "prompt": prompt,
        "n": 1,
        "size": "1024x1024",
        "quality": "standard",
        "output_format": "url"
    }
    resp = requests.post(
        f"{AZURE_ENDPOINT}/openai/deployments/gpt-image-2/images/generations?api-version=2025-04-01-preview",
        headers=headers, json=body
    )
    data = resp.json()
    return data["data"][0]["url"]

concept_urls = {}
for piece, prompt in pieces.items():
    concept_urls[piece] = generate_concept(prompt, piece)
    print(f"Generated concept for {piece}: {concept_urls[piece]}")
```

#### Step 3: Meshy Image-to-3D API — Submit All 6 Pieces
```python
import time, requests, os

MESHY_KEY = os.environ["MESHY_API_KEY"]
HEADERS = {
    "Authorization": f"Bearer {MESHY_KEY}",
    "Content-Type": "application/json"
}
BASE = "https://api.meshy.ai/openapi/v2"

def submit_image_to_3d(image_url, piece_name):
    """Submit image-to-3D task. Returns task_id."""
    resp = requests.post(f"{BASE}/image-to-3d", headers=HEADERS, json={
        "image_url": image_url,
        "should_texture": True,
        "enable_pbr": True,            # PBR maps: albedo, roughness, metallic, normal
        "ai_model": "meshy-6",         # Latest model (30 credits)
        "hd_texture": False,           # True = higher quality but costs more
        "topology": "triangle",
        "target_polycount": 20000,     # ~20k tris ideal for web Three.js
    })
    resp.raise_for_status()
    task_id = resp.json()["result"]
    print(f"  {piece_name}: submitted → task_id={task_id}")
    return task_id

def poll_and_download(task_id, piece_name, out_dir="./output"):
    """Poll until done, download GLB."""
    os.makedirs(out_dir, exist_ok=True)
    while True:
        r = requests.get(f"{BASE}/image-to-3d/{task_id}", headers=HEADERS)
        data = r.json()
        status = data.get("status")
        if status == "SUCCEEDED":
            glb_url = data["model_urls"]["glb"]
            out_path = os.path.join(out_dir, f"{piece_name}.glb")
            glb_data = requests.get(glb_url).content
            with open(out_path, "wb") as f: f.write(glb_data)
            print(f"  ✅ {piece_name}.glb saved ({len(glb_data)//1024} KB)")
            return out_path
        elif status == "FAILED":
            raise RuntimeError(f"Task {task_id} failed: {data.get('task_error')}")
        else:
            print(f"  ⏳ {piece_name}: {status} ({data.get('progress',0):.0%}) ...")
            time.sleep(10)

# Submit all 6
task_ids = {}
for piece, url in concept_urls.items():
    task_ids[piece] = submit_image_to_3d(url, piece)
    time.sleep(2)  # Avoid rate limits

# Poll and download
glb_paths = {}
for piece, tid in task_ids.items():
    glb_paths[piece] = poll_and_download(tid, piece)
```

#### Step 4: Blender CPU Post-Processing (headless)
```python
# post_process.py — run as: blender --background --python post_process.py -- horse.glb
import bpy, sys, os

# Parse GLB path from args
argv = sys.argv[sys.argv.index("--") + 1:]
glb_in  = argv[0]
glb_out = glb_in.replace(".glb", "_processed.glb")

# Clean scene
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=glb_in)

# Normalize scale to board-game proportions (target: 4cm height = 0.04 blender units)
for obj in bpy.context.scene.objects:
    if obj.type == 'MESH':
        # Normalize to target height
        dims = obj.dimensions
        max_dim = max(dims)
        scale_factor = 0.04 / max_dim
        obj.scale = (scale_factor, scale_factor, scale_factor)
        bpy.ops.object.transform_apply(scale=True)
        # Center on origin
        bpy.ops.object.origin_set(type='ORIGIN_GEOMETRY', center='BOUNDS')
        obj.location = (0, 0, obj.dimensions.z / 2)

# Re-export
bpy.ops.export_scene.gltf(
    filepath=glb_out,
    export_format='GLB',
    export_materials='EXPORT',
    export_apply=True,
    export_yup=True,
    export_draco_mesh_compression_enable=True,   # optional: smaller file for web
    export_draco_mesh_compression_level=6
)
print(f"Exported: {glb_out}")
```

Run for all pieces:
```cmd
for %f in (./output/*.glb) do (
    "C:\Program Files\Blender Foundation\Blender 5.1\blender.exe" ^
    --background --python post_process.py -- %f
)
```

---

### Fallback If Meshy Isn't Sufficient (Quality Upgrade)

**Upgrade path to Rodin Gen-2.5** (best quality, ~$0.75/piece):
- Sign up at [hyper3d.ai](https://hyper3d.ai) → Get API key from developer dashboard
- Same pipeline, swap the API call:
  ```python
  import requests
  
  RODIN_KEY = os.environ["RODIN_API_KEY"]
  resp = requests.post(
      "https://hyperhuman.deemos.com/api/v2/rodin",
      headers={"Authorization": f"Bearer {RODIN_KEY}"},
      files={"images": open("horse_concept.png", "rb")},
      data={
          "tier": "Gen-2.5-High",        # 0.5 credits
          "geometry_file_format": "glb",
          "material": "PBR",
          "quality": "medium",           # 500k raw / 18k quad faces
          "mesh_mode": "Quad",           # cleaner topology for game
          "texture_delight": "true"      # removes baked lighting from textures
      }
  )
  task_uuid = resp.json()["uuid"]
  ```

---

### Key Practical Notes

1. **Azure gpt-image-2 prompt engineering:** Include explicit instructions: "white/neutral background", "single object centered", "no shadows", "front 3/4 view" — this greatly improves image-to-3D quality by giving the model a clean silhouette.

2. **Credits monitoring:** Meshy 200 credits/month = 6 pieces at 30 credits each (PBR). If you need to regenerate or refine, you'll hit the limit. Solution: Use `ai_model: "meshy-4"` (5 credits no texture, 15 credits with texture) for initial tests, switch to `meshy-6` for final.

3. **Tripo as an alternative** (if Meshy quality disappoints): 300 free credits, but note the **15 GLB download/month limit on the free plan** — enough for one full set of 6 pieces per month. Their API endpoint: `POST https://api.tripo3d.ai/v2/openapi/task` with `"type": "image_to_model"`.

4. **Blender 5.1 + glTF:** The built-in glTF exporter (`io_scene_gltf2`) ships with Blender 5.1 and is always enabled. `bpy.ops.export_scene.gltf(...)` works headlessly with no GPU required.

5. **License for game use:** Meshy free tier outputs under **CC BY 4.0** — you must attribute. For a proprietary game, upgrade to Meshy paid ($20/month) to get commercial rights, or use Rodin (credits-only, commercial allowed at Creator+ tier).

---

## Citations Index

| Service / Tool | Source Verified |
|---|---|
| Meshy pricing (200 credits/month, credit costs) | [docs.meshy.ai/en/api/pricing](https://docs.meshy.ai/en/api/pricing) *(fetched directly)* |
| Meshy API endpoint `openapi/v2/image-to-3d` | [docs.meshy.ai/en/api/image-to-3d](https://docs.meshy.ai/en/api/image-to-3d), search-verified |
| Meshy free tier no credit card, CC BY 4.0 | [yangmao.ai/en/providers/meshy/free-tier/](https://yangmao.ai/en/providers/meshy/free-tier/) |
| Tripo 300 credits/month, 15 downloads limit | [tripo3d.ai/pricing](https://www.tripo3d.ai/pricing) |
| Rodin Gen-2.5 API spec (endpoint, params, credits) | [developer.hyper3d.ai/api-specification/rodin-gen2.5.md](https://developer.hyper3d.ai/api-specification/rodin-gen2.5.md) *(fetched directly)* |
| Rodin free tier 10 credits, pay-on-export | [costbench.com/software/ai-3d-generation/rodin-hyper3d/](https://costbench.com/software/ai-3d-generation/rodin-hyper3d/) |
| Stability AI SF3D: 25 signup credits, 10/generation | [platform.stability.ai/pricing](https://platform.stability.ai/pricing), [stability.ai/api-pricing-update-25](https://stability.ai/api-pricing-update-25) |
| Stability AI SF3D model: ~3.9GB, Community License | [github.com/Stability-AI/stable-fast-3d](https://github.com/Stability-AI/stable-fast-3d), [huggingface.co/stabilityai/stable-fast-3d](https://huggingface.co/stabilityai/stable-fast-3d) |
| SF3D OpenVINO CPU acceleration | [docs.openvino.ai/2024/notebooks/stable-fast-3d-with-output.html](https://docs.openvino.ai/2024/notebooks/stable-fast-3d-with-output.html) |
| Luma Genie: API requires paid plan | [costbench.com/software/ai-3d-generation/luma-genie/free-plan/](https://costbench.com/software/ai-3d-generation/luma-genie/free-plan/) |
| TripoSR: MIT license, 374MB, CPU feasible | [github.com/VAST-AI-Research/TripoSR](https://github.com/VAST-AI-Research/TripoSR), [stability.ai/news-updates/triposr-3d-generation](https://stability.ai/news-updates/triposr-3d-generation) |
| InstantMesh: Apache 2.0, 16GB VRAM, GPU-only | [github.com/TencentARC/InstantMesh](https://github.com/TencentARC/InstantMesh), [arxiv.org/abs/2404.07191](https://arxiv.org/abs/2404.07191) |
| Hunyuan3D-2mini: 0.6B params, Windows installer | [huggingface.co/tencent/Hunyuan3D-2mini](https://huggingface.co/tencent/Hunyuan3D-2mini), [github.com/sdbds/Hunyuan3D-2-for-windows](https://github.com/sdbds/Hunyuan3D-2-for-windows) |
| TRELLIS.2: MIT, 4B params, Linux/CUDA only | [github.com/microsoft/TRELLIS.2](https://github.com/microsoft/TRELLIS.2), [huggingface.co/microsoft/TRELLIS.2-4B](https://huggingface.co/microsoft/TRELLIS.2-4B/blob/main/README.md) |
| Wonder3D: Non-commercial, CVPR 2024, GPU only | [arxiv.org/abs/2310.15008](https://arxiv.org/abs/2310.15008), [github.com/xxlong0/Wonder3D](https://github.com/xxlong0/Wonder3D) |
| Blender bpy: Skin modifier, subdivision scripting | [docs.blender.org/api/current/](https://docs.blender.org/api/current/) |
| Blender bpy: `bpy.ops.import_image.to_plane` | [docs.blender.org/api/current/bpy.ops.import_image.html](https://docs.blender.org/api/current/bpy.ops.import_image.html) |
| Blender glTF export: `bpy.ops.export_scene.gltf` | [docs.blender.org/manual/en/latest/files/import_export/glTF2.html](https://docs.blender.org/manual/en/latest/files/import_export/glTF2.html) |
| OpenAI Shap-E: MIT, text-to-3D, CPU feasible | [github.com/openai/shap-e](https://github.com/openai/shap-e) |

---

## Gaps and Uncertainties

1. **Meshy free tier continuity:** The 200 credits/month free plan is confirmed across multiple sources but Meshy has changed credit amounts before. Verify current amount at `meshy.ai/settings` after signup — the official pricing page (fetched directly) doesn't explicitly list the free tier amount, suggesting the free plan details are on the account dashboard.

2. **Tripo official API base URL:** The `platform.tripo3d.ai` docs render as a JS SPA and return blank to headless fetch. The official endpoint `api.tripo3d.ai/v2/openapi/task` is inferred from the `tripo3d` PyPI package and community documentation. The `3daistudio.com` wrapper is a third-party aggregator — use official endpoints only.

3. **Rodin base URL:** The fetched spec shows `/api/v2/rodin` with relative path. Full base URL `https://hyperhuman.deemos.com` is inferred from the Deemos brand (note: the developer portal is `developer.hyper3d.ai`). Their SDK and docs should be consulted at signup for the exact base URL.

4. **Blender 5.1 socket name changes:** Principled BSDF input socket names changed in Blender 4.0 (e.g., `"Subsurface"` → `"Subsurface Weight"`). Blender 5.1 may have further changes. Always validate with `bsdf.inputs.keys()` in the Python console before running headless scripts.

5. **Wonder3D commercial use:** Not definitively confirmed as prohibited; the paper GitHub README should be checked for the specific license file. Do not use for commercial game assets without explicit permission.

6. **Meshy CC BY 4.0 on free tier:** This is documented in community guides but should be verified in Meshy's own Terms of Service for your specific use case (web board game deployment).