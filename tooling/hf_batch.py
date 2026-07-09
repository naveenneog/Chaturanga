"""Batch-generate the remaining Chaturanga pieces via the tencent/Hunyuan3D-2 HF Space.

Reuses one gradio Client connection. Retries each piece on transient errors.
Outputs raw <key>_hunyuan.glb into tooling/hunyuan_out/.

Usage: python tooling/hf_batch.py [key1 key2 ...]   (default = all 5 remaining)
"""
import os
import shutil
import sys
import time

from gradio_client import Client, handle_file

SPACE = "tencent/Hunyuan3D-2"
REFS = os.environ.get("REFS_DIR", os.path.join("web", "assets", "kurukshetra", "refs"))
OUTDIR = os.environ.get("OUT_DIR", os.path.join("tooling", "hunyuan_out"))
OCT = int(os.environ.get("OCTREE", "256"))
tok = os.environ.get("HF_TOKEN")

DEFAULT = ["raja", "mantri", "ratha", "gaja", "padati"]


def extract_glb(res):
    items = res if isinstance(res, (list, tuple)) else [res]
    for item in items:
        path = item.get("value") if isinstance(item, dict) else (item if isinstance(item, str) else None)
        if isinstance(path, str) and path.lower().endswith(".glb") and os.path.exists(path):
            return path
    return None


def gen(client, key, retries=3):
    img = os.path.join(REFS, f"{key}.jpg")
    if not os.path.exists(img):
        print(f"!! missing concept {img}"); return False
    dst = os.path.join(OUTDIR, f"{key}_hunyuan.glb")
    kw = dict(caption=None, image=handle_file(img),
              mv_image_front=None, mv_image_back=None, mv_image_left=None, mv_image_right=None,
              steps=30, guidance_scale=5.0, seed=1234, octree_resolution=OCT,
              check_box_rembg=True, num_chunks=8000, randomize_seed=False,
              api_name="/shape_generation")
    for attempt in range(1, retries + 1):
        try:
            print(f"[{key}] attempt {attempt} calling /shape_generation ...", flush=True)
            t0 = time.time()
            res = client.predict(**kw)
            src = extract_glb(res)
            if not src:
                print(f"[{key}] no glb in result: {repr(res)[:300]}"); time.sleep(5); continue
            shutil.copy(src, dst)
            print(f"[{key}] OK {os.path.getsize(dst)} bytes in {time.time()-t0:.1f}s -> {dst}", flush=True)
            return True
        except Exception as e:
            print(f"[{key}] error: {e}", flush=True)
            time.sleep(10 * attempt)
    return False


def main():
    os.makedirs(OUTDIR, exist_ok=True)
    keys = sys.argv[1:] or DEFAULT
    print("connecting", SPACE, "octree", OCT, "keys", keys, flush=True)
    client = Client(SPACE, hf_token=tok) if tok else Client(SPACE)
    ok, bad = [], []
    for k in keys:
        (ok if gen(client, k) else bad).append(k)
        time.sleep(2)
    print("\n=== DONE ===  ok:", ok, " failed:", bad)
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
