"""Call the tencent/Hunyuan3D-2 HF Space to make a 3D mesh from a concept image (free GPU).

Usage: python tooling/hf_hunyuan.py <image> <out.glb> [shape|all] [octree]
  shape -> /shape_generation (geometry only, faster)
  all   -> /generation_all   (geometry + texture)
Key optional: env HF_TOKEN (free token helps if ZeroGPU rate-limits anon calls).
"""
import os
import shutil
import sys

from gradio_client import Client, handle_file

SPACE = "tencent/Hunyuan3D-2"
IMG = sys.argv[1]
OUT = sys.argv[2]
MODE = sys.argv[3] if len(sys.argv) > 3 else "shape"
OCT = int(sys.argv[4]) if len(sys.argv) > 4 else 256
tok = os.environ.get("HF_TOKEN")


def save(item, dst):
    path = None
    if isinstance(item, str):
        path = item
    elif isinstance(item, dict):
        path = item.get("value") or item.get("path") or item.get("name") or item.get("url")
    if path and isinstance(path, str) and os.path.exists(path):
        shutil.copy(path, dst); print("saved", dst, os.path.getsize(dst), "bytes"); return True
    print("could not save from", repr(item)[:200]); return False


def main():
    print("connecting", SPACE, "mode", MODE, "octree", OCT, flush=True)
    c = (Client(SPACE, hf_token=tok) if tok else Client(SPACE))
    api = "/generation_all" if MODE == "all" else "/shape_generation"
    kw = dict(caption=None, image=handle_file(IMG),
              mv_image_front=None, mv_image_back=None, mv_image_left=None, mv_image_right=None,
              steps=30, guidance_scale=5.0, seed=1234, octree_resolution=OCT,
              check_box_rembg=True, num_chunks=8000, randomize_seed=False, api_name=api)
    print("calling", api, "(this runs on HF GPU; may queue)...", flush=True)
    res = c.predict(**kw)
    print("raw result types:", [type(x).__name__ for x in res] if isinstance(res, (list, tuple)) else type(res).__name__)
    items = res if isinstance(res, (list, tuple)) else [res]
    saved = 0
    for item in items:
        path = item.get("value") if isinstance(item, dict) else (item if isinstance(item, str) else None)
        if isinstance(path, str) and path.lower().endswith(".glb"):
            dst = OUT if saved == 0 else OUT.replace(".glb", f".{saved}.glb")
            if save(item, dst):
                saved += 1
    if not saved:
        print("FULL RESULT:", res)


if __name__ == "__main__":
    main()
