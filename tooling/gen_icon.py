"""Generate the Chaturanga app icon + splash logo with Azure gpt-image-2 (AAD auth).

Writes:
  resources/logo.png        1024x1024 app icon (Raja piece, carved ivory + gold)
  resources/splash.png      2732x2732 splash (logo centred on the theme background)
  resources/icon-foreground.png  1024x1024 (same as logo, for adaptive icons)
  resources/icon-background.png  1024x1024 (solid theme background)

Then run:  npx @capacitor/assets generate --assetPath resources --android
"""
import base64
import io
import pathlib
import subprocess
import time
import urllib.error
import urllib.request

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parents[1]
RES = ROOT / "resources"
ENDPOINT = "https://ai-contosohub530569751908.cognitiveservices.azure.com"
IMG_URI = f"{ENDPOINT}/openai/deployments/gpt-image-2/images/generations?api-version=2025-04-01-preview"
CS_SCOPE = "https://cognitiveservices.azure.com"
BG = (26, 15, 8)  # theme bg #1a0f08

PROMPT = (
    "A premium mobile app icon: a single majestic carved ivory-and-gold Chaturanga king "
    "(an ancient Indian chess Raja) figurine under a small royal parasol, front view, "
    "centred, glowing warm rim light, on a deep maroon-and-gold radial background with a "
    "faint mandala motif. Ornate, luxurious, iconic, clean silhouette, app-store quality. "
    "No text, no letters, no watermark, no border."
)


def token(force=False):
    return subprocess.run(
        ["az", "account", "get-access-token", "--resource", CS_SCOPE,
         "--query", "accessToken", "-o", "tsv"],
        capture_output=True, text=True, shell=True).stdout.strip()


def gen(prompt, size="1024x1024"):
    import json
    body = json.dumps({"model": "gpt-image-2", "prompt": prompt, "n": 1, "size": size}).encode()
    for attempt in range(1, 8):
        req = urllib.request.Request(IMG_URI, data=body, method="POST")
        req.add_header("Authorization", f"******")
        req.add_header("Content-Type", "application/json")
        try:
            with urllib.request.urlopen(req, timeout=240) as r:
                data = json.loads(r.read())
            return Image.open(io.BytesIO(base64.b64decode(data["data"][0]["b64_json"]))).convert("RGB")
        except urllib.error.HTTPError as e:
            wait = min(20 + attempt * 10, 75)
            print(f"  HTTP {e.code} attempt {attempt} -> wait {wait}s: {e.read()[:120]!r}", flush=True)
            time.sleep(wait)
    raise RuntimeError("icon generation failed")


def main():
    RES.mkdir(parents=True, exist_ok=True)
    print("generating icon...", flush=True)
    logo = gen(PROMPT)
    logo.save(RES / "logo.png", "PNG")
    logo.save(RES / "icon-foreground.png", "PNG")
    Image.new("RGB", (1024, 1024), BG).save(RES / "icon-background.png", "PNG")
    # splash: logo centred on the theme background
    splash = Image.new("RGB", (2732, 2732), BG)
    s = logo.resize((820, 820))
    splash.paste(s, ((2732 - 820) // 2, (2732 - 820) // 2))
    splash.save(RES / "splash.png", "PNG")
    splash.save(RES / "splash-dark.png", "PNG")
    print("wrote", RES, flush=True)


if __name__ == "__main__":
    main()
