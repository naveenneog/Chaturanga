# Chaturanga — project context (read this to resume)

> **If you are an AI agent resuming this game, read this first.** Sister project to
> **Sopāna** (`../Sopana`), which pioneered the data-driven "worlds" pattern. The reusable
> board-game method lives in the **`sopana-game`** skill — leave that skill as-is; this is a
> separate game.

- **What:** *Chaturanga* — the ancient Indian "game of the four army divisions", played with
  **modern chess moves** but **authentic Chaturanga piece identities**, where every *world*
  teaches **moral values and life/battlefield lessons** (especially for the pawns).
- **Owner:** @naveenneog (Naveen Gopalakrishna)
- **Run:** `npm run serve` → http://localhost:5174/  ·  **Test:** `npm test` (node:test)
- **Status:** v0.4 — playable 3D board, one world (Kurukshetra), teachings + read-aloud,
  and **realistic figurine pieces** built with a **local image-to-3D pipeline**: a themed
  gpt-image-2 concept per piece → **TripoSR (CPU)** mesh → **Blender concept-texture
  projection** → web GLB. Image-based lighting + generated board textures + Sora intro.

---

## Core design decisions (from the user)
- **Authentic identities, modern moves.** Pieces are Raja/Mantri/Ratha/Gaja/Ashva/Padati but
  move exactly like modern chess (queen, bishop, knight, rook, castling, pawn double-step,
  en-passant, promotion) — "if the rules change it's a problem for players."
- **Worlds carry the meaning.** One JSON per world = a board skin + a moral **teaching per piece
  type** + rich **`pawnTeachings[]`** (the life-and-battlefield lessons) + capture/promotion lines.
- **Pawns realistic, per world, in 3D.** Realistic 3D pieces; may use **Blender via MCP** later
  for higher-fidelity models. v0.1 ships procedural (LatheGeometry) pieces.
- **Teachings are revealed + read aloud** on select (a piece's dharma), capture (a battlefield
  lesson), pawn advance (a life lesson) and promotion (the growth payoff). Narration currently
  uses the browser `speechSynthesis`; pre-generated Azure TTS clips can replace it later.
- **Local hotseat**, static hosting, no backend (like Sopana).

## Architecture (data → rules → renderer)
```
web/worlds/<id>.json   the world: theme + pieces{raja,mantri,ratha,gaja,ashva,padati} + pawnTeachings[]
web/js/rules.js        PURE: chess.js wrapper. TYPE_TO_KEY identities, selectMoment/moveMoment, validateWorld
web/js/pieces3d.js     procedural 3D pieces (LatheGeometry) — FALLBACK if a glTF model is missing
web/js/board3d.js      renderer: scene, InstancedMesh squares, tap-to-move, teaching card + speak(), camera fit
web/play.html          the game shell (HUD, teaching card, turn pills). Has an import map: "three" -> vendor
web/vendor/            chess.js (rules) + three.module.js + three.core.js + GLTFLoader.js (+BufferGeometryUtils/SkeletonUtils)
web/assets/models/     <piece>.glb — carved pieces exported from Blender (padati/gaja/ashva/ratha/mantri/raja)
tooling/blender/model_pieces.py   headless Blender modeller: builds the 6 pieces + exports .glb (+ Cycles preview)
tooling/gen_assets.py   gpt-image-2 (AAD): env + board-light/dark textures per world -> web/assets/<world>/*.jpg
tooling/gen_intro.py    Sora-2 (AAD): cinematic intro per world -> web/assets/<world>/intro.mp4
scripts/serve.mjs      static server on :5174
test/rules.test.js     9 unit tests (engine + identities + teachings + world validation)
```

## Realism + asset workflow (GPT-image-2 + Sora, AAD auth via `az login`)
- **`python tooling/gen_assets.py [world]`** (gpt-image-2 at `.../deployments/gpt-image-2/images/
  generations?api-version=2025-04-01-preview`) makes `env.jpg` (a warm temple panorama), `board-light.jpg`
  and `board-dark.jpg` (seamless marble / rosewood). Art direction is the `WORLDS` dict in the script.
- **`python tooling/gen_intro.py [world] [secs]`** (Sora-2 at `/openai/v1/videos?api-version=preview`)
  makes `intro.mp4`. It's shown as a start overlay (`#intro` in `play.html`) that auto-dismisses on
  `ended` / codec-error / a 4s stall safety, so it never traps the player.
- **Renderer realism:** `renderer.toneMapping = ACESFilmic`; `env.jpg` → `PMREMGenerator` → `scene.environment`
  (real reflections); pieces use `MeshPhysicalMaterial` (ivory white / rosewood black, clearcoat); the
  board is two textured `InstancedMesh`es (light/dark) with the generated maps + max anisotropy; the
  flat board needs `shadow.normalBias ≈ 0.03` (else shadow-acne stripes).

## 3D pieces — local image-to-3D pipeline (gpt-image-2 → TripoSR → Blender projection)
The current realistic pieces are **not** hand-modelled; they are reconstructed from a themed
concept image. Reproduce with the `.venv3d` (Python 3.11 via `uv`, torch CPU):
1. **Concept (inspiration):** `python tooling/gen_refs.py [world]` → a museum-quality carved-ivory
   figurine per piece on a neutral bg → `web/assets/<world>/refs/<key>.jpg` (+ `_contact.jpg`).
   Art direction (subjects) is the `WORLDS` dict in the script.
