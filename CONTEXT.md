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
- **Status:** v0.1 — playable 3D board, one world (Kurukshetra), teachings + read-aloud.

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
web/js/pieces3d.js     procedural 3D pieces (LatheGeometry profiles + sculpted Ashva horse-head)
web/js/board3d.js      renderer: scene, InstancedMesh squares, tap-to-move, teaching card + speak(), camera fit
web/play.html          the game shell (HUD, teaching card, turn pills)
web/vendor/            chess.js (MIT, rules) + three.module.js + three.core.js (copied from Sopana)
scripts/serve.mjs      static server on :5174
test/rules.test.js     9 unit tests (engine + identities + teachings + world validation)
```
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

## Backlog / next
- More worlds: **Chaturanga Classic** (historical lore), **Life & Karma** (modern work/life lessons).
- Realistic pieces via **Blender (MCP)** → glTF, esp. Gaja (elephant) + Ashva (horse) + Padati.
- A **lobby** (`setup.html`): pick world + sides + (later) a piece set; per-world board/piece skins.
- Pre-generated **Azure TTS** narration per world (finite line set); per-world **music** + branding/logo.
- Optional: promotion chooser, move history, simple AI opponent, publish (GitHub Pages + APK via Capacitor).
