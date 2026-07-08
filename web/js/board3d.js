// Chaturanga — real 3D board (Three.js). Modern chess rules via chess.js,
// authentic Chaturanga piece identities + per-world moral teachings that are
// revealed and read aloud on select / capture / promotion. Local hotseat.
import * as THREE from '../vendor/three.module.js';
import { GLTFLoader } from '../vendor/GLTFLoader.js';
import { newGame, TYPE_TO_KEY, selectMoment, moveMoment } from './rules.js';
import { makePiece } from './pieces3d.js';
import { bestMove as bestMoveMain, LEVELS, levelById } from './engine.js';
import { hint as hintMain, reviewMove as reviewMain, openingNote } from './coach.js';

const $ = (s) => document.querySelector(s);
const FILES = 'abcdefgh';
const hexInt = (h) => parseInt(String(h || '#000').replace('#', ''), 16) || 0;
const easeIO = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const tween = (dur, fn) => new Promise((res) => {
  const t0 = performance.now();
  const step = () => { const p = Math.min(1, (performance.now() - t0) / dur); fn(p); p < 1 ? requestAnimationFrame(step) : res(); };
  requestAnimationFrame(step);
});

// board square <-> world position. col0=a file, row0=rank 1 (white's home, near +z).
const squareName = (col, row) => FILES[col] + (row + 1);
const posOf = (col, row) => new THREE.Vector3(col - 3.5, 0, 3.5 - row);
function cellFromXZ(x, z) {
  const col = Math.round(x + 3.5), row = Math.round(3.5 - z);
  return (col >= 0 && col < 8 && row >= 0 && row < 8) ? { col, row, square: squareName(col, row) } : null;
}

const WORLDS = [['kurukshetra', 'Kurukshetra']];

