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
- **Status:** v0.2 — playable 3D board, one world (Kurukshetra), teachings + read-aloud,
  **carved glTF pieces modelled in Blender** (all 6) with a procedural fallback.

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
scripts/serve.mjs      static server on :5174
test/rules.test.js     9 unit tests (engine + identities + teachings + world validation)
```

## 3D pieces (Blender pipeline)
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

## Backlog / next
- More worlds: **Chaturanga Classic** (historical lore), **Life & Karma** (modern work/life lessons).
- **Refine the Blender pieces** (Gaja is a bit bulbous; add tusk/eye detail; per-world piece skins).
- A **lobby** (`setup.html`): pick world + sides + piece set.
- Pre-generated **Azure TTS** narration per world (finite line set); per-world **music** + branding/logo.
- Optional: promotion chooser, move history, simple AI opponent, publish (GitHub Pages + APK via Capacitor).
