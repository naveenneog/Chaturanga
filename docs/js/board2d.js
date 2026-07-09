// Chaturanga — 2D board renderer. A lightweight DOM board that reuses the same game brain as
// the 3D version: chess.js rules + identities (rules.js), the AI engine (engine.worker.js),
// the coach + openings, procedural audio, and the pre-generated DragonHD narration. Themed
// glyph pieces, per-side identities, teachings, undo, captured tray, promotion, game-over.
import { newGame, TYPE_TO_KEY, selectMoment, moveMoment, sidePieces } from './rules.js';
import { bestMove as bestMoveMain, levelById } from './engine.js';
import { hint as hintMain, reviewMove as reviewMain, openingNote, openingStep } from './coach.js';
import { openingById } from './openings.js';
import * as audio from './audio.js';

const $ = (s) => document.querySelector(s);
const FILES = 'abcdefgh';
const WORLDS = [['kurukshetra', 'Kurukshetra'], ['ramayana', 'Ramayana · Lanka'], ['kalinga', 'Kalinga · Ashoka'], ['devasura', 'Devas & Asuras']];

async function main() {
  const params = new URLSearchParams(location.search);
  const worldFile = (params.get('world') || 'kurukshetra').replace(/[^a-z]/gi, '');
  let world;
  try { world = await (await fetch(`worlds/${worldFile}.json`)).json(); } catch { world = { title: 'Chaturanga', theme: {}, pieces: {} }; }
  const T = world.theme || {};
  const ASSET_BASE = world.assets || `assets/${worldFile}`;
  document.title = `${world.title} — Chaturanga 2D`;
  $('#title').textContent = world.title;
  // theme
  const rs = document.documentElement.style;
  for (const [k, v] of Object.entries({ bg: T.bg, accent: T.accent, text: T.text, muted: T.muted, light: T.light, dark: T.dark, wa: T.whiteArmy, ba: T.blackArmy })) if (v) rs.setProperty(`--${k}`, v);

  const MODE = params.get('mode') === 'hotseat' ? 'hotseat' : 'ai';
  const HUMAN = params.get('side') === 'b' ? 'b' : 'w';
  const LEVEL = levelById(+(params.get('level') || 3));
  const TRAIN = (params.get('train') || '').replace(/[^a-z]/gi, '');
  const vsAI = MODE === 'ai';
  let training = false, trainerPaused = false, trainerExit = false;
  const isHumanTurn = () => MODE === 'hotseat' || game.turn() === HUMAN;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  const game = newGame();
  let flip = vsAI && HUMAN === 'b';
  let selected = null, busy = false, aiThinking = false, muted = false;

  // audio unlock on first gesture
  let audioReady = false;
  const unlockAudio = () => { if (audioReady) return; audioReady = true; try { audio.unlock(worldFile); } catch { /* ignore */ } };
  window.addEventListener('pointerdown', unlockAudio, { once: true, capture: true });

  // ---------- AI worker (main-thread fallback) ----------
  let worker = null;
  try { worker = new Worker(new URL('./engine.worker.js', import.meta.url), { type: 'module' }); } catch { worker = null; }
  const pending = new Map(); let reqId = 0;
  if (worker) worker.onmessage = (e) => { const { id, result, error } = e.data || {}; const p = pending.get(id); if (!p) return; pending.delete(id); error ? p.rej(new Error(error)) : p.res(result); };
  function think(kind, payload) {
    if (worker) return new Promise((res, rej) => { const id = ++reqId; pending.set(id, { res, rej }); worker.postMessage({ id, kind, ...payload }); });
    return new Promise((res) => setTimeout(() => {
      try { res(kind === 'hint' ? hintMain(payload.fen, payload.level) : kind === 'review' ? reviewMain(payload.fen, payload.move, { depth: 3, maxMs: 700 }) : bestMoveMain(payload.fen, payload.level)); } catch { res(null); }
    }, 24));
  }

  // ---------- board DOM ----------
  const boardEl = $('#board');
  const squares = {}; // square-name -> el
  function buildBoard() {
    boardEl.innerHTML = '';
    for (let r = 7; r >= 0; r--) for (let f = 0; f < 8; f++) {
      const dr = flip ? 7 - r : r, dfl = flip ? 7 - f : f;
      const sq = FILES[dfl] + (dr + 1);
      const el = document.createElement('div');
      el.className = 'sq ' + ((dfl + dr) % 2 === 0 ? 'drk' : 'lite');
      el.dataset.sq = sq;
      if (dfl === (flip ? 7 : 0)) { const c = document.createElement('span'); c.className = 'coord'; c.textContent = dr + 1; el.appendChild(c); }
      if (dr === (flip ? 7 : 0)) { const c = document.createElement('span'); c.className = 'coord'; c.style.bottom = 'auto'; c.style.top = '1px'; c.style.left = '2px'; c.style.right = 'auto'; c.textContent = FILES[dfl]; el.appendChild(c); }
      el.addEventListener('click', () => onTap(sq));
      boardEl.appendChild(el);
      squares[sq] = el;
    }
  }
  // pixel position (%) of a square for absolutely-positioned pieces
  function posOf(sq) {
    const f = FILES.indexOf(sq[0]), r = +sq[1] - 1;
    const col = flip ? 7 - f : f, row = flip ? r : 7 - r;
    return { left: col * 12.5 + '%', top: row * 12.5 + '%' };
  }
  const GLYPH = { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛', k: '♚' };
  let pieceEls = new Map();
  function render() {
    boardEl.querySelectorAll('.pc').forEach((e) => e.remove());
    pieceEls = new Map();
    const b = game.board();
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      const cell = b[r][c]; if (!cell) continue;
      const el = document.createElement('div');
      el.className = 'pc ' + cell.color;
      const g = document.createElement('span'); g.className = 'glyph'; g.textContent = GLYPH[cell.type];
      el.appendChild(g);
      const p = posOf(cell.square); el.style.left = p.left; el.style.top = p.top;
      el.dataset.sq = cell.square;
      el.addEventListener('click', (e) => { e.stopPropagation(); onTap(cell.square); });
      boardEl.appendChild(el);
      pieceEls.set(cell.square, el);
    }
    updateCheck();
  }

  // ---------- selection + markers ----------
  const markers = [];
  function clearMarkers() {
    markers.forEach((m) => m.remove()); markers.length = 0;
    Object.values(squares).forEach((s) => s.classList.remove('selsq'));
    boardEl.querySelectorAll('.pc.sel').forEach((e) => e.classList.remove('sel'));
    selected = null; $('#panel').classList.remove('show');
  }
  function showMoves(square) {
    const moves = game.moves({ square, verbose: true });
    if (!moves.length) return false;
    selected = { square, moves };
    squares[square]?.classList.add('selsq');
    pieceEls.get(square)?.classList.add('sel');
    for (const mv of moves) {
      const mk = document.createElement('div');
      mk.className = 'mk' + ((mv.flags.includes('c') || mv.flags.includes('e')) ? ' cap' : '');
      mk.innerHTML = '<span class="dot2"></span>';
      const p = posOf(mv.to); mk.style.left = p.left; mk.style.top = p.top;
      boardEl.appendChild(mk); markers.push(mk);
    }
    return true;
  }

  function onTap(square) {
    if (busy || aiThinking || training || game.isGameOver()) return;
    if (vsAI && !isHumanTurn()) return;
    const piece = game.get(square);
    if (selected) {
      const legal = selected.moves.find((m) => m.to === square);
      if (legal) { if (legal.promotion) askPromotion(selected.square, square); else doMove(selected.square, square); return; }
      if (piece && piece.color === game.turn()) { clearMarkers(); select(square); return; }
      clearMarkers(); return;
    }
    if (piece && piece.color === game.turn()) select(square);
  }
  function select(square) {
    const piece = game.get(square);
    clearMarkers();
    showMoves(square);               // draw move dots if any (a no-move piece still shows its dharma)
    audio.sfx('select');
    squares[square]?.classList.add('selsq');
    pieceEls.get(square)?.classList.add('sel');
    const info = selectMoment(world, piece.type, piece.color);
    showPanel(info, piece.type, piece.color);
    speak(info.teaching);
  }

  // ---------- move ----------
  async function doMove(from, to, opt = {}) {
    const fenBefore = game.fen();
    const mv = game.move({ from, to, promotion: opt.promotion || 'q' });
    if (!mv) return;
    audio.sfx(mv.flags.includes('k') || mv.flags.includes('q') ? 'castle' : mv.captured ? 'capture' : mv.flags.includes('p') ? 'promote' : 'move');
    busy = true; clearMarkers();
    // animate the moving piece element to the destination, then reconcile
    const el = pieceEls.get(from);
    if (el) { const p = posOf(to); el.style.left = p.left; el.style.top = p.top; }
    await wait(el ? 300 : 0);
    render(); updateCaptured(); updateUndo();
    if (game.inCheck() && !game.isCheckmate()) setTimeout(() => audio.sfx('check'), 240);
    reveal(moveMoment(world, mv, { check: game.inCheck(), checkmate: game.isCheckmate() }));
    updateStatus(); showOpening();
    busy = false;
    if (game.isGameOver()) { showGameOver(); return; }
    if (vsAI && !opt.ai) reviewHuman(fenBefore, mv);
    if (vsAI && !training && game.turn() !== HUMAN) aiMove();
  }
  async function aiMove() {
    if (aiThinking) return; aiThinking = true; busy = true; setThinking(true);
    try { const r = await think('best', { fen: game.fen(), level: LEVEL.id }); if (r && r.move) { busy = false; await doMove(r.move.from, r.move.to, { ai: true }); } }
    catch { /* ignore */ } finally { aiThinking = false; busy = false; setThinking(false); }
  }
  async function reviewHuman(fenBefore, mv) {
    try { const r = await think('review', { fen: fenBefore, move: { from: mv.from, to: mv.to, promotion: mv.promotion } }); if (r && r.tone === 'warn') showCoach(r); } catch { /* ignore */ }
  }
  function undo() {
    if (busy || aiThinking || training || !game.history().length) return;
    game.undo(); if (vsAI && game.turn() !== HUMAN && game.history().length) game.undo();
    render(); clearMarkers(); updateCaptured(); updateUndo(); updateStatus(); showOpening();
    $('#coach')?.classList.remove('show'); $('#over')?.classList.remove('show');
  }

  // ---------- promotion / game over ----------
  function askPromotion(from, to) {
    const modal = $('#promo'), row = $('#promoRow');
    const side = sidePieces(world, game.turn());
    const opts = [['q', 'mantri'], ['r', 'ratha'], ['b', 'gaja'], ['n', 'ashva']];
    row.innerHTML = opts.map(([p, k]) => `<button data-p="${p}">${(side[k] || {}).glyph || ''}<small>${(side[k] || {}).name || k}</small></button>`).join('');
    modal.classList.add('show');
    row.querySelectorAll('button').forEach((btn) => btn.onclick = () => { audio.sfx('ui'); modal.classList.remove('show'); doMove(from, to, { promotion: btn.dataset.p }); });
  }
  const sideName = (c) => (world.sides ? (c === 'w' ? world.sides.white : world.sides.black) : (c === 'w' ? 'White' : 'Black'));
  function showGameOver() {
    const over = $('#over'); if (!over) return;
    let title = 'A draw', line = 'A hard-fought balance — neither Raja falls today.';
    if (game.isCheckmate()) {
      const winColor = game.turn() === 'w' ? 'b' : 'w', darkWin = winColor === 'b';
      title = `${(darkWin ? world.checkmateTitleDark : null) || world.checkmateTitle || 'Victory'} — ${sideName(winColor)} win`;
      line = (darkWin ? world.checkmateLineDark : null) || world.checkmateLine || '';
    } else if (game.isStalemate()) { title = 'Stalemate'; line = 'No legal move remains, yet the Raja stands — a draw.'; }
    $('#overTitle').textContent = title; $('#overLine').textContent = line;
    over.classList.add('show'); audio.sfx('win'); if (line) speak(line);
  }

  // ---------- teaching panel + coach + narration ----------
  function moveOffsets(key) {
    const O = []; const line = (df, dr) => { for (let i = 1; i <= 2; i++) O.push([df * i, dr * i]); };
    if (key === 'ratha' || key === 'mantri') { line(1, 0); line(-1, 0); line(0, 1); line(0, -1); }
    if (key === 'gaja' || key === 'mantri') { line(1, 1); line(-1, 1); line(1, -1); line(-1, -1); }
    if (key === 'ashva') [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]].forEach((o) => O.push(o));
    if (key === 'raja') [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]].forEach((o) => O.push(o));
    if (key === 'padati') O.push([0, 1, 'move'], [0, 2, 'move'], [1, 1, 'cap'], [-1, 1, 'cap']);
    return O;
  }
  function showPanel(info, type, color) {
    const key = TYPE_TO_KEY[type];
    $('#pName').textContent = `${info.glyph || ''} ${info.name || key}`.trim();
    $('#pDharma').textContent = info.teaching || info.moral || '';
    const O = moveOffsets(key), at = (df, dr) => O.find((o) => o[0] === df && o[1] === dr);
    let html = '';
    for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) { const df = c - 2, dr = 2 - r; let cls = ''; if (df === 0 && dr === 0) cls = 'me'; else { const o = at(df, dr); if (o) cls = o[2] || 'mv'; } html += `<i class="${cls}"></i>`; }
    $('#pGrid').innerHTML = html;
    $('#panel').classList.add('show');
  }
  let cardTimer = null;
  function reveal(m) {
    if (!m) return;
    $('#coach')?.classList.remove('show');
    const key = TYPE_TO_KEY[m.pieceKey] ? m.pieceKey : m.pieceKey;
    $('#pName').textContent = `${m.glyph || ''} ${m.title || m.name || ''}`.trim();
    $('#pDharma').textContent = m.teaching || m.line || '';
    $('#panel').classList.add('show');
    clearTimeout(cardTimer); cardTimer = setTimeout(() => { if (!selected) $('#panel').classList.remove('show'); }, m.kind === 'checkmate' ? 9000 : 6500);
    speak(m.teaching || m.line || '');
  }
  let coachTimer = null;
  function showCoach(r) {
    const c = $('#coach'); if (!c) return;
    c.className = 'coach show ' + (r.tone || '');
    c.innerHTML = `<b>${r.title}.</b> ${r.message}`;
    clearTimeout(coachTimer); coachTimer = setTimeout(() => c.classList.remove('show'), 6500);
  }
  function setThinking(on) { if (on) $('#status').textContent = `${LEVEL.name} is thinking…`; else updateStatus(); }

  // ---------- narration (DragonHD clip, browser fallback) ----------
  let voiceManifest = {}; let narration = null;
  fetch(`${ASSET_BASE}/voice/voice.json`).then((r) => (r.ok ? r.json() : {})).then((m) => { voiceManifest = m || {}; }).catch(() => {});
  function speak(text) {
    if (muted || !text) return;
    const file = voiceManifest[text];
    if (file) { try { speechSynthesis?.cancel?.(); if (narration) narration.pause(); narration = new Audio(`${ASSET_BASE}/voice/${file}`); narration.play().catch(() => speakBrowser(text)); return; } catch { /* fall */ } }
    speakBrowser(text);
  }
  function speakBrowser(text) {
    if (muted || !text || !window.speechSynthesis) return;
    try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.rate = 0.95; u.lang = (world.voice && world.voice.web) || 'en-IN'; const v = speechSynthesis.getVoices().find((vo) => /en-IN|Indian/i.test(vo.lang + vo.name)); if (v) u.voice = v; speechSynthesis.speak(u); } catch { /* ignore */ }
  }

  // ---------- status / captured / check / opening ----------
  function updateStatus() {
    let s;
    if (game.isCheckmate()) s = `♚ Checkmate — ${sideName(game.turn() === 'w' ? 'b' : 'w')} wins`;
    else if (game.isStalemate()) s = 'Stalemate — a draw'; else if (game.isDraw()) s = 'Draw';
    else s = `${sideName(game.turn())} to move${game.inCheck() ? ' · Raja in check!' : ''}`;
    $('#status').textContent = s;
    const w = game.turn() === 'w';
    $('#turn').innerHTML = `<span class="side ${w ? 'on' : ''}"><span class="dot" style="background:${T.whiteArmy || '#efe4c8'}"></span>${sideName('w')}</span><span class="side ${!w ? 'on' : ''}"><span class="dot" style="background:${T.blackArmy || '#3a2418'}"></span>${sideName('b')}</span>`;
  }
  function updateCaptured() {
    const capB = [], capW = [];
    for (const m of game.history({ verbose: true })) { if (!m.captured) continue; const foe = m.color === 'w' ? 'b' : 'w'; const glyph = (sidePieces(world, foe)[TYPE_TO_KEY[m.captured]] || {}).glyph || '•'; (m.color === 'w' ? capW : capB).push(glyph); }
    $('#capW').innerHTML = capW.map((g) => `<span style="color:${T.muted || '#b79b74'}">${g}</span>`).join('');
    $('#capB').innerHTML = capB.map((g) => `<span style="color:${T.whiteArmy || '#efe4c8'}">${g}</span>`).join('');
  }
  function updateCheck() {
    Object.values(squares).forEach((s) => s.classList.remove('chk'));
    if (!game.inCheck()) return;
    const b = game.board(), turn = game.turn();
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) { const cell = b[r][c]; if (cell && cell.type === 'k' && cell.color === turn) squares[cell.square]?.classList.add('chk'); }
  }
  function updateUndo() { const u = $('#undoBtn'); if (u) u.disabled = game.history().length === 0 || training; }
  function showOpening() { const badge = $('#opening'); if (!badge) return; const n = openingNote(game.history()); if (n) { badge.textContent = `${n.name} — ${n.sub}`; badge.classList.add('show'); } else badge.classList.remove('show'); }

  // ---------- openings trainer ----------
  async function pausableWait(ms) { const end = performance.now() + ms; while (performance.now() < end || trainerPaused) { if (trainerExit) throw 'exit'; await wait(120); } }
  async function runTrainer(id) {
    const opening = openingById(id); if (!opening) return;
    training = true; trainerPaused = false; trainerExit = false; $('#trainer').classList.add('show');
    try {
      await pausableWait(700); let ply = 0, step;
      while ((step = openingStep(id, ply))) {
        const mv = game.moves({ verbose: true }).find((m) => m.san === step.san); if (!mv) break;
        $('#trStep').textContent = `${opening.name} · ${ply + 1}/${step.total}`;
        showCoach({ tone: 'nudge', title: `${opening.name} · ${ply + 1}/${step.total}`, message: step.note }); speak(step.note);
        await pausableWait(1800); await doMove(mv.from, mv.to, { ai: true }); await pausableWait(1400); ply++;
      }
      showCoach({ tone: 'nudge', title: 'Your move', message: `That is the ${opening.name}. ${opening.idea} Now play on.` });
    } catch { showCoach({ tone: 'nudge', title: 'Trainer ended', message: 'Play on from here.' }); }
    training = false; $('#trainer').classList.remove('show'); updateUndo();
    if (vsAI && !game.isGameOver() && game.turn() !== HUMAN) aiMove();
  }

  // ---------- HUD ----------
  const sel = $('#worldSel');
  sel.innerHTML = WORLDS.map(([id, n]) => `<option value="${id}"${id === worldFile ? ' selected' : ''}>${n}</option>`).join('');
  sel.addEventListener('change', () => { if (game.history().length && !confirm('Leave this game and switch world?')) { sel.value = worldFile; return; } location.search = `?world=${sel.value}&mode=${MODE}&side=${HUMAN}&level=${LEVEL.id}`; });
  function resetGame() { game.reset(); render(); clearMarkers(); updateCaptured(); updateUndo(); ['#coach', '#opening', '#over'].forEach((s) => $(s)?.classList.remove('show')); $('#panel').classList.remove('show'); updateStatus(); if (vsAI && game.turn() !== HUMAN) aiMove(); }
  $('#newBtn').addEventListener('click', resetGame);
  $('#overNew')?.addEventListener('click', () => { $('#over').classList.remove('show'); resetGame(); });
  $('#undoBtn').addEventListener('click', undo);
  $('#flipBtn').addEventListener('click', () => { flip = !flip; buildBoard(); render(); if (selected) { const s = selected.square; clearMarkers(); select(s); } });
  $('#hintBtn').addEventListener('click', async () => { if (busy || aiThinking || training || game.isGameOver() || (vsAI && !isHumanTurn())) return; const h = await think('hint', { fen: game.fen(), level: LEVEL.id }); if (h) { squares[h.from]?.classList.add('selsq'); showCoach({ tone: 'nudge', title: 'Hint', message: `${h.san} — ${h.why}` }); setTimeout(() => { if (!selected) squares[h.from]?.classList.remove('selsq'); }, 3000); } });
  $('#musicBtn').addEventListener('click', () => { const on = !audio.isMusicOn(); audio.setMusic(on); $('#musicBtn').classList.toggle('on', on); });
  $('#soundBtn').addEventListener('click', () => { const on = !audio.isSfxOn(); audio.setSfx(on); $('#soundBtn').classList.toggle('on', on); });
  $('#muteBtn').addEventListener('click', () => { muted = !muted; if (muted) { speechSynthesis?.cancel?.(); if (narration) narration.pause(); } $('#muteBtn').textContent = muted ? '🔇' : '🔊'; $('#muteBtn').classList.toggle('on', !muted); });
  $('#trPause')?.addEventListener('click', () => { trainerPaused = !trainerPaused; $('#trPause').textContent = trainerPaused ? '▶ Resume' : '⏸ Pause'; });
  $('#trExit')?.addEventListener('click', () => { trainerExit = true; trainerPaused = false; });
  document.querySelectorAll('#hud button').forEach((btn) => btn.addEventListener('click', () => audio.sfx('ui')));
  $('#musicBtn').classList.toggle('on', audio.isMusicOn()); $('#soundBtn').classList.toggle('on', audio.isSfxOn()); $('#muteBtn').classList.toggle('on', !muted);
  // carry world to nav links (Lobby + 3D)
  $('#lobbyLink').href = `setup.html?world=${worldFile}`;
  $('#to3d').href = `play.html?world=${worldFile}&mode=${MODE}&side=${HUMAN}&level=${LEVEL.id}${TRAIN ? `&train=${TRAIN}` : ''}`;

  buildBoard(); render(); updateStatus(); updateUndo(); updateCaptured();
  if (TRAIN) runTrainer(TRAIN); else if (vsAI && game.turn() !== HUMAN) aiMove();

  window.__cReady = true;
  window.__c = {
    fen: () => game.fen(), turn: () => game.turn(), moves: () => game.history().length,
    move: (from, to) => doMove(from, to), tap: (sq) => onTap(sq),
    selected: () => (selected ? selected.square : null),
    panel: () => ({ shown: $('#panel').classList.contains('show'), name: $('#pName').textContent, text: $('#pDharma').textContent }),
    captured: () => ({ w: $('#capW').textContent, b: $('#capB').textContent }),
    inCheck: () => game.inCheck(), checkShown: () => !!boardEl.querySelector('.sq.chk'),
    gameOver: () => ({ shown: $('#over').classList.contains('show'), title: $('#overTitle').textContent }),
    mode: () => MODE, level: () => LEVEL.id, human: () => HUMAN, aiThinking: () => aiThinking,
    load: (fen) => { try { game.load(fen); render(); clearMarkers(); updateCaptured(); updateUndo(); updateStatus(); return true; } catch { return false; } },
  };
}

main();
