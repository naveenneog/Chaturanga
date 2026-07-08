"""Chaturanga piece INSPIRATION / reference art with Azure gpt-image-2 (AAD auth).

For each of the six pieces this makes a museum-quality "hero" concept of the piece
as a finely hand-carved figurine, themed to the world (Kurukshetra / Mahabharata).
These are used two ways:
  1. inspiration — decide the look/silhouette of the realistic 3D piece.
  2. modeling reference — a clean, centred, evenly-lit single object on a neutral
     background is ideal to trace/sculpt from (or feed an image-to-3D step).

Output:  web/assets/<world>/refs/<piece>.jpg   (+ _contact.jpg a 3x2 sheet)

Usage:
  python tooling/gen_refs.py [world ...] [--force] [--material ivory|bronze]
  (default world: kurukshetra, material: ivory)
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

# Shared "house style" so the six pieces read as one matched carved set and are
# clean enough to model / image-to-3D from.
def house(material):
    mat = {
        "ivory": "carved from warm cream ivory with fine chisel detail and a subtle honey patina",
        "bronze": "cast in dark antique bronze with warm reddish highlights and fine engraved detail",
    }[material]
    return (
        f"Museum-quality collectible chess figurine, {mat}. "
        "A SINGLE piece, centred, whole figure fully visible from its round carved pedestal "
        "base to the very top, three-quarter hero view, slight low angle. "
        "Soft even studio lighting, gentle rim light, shallow contact shadow. "
        "Seamless neutral warm light-grey studio background. Photorealistic product render, "
        "crisp focus, intricate ornament. No text, no watermark, no human hands, no other objects, "
        "no chessboard, no border."
    )


# Per-world, per-piece subject direction. Authentic Chaturanga army of the Mahabharata.
WORLDS = {
    "kurukshetra": {
        "padati": (
            "A brave ancient Indian foot-soldier (Padati) of the Kurukshetra war: a bare-chested "
            "warrior in a knee-length dhoti and a rounded turban-helmet, a small round shield on one "
            "arm and a short spear held upright in the other, standing alert and resolute."
        ),
        "ashva": (
            "A spirited ancient Indian war-horse (Ashva) rearing up on its hind legs, powerful arched "
            "neck, flowing mane and tail, an ornate saddle-cloth, bridle and rows of tiny bells, "
            "nostrils flared — full of motion and courage."
        ),
        "gaja": (
            "A caparisoned Indian war-elephant (Gaja) standing four-square, long curved tusks, trunk "
            "curled, a decorated ceremonial face-plate and jewelled drapes, a small ornate howdah "
            "(seat) with a canopy on its back — regal and immense."
        ),
        "ratha": (
            "An ancient Indian war-chariot (Ratha) of the Mahabharata: a single ornate curved chariot "
            "car on two large spoked wheels drawn by a pair of stylised horses, a tall fluttering "
            "pennant, a great bow resting across the car — poised and noble."
        ),
        "mantri": (
            "A wise royal counsellor (Mantri) of the Mahabharata evoking Krishna the divine charioteer: "
            "a dignified robed figure with a peacock-feather crown, holding a conch shell, one hand "
            "raised in blessing, serene and commanding — the most powerful adviser."
        ),
        "raja": (
            "A regal ancient Indian emperor (Raja): a crowned king in royal robes and jewellery, a "
            "ceremonial mace in hand, a royal chhatra parasol rising above his crown, standing tall "
            "and sovereign — the heart of the army."
        ),
    },
}

ORDER = ["padati", "ashva", "gaja", "ratha", "mantri", "raja"]

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


def gen_image(prompt, out, size="1024x1536"):
    body = json.dumps({"model": "gpt-image-2", "prompt": prompt, "n": 1, "size": size}).encode()
    for attempt in range(1, 9):
        req = urllib.request.Request(IMG_URI, data=body, method="POST")
        req.add_header("Authorization", f"Bearer {token()}")
        req.add_header("Content-Type", "application/json")
        try:
            with urllib.request.urlopen(req, timeout=300) as r:
                data = json.loads(r.read())
            b64 = data["data"][0].get("b64_json")
            if not b64:
                log(f"  no b64 for {out.name}"); return False
            img = Image.open(io.BytesIO(base64.b64decode(b64))).convert("RGB")
            out.parent.mkdir(parents=True, exist_ok=True)
            img.save(out, "JPEG", quality=92)
            log(f"  OK {out.name} ({img.width}x{img.height}, {out.stat().st_size} bytes)")
            time.sleep(3)
            return True
        except urllib.error.HTTPError as e:
            msg = e.read()[:300]
            if e.code == 401:
                token(force=True); continue
            if e.code == 429:
                wait = min(20 + attempt * 10, 75)
                log(f"  429 {out.name} attempt {attempt} -> {wait}s"); time.sleep(wait); continue
            if e.code == 400 and b"size" in msg and size != "1024x1024":
                log(f"  size {size} rejected; retry 1024x1024"); size = "1024x1024"; continue
            log(f"  HTTP {e.code} {out.name}: {msg!r}"); time.sleep(5)
        except Exception as e:  # noqa: BLE001
            log(f"  ERR {out.name}: {e}"); time.sleep(5)
    return False


def contact_sheet(base, pieces):
    imgs = []
    for k in pieces:
        p = base / f"{k}.jpg"
        if p.exists():
            imgs.append((k, Image.open(p).convert("RGB")))
    if not imgs:
        return
    cw, ch, cols = 480, 720, 3
    rows = (len(imgs) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * cw, rows * ch), (28, 24, 20))
    for i, (k, im) in enumerate(imgs):
        im = im.copy(); im.thumbnail((cw - 12, ch - 12))
        x = (i % cols) * cw + (cw - im.width) // 2
        y = (i // cols) * ch + (ch - im.height) // 2
        sheet.paste(im, (x, y))
    out = base / "_contact.jpg"
    sheet.save(out, "JPEG", quality=88)
    log(f"contact sheet -> {out} ({sheet.width}x{sheet.height})")


def main():
    args = sys.argv[1:]
    force = "--force" in args
    material = "ivory"
    if "--material" in args:
        material = args[args.index("--material") + 1]
    worlds = [a for a in args if not a.startswith("--") and a not in (material,)] or ["kurukshetra"]
    style = house(material)
    for w in worlds:
        spec = WORLDS.get(w)
        if not spec:
            log(f"no ref art direction for world '{w}'; skipping"); continue
        base = ASSETS / w / "refs"
        for k in ORDER:
            if k not in spec:
                continue
            out = base / f"{k}.jpg"
            if out.exists() and not force:
                log(f"[{w}] {k} exists; skip"); continue
            prompt = f"{spec[k]} {style}"
            log(f"[{w}] generating {k}")
            gen_image(prompt, out)
        contact_sheet(base, [k for k in ORDER if k in spec])
    log("DONE")


if __name__ == "__main__":
    main()
