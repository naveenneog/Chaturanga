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
    "ramayana": {
        "padati": (
            "A heroic vanara (monkey) foot-soldier of Rama's army: an upright, muscular "
            "anthropomorphic monkey with a noble expressive face, wearing a simple warrior's "
            "loincloth and a beaded chest ornament, gripping a stout knotted wooden club, a long "
            "tail curling behind, standing alert, loyal and brave."
        ),
        "ashva": (
            "A mighty leaping vanara champion evoking Hanuman: a powerful anthropomorphic monkey "
            "caught mid-leap on one bent leg, one arm raised high with a heavy mace, chest thrust "
            "forward, a long flowing tail streaming behind, muscular and devoted — full of soaring "
            "upward motion and courage."
        ),
        "gaja": (
            "A colossal armoured war-bear of the vanara host evoking Jambavan: a huge standing bear "
            "on all fours with a decorated ceremonial face-plate and jewelled drapes, a small ornate "
            "canopied howdah on its broad back — immense, ancient and wise."
        ),
        "ratha": (
            "An ornate ancient Indian war-chariot of the Ramayana: a single curved chariot car on two "
            "large spoked wheels drawn by a pair of stylised horses, a tall fluttering pennant and a "
            "great longbow resting across the car — poised and noble."
        ),
        "mantri": (
            "A dignified rakshasa noble counsellor evoking Vibhishana: a tall regal figure with a "
            "serene wise face, princely robes, ornate crown and jewellery, one hand raised in wise "
            "counsel — the righteous adviser who chose dharma."
        ),
        "raja": (
            "The prince Rama as a noble archer-king: a crowned, serene royal figure standing tall, "
            "holding a great ceremonial longbow upright in one hand with a quiver of arrows at his "
            "back, richly robed and jewelled — the ideal king and heart of the army."
        ),
    },
    "ramayana_dark": {
        "padati": (
            "A fierce rakshasa (demon) foot-soldier of Ravana's army of Lanka: a muscular horned "
            "demon-warrior with fanged snarling face, spiked armour and a bone necklace, gripping a "
            "heavy curved cleaver, standing menacing and battle-ready."
        ),
        "ashva": (
            "A leaping rakshasa demon-champion of Lanka caught mid-leap on one bent leg, one clawed "
            "arm raised high with a spiked mace, fanged and horned, a tattered cape streaming behind "
            "— full of savage upward motion."
        ),
        "gaja": (
            "A colossal armoured demon-titan of Lanka evoking the giant Kumbhakarna: an immense "
            "hulking horned rakshasa on all fours draped in spiked war-armour and jewelled plates, a "
            "small ornate canopied howdah on its broad back — monstrous, ancient and terrible."
        ),
        "ratha": (
            "Ravana's dark ornate war-chariot: a single menacing curved chariot car on two large "
            "spiked spoked wheels drawn by a pair of fearsome demon-steeds, a tall black pennant with "
            "a skull emblem and a great bow across the car — sinister and proud."
        ),
        "mantri": (
            "The rakshasa prince Indrajit (Meghnad), Ravana's mighty warrior-son: a tall crowned "
            "demon-prince with a fierce noble face, spiked ornate armour and jewellery, drawing a "
            "great war-bow — the most dangerous counsellor-general of Lanka."
        ),
        "raja": (
            "Ravana, the ten-headed demon-king of Lanka (Dashanana): a mighty crowned rakshasa "
            "emperor with ten fierce fanged heads and many arms bearing weapons, in magnificent "
            "spiked golden war-armour, standing sovereign and terrible — the heart of the demon host."
        ),
    },
    "kalinga": {
        "padati": (
            "A disciplined Mauryan imperial foot-soldier of Emperor Ashoka's army (3rd century BCE): "
            "a bare-chested warrior in a knee-length dhoti and a plumed helmet, a tall rectangular "
            "shield on one arm and a straight spear in the other, standing at rigid disciplined attention."
        ),
        "ashva": (
            "A Mauryan imperial war-horse (Ashva) rearing on its hind legs, powerful arched neck, "
            "braided mane and tail, an imperial saddle-cloth with the Mauryan lion emblem, bridle and "
            "bells — proud and martial."
        ),
        "gaja": (
            "A grand Mauryan imperial war-elephant (Gaja) standing four-square, long tusks capped with "
            "metal, a jewelled imperial face-plate and rich drapes, a large ornate armoured howdah with "
            "a canopy on its back — the might of the Mauryan empire."
        ),
        "ratha": (
            "A Mauryan imperial war-chariot (Ratha): an ornate curved chariot car on two large spoked "
            "wheels drawn by a pair of stylised horses, a tall imperial pennant with a lion crest and a "
            "great bow across the car — disciplined and grand."
        ),
        "mantri": (
            "A wise Mauryan royal counsellor (Mantri) evoking the minister Radhagupta: a dignified robed "
            "elder statesman with a neat beard and a scroll, one hand raised in calm counsel — the "
            "shrewd adviser of the empire."
        ),
        "raja": (
            "Emperor Ashoka the Great as a Mauryan raja: a crowned imperial emperor in rich robes and "
            "jewellery, a ceremonial sword sheathed, a grave far-seeing expression — a conqueror on the "
            "verge of renouncing war for dharma."
        ),
    },
    "kalinga_dark": {
        "padati": (
            "A fierce Kalinga defender foot-soldier (3rd century BCE, ancient Odisha): a bare-chested "
            "coastal-kingdom warrior in a patterned wrap and a conical helmet, a round hide shield and a "
            "broad-bladed spear, standing defiant to defend his homeland."
        ),
        "ashva": (
            "A spirited Kalinga war-horse (Ashva) rearing up, arched neck, wild mane, a woven coastal "
            "saddle-cloth with sea-wave patterns, bridle and shells — fierce and free."
        ),
        "gaja": (
            "A powerful Kalinga war-elephant (Gaja) standing four-square, long tusks, a painted "
            "coastal-styled face-plate and shell-and-wave drapes, a sturdy armoured howdah with a canopy "
            "— the pride of Kalinga."
        ),
        "ratha": (
            "A Kalinga war-chariot (Ratha): an ornate curved chariot car on two spoked wheels drawn by a "
            "pair of horses, a fluttering pennant with a coastal sun-and-wave emblem and a great bow — "
            "proud and defiant."
        ),
        "mantri": (
            "A resolute Kalinga general-counsellor (Mantri): a strong robed commander with a coastal "
            "diadem, one hand on a sheathed sword, the other raised in rallying command — the defiant "
            "war-leader of Kalinga."
        ),
        "raja": (
            "The King of Kalinga as a raja: a crowned proud defender-king in coastal royal robes and "
            "shell jewellery, a raised sceptre-mace, standing unbowed before a mightier empire — "
            "the heart of Kalinga's resistance."
        ),
    },
    "devasura": {
        "padati": (
            "A radiant Deva (celestial god) foot-soldier of Indra's host: a luminous divine warrior in "
            "glowing golden armour with a serene ageless face, a jewelled spear and a small sun-disc "
            "shield, a soft halo of light — heavenly and resolute."
        ),
        "ashva": (
            "Uchchaihshravas, the divine seven-headed white horse of the gods risen from the churning "
            "ocean: a magnificent luminous celestial horse rearing, flowing radiant mane and tail, "
            "golden divine harness with gems — dazzling and swift."
        ),
        "gaja": (
            "Airavata, Indra's magnificent divine white war-elephant with multiple tusks: an immense "
            "luminous elephant standing four-square, jewelled celestial face-plate and gold drapes, a "
            "radiant ornate howdah with a canopy on its back — glorious and vast."
        ),
        "ratha": (
            "A golden celestial deva war-chariot (Ratha): a resplendent glowing chariot car on two "
            "radiant spoked wheels drawn by luminous divine horses, a tall pennant with a sun emblem "
            "and a shining bow — heavenly and grand."
        ),
        "mantri": (
            "Brihaspati, the divine guru of the gods (Mantri): a serene luminous sage with a topknot, "
            "flowing robes and a soft halo, holding a rosary and a scripture, one hand raised in wise "
            "blessing — the celestial counsellor."
        ),
        "raja": (
            "Indra, king of the gods (Devaraja): a resplendent crowned celestial emperor holding the "
            "vajra thunderbolt, in radiant golden divine armour and jewellery, a serene commanding face "
            "and a halo of light — the sovereign of the heavens."
        ),
    },
    "devasura_dark": {
        "padati": (
            "A mighty Asura (demon-god) foot-soldier of the churning war: a powerful dark-hued asura "
            "warrior in ornate blackened bronze armour with a proud fierce face, gripping a heavy "
            "spiked mace and a dark shield — formidable and defiant."
        ),
        "ashva": (
            "A fearsome Asura war-steed of the demon host: a powerful dark celestial horse-beast rearing "
            "with burning eyes, a wild smoky mane, blackened bronze harness with dark gems — savage and "
            "unstoppable."
        ),
        "gaja": (
            "A colossal Asura war-elephant of the demon host: an immense dark-hued armoured elephant "
            "standing four-square, long tusks, a fierce blackened face-plate and dark jewelled drapes, a "
            "spiked ornate howdah with a canopy — terrible and mighty."
        ),
        "ratha": (
            "A dark Asura war-chariot (Ratha): a menacing ornate chariot car on two spiked spoked wheels "
            "drawn by a pair of dark demon-steeds, a tall black pennant with an eclipse emblem and a "
            "great bow — proud and ominous."
        ),
        "mantri": (
            "Shukracharya, the guru of the asuras (Mantri) who knew the secret of reviving the fallen: a "
            "commanding dark-robed sage with a fierce wise face and a topknot, holding a staff and a "
            "sacred text, one hand raised — the brilliant counsellor of the demons."
        ),
        "raja": (
            "The Asura king Bali as a raja: a mighty crowned demon-emperor of great might and strange "
            "nobility, in magnificent blackened-gold war-armour and jewellery, a raised sceptre, a proud "
            "commanding face — sovereign of the asura host."
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