async function main() {
  const params = new URLSearchParams(location.search);
  const worldFile = (params.get('world') || 'kurukshetra').replace(/[^a-z]/gi, '');
  const world = await (await fetch(`worlds/${worldFile}.json`)).json();
  const T = world.theme || {};
  document.title = `${world.title} — Chaturanga`;
  $('#title').textContent = world.title;

  // ---------- game mode: vs AI (pick side+level) or local hotseat ----------
  const MODE = params.get('mode') === 'hotseat' ? 'hotseat' : 'ai';
  const HUMAN = params.get('side') === 'b' ? 'b' : 'w';   // human's army in AI mode
  const LEVEL = levelById(+(params.get('level') || 3));
  const vsAI = MODE === 'ai';
  const isHumanTurn = () => MODE === 'hotseat' || game.turn() === HUMAN;

  const game = newGame();

  // ---------- AI worker (keeps search off the render thread; main-thread fallback) ----------
  let worker = null;
  try { worker = new Worker(new URL('./engine.worker.js', import.meta.url), { type: 'module' }); } catch { worker = null; }
  const pending = new Map();
  let reqId = 0;
  if (worker) worker.onmessage = (e) => {
    const { id, result, error } = e.data || {};
    const p = pending.get(id); if (!p) return; pending.delete(id);
    error ? p.rej(new Error(error)) : p.res(result);
  };
  function think(kind, payload) {
    if (worker) return new Promise((res, rej) => { const id = ++reqId; pending.set(id, { res, rej }); worker.postMessage({ id, kind, ...payload }); });
    return new Promise((res) => setTimeout(() => {
      try {
        if (kind === 'hint') res(hintMain(payload.fen, payload.level));
        else if (kind === 'review') res(reviewMain(payload.fen, payload.move, { depth: 3, maxMs: 700 }));
        else res(bestMoveMain(payload.fen, payload.level));
      } catch { res(null); }
    }, 24));
  }

  // ---------- renderer / scene ----------
  const MOBILE = matchMedia('(pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 820;
  const renderer = new THREE.WebGLRenderer({ antialias: !MOBILE, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, MOBILE ? 1.5 : 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = !MOBILE;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  $('#stage').appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const bg = hexInt(T.bg || '#1a0f08');
  scene.background = new THREE.Color(bg);
  scene.fog = new THREE.Fog(bg, 40, 120);

  const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 200);

  // ---------- image-based lighting (generated environment) for real reflections ----------
  const ASSET_BASE = world.assets || `assets/${worldFile}`;
  const texLoader = new THREE.TextureLoader();
  const pmrem = new THREE.PMREMGenerator(renderer); pmrem.compileEquirectangularShader();
  texLoader.load(`${ASSET_BASE}/env.jpg`, (tex) => {
    tex.mapping = THREE.EquirectangularReflectionMapping;
    const rt = pmrem.fromEquirectangular(tex);
    scene.environment = rt.texture;
    tex.dispose();
  }, undefined, () => { /* env optional */ });

  scene.add(new THREE.HemisphereLight(hexInt(T.accent || '#e8a33d'), hexInt(T.panel || '#241308'), 0.7));
  const key = new THREE.DirectionalLight(0xfff2e0, 1.25);
  key.position.set(5, 11, 6);
  if (!MOBILE) {
    key.castShadow = true;
    key.shadow.mapSize.set(4096, 4096);
    const d = 6.0; Object.assign(key.shadow.camera, { left: -d, right: d, top: d, bottom: -d, near: 1, far: 30 });
    key.shadow.bias = -0.00015;
    key.shadow.normalBias = 0.035;
  }
  scene.add(key);
  scene.add(new THREE.AmbientLight(hexInt(T.panel || '#241308'), 0.55));

  const boardGroup = new THREE.Group();
  scene.add(boardGroup);

  // plinth
  const plinth = new THREE.Mesh(
    new THREE.BoxGeometry(9.4, 0.5, 9.4),
    new THREE.MeshStandardMaterial({ color: hexInt(T.dark || '#6b4423'), roughness: 0.9 }),
  );
  plinth.position.y = -0.28; plinth.receiveShadow = true;
  boardGroup.add(plinth);
  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(8.7, 0.16, 8.7),
    new THREE.MeshStandardMaterial({ color: hexInt(T.accent || '#e8a33d'), roughness: 0.6, metalness: 0.3 }),
  );
  frame.position.y = -0.04; frame.receiveShadow = true;
  boardGroup.add(frame);

  // 8x8 squares as two InstancedMeshes (light + dark) with generated stone/wood textures
  const sqGeo = new THREE.BoxGeometry(0.98, 0.08, 0.98);
  const lightMat = new THREE.MeshStandardMaterial({ color: hexInt(T.light || '#d9b98a'), roughness: 0.55, metalness: 0.05, envMapIntensity: 0.6 });
  const darkMat = new THREE.MeshStandardMaterial({ color: hexInt(T.dark || '#6b4423'), roughness: 0.5, metalness: 0.05, envMapIntensity: 0.6 });
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const applyTex = (mat, file) => texLoader.load(`${ASSET_BASE}/${file}`, (t) => {
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = maxAniso;
    mat.map = t; mat.color.set(0xffffff); mat.needsUpdate = true;
  }, undefined, () => {});
  applyTex(lightMat, 'board-light.jpg');
  applyTex(darkMat, 'board-dark.jpg');
  const lightIM = new THREE.InstancedMesh(sqGeo, lightMat, 32);
  const darkIM = new THREE.InstancedMesh(sqGeo, darkMat, 32);
  lightIM.receiveShadow = darkIM.receiveShadow = true;
  const dummy = new THREE.Object3D();
  let li = 0, di = 0;
  for (let row = 0; row < 8; row++) for (let col = 0; col < 8; col++) {
    const p = posOf(col, row);
    dummy.position.set(p.x, 0, p.z); dummy.updateMatrix();
    if ((col + row) % 2 === 0) darkIM.setMatrixAt(di++, dummy.matrix);
    else lightIM.setMatrixAt(li++, dummy.matrix);
  }
  lightIM.instanceMatrix.needsUpdate = darkIM.instanceMatrix.needsUpdate = true;
  boardGroup.add(lightIM); boardGroup.add(darkIM);

  // ---------- piece meshes: polished ivory (white) vs dark rosewood (black) ----------
  const whiteMat = new THREE.MeshPhysicalMaterial({ color: hexInt(T.whiteArmy || '#efe4c8'), roughness: 0.34, metalness: 0.0, clearcoat: 0.55, clearcoatRoughness: 0.3, envMapIntensity: 1.15, sheen: 0.2 });
  const blackMat = new THREE.MeshPhysicalMaterial({ color: hexInt(T.blackArmy || '#3a2418'), roughness: 0.3, metalness: 0.05, clearcoat: 0.7, clearcoatRoughness: 0.22, envMapIntensity: 1.0 });
  const piecesGroup = new THREE.Group();
  boardGroup.add(piecesGroup);
  let meshBySquare = new Map();

  // ---------- carved glTF models (Blender) with a procedural fallback ----------
  const MODELS = {};
  const TARGET_H = { padati: 0.72, gaja: 0.86, ashva: 0.94, ratha: 0.8, mantri: 1.0, raja: 1.14 };
  const loader = new GLTFLoader();
  const loadGLB = (url) => new Promise((res, rej) => loader.load(url, res, undefined, rej));
  function normalize(obj, targetH) {
    let box = new THREE.Box3().setFromObject(obj);
    const size = new THREE.Vector3(); box.getSize(size);
    const s = targetH / (size.y || 1);
    obj.scale.setScalar(s);
    obj.updateMatrixWorld(true);
    box = new THREE.Box3().setFromObject(obj);
    const c = new THREE.Vector3(); box.getCenter(c);
    obj.position.set(-c.x, -box.min.y, -c.z);
  }
  async function loadModels() {
    await Promise.all(Object.keys(TARGET_H).map(async (k) => {
      try {
        const gltf = await loadGLB(`assets/models/${k}.glb`);
        normalize(gltf.scene, TARGET_H[k]);
        const t = new THREE.Group(); t.add(gltf.scene);
        MODELS[k] = t;
      } catch { /* keep procedural fallback */ }
    }));
  }
  // pieces with a clear front (muzzle / spear) point at +X in their model
  const facingY = (key, color) => {
    const w = color === 'w';
    if (key === 'ashva' || key === 'padati') return w ? Math.PI / 2 : -Math.PI / 2;
    if (key === 'gaja') return w ? 0 : Math.PI;
    return w ? 0 : Math.PI;
  };
  // ivory (white army) shows the baked concept texture as-is; dark army multiplies
  // it toward rosewood so the carved detail survives as dark wood.
  const IVORY = new THREE.Color(0xffffff);
  const ROSEWOOD = new THREE.Color(0x4a3120);
  function pieceFor(key, color) {
    const t = MODELS[key];
    if (!t) return makePiece(key, color === 'w' ? whiteMat : blackMat);
    const g = t.clone(true);
    const tint = color === 'w' ? IVORY : ROSEWOOD;
    g.traverse((n) => {
      if (!n.isMesh) return;
      n.castShadow = true;
      if (n.material && n.material.map) {
        const m = n.material.clone();
        m.color = tint.clone();
        m.roughness = 0.5; m.metalness = 0.0; m.envMapIntensity = 1.0;
        n.material = m;
      } else {
        n.material = color === 'w' ? whiteMat : blackMat;
      }
    });
    g.userData.key = key;
    return g;
  }

  function syncPieces() {
    piecesGroup.clear();
    meshBySquare = new Map();
    const b = game.board();
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      const cell = b[r][c];
      if (!cell) continue;
      const row = 7 - r, col = c; // r0 = rank8
      const key2 = TYPE_TO_KEY[cell.type];
      const g = pieceFor(key2, cell.color);
      const p = posOf(col, row);
      g.position.set(p.x, 0.041, p.z); // rest base ON the board top (squares top = 0.04) to avoid z-fighting
      g.rotation.y = facingY(key2, cell.color);
      g.userData.square = cell.square;
      piecesGroup.add(g);
      meshBySquare.set(cell.square, g);
    }
  }
  await loadModels();
  syncPieces();

  // ---------- selection + move markers ----------
  const markers = new THREE.Group();
  boardGroup.add(markers);
  const selRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.42, 0.05, 12, 36),
    new THREE.MeshBasicMaterial({ color: hexInt(T.accent || '#e8a33d'), transparent: true, opacity: 0.85 }),
  );
  selRing.rotation.x = Math.PI / 2; selRing.visible = false; selRing.position.y = 0.06;
  boardGroup.add(selRing);

  let selected = null; // {square, moves:[verbose]}
  function clearMarkers() { markers.clear(); selRing.visible = false; selected = null; }
  function showMoves(square) {
    const moves = game.moves({ square, verbose: true });
    if (!moves.length) return false;
    selected = { square, moves };
    const c = cellFromName(square);
    selRing.position.set(c.x, 0.06, c.z); selRing.visible = true;
    for (const mv of moves) {
      const t = cellFromName(mv.to);
      const capture = mv.flags.includes('c') || mv.flags.includes('e');
      const mk = capture
        ? new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.045, 10, 28), new THREE.MeshBasicMaterial({ color: 0xff5c5c, transparent: true, opacity: 0.85 }))
        : new THREE.Mesh(new THREE.CircleGeometry(0.16, 24), new THREE.MeshBasicMaterial({ color: hexInt(T.accent || '#e8a33d'), transparent: true, opacity: 0.7 }));
      mk.rotation.x = -Math.PI / 2; mk.position.set(t.x, 0.07, t.z);
      markers.add(mk);
    }
    return true;
  }
  const cellFromName = (sq) => { const col = FILES.indexOf(sq[0]), row = +sq[1] - 1; return posOf(col, row); };

  // ---------- move execution ----------
  let busy = false, aiThinking = false;
  async function doMove(from, to, opt = {}) {
    const fenBefore = game.fen();
    const mv = game.move({ from, to, promotion: 'q' });
    if (!mv) return;
    busy = true;
    clearMarkers();
    const mesh = meshBySquare.get(from);
    const dest = cellFromName(to);
    // fade a captured piece (normal or en-passant)
    const capSquare = mv.flags.includes('e') ? to[0] + from[1] : to;
    const capMesh = mv.captured ? meshBySquare.get(capSquare) : null;
    if (capMesh) fadeOut(capMesh);
    if (mesh) {
      const a = mesh.position.clone();
      await tween(360, (p) => {
        const e = easeIO(p);
        mesh.position.x = a.x + (dest.x - a.x) * e;
        mesh.position.z = a.z + (dest.z - a.z) * e;
        mesh.position.y = Math.sin(p * Math.PI) * (mv.piece === 'n' ? 0.6 : 0.28);
      });
    }
    syncPieces(); // reconcile castling / en-passant / promotion
    const state = { check: game.inCheck(), checkmate: game.isCheckmate() };
    reveal(moveMoment(world, mv, state));
    updateStatus();
    showOpening();
    busy = false;
    // coach: review a HUMAN move (only in AI mode, and not on game-ending moves)
    if (vsAI && !opt.ai && !game.isGameOver()) reviewHuman(fenBefore, mv);
    // AI reply
    if (vsAI && !game.isGameOver() && game.turn() !== HUMAN) aiMove();
  }

  async function aiMove() {
    if (aiThinking) return;
    aiThinking = true; busy = true;
    setThinking(true);
    try {
      const r = await think('best', { fen: game.fen(), level: LEVEL.id });
      if (r && r.move) { busy = false; await doMove(r.move.from, r.move.to, { ai: true }); }
    } catch { /* ignore; leave it human's move */ }
    finally { aiThinking = false; busy = false; setThinking(false); }
  }

  async function reviewHuman(fenBefore, mv) {
    try {
      const r = await think('review', { fen: fenBefore, move: { from: mv.from, to: mv.to, promotion: mv.promotion } });
      if (r && r.tone === 'warn') showCoach(r);
    } catch { /* ignore */ }
  }
  function fadeOut(g) {
    g.traverse((n) => { if (n.material) { n.material = n.material.clone(); n.material.transparent = true; } });
    tween(340, (p) => g.traverse((n) => { if (n.material) n.material.opacity = 1 - p; n.scale?.setScalar?.(1 - 0.4 * p); }));
  }

  // ---------- picking ----------
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hit = new THREE.Vector3();
  function pick(clientX, clientY) {
    ndc.set((clientX / innerWidth) * 2 - 1, -(clientY / innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    if (!ray.ray.intersectPlane(ground, hit)) return null;
    return cellFromXZ(hit.x, hit.z);
  }
  function onTap(cell) {
    if (busy || aiThinking || !cell || game.isGameOver()) return;
    if (vsAI && !isHumanTurn()) return;               // wait your turn against the AI
    const piece = game.get(cell.square);
    if (selected) {
      const legal = selected.moves.find((m) => m.to === cell.square);
      if (legal) { doMove(selected.square, cell.square); return; }
      if (piece && piece.color === game.turn()) { clearMarkers(); select(cell.square); return; }
      clearMarkers(); return;
    }
    if (piece && piece.color === game.turn()) select(cell.square);
  }
  function select(square) {
    const piece = game.get(square);
    if (!showMoves(square)) { clearMarkers(); }
    reveal(selectMoment(world, piece.type), true);
    inspectPiece(piece.type, piece.color);            // rotating render + movement pattern
    if (eyeMode) setEye(square, piece.color, piece.type);
  }

  // ---------- teaching card + narration ----------
  let cardTimer = null;
  function reveal(m, quiet) {
    if (!m) return;
    const kindLabel = { select: 'Dharma', pawn: 'The Foot-soldier', capture: 'Battlefield', promotion: 'Reborn', check: 'Peril', checkmate: 'Victory', move: 'Dharma' }[m.kind] || 'Dharma';
    $('#cKind').textContent = kindLabel;
    $('#cKind').className = 'kind ' + m.kind;
    $('#cName').textContent = (m.glyph ? m.glyph + '  ' : '') + (m.title || m.name || '');
    $('#cEn').textContent = m.en ? '— ' + m.en : (m.moral || '');
    const text = m.teaching || m.line || '';
    $('#cMeaning').textContent = text;
    $('#card').classList.add('show');
    clearTimeout(cardTimer);
    cardTimer = setTimeout(() => $('#card').classList.remove('show'), m.kind === 'select' ? 4200 : 6500);
    if (!quiet || m.kind === 'select') speak(text);
  }
  let muted = false;
  function speak(text) {
    if (muted || !text || !window.speechSynthesis) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 0.95; u.pitch = 1; u.lang = (world.voice && world.voice.web) || 'en-IN';
      const v = speechSynthesis.getVoices().find((vo) => /en-IN|Indian/i.test(vo.lang + vo.name)) || null;
      if (v) u.voice = v;
      speechSynthesis.speak(u);
    } catch { /* ignore */ }
  }

  // ---------- status / turn ----------
  const sideName = (c) => (world.sides ? (c === 'w' ? world.sides.white : world.sides.black) : (c === 'w' ? 'White' : 'Black'));
  function updateStatus() {
    let s;
    if (game.isCheckmate()) s = `♚ Checkmate — ${sideName(game.turn() === 'w' ? 'b' : 'w')} wins`;
    else if (game.isStalemate()) s = 'Stalemate — a draw';
    else if (game.isDraw()) s = 'Draw';
    else s = `${sideName(game.turn())} to move${game.inCheck() ? ' · Raja in check!' : ''}`;
    $('#status').textContent = s;
    const w = game.turn() === 'w';
    $('#turn').innerHTML = `
      <span class="side ${w ? 'on' : ''}"><span class="dot" style="background:${T.whiteArmy || '#efe4c8'}"></span>${sideName('w')}</span>
      <span class="side ${!w ? 'on' : ''}"><span class="dot" style="background:${T.blackArmy || '#3a2418'}"></span>${sideName('b')}</span>`;
  }
  function showOpening() {
    const badge = $('#opening'); if (!badge) return;
    const n = openingNote(game.history());
    if (n) { badge.textContent = `${n.name} — ${n.sub}`; badge.classList.add('show'); badge.title = n.idea; }
    else badge.classList.remove('show');
  }
  let coachTimer = null;
  function showCoach(r) {
    const c = $('#coach'); if (!c) return;
    c.className = 'coach show ' + (r.tone || '');
    c.innerHTML = `<b>${r.title}.</b> ${r.message}`;
    clearTimeout(coachTimer); coachTimer = setTimeout(() => c.classList.remove('show'), 6500);
  }
  function setThinking(on) {
    const dot = $('#thinking'); if (dot) dot.classList.toggle('show', on);
    if (on) $('#status').textContent = `${LEVEL.name} is thinking…`; else updateStatus();
  }

  // ---------- camera (orbit + pinch + fit) ----------
  const BOARD_R = 6.3;
  const cam = { radius: 12, baseRadius: 12, theta: Math.PI / 2, phi: 0.82, t: new THREE.Vector3(0, 0, 0) };
  const PRESETS = [
    { name: 'Sitting', radius: 11, theta: Math.PI / 2, phi: 0.86 },
    { name: 'Top', radius: 11, theta: Math.PI / 2, phi: 0.12 },
    { name: 'Duel', radius: 10, theta: Math.PI / 2, phi: 1.2 },
    { name: 'Corner', radius: 12, theta: Math.PI / 4, phi: 0.8 },
  ];
  let presetIdx = 0, camTween = null, flip = vsAI && HUMAN === 'b';
  let eyeMode = false, eyeTarget = null;
  function setEye(square, color, type) {
    const p = cellFromName(square);
    const h = (TARGET_H[TYPE_TO_KEY[type]] || 0.9);
    const fwd = color === 'w' ? -1 : 1;               // enemy lies toward -z for white, +z for black
    eyeTarget = {
      pos: new THREE.Vector3(p.x, h * 0.94 + 0.06, p.z - fwd * 0.05),
      look: new THREE.Vector3(p.x, 0.3, p.z + fwd * 3.4),
    };
  }
  const fitRadius = (base) => {
    const vHalf = (camera.fov * Math.PI) / 360;
    const hHalf = Math.atan(Math.tan(vHalf) * camera.aspect);
    return Math.max(base, BOARD_R / Math.sin(Math.min(vHalf, hHalf)));
  };
  // steeper, fuller view on tall/portrait phones so the board isn't a shallow band
  const presetPhi = (p) => (camera.aspect < 0.85 && p.name === 'Sitting' ? 0.52 : p.phi);
  function applyPreset(p, instant) {
    cam.baseRadius = p.radius;
    const theta = p.theta + (flip ? Math.PI : 0);
    const ph = presetPhi(p);
    if (instant) { cam.radius = fitRadius(p.radius); cam.theta = theta; cam.phi = ph; }
    else camTween = { from: { r: cam.radius, th: cam.theta, ph: cam.phi }, to: { r: fitRadius(p.radius), th: theta, ph }, t0: performance.now(), dur: 900 };
  }
  applyPreset(PRESETS[0], true);
  function updateCamera() {
    if (eyeMode && eyeTarget) {
      camera.position.lerp(eyeTarget.pos, 0.18);
      camera.lookAt(eyeTarget.look);
      return;
    }
    if (camTween) {
      const p = Math.min(1, (performance.now() - camTween.t0) / camTween.dur), e = easeIO(p), a = camTween.from, b = camTween.to;
      cam.radius = a.r + (b.r - a.r) * e; cam.theta = a.th + (b.th - a.th) * e; cam.phi = a.ph + (b.ph - a.ph) * e;
      if (p >= 1) camTween = null;
    }
    const sp = Math.max(0.06, Math.min(1.4, cam.phi));
    camera.position.set(cam.t.x + cam.radius * Math.sin(sp) * Math.cos(cam.theta), cam.t.y + cam.radius * Math.cos(sp), cam.t.z + cam.radius * Math.sin(sp) * Math.sin(cam.theta));
    camera.lookAt(cam.t);
  }

  // ---------- input ----------
  const el = renderer.domElement;
  const ptrs = new Map();
  let lx = 0, ly = 0, pinchD = 0, moved = 0, downX = 0, downY = 0;
  const pinchDist = () => { const a = [...ptrs.values()]; return Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y); };
  el.addEventListener('pointerdown', (e) => { ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); lx = e.clientX; ly = e.clientY; downX = e.clientX; downY = e.clientY; moved = 0; if (ptrs.size === 2) pinchD = pinchDist(); });
  const up = (e) => {
    const wasTap = ptrs.has(e.pointerId) && moved < 8 && ptrs.size === 1;
    ptrs.delete(e.pointerId); if (ptrs.size < 2) pinchD = 0;
    if (wasTap) { const cell = pick(e.clientX, e.clientY); onTap(cell); }
  };
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', (e) => { ptrs.delete(e.pointerId); });
  window.addEventListener('pointermove', (e) => {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved += Math.abs(e.clientX - lx) + Math.abs(e.clientY - ly);
    if (ptrs.size >= 2) { const d = pinchDist(); if (pinchD > 0 && d > 0) cam.radius = Math.max(6, Math.min(30, cam.radius * (pinchD / d))); pinchD = d; camTween = null; return; }
    if (moved > 6) { camTween = null; cam.theta -= (e.clientX - lx) * 0.006; cam.phi = Math.max(0.08, Math.min(1.4, cam.phi - (e.clientY - ly) * 0.006)); }
    lx = e.clientX; ly = e.clientY;
  });
  el.addEventListener('wheel', (e) => { e.preventDefault(); cam.radius = Math.max(6, Math.min(30, cam.radius + Math.sign(e.deltaY) * 1)); }, { passive: false });
  addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); if (!camTween) cam.radius = fitRadius(cam.baseRadius); });

  // ---------- piece inspector: a small rotating render + movement diagram ----------
  let insp = null;
  function initInspector() {
    const canvas = document.getElementById('inspCanvas');
    if (!canvas) return null;
    const r = new THREE.WebGLRenderer({ canvas, antialias: !MOBILE, alpha: true });
    r.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    const w = canvas.clientWidth || 150, h = canvas.clientHeight || 168;
    r.setSize(w, h, false);
    const sc = new THREE.Scene();
    const cm = new THREE.PerspectiveCamera(38, w / h, 0.1, 50);
    cm.position.set(0, 0.35, 3.2);
    sc.add(new THREE.HemisphereLight(0xffffff, 0x2a1a0e, 1.05));
    const dl = new THREE.DirectionalLight(0xfff2e0, 1.4); dl.position.set(2, 4, 3); sc.add(dl);
    if (scene.environment) sc.environment = scene.environment;
    const holder = new THREE.Group(); sc.add(holder);
    return { r, sc, cm, holder };
  }
  function inspectPiece(type, color) {
    if (!insp) insp = initInspector();
    if (!insp) return;
    insp.holder.clear();
    const key = TYPE_TO_KEY[type];
    const g = pieceFor(key, color);
    const box = new THREE.Box3().setFromObject(g); const size = new THREE.Vector3(); box.getSize(size);
    g.scale.setScalar(1.7 / (size.y || 1)); g.updateMatrixWorld(true);
    const b2 = new THREE.Box3().setFromObject(g); const c = new THREE.Vector3(); b2.getCenter(c);
    g.position.set(-c.x, -(b2.min.y + (b2.max.y - b2.min.y) / 2), -c.z);
    insp.holder.add(g);
    drawMovePattern(key);
    const info = world.pieces[key] || {};
    const nm = $('#inspName'); if (nm) nm.textContent = `${info.glyph || ''} ${info.name || key}`.trim();
    const panel = $('#inspector'); if (panel) panel.classList.add('show');
  }
  function moveOffsets(key) {
    const O = []; const line = (df, dr) => { for (let i = 1; i <= 2; i++) O.push([df * i, dr * i]); };
    if (key === 'ratha' || key === 'mantri') { line(1, 0); line(-1, 0); line(0, 1); line(0, -1); }
    if (key === 'gaja' || key === 'mantri') { line(1, 1); line(-1, 1); line(1, -1); line(-1, -1); }
    if (key === 'ashva') [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]].forEach((o) => O.push(o));
    if (key === 'raja') [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]].forEach((o) => O.push(o));
    if (key === 'padati') O.push([0, 1, 'move'], [0, 2, 'move'], [1, 1, 'cap'], [-1, 1, 'cap']);
    return O;
  }
  function drawMovePattern(key) {
    const grid = $('#moveGrid'); if (!grid) return;
    const O = moveOffsets(key);
    const at = (df, dr) => O.find((o) => o[0] === df && o[1] === dr);
    let html = '';
    for (let r = 0; r < 5; r++) for (let col = 0; col < 5; col++) {
      const df = col - 2, dr = 2 - r; let cls = 'mc';
      if (df === 0 && dr === 0) cls += ' me';
      else { const o = at(df, dr); if (o) cls += ' ' + (o[2] || 'mv'); }
      html += `<i class="${cls}"></i>`;
    }
    grid.innerHTML = html;
  }
  function hintArrow(from, to) {
    clearMarkers();
    const a = cellFromName(from), b = cellFromName(to);
    const r1 = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.05, 12, 36), new THREE.MeshBasicMaterial({ color: 0x66ff9c, transparent: true, opacity: 0.9 }));
    r1.rotation.x = Math.PI / 2; r1.position.set(a.x, 0.07, a.z); markers.add(r1);
    const r2 = new THREE.Mesh(new THREE.RingGeometry(0.26, 0.4, 28), new THREE.MeshBasicMaterial({ color: 0x66ff9c, transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
    r2.rotation.x = -Math.PI / 2; r2.position.set(b.x, 0.075, b.z); markers.add(r2);
    setTimeout(() => { if (!selected) clearMarkers(); }, 3200);
  }

  // ---------- HUD ----------
  const sel = $('#worldSel');
  sel.innerHTML = WORLDS.map(([id, n]) => `<option value="${id}"${id === worldFile ? ' selected' : ''}>${n}</option>`).join('');
  sel.addEventListener('change', () => { location.search = `?world=${sel.value}`; });
  $('#newBtn').addEventListener('click', () => {
    game.reset(); syncPieces(); clearMarkers();
    $('#card').classList.remove('show');
    $('#coach')?.classList.remove('show'); $('#opening')?.classList.remove('show'); $('#inspector')?.classList.remove('show');
    eyeTarget = null; updateStatus();
    if (vsAI && game.turn() !== HUMAN) aiMove();
  });
  $('#viewBtn').addEventListener('click', () => { eyeMode = false; $('#eyeBtn')?.classList.remove('on'); presetIdx = (presetIdx + 1) % PRESETS.length; $('#viewName').textContent = PRESETS[presetIdx].name; applyPreset(PRESETS[presetIdx]); });
  $('#flipBtn').addEventListener('click', () => { flip = !flip; applyPreset(PRESETS[presetIdx]); });
  $('#muteBtn').addEventListener('click', () => { muted = !muted; if (muted) speechSynthesis?.cancel?.(); $('#muteBtn').textContent = muted ? '🔇' : '🔊'; });
  $('#hintBtn')?.addEventListener('click', async () => {
    if (busy || aiThinking || game.isGameOver() || (vsAI && !isHumanTurn())) return;
    const h = await think('hint', { fen: game.fen(), level: LEVEL.id });
    if (h) { hintArrow(h.from, h.to); showCoach({ tone: 'nudge', title: 'Hint', message: `${h.san} — ${h.why}` }); }
  });
  $('#eyeBtn')?.addEventListener('click', () => {
    eyeMode = !eyeMode; $('#eyeBtn').classList.toggle('on', eyeMode);
    if (eyeMode && selected) { const p = game.get(selected.square); if (p) setEye(selected.square, p.color, p.type); }
    else { eyeTarget = null; applyPreset(PRESETS[presetIdx]); }
  });
  document.querySelectorAll('nav a').forEach((a) => { a.href = `${a.getAttribute('href').split('?')[0]}?world=${worldFile}`; });

  updateStatus();
  if (vsAI && game.turn() !== HUMAN) aiMove();          // AI opens when the human plays black
  renderer.setAnimationLoop(() => {
    updateCamera();
    const t = performance.now() * 0.001;
    selRing.material.opacity = 0.55 + Math.sin(t * 4) * 0.25;
    selRing.rotation.z = t * 0.6;
    renderer.render(scene, camera);
    if (insp && $('#inspector')?.classList.contains('show')) { insp.holder.rotation.y = t * 0.9; insp.r.render(insp.sc, insp.cm); }
  });

  window.__cReady = true;
  window.__c = {
    fen: () => game.fen(),
    turn: () => game.turn(),
    move: (from, to) => doMove(from, to),
    tap: (sq) => onTap({ col: FILES.indexOf(sq[0]), row: +sq[1] - 1, square: sq }),
    selected: () => (selected ? selected.square : null),
    card: () => ({ shown: $('#card').classList.contains('show'), kind: $('#cKind').textContent, name: $('#cName').textContent, text: $('#cMeaning').textContent }),
    info: () => ({ calls: renderer.info.render.calls, tris: renderer.info.render.triangles }),
    view: () => (eyeMode ? "Warrior's Eye" : PRESETS[presetIdx].name),
    cam: (o) => { camTween = null; eyeMode = false; Object.assign(cam, o || {}); return { r: cam.radius, theta: cam.theta, phi: cam.phi }; },
    mode: () => MODE, level: () => LEVEL.id, human: () => HUMAN,
    aiThinking: () => aiThinking,
    inspector: () => ({ shown: !!$('#inspector')?.classList.contains('show'), name: $('#inspName')?.textContent || '' }),
  };
}

main();
