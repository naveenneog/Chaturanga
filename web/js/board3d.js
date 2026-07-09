// Chaturanga — real 3D board (Three.js). Modern chess rules via chess.js,
// authentic Chaturanga piece identities + per-world moral teachings that are
// revealed and read aloud on select / capture / promotion. Local hotseat.
import * as THREE from '../vendor/three.module.js';
import { GLTFLoader } from '../vendor/GLTFLoader.js';
import { EffectComposer } from '../vendor/EffectComposer.js';
import { RenderPass } from '../vendor/RenderPass.js';
import { UnrealBloomPass } from '../vendor/UnrealBloomPass.js';
import { OutputPass } from '../vendor/OutputPass.js';
import { newGame, TYPE_TO_KEY, selectMoment, moveMoment, sidePieces } from './rules.js';
import { makePiece } from './pieces3d.js';
import { bestMove as bestMoveMain, LEVELS, levelById } from './engine.js';
import { hint as hintMain, reviewMove as reviewMain, openingNote, openingStep } from './coach.js';
import { openingById } from './openings.js';
import * as audio from './audio.js';

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

const WORLDS = [['kurukshetra', 'Kurukshetra'], ['ramayana', 'Ramayana · Lanka'], ['kalinga', 'Kalinga · Ashoka'], ['devasura', 'Devas & Asuras']];

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
  const TRAIN = (params.get('train') || '').replace(/[^a-z]/gi, '');   // openings trainer id
  const vsAI = MODE === 'ai';
  let training = false;
  const isHumanTurn = () => MODE === 'hotseat' || game.turn() === HUMAN;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  // unlock + start the ambience on the first user gesture (autoplay policy)
  let audioReady = false;
  const unlockAudio = () => { if (audioReady) return; audioReady = true; try { audio.unlock(worldFile); } catch { /* ignore */ } };
  window.addEventListener('pointerdown', unlockAudio, { once: true, capture: true });
  window.addEventListener('keydown', unlockAudio, { once: true, capture: true });

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
  // rim / back light — carves a glowing edge onto the pieces so they read with depth and "glory"
  const rim = new THREE.DirectionalLight(hexInt(T.accent || '#ffd9a0'), 0.9);
  rim.position.set(-6, 6, -7.5);
  scene.add(rim);
  scene.add(new THREE.AmbientLight(hexInt(T.panel || '#241308'), 0.55));

  // ---------- bloom (real emissive glow) ----------
  // A post-processing chain: render the scene, add an UnrealBloom halo around bright/emissive
  // pixels, then tone-map + colour-manage via OutputPass. Only strongly-emissive pieces (the glow
  // Warrior Styles) cross the threshold, so the board itself stays crisp. Toggle: '#glowBtn'.
  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(Math.min(devicePixelRatio || 1, MOBILE ? 1.5 : 2));
  composer.setSize(innerWidth, innerHeight);
  composer.addPass(new RenderPass(scene, camera));
  const bloomPass = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.62, 0.6, 0.86);
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());
  let glowOn = true;
  try { const g = localStorage.getItem('chaturanga_glow'); if (g === '0') glowOn = false; } catch { /* ignore */ }

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
    new THREE.MeshStandardMaterial({ color: hexInt(T.accent || '#e8a33d'), roughness: 0.78, metalness: 0.08 }),
  );
  frame.position.y = -0.06; frame.receiveShadow = true;   // recessed below the square tops so the gold rim can't creep up
  boardGroup.add(frame);

  // 8x8 squares as two InstancedMeshes (light + dark) with generated stone/wood textures.
  // Full 1.0 cells (no inter-square gaps -> no gold showing through) and thick (0.22) so a
  // grazing view sees the square's own side, not the frame's reflection. Top stays at y=0.04.
  const sqGeo = new THREE.BoxGeometry(1.0, 0.22, 1.0);
  const lightMat = new THREE.MeshStandardMaterial({ color: hexInt(T.light || '#d9b98a'), roughness: 0.62, metalness: 0.02, envMapIntensity: 0.35 });
  const darkMat = new THREE.MeshStandardMaterial({ color: hexInt(T.dark || '#6b4423'), roughness: 0.58, metalness: 0.02, envMapIntensity: 0.35 });
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
    dummy.position.set(p.x, -0.07, p.z); dummy.updateMatrix();  // thick square, top kept at y=0.04
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

  // Contact-shadow decals ground the pieces when realtime shadows are disabled (mobile).
  const shadowGroup = new THREE.Group();
  boardGroup.add(shadowGroup);
  function makeShadowTex() {
    const cv = document.createElement('canvas'); cv.width = cv.height = 128;
    const g = cv.getContext('2d');
    const grd = g.createRadialGradient(64, 64, 3, 64, 64, 60);
    grd.addColorStop(0, 'rgba(0,0,0,0.55)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(cv); return t;
  }
  const CONTACT = !renderer.shadowMap.enabled;
  const shadowMat = CONTACT ? new THREE.MeshBasicMaterial({ map: makeShadowTex(), transparent: true, depthWrite: false }) : null;
  const shadowGeo = new THREE.PlaneGeometry(0.92, 0.92);

  // ---------- carved glTF models (Blender) with a procedural fallback ----------
  // Two armies: MODELS.w (first side) and MODELS.b (second side). A world may ship a distinct
  // opposing army under <assets>/models_dark/ ("modelsDark": true) — e.g. Ramayana pairs Rama's
  // vanaras (white) against Ravana's rakshasas (black). Otherwise both sides share one sculpt set.
  const MODELS = { w: {}, b: {} };
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
  async function loadOne(url, k) {
    const gltf = await loadGLB(url);
    normalize(gltf.scene, TARGET_H[k]);
    const t = new THREE.Group(); t.add(gltf.scene);
    return t;
  }
  async function loadModels() {
    const mBase = world.assets || `assets/${worldFile}`;
    const whiteSrc = (k) => (world.models ? [`${mBase}/models/${k}.glb`, `assets/models/${k}.glb`] : [`assets/models/${k}.glb`]);
    const blackSrc = (k) => (world.modelsDark ? [`${mBase}/models_dark/${k}.glb`] : []);
    await Promise.all(Object.keys(TARGET_H).map(async (k) => {
      for (const url of whiteSrc(k)) { try { MODELS.w[k] = await loadOne(url, k); break; } catch { /* next */ } }
      let dark = false;
      for (const url of blackSrc(k)) { try { MODELS.b[k] = await loadOne(url, k); dark = true; break; } catch { /* next */ } }
      if (!dark) MODELS.b[k] = MODELS.w[k];   // no distinct opposing army -> reuse the sculpt, tinted dark
    }));
  }
  // pieces with a clear front (muzzle / spear) point at +X in their model
  const facingY = (key, color) => {
    const w = color === 'w';
    if (key === 'ashva' || key === 'padati') return w ? Math.PI / 2 : -Math.PI / 2;
    if (key === 'gaja') return w ? 0 : Math.PI;
    return w ? 0 : Math.PI;
  };
  // ---------- piece material styles ----------
  // A world may define its own themed style (world.pieceStyle.{white,black}); the player can also
  // cycle a set of preset materials. Each style multiplies the baked concept texture toward a tint
  // and sets roughness/metalness/emissive so an army can read as ivory, jade, bronze, or radiant.
  const hx = (h, d) => new THREE.Color(hexInt(h || d));
  const DEFAULT_STYLE = {
    white: { tint: '#fff6e2', roughness: 0.40, metalness: 0.06, emissive: '#4a3414', emissiveIntensity: 0.30, envMapIntensity: 1.20, clearcoat: 0.45 },
    black: { tint: '#5c3a20', roughness: 0.44, metalness: 0.10, emissive: '#3a1606', emissiveIntensity: 0.28, envMapIntensity: 1.10, clearcoat: 0.50 },
  };
  // Warrior Styles the player picks from a palette. `emissive` (army-coloured, additive) is the
  // strongest lever — with the bloom pass it makes BOTH armies GLOW, even the near-black one, where
  // a multiplied tint alone can never show. `swatch` = the two chips shown in the style picker.
  const STYLE_PRESETS = [
    { name: 'Themed', themed: true, swatch: [T.whiteArmy || '#efe4c8', T.blackArmy || '#3a2418'] },
    { name: 'Ivory & Ebony', swatch: ['#efe4c8', '#241812'],
      white: { tint: '#efe4c8', roughness: 0.40, metalness: 0.0, emissive: '#000000', emissiveIntensity: 0, envMapIntensity: 1.10, clearcoat: 0.5 },
      black: { tint: '#241812', roughness: 0.34, metalness: 0.05, emissive: '#000000', emissiveIntensity: 0, envMapIntensity: 1.0, clearcoat: 0.6 } },
    { name: 'Divine Radiance', glow: true, swatch: ['#ffd75e', '#b46cff'],
      white: { tint: '#ffe9b0', roughness: 0.34, metalness: 0.25, emissive: '#ffb020', emissiveIntensity: 1.05, envMapIntensity: 1.5, clearcoat: 0.6 },
      black: { tint: '#c9a6ff', roughness: 0.30, metalness: 0.30, emissive: '#8a2bff', emissiveIntensity: 1.20, envMapIntensity: 1.4, clearcoat: 0.7 } },
    { name: 'Blood & Iron', glow: true, swatch: ['#ff5a3c', '#c01818'],
      white: { tint: '#ffcaa8', roughness: 0.36, metalness: 0.45, emissive: '#ff4a1e', emissiveIntensity: 0.95, envMapIntensity: 1.5, clearcoat: 0.4 },
      black: { tint: '#7a2418', roughness: 0.34, metalness: 0.55, emissive: '#e01212', emissiveIntensity: 1.15, envMapIntensity: 1.3, clearcoat: 0.4 } },
    { name: 'Jade Warrior', glow: true, swatch: ['#57e39a', '#11a67e'],
      white: { tint: '#b7f0d0', roughness: 0.20, metalness: 0.20, emissive: '#1fbf6e', emissiveIntensity: 0.95, envMapIntensity: 1.5, clearcoat: 0.85 },
      black: { tint: '#124a3c', roughness: 0.18, metalness: 0.28, emissive: '#0bd08a', emissiveIntensity: 1.10, envMapIntensity: 1.3, clearcoat: 0.9 } },
    { name: 'Ember Forge', glow: true, swatch: ['#ff9a2e', '#ff3b12'],
      white: { tint: '#ffdca6', roughness: 0.42, metalness: 0.15, emissive: '#ff8a1a', emissiveIntensity: 1.15, envMapIntensity: 1.2, clearcoat: 0.3 },
      black: { tint: '#3a1c12', roughness: 0.40, metalness: 0.20, emissive: '#ff2e08', emissiveIntensity: 1.25, envMapIntensity: 1.1, clearcoat: 0.3 } },
    { name: 'Celestial Azure', glow: true, swatch: ['#4aa8ff', '#7b48ff'],
      white: { tint: '#bfe0ff', roughness: 0.26, metalness: 0.40, emissive: '#2f7bff', emissiveIntensity: 1.00, envMapIntensity: 1.6, clearcoat: 0.7 },
      black: { tint: '#4632a0', roughness: 0.24, metalness: 0.45, emissive: '#6a2aff', emissiveIntensity: 1.20, envMapIntensity: 1.4, clearcoat: 0.75 } },
    { name: 'Emerald & Ruby', glow: true, swatch: ['#22d36a', '#ff2a56'],
      white: { tint: '#9ff0bd', roughness: 0.24, metalness: 0.30, emissive: '#12c257', emissiveIntensity: 1.00, envMapIntensity: 1.5, clearcoat: 0.8 },
      black: { tint: '#5a0f22', roughness: 0.22, metalness: 0.35, emissive: '#ff1442', emissiveIntensity: 1.15, envMapIntensity: 1.4, clearcoat: 0.85 } },
    { name: 'Royal Amethyst', glow: true, swatch: ['#e06bff', '#7a2ad6'],
      white: { tint: '#f0c4ff', roughness: 0.28, metalness: 0.30, emissive: '#d23bff', emissiveIntensity: 1.00, envMapIntensity: 1.5, clearcoat: 0.8 },
      black: { tint: '#3a1466', roughness: 0.26, metalness: 0.38, emissive: '#7a1ee0', emissiveIntensity: 1.15, envMapIntensity: 1.3, clearcoat: 0.85 } },
    { name: 'Bronze & Gold', swatch: ['#f4c667', '#8a5a24'],   // metallic finish
      white: { tint: '#f4c667', roughness: 0.26, metalness: 0.95, emissive: '#3a2200', emissiveIntensity: 0.25, envMapIntensity: 1.9, clearcoat: 0.2 },
      black: { tint: '#8a5a24', roughness: 0.32, metalness: 0.98, emissive: '#241400', emissiveIntensity: 0.22, envMapIntensity: 1.7, clearcoat: 0.2 } },
    { name: 'Pearl & Obsidian', swatch: ['#f5efe6', '#16161e'],  // glossy finish
      white: { tint: '#f5efe6', roughness: 0.10, metalness: 0.12, emissive: '#20201a', emissiveIntensity: 0.18, envMapIntensity: 1.8, clearcoat: 1.0 },
      black: { tint: '#16161e', roughness: 0.08, metalness: 0.25, emissive: '#12122a', emissiveIntensity: 0.28, envMapIntensity: 1.7, clearcoat: 1.0 } },
  ];
  let styleIdx = 0;
  try { const s = +localStorage.getItem('chaturanga_style'); if (s >= 0 && s < STYLE_PRESETS.length) styleIdx = s; } catch { /* ignore */ }
  function styleFor(color) {
    const preset = STYLE_PRESETS[styleIdx];
    const side = color === 'w' ? 'white' : 'black';
    if (preset.themed) return (world.pieceStyle && world.pieceStyle[side]) || DEFAULT_STYLE[side];
    return preset[side];
  }
  // Apply a style's finish + glow to one material. `hasMap` keeps the baked concept texture (the
  // tint multiplies it); without a map the tint becomes the base colour. Emissive is set on every
  // material so glow presets are visible on BOTH armies, including the near-black one.
  function applyStyle(m, st, hasMap, color) {
    m.color = hasMap ? hx(st.tint, '#ffffff') : hx(st.tint, color === 'w' ? '#efe4c8' : '#241812');
    m.roughness = st.roughness ?? 0.4;
    m.metalness = st.metalness ?? 0.05;
    m.emissive = hx(st.emissive, '#000000');
    m.emissiveIntensity = st.emissiveIntensity || 0;
    m.envMapIntensity = st.envMapIntensity ?? 1.0;
    if ('clearcoat' in m) m.clearcoat = st.clearcoat ?? 0.4;
    m.needsUpdate = true;
    return m;
  }
  function pieceFor(key, color) {
    const t = MODELS[color === 'w' ? 'w' : 'b'][key] || MODELS.w[key];
    const st = styleFor(color);
    if (!t) {
      const base = applyStyle((color === 'w' ? whiteMat : blackMat).clone(), st, false, color);
      return makePiece(key, base);
    }
    const g = t.clone(true);
    g.traverse((n) => {
      if (!n.isMesh) return;
      n.castShadow = true;
      const hasMap = !!(n.material && n.material.map);
      const m = (n.material && n.material.isMaterial) ? n.material.clone() : new THREE.MeshPhysicalMaterial();
      applyStyle(m, st, hasMap, color);
      n.material = m;
    });
    g.userData.key = key;
    return g;
  }

  function syncPieces() {
    piecesGroup.clear();
    shadowGroup.clear();
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
      if (shadowMat) { const s = new THREE.Mesh(shadowGeo, shadowMat); s.rotation.x = -Math.PI / 2; s.position.set(p.x, 0.044, p.z); shadowGroup.add(s); }
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
  // red ring on the checked king (ux-05)
  const checkRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.45, 0.055, 12, 36),
    new THREE.MeshBasicMaterial({ color: 0xff4444, transparent: true, opacity: 0.9 }),
  );
  checkRing.rotation.x = Math.PI / 2; checkRing.visible = false; checkRing.position.y = 0.065;
  boardGroup.add(checkRing);
  function updateCheck() {
    if (!game.inCheck()) { checkRing.visible = false; return; }
    const b = game.board(), turn = game.turn();
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      const cell = b[r][c];
      if (cell && cell.type === 'k' && cell.color === turn) { const p = cellFromName(cell.square); checkRing.position.set(p.x, 0.065, p.z); checkRing.visible = true; }
    }
  }

  let selected = null; // {square, moves:[verbose]}
  function clearMarkers() { markers.clear(); selRing.visible = false; selected = null; $('#inspector')?.classList.remove('show'); }
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
    let mv;
    try { mv = game.move({ from, to, promotion: opt.promotion || 'q' }); }
    catch { mv = null; }   // chess.js THROWS on an illegal move — never let it halt the game
    if (!mv) { busy = false; return; }
    audio.sfx(mv.flags.includes('k') || mv.flags.includes('q') ? 'castle' : mv.captured ? 'capture' : mv.flags.includes('p') ? 'promote' : 'move');
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
    updateCheck(); updateCaptured(); updateUndo();
    if (game.inCheck() && !game.isCheckmate()) setTimeout(() => audio.sfx('check'), 260);
    if (MODE === 'hotseat' && autoFlip) { flip = game.turn() === 'b'; applyPreset(PRESETS[presetIdx]); }
    const state = { check: game.inCheck(), checkmate: game.isCheckmate() };
    reveal(moveMoment(world, mv, state));
    updateStatus();
    showOpening();
    busy = false;
    if (game.isGameOver()) { showGameOver(); return; }
    // coach: review a HUMAN move (only in AI mode)
    if (vsAI && !opt.ai) reviewHuman(fenBefore, mv);
    // AI reply
    if (vsAI && !training && game.turn() !== HUMAN) aiMove();
  }

  // Openings trainer: walk a booked line move-by-move with its teaching, then hand over.
  let autoFlip = false, trainerPaused = false, trainerExit = false;
  async function pausableWait(ms) {
    const end = performance.now() + ms;
    while (performance.now() < end || trainerPaused) { if (trainerExit) throw 'exit'; await wait(120); }
  }
  async function runTrainer(id) {
    const opening = openingById(id);
    if (!opening) return;
    training = true; trainerPaused = false; trainerExit = false;
    $('#trainer')?.classList.add('show');
    const badge = $('#opening'); if (badge) { badge.textContent = `${opening.name} — ${opening.sub}`; badge.classList.add('show'); }
    try {
      await pausableWait(700);
      let ply = 0, step;
      while ((step = openingStep(id, ply))) {
        const mv = game.moves({ verbose: true }).find((m) => m.san === step.san);
        if (!mv) break;
        const st = $('#trStep'); if (st) st.textContent = `${opening.name} · ${ply + 1}/${step.total}`;
        showCoach({ tone: 'nudge', title: `${opening.name} · ${ply + 1}/${step.total}`, message: step.note });
        speak(step.note);
        await pausableWait(1800);
        await doMove(mv.from, mv.to, { ai: true });
        await pausableWait(1500);
        ply++;
      }
      showCoach({ tone: 'nudge', title: 'Your move', message: `That is the ${opening.name}. ${opening.idea} Now play on and apply it.` });
      speak(`That is the ${opening.name}. Now play on.`);
    } catch { showCoach({ tone: 'nudge', title: 'Trainer ended', message: 'Play on from here — apply what you learned.' }); }
    training = false;
    $('#trainer')?.classList.remove('show');
    if (vsAI && !game.isGameOver() && game.turn() !== HUMAN) aiMove();
  }

  async function aiMove() {
    if (aiThinking) return;
    aiThinking = true; busy = true;
    setThinking(true);
    try {
      const r = await think('best', { fen: game.fen(), level: LEVEL.id });
      const legal = game.moves({ verbose: true });
      let mv = r && r.move;
      // defensive: if the engine ever returns nothing or an illegal move, play a random legal one
      // so auto-play never silently stalls (root cause of the "stops after a few moves" bug).
      if (legal.length && (!mv || !legal.some((m) => m.from === mv.from && m.to === mv.to))) {
        mv = legal[Math.floor(Math.random() * legal.length)];
      }
      if (mv) { busy = false; await doMove(mv.from, mv.to, { ai: true, promotion: mv.promotion }); }
    } catch { /* ignore; leave it human's move */ }
    finally { aiThinking = false; busy = false; setThinking(false); }
  }

  async function reviewHuman(fenBefore, mv) {
    try {
      const r = await think('review', { fen: fenBefore, move: { from: mv.from, to: mv.to, promotion: mv.promotion } });
      if (r && r.tone === 'warn') showCoach(r);
    } catch { /* ignore */ }
  }

  // captured-pieces tray (ux-04): derive from move history
  function updateCaptured() {
    const capB = [], capW = []; // capB: white-army pieces lost; capW: black-army pieces lost
    for (const m of game.history({ verbose: true })) {
      if (!m.captured) continue;
      const glyph = (world.pieces[TYPE_TO_KEY[m.captured]] || {}).glyph || '•';
      (m.color === 'w' ? capW : capB).push(glyph);
    }
    const w = $('#capW'), b = $('#capB');
    if (w) w.innerHTML = capW.map((g) => `<span style="color:${T.muted || '#b79b74'}">${g}</span>`).join('');
    if (b) b.innerHTML = capB.map((g) => `<span style="color:${T.whiteArmy || '#efe4c8'}">${g}</span>`).join('');
  }
  function updateUndo() { const u = $('#undoBtn'); if (u) u.disabled = game.history().length === 0 || training; }
  function undo() {
    if (busy || aiThinking || training || !game.history().length) return;
    game.undo();
    if (vsAI && game.turn() !== HUMAN && game.history().length) game.undo(); // also pop the AI reply
    syncPieces(); clearMarkers(); updateCheck(); updateCaptured(); updateUndo();
    if (MODE === 'hotseat' && autoFlip) { flip = game.turn() === 'b'; applyPreset(PRESETS[presetIdx]); }
    updateStatus(); showOpening();
    $('#card')?.classList.remove('show'); $('#coach')?.classList.remove('show'); $('#over')?.classList.remove('show');
  }

  // promotion picker (ux-06)
  function askPromotion(from, to) {
    const modal = $('#promo'), row = $('#promoRow'); if (!modal || !row) { doMove(from, to, { promotion: 'q' }); return; }
    const opts = [['q', 'mantri'], ['r', 'ratha'], ['b', 'gaja'], ['n', 'ashva']];
    row.innerHTML = opts.map(([p, k]) => `<button data-p="${p}">${(world.pieces[k] || {}).glyph || ''}<small>${(world.pieces[k] || {}).name || k}</small></button>`).join('');
    modal.classList.add('show');
    row.querySelectorAll('button').forEach((btn) => btn.onclick = () => { modal.classList.remove('show'); doMove(from, to, { promotion: btn.dataset.p }); });
  }

  // game-over modal (ux-16)
  function showGameOver() {
    const over = $('#over'); if (!over) return;
    let kind = 'Draw', title = 'A draw', line = 'A hard-fought balance — neither Raja falls today.';
    if (game.isCheckmate()) {
      const winColor = game.turn() === 'w' ? 'b' : 'w';   // the side that delivered mate
      const winner = sideName(winColor);
      const darkWin = winColor === 'b';
      kind = 'Victory';
      title = `${(darkWin ? world.checkmateTitleDark : null) || world.checkmateTitle || 'Victory'} — ${winner} win`;
      line = (darkWin ? world.checkmateLineDark : null) || world.checkmateLine || '';
    } else if (game.isStalemate()) { kind = 'Stalemate'; title = 'Stalemate'; line = 'No legal move remains, yet the Raja stands — the game is drawn.'; }
    else if (game.isDraw()) { kind = 'Draw'; title = 'A draw'; line = 'The field is balanced — a draw by repetition or insufficient force.'; }
    $('#overKind').textContent = kind;
    $('#overTitle').textContent = title;
    $('#overLine').textContent = line;
    over.classList.add('show');
    audio.sfx('win');
    if (line) speak(line);
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
    if (busy || aiThinking || training || !cell || game.isGameOver()) return;
    if (vsAI && !isHumanTurn()) return;               // wait your turn against the AI
    const piece = game.get(cell.square);
    if (selected) {
      const legal = selected.moves.find((m) => m.to === cell.square);
      if (legal) {
        const from = selected.square, to = cell.square;
        if (legal.promotion) { askPromotion(from, to); }   // let the player choose (ux-06)
        else doMove(from, to);
        return;
      }
      if (piece && piece.color === game.turn()) { clearMarkers(); select(cell.square); return; }
      clearMarkers(); return;
    }
    if (piece && piece.color === game.turn()) select(cell.square);
  }
  function select(square) {
    const piece = game.get(square);
    if (!showMoves(square)) { clearMarkers(); }
    audio.sfx('select');
    reveal(selectMoment(world, piece.type, piece.color), true);   // per-side identity
    inspectPiece(piece.type, piece.color);            // rotating render + movement pattern
    if (eyeMode) setEye(square, piece.color, piece.type);
  }

  // ---------- teaching card + narration ----------
  let cardTimer = null;
  function reveal(m, quiet) {
    if (!m) return;
    $('#coach')?.classList.remove('show');   // don't stack the coach + teaching card (ux-01)
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
  // Pre-generated DragonHD Indian-English narration (Azure). Falls back to the browser voice.
  let voiceManifest = {};
  let narration = null;
  fetch(`${ASSET_BASE}/voice/voice.json`).then((r) => (r.ok ? r.json() : {})).then((m) => { voiceManifest = m || {}; }).catch(() => {});
  function speak(text) {
    if (muted || !text) return;
    const file = voiceManifest[text];
    if (file) {
      try {
        speechSynthesis?.cancel?.();
        if (narration) { narration.pause(); narration = null; }
        narration = new Audio(`${ASSET_BASE}/voice/${file}`);
        narration.play().then(() => {}).catch(() => speakBrowser(text));
        return;
      } catch { /* fall through to the browser voice */ }
    }
    speakBrowser(text);
  }
  function speakBrowser(text) {
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
    $('#card')?.classList.remove('show');   // don't stack the teaching card + coach (ux-01)
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
    const portrait = camera.aspect < 0.85;
    const need = (BOARD_R / Math.sin(Math.min(vHalf, hHalf))) * (portrait ? 0.9 : 1); // fill more on phones (ux-09)
    return Math.max(base * (portrait ? 0.82 : 1), need);
  };
  // steeper, fuller view on tall/portrait phones so the board isn't a shallow band
  const presetPhi = (p) => (camera.aspect < 0.85 && p.name === 'Sitting' ? 0.48 : p.phi);
  function applyPreset(p, instant) {
    cam.baseRadius = p.radius;
    cam.t.y = camera.aspect < 0.85 ? 0.5 : 0;          // lift the board up on portrait (ux-09)
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
  addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight); bloomPass.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); if (!camTween) cam.radius = fitRadius(cam.baseRadius); });

  // ---------- piece inspector: a small rotating render + movement diagram ----------
  let insp = null;
  function initInspector() {
    const canvas = document.getElementById('inspCanvas');
    if (!canvas) return null;
    const r = new THREE.WebGLRenderer({ canvas, antialias: !MOBILE, alpha: true });
    r.setPixelRatio(Math.min(devicePixelRatio || 1, MOBILE ? 1.25 : 2));
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
    const info = sidePieces(world, color)[key] || {};   // per-side name/glyph
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
  sel.addEventListener('change', () => {
    if (game.history().length && !confirm('Leave this game and switch world?')) { sel.value = worldFile; return; }  // ux-08
    location.search = `?world=${sel.value}&mode=${MODE}&side=${HUMAN}&level=${LEVEL.id}`;
  });
  function resetGame() {
    game.reset(); syncPieces(); clearMarkers(); updateCheck(); updateCaptured(); updateUndo();
    ['#card', '#coach', '#opening', '#inspector', '#over'].forEach((s) => $(s)?.classList.remove('show'));
    eyeTarget = null; if (MODE === 'hotseat' && autoFlip) { flip = false; } applyPreset(PRESETS[presetIdx]); updateStatus();
    if (vsAI && game.turn() !== HUMAN) aiMove();
  }
  $('#newBtn').addEventListener('click', resetGame);
  $('#overNew')?.addEventListener('click', () => { $('#over')?.classList.remove('show'); resetGame(); });
  $('#undoBtn')?.addEventListener('click', undo);
  $('#viewBtn').addEventListener('click', () => { eyeMode = false; $('#eyeBtn')?.classList.remove('on'); presetIdx = (presetIdx + 1) % PRESETS.length; $('#viewName').textContent = PRESETS[presetIdx].name; applyPreset(PRESETS[presetIdx]); });
  $('#flipBtn').addEventListener('click', () => { flip = !flip; applyPreset(PRESETS[presetIdx]); });
  // ---------- Warrior-style picker ----------
  function applyStyleIdx(i) {
    styleIdx = ((i % STYLE_PRESETS.length) + STYLE_PRESETS.length) % STYLE_PRESETS.length;
    try { localStorage.setItem('chaturanga_style', styleIdx); } catch { /* ignore */ }
    $('#styleName').textContent = STYLE_PRESETS[styleIdx].name;
    syncPieces();
    if (selected) { const p = game.get(selected.square); if (p) inspectPiece(p.type, p.color); }
    buildStyleGrid();
  }
  function buildStyleGrid() {
    const grid = $('#spGrid'); if (!grid) return;
    grid.innerHTML = STYLE_PRESETS.map((s, i) => {
      const sw = s.swatch || [T.whiteArmy || '#efe4c8', T.blackArmy || '#3a2418'];
      const g = s.glow ? '<span class="sp-glow">✨</span>' : '';
      return `<button class="sp-item ${i === styleIdx ? 'active' : ''}" data-i="${i}" aria-label="${s.name}">`
        + `<span class="sp-swatch" style="background:linear-gradient(135deg,${sw[0]} 0 50%,${sw[1]} 50% 100%)"></span>`
        + `<span class="sp-name">${s.name}</span>${g}</button>`;
    }).join('');
    grid.querySelectorAll('.sp-item').forEach((b) => b.addEventListener('click', () => { audio.sfx('ui'); applyStyleIdx(+b.dataset.i); }));
  }
  const stylePanel = $('#stylePanel');
  function openStylePanel() { buildStyleGrid(); stylePanel?.classList.add('show'); $('#more')?.classList.remove('show'); }
  function closeStylePanel() { stylePanel?.classList.remove('show'); }
  $('#styleBtn')?.addEventListener('click', openStylePanel);
  $('#spClose')?.addEventListener('click', closeStylePanel);
  stylePanel?.addEventListener('click', (e) => { if (e.target === stylePanel) closeStylePanel(); });
  // glow (bloom) toggle
  function reflectGlow() { const b = $('#glowBtn'); if (b) { b.classList.toggle('on', glowOn); b.innerHTML = glowOn ? '✨ Glow' : '✨̶ Glow off'; } }
  $('#glowBtn')?.addEventListener('click', () => { glowOn = !glowOn; try { localStorage.setItem('chaturanga_glow', glowOn ? '1' : '0'); } catch { /* ignore */ } reflectGlow(); });
  reflectGlow();
  $('#autoflipBtn')?.addEventListener('click', () => {
    autoFlip = !autoFlip; $('#autoflipBtn').classList.toggle('on', autoFlip);
    if (autoFlip && MODE === 'hotseat') { flip = game.turn() === 'b'; applyPreset(PRESETS[presetIdx]); }
  });
  $('#muteBtn').addEventListener('click', () => { muted = !muted; if (muted) { speechSynthesis?.cancel?.(); if (narration) { narration.pause(); narration = null; } } $('#muteBtn').innerHTML = muted ? '🔇 Voice' : '🔊 Voice'; $('#muteBtn').classList.toggle('on', !muted); });
  // music + sound-effects toggles (sound design)
  $('#musicBtn')?.addEventListener('click', () => { const on = !audio.isMusicOn(); audio.setMusic(on); $('#musicBtn').innerHTML = on ? '🎵 Music' : '🎵̶ Music off'; $('#musicBtn').classList.toggle('on', on); });
  $('#soundBtn')?.addEventListener('click', () => { const on = !audio.isSfxOn(); audio.setSfx(on); $('#soundBtn').innerHTML = on ? '🔔 Sounds' : '🔕 Sounds'; $('#soundBtn').classList.toggle('on', on); });
  // subtle click on any HUD/menu button
  document.querySelectorAll('#hud button, #more button').forEach((b) => b.addEventListener('click', () => audio.sfx('ui')));
  $('#hintBtn')?.addEventListener('click', async () => {
    if (busy || aiThinking || training || game.isGameOver() || (vsAI && !isHumanTurn())) return;
    const h = await think('hint', { fen: game.fen(), level: LEVEL.id });
    if (h) { hintArrow(h.from, h.to); showCoach({ tone: 'nudge', title: 'Hint', message: `${h.san} — ${h.why}` }); }
  });
  $('#eyeBtn')?.addEventListener('click', () => {
    eyeMode = !eyeMode; $('#eyeBtn').classList.toggle('on', eyeMode);
    if (eyeMode && selected) { const p = game.get(selected.square); if (p) setEye(selected.square, p.color, p.type); }
    else if (eyeMode) { showCoach({ tone: 'nudge', title: "Warrior's Eye", message: 'Tap one of your pieces to look through its eyes.' }); }
    else { eyeTarget = null; applyPreset(PRESETS[presetIdx]); }
  });
  // overflow menu (ux-10)
  const moreBtn = $('#moreBtn'), moreMenu = $('#more');
  moreBtn?.addEventListener('click', (e) => { e.stopPropagation(); const on = moreMenu.classList.toggle('show'); moreBtn.setAttribute('aria-expanded', on); });
  document.addEventListener('click', (e) => { if (moreMenu?.classList.contains('show') && !moreMenu.contains(e.target) && e.target !== moreBtn) { moreMenu.classList.remove('show'); moreBtn.setAttribute('aria-expanded', 'false'); } });
  // inspector close (ux-02)
  $('#inspClose')?.addEventListener('click', () => $('#inspector')?.classList.remove('show'));
  // trainer controls (ux-11)
  $('#trPause')?.addEventListener('click', () => { trainerPaused = !trainerPaused; $('#trPause').textContent = trainerPaused ? '▶ Resume' : '⏸ Pause'; });
  $('#trExit')?.addEventListener('click', () => { trainerExit = true; trainerPaused = false; });
  document.querySelectorAll('nav a').forEach((a) => { a.href = `${a.getAttribute('href').split('?')[0]}?world=${worldFile}`; });
  // reflect persisted audio prefs
  $('#musicBtn')?.classList.toggle('on', audio.isMusicOn()); if (!audio.isMusicOn() && $('#musicBtn')) $('#musicBtn').innerHTML = '🎵̶ Music off';
  $('#soundBtn')?.classList.toggle('on', audio.isSfxOn()); if (!audio.isSfxOn() && $('#soundBtn')) $('#soundBtn').innerHTML = '🔕 Sounds';
  $('#muteBtn')?.classList.toggle('on', !muted);
  if ($('#styleName')) $('#styleName').textContent = STYLE_PRESETS[styleIdx].name;

  updateStatus(); updateUndo(); updateCaptured();
  if (TRAIN) runTrainer(TRAIN);
  else if (vsAI && game.turn() !== HUMAN) aiMove();     // AI opens when the human plays black
  function loop() {
    updateCamera();
    const t = performance.now() * 0.001;
    selRing.material.opacity = 0.55 + Math.sin(t * 4) * 0.25;
    selRing.rotation.z = t * 0.6;
    if (checkRing.visible) { checkRing.material.opacity = 0.6 + Math.sin(t * 6) * 0.35; checkRing.rotation.z = -t * 0.8; }
    if (glowOn) composer.render(); else renderer.render(scene, camera);
    if (insp && $('#inspector')?.classList.contains('show')) { insp.holder.rotation.y = t * 0.9; insp.r.render(insp.sc, insp.cm); }
  }
  renderer.setAnimationLoop(loop);
  // pause rendering when the app is backgrounded (saves battery on mobile)
  document.addEventListener('visibilitychange', () => renderer.setAnimationLoop(document.hidden ? null : loop));

  window.__cReady = true;
  window.__c = {
    fen: () => game.fen(),
    turn: () => game.turn(),
    legalMoves: () => game.moves({ verbose: true }),
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
    undo: () => undo(),
    canUndo: () => !$('#undoBtn')?.disabled,
    captured: () => ({ w: $('#capW')?.textContent || '', b: $('#capB')?.textContent || '' }),
    inCheck: () => game.inCheck(),
    checkShown: () => checkRing.visible,
    gameOver: () => ({ shown: !!$('#over')?.classList.contains('show'), title: $('#overTitle')?.textContent || '' }),
    moves: () => game.history().length,
    load: (fen) => { try { game.load(fen); syncPieces(); updateCheck(); updateCaptured(); updateUndo(); clearMarkers(); updateStatus(); return true; } catch { return false; } },
  };
}

main();