2. **Ivory bg:** `python tooling/ivory_bg.py [world]` (rembg) → `<key>.proj.jpg` (figurine on
   ivory, so mesh areas outside the concept silhouette read as plain carved ivory, not grey).
3. **Mesh:** `python tooling/triposr_run.py <img...> --out tooling/TripoSR/out256 --resolution 256`
   → `<key>.glb` (dense, vertex-coloured). **TripoSR is patched** to use **PyMCubes** instead of
   the native `torchmcubes` (see `tsr/models/isosurface.py`) — no compiler needed, CPU-only.
4. **Project + web-ready:** `blender -b --python tooling/blender/texture_project.py -- <raw_glb>
   <concept.proj.jpg> web/assets/models/<key>.glb <preview.png>` with env `ROTX=-135 CAM=+X`.
   It orients/grounds the (consistently tilted) TripoSR output, decimates to ~28k tris, and
   projects the concept from an ortho front camera as the surface texture. Renders 3 QA angles.
- **Orientation:** TripoSR's canonical frame is a **fixed ~45° tilt** for every piece → the SAME
  `ROTX=-135` uprights all; the concept's side view is along **+X** → `CAM=+X`. Do transforms via
  `mesh.data.transform(Matrix)` — **object-level `transform_apply` silently no-ops in --background**.
- **Renderer:** `board3d.js pieceFor(key,color)` keeps the baked concept texture for the ivory
  (white) army and multiplies `material.color` toward **rosewood** (`0x4a3120`) for the dark army.
- **QA on board:** `node tooling/shot.mjs <prefix> [world]` (Playwright, swiftshader — slow ~3 min).
- Diagnostics/tools: `tooling/blender/inspect_glb.py` (3 framed views) and `axis_views.py`
  (±X/±Y/top, to read a mesh's native orientation). Research notes: `tooling/3d_pipeline_research.md`.
- **Known limits (iterate):** TripoSR is soft/melty on thin parts (horse mane, elephant trunk,
  chhatra parasol); the projection is one-sided (back is mirrored/plain ivory). Options: higher
  `--resolution`, per-piece `CAM`, or a stronger local engine (Hunyuan3D-2mini) later.

## 3D pieces (legacy hand-modelled Blender pipeline — fallback)
- **Model:** `blender --background --python tooling/blender/model_pieces.py` (Blender 5.1 at
  `C:\Program Files\Blender Foundation\Blender 5.1\blender.exe`). Controlled primitives + an
  extruded silhouette (Ashva horse-head) + `SOLIDIFY`/`SUBSURF`/`BEVEL`/`DECIMATE`. Metaballs were
  too blobby — avoid. Exports each piece as `web/assets/models/<key>.glb` (`export_yup=True`).
- **Load:** `board3d.js` uses `GLTFLoader` (import map maps `three`→the vendored core), preloads all
  6 `.glb`, `normalize()`s each (scale to `TARGET_H`, centre X/Z, base at y=0), clones per piece and
  overrides the material with the army colour. `pieceFor()` falls back to `pieces3d.makePiece` if a
  model is missing. `facingY(key,color)` orients pieces (Ashva/Padati front=+X; Gaja front=−Z).
- Piece map: `p→padati, n→ashva, b→gaja, r→ratha, q→mantri, k→raja`.
- Board coords: `col0=a` file → x; `row0=rank1` → z=+3.5 (white near). `syncPieces()` rebuilds from
  `game.board()` after every move (handles castling/en-passant/promotion robustly).
- Camera: aspect-aware `fitRadius` (fov 50); steeper `presetPhi` on portrait; orbit + pinch + wheel.
- Debug hook: `window.__c` = { fen, turn, move(from,to), tap(sq), selected, card, info, view }.

## Gotchas
- `chess.js` v1.0.0: `new Chess()`, `.moves({square,verbose})`, `.move({from,to,promotion:'q'})`,
  `.board()` (row0=rank8), `.get(sq)`, `.inCheck()/.isCheckmate()/.isStalemate()/.isGameOver()`.
- `InstancedMesh.setColorAt` → must set `instanceColor.needsUpdate = true`.
- Fog must not dim the far-pushed portrait board (fit radius can reach ~30 on a phone) — keep
  `fog` far (currently 40→120) beyond the board.
- Local `npm install` needs `--registry https://registry.npmjs.org` (private registry 401s);
  Playwright reuses the Chromium already downloaded for Sopana.
- **Blender headless: EEVEE crashes (no GPU)** — render QA previews with **Cycles + CPU**. Export
  glTF works headless fine.
- **GLTFLoader** (r185) imports two utils via relative paths — vendored alongside it and the paths
  patched to `./`; `three` resolves via the **import map** in `play.html`.
- **Headless Chromium can't decode H.264** (Sora `intro.mp4`) — the intro overlay auto-dismisses on
  error/stall, so QA never hangs; the video plays fine on real browsers/devices.
- Generated textures/panoramas: save as **JPG** (gpt-image PNGs are ~1–2 MB each; JPG ~150–380 KB).

## Backlog / next
- More worlds: **Chaturanga Classic** (historical lore), **Life & Karma** (modern work/life lessons)
  — each needs its own `env/board-light/board-dark` (gen_assets) + `intro` (gen_intro) + teachings.
- **Refine the Blender pieces** further (Gaja detail; per-world piece skins/materials).
- A **lobby** (`setup.html`): pick world + sides + piece set.
- **Azure TTS** narration per world (replace `speechSynthesis`); per-world **music** + branding/logo.
- Optional: promotion chooser, move history, simple AI opponent, publish (GitHub Pages + APK via Capacitor).
