# Chaturanga — project context (read this to resume)

> **If you are an AI agent resuming this game, read this first.** Sister project to
> **Sopāna** (`../Sopana`), which pioneered the data-driven "worlds" pattern. The reusable
> board-game method lives in the **`sopana-game`** skill — leave that skill as-is; this is a
> separate game.

- **What:** *Chaturanga* — the ancient Indian "game of the four army divisions", played with
  **modern chess moves** but **authentic Chaturanga piece identities**, where every *world*
  teaches **moral values and life/battlefield lessons** (especially for the pawns).
- **Owner:** @naveenneog (Naveen Gopalakrishna)
- **Published:** public repo **github.com/naveenneog/Chaturanga** · playable at
  **naveenneog.github.io/Chaturanga** (GitHub Pages from `docs/`) · release **v1.0.0** with
  **Chaturanga-v1.0.0.apk** (debug-signed). Build the APK with `npm run apk`.
- **Run:** `npm run serve` → http://localhost:5174/  ·  **Test:** `npm test` (node:test, 36 tests)
- **Status:** v1.0 — playable in **3D (Three.js) AND 2D** with **four worlds**, each with **two
  DISTINCT per-side armies** (white/black have their own identities, names, models & teachings):
  **Kurukshetra** (Pandavas vs Kauravas), **Ramayana** (Rama's vanaras vs Ravana's rakshasas),
  **Kalinga** (Ashoka's Mauryas vs Kalinga), **Devasura** (Devas vs Asuras). Teachings +
  **read-aloud** (pre-generated **DragonHD Indian-English** narration, per side), **realistic
  Hunyuan3D-2 pieces**, a **piece-style system** (per-world themed materials + 5 cyclable presets;
  Devas glow), AND a full **teach-and-play layer**: an AI opponent with **5 levels** (alpha-beta
  engine in a Web Worker), a **coach** (best-move hints + blunder review), an **openings trainer**
  (6 openings walked move-by-move), a **piece inspector** (rotating 3D render + movement diagram on
  select), a **Warrior's Eye** piece-perspective camera, a **procedural audio** engine (Indian
  classical drone + raga + SFX), a **lobby** (`setup.html`: world/mode/side/level/**render 3D|2D**),
  portrait **Sora intros with music**, and a **native Android APK** (Capacitor) —
  `npm run apk` → `Chaturanga-v1.0.0.apk` (debug-signed, ~97 MB, 4 worlds bundled).
- **Pieces:** built with an **image-to-3D pipeline** — a themed gpt-image-2 concept per piece →
  **Hunyuan3D-2 mesh (free HF Space, GPU)** → **Blender concept-texture projection** → web GLB.
  (Local **TripoSR (CPU)** remains a no-signup fallback.) Image-based lighting + generated board
  textures per world.

---

## Teach-and-play layer (v0.5)
```
web/js/engine.js        PURE: alpha-beta negamax + quiescence + MVV-LVA + piece-square eval over
                        chess.js. LEVELS[5] (Padati..Mantri) scale depth + blunder rate + time cap.
                        analyze()/bestMove()/classifyMove(). Root moves searched full-window so
                        every move gets an EXACT score (needed for blunder detection).
web/js/coach.js         PURE: hint() (best move + themed why), reviewMove() (silent on good moves,
                        names the stronger move on mistakes/blunders), openingNote()/openingStep().
web/js/openings.js      6 classic openings, each annotated move-by-move (detectOpening()).
web/js/engine.worker.js Web Worker running the AI off the render thread (main-thread fallback).
```
- **URL params → board3d.js:** `mode` (ai|hotseat), `side` (w|b), `level` (1-5), `train` (opening id).
  Lobby `setup.html` builds these. AI runs in the worker; after each human move the coach reviews it
  and warns on blunders; the opening badge names the line.
- **Piece inspector** (`#inspector`): a second small WebGL renderer shows the selected piece rotating
  + a 5x5 CSS movement grid (gold=move, red=capture). **Warrior's Eye** (`#eyeBtn`): camera sits at
  the selected piece's eye level looking down the board (`setEye`/`eyeTarget` in board3d).
- **Openings trainer:** `play.html?train=<id>` → `runTrainer()` auto-walks the booked line move-by-
  move with each note narrated, then hands control back.
- **Mobile:** contact-shadow decals ground pieces when realtime shadows are off; render loop pauses
  on `visibilitychange`; inspector DPR capped. **Android APK:** Capacitor 8, `capacitor.config.json`
  (appId `com.naveenneog.chaturanga`, webDir `web`), `tooling/build_apk.ps1` (needs JDK 21 +
  Android SDK). App icon/splash from `resources/` via `@capacitor/assets` (`tooling/gen_icon.py`).
- **Tests:** `node --test` = 36 (rules + engine + coach/openings + all-worlds validation +
  per-side identities). QA harnesses: `tooling/smoke.mjs` (AI game + inspector + hint + eye),
  `tooling/smoke2.mjs` (lobby + trainer + worlds) and `tooling/smoke_ux.mjs` (UX regressions).

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
  lesson), pawn advance (a life lesson) and promotion (the growth payoff). Narration uses
  **pre-generated Azure DragonHD Indian-English clips** (`assets/<world>/voice/*.mp3`, keyed by the
  exact teaching string, **per side**) with a `speechSynthesis` fallback.
- **Two distinct armies per world.** White and black are NOT mirror images: each side has its own
  piece identities, pawn teachings, capture/check/checkmate lines AND (for ramayana/kalinga/devasura)
  its own 3D **models_dark** sculpts. See `rules.js sidePieces(world,color)` + `world.piecesDark`.
- **Local hotseat**, static hosting, no backend (like Sopana).

## Architecture (data → rules → renderer)
```
web/worlds/<id>.json   the world: theme + pieces{...} + pawnTeachings[] + (per-side) piecesDark{...},
                       pawnTeachingsDark[], captureLinesDark, check/checkmate*Dark, pieceStyle{white,black}
web/js/rules.js        PURE: chess.js wrapper + PER-SIDE identity logic. sidePieces(world,color),
                       color-aware selectMoment/moveMoment/pieceInfo/pawnTeaching, validateWorld
web/js/pieces3d.js     procedural 3D pieces (LatheGeometry) — FALLBACK if a glTF model is missing
web/js/board3d.js      3D renderer: scene, InstancedMesh squares, tap-to-move, teaching card + voice,
                       per-side MODELS.w/.b, piece-style presets (styleFor/STYLE_PRESETS), inspector,
                       Warrior's Eye, coach/openings, camera fit
web/js/board2d.js      2D renderer (canvas/DOM) reusing rules/engine/coach/audio/openings — same game,
                       themed glyph pieces, teaching panel, coach, undo, captured tray
web/js/audio.js        procedural Web Audio: tanpura drone + raga melody + move/capture/check SFX
web/play.html          the 3D shell (HUD, teaching card, More menu: 🎨 Style, music/sound/voice)
web/play2d.html        the 2D shell (same HUD/menus)
web/setup.html         lobby: world + mode(ai|hotseat) + side + level + render(3D|2D) + openings launcher
web/vendor/            chess.js + three.module.js + three.core.js + GLTFLoader.js (+utils)
web/assets/<world>/models/       <piece>.glb — white army carved pieces (Hunyuan3D-2)
web/assets/<world>/models_dark/  <piece>.glb — black army (distinct sculpts; ramayana/kalinga/devasura)
web/assets/<world>/voice/        voice.json + <hash>.mp3 — DragonHD narration (per side)
tooling/gen_refs|gen_assets|gen_intro|gen_voice.py   asset pipelines (all 4 worlds' art direction)
scripts/serve.mjs      static server on :5174
test/*.test.js         36 unit tests: rules + engine + coach/openings + worlds + per-side identities
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

## 3D pieces — image-to-3D pipeline (gpt-image-2 → Hunyuan3D-2 → Blender projection)
The current realistic pieces are **not** hand-modelled; they are reconstructed from a themed
concept image. The live pieces are built with **Hunyuan3D-2** (below); **TripoSR** is a
no-signup CPU fallback. Reproduce with the `.venv3d` (Python 3.11 via `uv`, torch CPU):
1. **Concept (inspiration):** `python tooling/gen_refs.py [world]` → a museum-quality carved-ivory
   figurine per piece on a neutral bg → `web/assets/<world>/refs/<key>.jpg` (+ `_contact.jpg`).
   Art direction (subjects) is the `WORLDS` dict in the script.
2. **Ivory bg:** `python tooling/ivory_bg.py [world]` (rembg) → `<key>.proj.jpg` (figurine on
   ivory, so mesh areas outside the concept silhouette read as plain carved ivory, not grey).
3. **Mesh (primary — Hunyuan3D-2, free HF Space):** `python tooling/hf_batch.py [keys...]`
   (reuses one `gradio_client` connection; anon, ZeroGPU, ~11s/piece) → `tooling/hunyuan_out/
   <key>_hunyuan.glb` (dense, ~4–10 MB, **far crisper** than TripoSR — clean manes, trunks,
   chariot wheels, riders). Single piece: `python tooling/hf_hunyuan.py <img> <out.glb> [shape|all]`.
   Optional free `HF_TOKEN` env if anon rate-limits (didn't in practice). *Fallback (local, CPU):*
   `python tooling/triposr_run.py <img...> --out tooling/TripoSR/out256 --resolution 256` (TripoSR
   patched to **PyMCubes** in `tsr/models/isosurface.py` — no compiler/CUDA, but soft/melty).
4. **Project + web-ready:** `blender -b --python tooling/blender/texture_project.py -- <raw_glb>
   <concept.proj.jpg> web/assets/models/<key>.glb <preview.png>`. For **Hunyuan** use env
   `ROTX=0 CAM=+Y` (its native frame is already upright, up=+Z, side profile along Y). *(TripoSR
   needs `ROTX=-135 CAM=+X`.)* It orients/grounds, auto-corrects residual body-lean (vertical-mass
   axis → +Z), decimates to ~28k tris, and projects the concept from an ortho front camera as the
   surface texture. Renders 3 QA angles.
- **Orientation:** **Hunyuan3D-2** outputs a consistent upright frame (up=+Z, concept view along
  +Y) → `ROTX=0 CAM=+Y`. TripoSR's frame is a fixed ~45° tilt → `ROTX=-135 CAM=+X`. Either way a
  per-piece body-lean refine finishes the upright. Do transforms via `mesh.data.transform(Matrix)`
  — **object-level `transform_apply` silently no-ops in --background**.
- **Renderer:** `board3d.js pieceFor(key,color)` keeps the baked concept texture for the ivory
  (white) army and multiplies `material.color` toward **rosewood** (`0x4a3120`) for the dark army.
- **QA on board:** `node tooling/shot.mjs <prefix> [world]` (Playwright, swiftshader — slow ~3 min).
- Diagnostics/tools: `tooling/blender/inspect_glb.py` (3 framed views), `axis_views.py`
  (±X/±Y/top, to read a mesh's native orientation), `compare_render.py` (side-by-side two GLBs).
  Research notes: `tooling/3d_pipeline_research.md`.
- **Engine comparison (done):** Hunyuan3D-2 (free HF Space) beats local TripoSR decisively —
  reconstructs riders, tails, chariot wheels, elephant howdahs that TripoSR melts into blobs. The
  cloud image-to-3D options with paid APIs (Meshy/Rodin) and Azure (no first-party image-to-3D)
  were dead-ends; the **free HF Space is the recommended engine**. TripoSR stays as the offline
  fallback (soft on thin parts; res 400 only marginally cleaner than 256; Hunyuan3D-2**mini** is
  NOT CPU-feasible — needs the hosted GPU Space).

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

## Piece styles + per-side voice (v1.0)
- **Piece-style system** (`board3d.js` `pieceFor`→`styleFor(color)`): a style = {tint, roughness,
  metalness, emissive, emissiveIntensity, envMapIntensity, clearcoat}. Each world may set
  `pieceStyle.{white,black}` (kalinga=bronze/iron, devasura=radiant-gold-GLOW/dark-cosmic); the
  **🎨 Style** button (More menu) cycles **5 presets** (persisted `localStorage 'chaturanga_style'`).
- **Per-side voice:** `tooling/gen_voice.py <world>` reads every teaching string for BOTH sides and
  synthesises DragonHD clips → `assets/<world>/voice/voice.json` (map: teaching→mp3). Voices:
  `en-IN-Arjun:DragonHDLatestNeural` (sage) + `en-IN-Neerja:DragonHDLatestNeural`. **Azure Speech
  gotcha:** header `Authorization: aad#<RESOURCE_ID>#<AAD-token>` (NO "Bearer"); `pitch="0%"` not
  `"0st"` (400). DragonHD honors prosody, ignores express-as styles.

## Backlog / next
- More worlds (e.g. **Chaturanga Classic**, **Life & Karma**) — each needs `gen_refs`→`hf_batch`→
  Blender projection for both armies + `gen_assets`/`gen_intro`/`gen_voice` + a `<id>.json`.
- **2D piece sprites:** the 2D renderer currently uses themed glyphs, not the carved concept art —
  could render the `refs/*.jpg` or a flattened model shot per side.
- **Shrink the ~97 MB APK:** exclude dev-only `assets/*/refs/*.jpg` + `assets/*_dark/refs/` concept
  images from the web→android/docs sync (they aren't used at runtime).
- More piece styles / per-world music tracks / branding.
