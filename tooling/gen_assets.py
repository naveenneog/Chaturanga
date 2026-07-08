"""Chaturanga asset workflow — generate realism assets with Azure gpt-image-2 (AAD auth).

Per world it makes:
  web/assets/<world>/env.png          a warm environment panorama for image-based lighting (reflections)
  web/assets/<world>/board-light.png  seamless material for the light squares
  web/assets/<world>/board-dark.png   seamless material for the dark squares

These give the 3D pieces real reflections and the board a carved-stone/wood look.

Usage:
  python tooling/gen_assets.py [world ...] [--force]     # default: kurukshetra
"""
import base64
import io
import json
import pathlib
import subprocess
import sys
import time
import urllib.error
import urllib.request

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parents[1]
ASSETS = ROOT / "web" / "assets"
ENDPOINT = "https://ai-contosohub530569751908.cognitiveservices.azure.com"
IMG_URI = f"{ENDPOINT}/openai/deployments/gpt-image-2/images/generations?api-version=2025-04-01-preview"
CS_SCOPE = "https://cognitiveservices.azure.com"

# per-world art direction: (env, light-square, dark-square)
WORLDS = {
    "kurukshetra": {
        "env": (
            "A wide 360-degree equirectangular panorama of an ancient Indian temple sanctum at dusk: "
            "warm honey-gold oil-lamp light, carved sandstone pillars and arches, faint incense haze, "
            "distant glowing shrine, deep warm shadows in amber, ochre and bronze. Soft, even, "
            "photographic, high dynamic range feel. No people, no text, no watermark."
        ),
        "light": (
            "A seamless tileable top-down texture of polished cream-ivory marble with subtle warm "
            "honey veining and a faint carved sheen, even studio lighting, photorealistic, no seams, "
            "no text, no border, no shadows."
        ),
        "dark": (
            "A seamless tileable top-down texture of polished dark rosewood with deep warm reddish-brown "
            "grain and a soft lacquered sheen, even studio lighting, photorealistic, no seams, no text, "
            "no border, no shadows."
        ),
    },
    "ramayana": {
        "env": (
            "A wide 360-degree equirectangular panorama of a moonlit ocean causeway leading to golden "
            "Lanka at night: cool silver-blue moonlight on calm water, distant torch-lit golden palace "
            "spires, faint sea mist, deep teal shadows with warm gold highlights. Soft, even, "
            "photographic, high dynamic range feel. No people, no text, no watermark."
        ),
        "light": (
            "A seamless tileable top-down texture of pale moonlit sea-stone marble with faint blue-grey "
            "veining and a cool pearly sheen, even studio lighting, photorealistic, no seams, no text, "
            "no border, no shadows."
        ),
        "dark": (
            "A seamless tileable top-down texture of dark teal-slate stone with deep blue-green grain "
            "and a soft polished sheen, even studio lighting, photorealistic, no seams, no text, "
            "no border, no shadows."
        ),
    },
}

_tok = {"v": None, "t": 0.0}


def token(force=False):
    if force or not _tok["v"] or time.time() - _tok["t"] > 2400:
        _tok["v"] = subprocess.run(
            ["az", "account", "get-access-token", "--resource", CS_SCOPE,
             "--query", "accessToken", "-o", "tsv"],
            capture_output=True, text=True, shell=True).stdout.strip()
        _tok["t"] = time.time()
        if not _tok["v"]:
            raise RuntimeError("no AAD token; run `az login`")
    return _tok["v"]


def log(m):
    print(f"{time.strftime('%H:%M:%S')} {m}", flush=True)


def gen_image(prompt, out_png, size="1024x1024"):
    body = json.dumps({"model": "gpt-image-2", "prompt": prompt, "n": 1, "size": size}).encode()
    for attempt in range(1, 9):
        req = urllib.request.Request(IMG_URI, data=body, method="POST")
        req.add_header("Authorization", f"Bearer {token()}")
        req.add_header("Content-Type", "application/json")
        try:
            with urllib.request.urlopen(req, timeout=240) as r:
                data = json.loads(r.read())
            b64 = data["data"][0].get("b64_json")
            if not b64:
                log(f"  no b64 for {out_png.name}"); return False
            img = Image.open(io.BytesIO(base64.b64decode(b64))).convert("RGB")
            out_png.parent.mkdir(parents=True, exist_ok=True)
            if out_png.suffix.lower() in (".jpg", ".jpeg"):
                img.save(out_png, "JPEG", quality=90)
            else:
                img.save(out_png, "PNG")
            log(f"  OK {out_png.relative_to(ASSETS)} ({img.width}x{img.height}, {out_png.stat().st_size} bytes)")
            time.sleep(4)
            return True
        except urllib.error.HTTPError as e:
            msg = e.read()[:200]
            if e.code == 401:
                token(force=True); continue
            if e.code == 429:
                wait = min(20 + attempt * 10, 75)
                log(f"  429 {out_png.name} attempt {attempt} -> {wait}s"); time.sleep(wait); continue
            log(f"  HTTP {e.code} {out_png.name}: {msg!r}"); time.sleep(5)
        except Exception as e:  # noqa: BLE001
            log(f"  ERR {out_png.name}: {e}"); time.sleep(5)
    return False


def main():
    args = sys.argv[1:]
    force = "--force" in args
    worlds = [a for a in args if not a.startswith("--")] or ["kurukshetra"]
    for w in worlds:
        spec = WORLDS.get(w)
        if not spec:
            log(f"no art direction for world '{w}'; skipping"); continue
        base = ASSETS / w
        jobs = [
            ("env.jpg", spec["env"], "1536x1024"),
            ("board-light.jpg", spec["light"], "1024x1024"),
            ("board-dark.jpg", spec["dark"], "1024x1024"),
        ]
        for fname, prompt, size in jobs:
            out = base / fname
            if out.exists() and not force:
                log(f"[{w}] {fname} exists; skip"); continue
            log(f"[{w}] generating {fname}")
            gen_image(prompt, out, size)
    log("DONE")


if __name__ == "__main__":
    main()
