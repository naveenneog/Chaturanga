"""Chaturanga intro cinematic — Azure Sora-2 (AAD auth). Writes web/assets/<world>/intro.mp4.

Usage: python tooling/gen_intro.py [world] [seconds]   # seconds in {4,8,12}, default 8
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
        "Cinematic slow push-in over an ancient Indian battlefield at dawn — the field of Kurukshetra. "
        "A vast carved stone chessboard rests on the plain; on it stand two armies of beautifully carved "
        "ivory and dark-rosewood Chaturanga pieces: elephants with howdahs, horses, chariot-towers, a "
        "crowned king under a parasol, foot-soldiers with spears. Warm golden dawn light and drifting dust "
        "and incense haze, conch-shell and war-drum mood, reverent and mythic like the Bhagavad Gita. "
        "Shallow depth of field, volumetric light. No text, no words, no watermark."
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
    prompt = PROMPTS.get(world)
    if not prompt:
        raise SystemExit(f"no intro prompt for world '{world}'")
    out = ROOT / "web" / "assets" / world / "intro.mp4"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.with_suffix(".prompt.txt").write_text(prompt, encoding="utf-8")

    vid = None
    while vid is None:
        try:
            with req("POST", f"{ENDPOINT}/openai/v1/videos?api-version={API_VERSION}",
                     {"model": MODEL, "prompt": prompt, "seconds": seconds, "size": "1280x720"}) as r:
                vid = json.loads(r.read())["id"]; log(f"submitted -> {vid}")
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
