"""Lean TripoSR runner (CPU) — image -> textured GLB, no xatlas/moderngl needed.

Turns a concept image (e.g. web/assets/<world>/refs/<key>.jpg) into a 3D mesh with
baked vertex colours, exported as GLB. Marching cubes uses PyMCubes (see the patch in
tsr/models/isosurface.py) so no native build is required. Runs fully on CPU.

Usage:
  python tooling/triposr_run.py IMG [IMG ...] --out DIR
       [--resolution 256] [--fg 0.85] [--chunk 8192] [--no-remove-bg]

Each IMG -> DIR/<stem>.glb  (+ DIR/<stem>.input.png the preprocessed view)
"""
import argparse
import logging
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "TripoSR"))

import numpy as np  # noqa: E402
import torch  # noqa: E402
import rembg  # noqa: E402
from PIL import Image  # noqa: E402

from tsr.system import TSR  # noqa: E402
from tsr.utils import remove_background, resize_foreground  # noqa: E402

logging.basicConfig(format="%(asctime)s %(levelname)s %(message)s", level=logging.INFO)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("images", nargs="+")
    ap.add_argument("--out", required=True)
    ap.add_argument("--resolution", type=int, default=256, help="marching-cubes grid")
    ap.add_argument("--fg", type=float, default=0.85, help="foreground ratio")
    ap.add_argument("--chunk", type=int, default=8192)
    ap.add_argument("--threshold", type=float, default=25.0)
    ap.add_argument("--no-remove-bg", action="store_true")
    ap.add_argument("--model", default="stabilityai/TripoSR")
    args = ap.parse_args()

    os.makedirs(args.out, exist_ok=True)
    torch.set_num_threads(os.cpu_count() or 4)
    device = "cuda:0" if torch.cuda.is_available() else "cpu"

    t0 = time.time()
    logging.info("loading TripoSR (%s) on %s", args.model, device)
    model = TSR.from_pretrained(args.model, config_name="config.yaml", weight_name="model.ckpt")
    model.renderer.set_chunk_size(args.chunk)
    model.to(device)
    logging.info("model ready in %.1fs", time.time() - t0)

    rembg_session = None if args.no_remove_bg else rembg.new_session()

    for path in args.images:
        stem = os.path.splitext(os.path.basename(path))[0]
        ti = time.time()
        if args.no_remove_bg:
            img = np.array(Image.open(path).convert("RGB"))
        else:
            im = remove_background(Image.open(path), rembg_session)
            im = resize_foreground(im, args.fg)
            arr = np.array(im).astype(np.float32) / 255.0
            arr = arr[:, :, :3] * arr[:, :, 3:4] + (1 - arr[:, :, 3:4]) * 0.5
            img = Image.fromarray((arr * 255.0).astype(np.uint8))
            img.save(os.path.join(args.out, f"{stem}.input.png"))
        with torch.no_grad():
            scene_codes = model([img], device=device)
        meshes = model.extract_mesh(scene_codes, True, resolution=args.resolution,
                                    threshold=args.threshold)
        out_glb = os.path.join(args.out, f"{stem}.glb")
        meshes[0].export(out_glb)
        logging.info("%s -> %s  (%d verts, %.1fs)", stem, out_glb,
                     len(meshes[0].vertices), time.time() - ti)

    logging.info("ALL DONE in %.1fs", time.time() - t0)


if __name__ == "__main__":
    main()
