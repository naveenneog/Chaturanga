"""Composite each concept ref onto an IVORY background for texture projection.

The refs sit on a light-grey studio background. When we project a concept onto a
(chunkier) TripoSR mesh, any mesh area that pokes outside the concept's silhouette
samples that grey -> ugly grey patches. Compositing the figurine onto a warm ivory
background makes those areas read as plain carved ivory instead.

Uses rembg (already installed) to isolate the figurine, then composites on ivory.
Output: web/assets/<world>/refs/<key>.proj.jpg

Usage: python tooling/ivory_bg.py [world]   (default kurukshetra)
"""
import io
import os
import pathlib
import sys

import numpy as np
import rembg
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parents[1]
IVORY = (223, 210, 178)  # warm ivory
KEYS = ["padati", "ashva", "gaja", "ratha", "mantri", "raja"]


def main():
    world = sys.argv[1] if len(sys.argv) > 1 else "kurukshetra"
    base = ROOT / "web" / "assets" / world / "refs"
    session = rembg.new_session()
    for k in KEYS:
        src = base / f"{k}.jpg"
        if not src.exists():
            print("skip missing", k); continue
        cut = rembg.remove(Image.open(src).convert("RGB"), session=session)  # RGBA
        cut = cut.convert("RGBA")
        bg = Image.new("RGBA", cut.size, IVORY + (255,))
        out = Image.alpha_composite(bg, cut).convert("RGB")
        dst = base / f"{k}.proj.jpg"
        out.save(dst, "JPEG", quality=92)
        print("ivory-bg", dst.name, out.size)


if __name__ == "__main__":
    main()
