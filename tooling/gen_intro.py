"""Chaturanga intro cinematic — Azure Sora-2 (AAD auth). Writes web/assets/<world>/intro.mp4.

Usage: python tooling/gen_intro.py [world] [seconds] [size]
  seconds in {4,8,12}, default 8
  size default 720x1280 (portrait, mobile form factor); pass 1280x720 for landscape.
  Writes intro.mp4 for portrait, intro_land.mp4 for landscape (so both can coexist).
"""
import json
import pathlib
import subprocess
import sys
import time
import urllib.error
import urllib.request

ENDPOINT = "https://ai-contosohub530569751908.cognitiveservices.azure.com"
API_VERSION = "preview"
MODEL = "sora-2"
CS_SCOPE = "https://cognitiveservices.azure.com"
ROOT = pathlib.Path(__file__).resolve().parents[1]

PROMPTS = {
    "kurukshetra": (
        "Vertical cinematic tilt-up over an ancient Indian battlefield at dawn — the field of Kurukshetra. "
        "A vast carved stone chessboard rests on the plain; on it stand two armies of beautifully carved "
        "ivory and dark-rosewood Chaturanga pieces: elephants with howdahs, horses, chariot-towers, a "
        "crowned king under a parasol, foot-soldiers with spears. Warm golden dawn light and drifting dust "
        "and incense haze. A stirring devotional folk score rises — deep war-drums (mridangam), a droning "
        "veena, and a lone conch-shell call, reverent and mythic like the Bhagavad Gita. "
        "Framed vertically for a phone screen, shallow depth of field, volumetric light, slow reverent "
        "camera move. No text, no words, no watermark."
    ),
    "ramayana": (
        "Vertical cinematic push-in across a moonlit causeway to golden Lanka — the war of the Ramayana. "
        "A carved stone chessboard bridges the sea; on it stand two armies of carved ivory and dark-rosewood "
        "figures: vanara war-monkeys, bears, chariots, a crowned prince with a great bow, foot-soldiers. "
        "Silver moonlight, sea-spray haze and torch-fire. A heroic devotional folk score — booming drums, "
        "flutes and a conch — swells with courage and longing. Framed vertically for a phone screen, "
        "shallow depth of field, volumetric light. No text, no words, no watermark."
    ),
    "kalinga": (
        "Vertical cinematic slow tilt-down over an ancient Indian battlefield beside a still river at "
        "solemn dusk — the war of Kalinga. A vast carved stone chessboard rests on the plain; on it "
        "stand two armies of carved ivory and dark iron-stone figures: imperial Mauryan war-elephants, "
        "chariots, an emperor, and defiant coastal defenders. Muted ochre and grey light, drifting "
        "smoke and dust, a river faintly tinged red. A grave, sorrowful score — a low mournful bansuri "
        "flute, a slow deep drum and a distant conch — that softens toward peace and reflection. "
        "Framed vertically for a phone screen, shallow depth of field, volumetric light, slow reverent "
        "camera move. No text, no words, no watermark."
    ),
    "devasura": (
        "Vertical cinematic push-in through a radiant cosmic realm — the churning of the ocean of milk, "
        "the war of gods and demons. A luminous carved chessboard floats amid swirling golden and pearl "
        "light and deep cosmic indigo; on it stand two armies of glowing ivory-gold celestial figures "
        "and dark cosmic-bronze demon figures: a radiant many-tusked white elephant, a divine horse, "
        "celestial chariots, a crowned thunderbolt-king, and mighty asura lords. Brilliant divine light, "
        "star-flecked nebular mist. An epic, dramatic score swells — thunderous drums, soaring strings, "
        "a droning tanpura and a triumphant conch, cosmic and grand. Framed vertically for a phone "
        "screen, shallow depth of field, volumetric light. No text, no words, no watermark."
    ),
}

_tok = {"v": None, "t": 0.0}


def token():
    if not _tok["v"] or time.time() - _tok["t"] > 2400:
        _tok["v"] = subprocess.run(
            ["az", "account", "get-access-token", "--resource", CS_SCOPE,
             "--query", "accessToken", "-o", "tsv"],
            capture_output=True, text=True, shell=True).stdout.strip()
        _tok["t"] = time.time()
        if not _tok["v"]:
            raise RuntimeError("no AAD token; run `az login`")
    return _tok["v"]


def req(method, url, body=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(url, data=data, method=method)
    r.add_header("Authorization", f"Bearer {token()}")
    if body is not None:
        r.add_header("Content-Type", "application/json")
    return urllib.request.urlopen(r, timeout=180)


def log(m):
    print(f"{time.strftime('%H:%M:%S')} {m}", flush=True)


def main():
    world = sys.argv[1] if len(sys.argv) > 1 else "kurukshetra"
    seconds = sys.argv[2] if len(sys.argv) > 2 else "8"
    size = sys.argv[3] if len(sys.argv) > 3 else "720x1280"
    prompt = PROMPTS.get(world)
    if not prompt:
        raise SystemExit(f"no intro prompt for world '{world}'")
    portrait = int(size.split("x")[0]) <= int(size.split("x")[1])
    name = "intro.mp4" if portrait else "intro_land.mp4"
    out = ROOT / "web" / "assets" / world / name
    out.parent.mkdir(parents=True, exist_ok=True)
    out.with_suffix(".prompt.txt").write_text(prompt, encoding="utf-8")

    vid = None
    while vid is None:
        try:
            with req("POST", f"{ENDPOINT}/openai/v1/videos?api-version={API_VERSION}",
                     {"model": MODEL, "prompt": prompt, "seconds": seconds, "size": size}) as r:
                vid = json.loads(r.read())["id"]; log(f"submitted -> {vid} ({size})")
        except urllib.error.HTTPError as e:
            if e.code == 429:
                log("429 on submit; backoff 45s"); time.sleep(45)
            elif e.code in (401, 403):
                _tok["v"] = None; time.sleep(2)
            else:
                raise RuntimeError(f"submit failed {e.code}: {e.read()[:300]!r}")

    deadline = time.time() + 1800
    while time.time() < deadline:
        try:
            with req("GET", f"{ENDPOINT}/openai/v1/videos/{vid}?api-version={API_VERSION}") as r:
                s = json.loads(r.read())
            st = s.get("status")
            if st == "completed":
                with req("GET", f"{ENDPOINT}/openai/v1/videos/{vid}/content?api-version={API_VERSION}") as r:
                    out.write_bytes(r.read())
                log(f"DONE {out} ({out.stat().st_size} bytes)"); return
            if st == "failed":
                raise RuntimeError(f"failed: {s.get('error')}")
            log(f"status={st} progress={s.get('progress', '?')}")
        except urllib.error.HTTPError as e:
            if e.code in (401, 403):
                _tok["v"] = None
            else:
                log(f"poll error {e.code}")
        time.sleep(10)
    raise TimeoutError("intro did not complete in time")


if __name__ == "__main__":
    main()
