// Live hero showcase — rotates the real carved GLB pieces with a glowing warrior-style material
// + bloom, cycling through the six heroes. Self-contained; needs the import map ("three").
import * as THREE from '../vendor/three.module.js';
import { GLTFLoader } from '../vendor/GLTFLoader.js';
import { EffectComposer } from '../vendor/EffectComposer.js';
import { RenderPass } from '../vendor/RenderPass.js';
import { UnrealBloomPass } from '../vendor/UnrealBloomPass.js';
import { OutputPass } from '../vendor/OutputPass.js';

const HEROES = [
  { key: 'raja',   name: 'Rājā',   role: 'The King',         line: 'Where the king stands, the whole host finds its purpose.', col: { base: '#f6c343', emis: '#c98a10', rim: '#fff0b0', metal: 0.55 } },
  { key: 'mantri', name: 'Mantrī', role: 'The Minister',     line: 'Wisest of the four-army host — its counsel ranges the whole field.', col: { base: '#c94dff', emis: '#9a1ed0', rim: '#f0c4ff', metal: 0.45 } },
  { key: 'ratha',  name: 'Ratha',  role: 'The Chariot',      line: 'Straight and relentless, thundering down every open line.', col: { base: '#3f9bff', emis: '#1a5fe0', rim: '#bfe0ff', metal: 0.50 } },
  { key: 'gaja',   name: 'Gaja',   role: 'The War-Elephant', line: 'Crossing the field on the diagonal, an unstoppable tusker.', col: { base: '#37c07e', emis: '#0f7a4a', rim: '#a6f5cf', metal: 0.40 } },
  { key: 'ashva',  name: 'Ashva',  role: 'The Cavalry',      line: 'The bold leap no other warrior on the field dares to make.', col: { base: '#ff9a30', emis: '#e0600e', rim: '#ffd070', metal: 0.35 } },
  { key: 'padati', name: 'Padati', role: 'The Foot-Soldier', line: 'One honest step at a time — yet it may grow into anything.', col: { base: '#1fce67', emis: '#0e9a4c', rim: '#9ff0bd', metal: 0.30 } },
];
const MODEL_BASE = 'assets/models';
const ENV_URL = 'assets/kurukshetra/env.jpg';
const TARGET_H = 2.1;

export function initShowcase(canvas) {
  const hx = (h) => new THREE.Color(h);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  camera.position.set(0, 1.25, 4.7);
  camera.lookAt(0, 1.0, 0);

  // image-based lighting for real reflections
  const pmrem = new THREE.PMREMGenerator(renderer); pmrem.compileEquirectangularShader();
  new THREE.TextureLoader().load(ENV_URL, (tex) => {
    tex.mapping = THREE.EquirectangularReflectionMapping;
    scene.environment = pmrem.fromEquirectangular(tex).texture; tex.dispose();
  }, undefined, () => {});
  scene.add(new THREE.HemisphereLight(0xffe0b0, 0x1a1008, 0.7));
  const key = new THREE.DirectionalLight(0xfff2e0, 1.4); key.position.set(4, 8, 6); scene.add(key);
  const rim = new THREE.DirectionalLight(0xffd9a0, 1.0); rim.position.set(-5, 4, -6); scene.add(rim);
  scene.add(new THREE.AmbientLight(0x2a1808, 0.5));

  // soft radial halo behind the piece (recoloured per hero), gives a glowing stage
  const halo = makeHalo();
  scene.add(halo.sprite);
  // subtle reflective plinth disc
  const disc = new THREE.Mesh(
    new THREE.CylinderGeometry(0.95, 1.05, 0.12, 48),
    new THREE.MeshStandardMaterial({ color: 0x1a1206, roughness: 0.35, metalness: 0.6, envMapIntensity: 1.2 }),
  );
  disc.position.y = -0.06; scene.add(disc);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.98, 0.03, 16, 64),
    new THREE.MeshBasicMaterial({ color: 0xffcf7a }),
  );
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.02; scene.add(ring);

  const stage = new THREE.Group(); scene.add(stage);

  // bloom pipeline
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.55, 0.6, 0.85);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const loader = new GLTFLoader();
  const models = {}; // key -> normalized THREE.Object3D (base geometry, no material yet)
  let current = null, idx = 0, spin = 0, dragging = false, lastX = 0, autoT = 0, paused = false, ready = false;

  function normalize(root) {
    const box = new THREE.Box3().setFromObject(root);
    const size = new THREE.Vector3(); box.getSize(size);
    const s = TARGET_H / (size.y || 1);
    root.scale.setScalar(s);
    const box2 = new THREE.Box3().setFromObject(root);
    const c = new THREE.Vector3(); box2.getCenter(c);
    root.position.x -= c.x; root.position.z -= c.z;
    root.position.y -= box2.min.y; // base at y=0
    return root;
  }

  function fresnel(m, rimColor, strength, power) {
    const col = hx(rimColor);
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uRimColor = { value: col };
      shader.uniforms.uRimStrength = { value: strength };
      shader.uniforms.uRimPower = { value: power };
      shader.fragmentShader = 'uniform vec3 uRimColor;\nuniform float uRimStrength;\nuniform float uRimPower;\n'
        + shader.fragmentShader.replace('#include <emissivemap_fragment>',
          '#include <emissivemap_fragment>\nfloat _rf = pow(1.0 - saturate(dot(normalize(normal), normalize(vViewPosition))), uRimPower);\ntotalEmissiveRadiance += uRimColor * _rf * uRimStrength;');
    };
    m.customProgramCacheKey = () => 'showrim';
  }

  function heroMesh(hero) {
    const base = models[hero.key]; if (!base) return null;
    const g = base.clone(true);
    const c = hero.col;
    g.traverse((n) => {
      if (!n.isMesh) return;
      const m = new THREE.MeshPhysicalMaterial({
        color: hx(c.base), roughness: 0.3, metalness: c.metal, clearcoat: 0.7, clearcoatRoughness: 0.25,
        emissive: hx(c.emis), emissiveIntensity: 0.28, envMapIntensity: 1.5, sheen: 0.3, sheenColor: hx(c.rim),
      });
      fresnel(m, c.rim, 2.1, 2.8);
      n.material = m;
    });
    return g;
  }

  function show(i, instant) {
    idx = ((i % HEROES.length) + HEROES.length) % HEROES.length;
    const hero = HEROES[idx];
    const mesh = heroMesh(hero); if (!mesh) return;
    if (current) stage.remove(current);
    current = mesh; spin = 0; stage.add(mesh);
    halo.setColor(hero.col.rim);
    ring.material.color.set(hero.col.rim);
    // caption
    setText('hcName', hero.name); setText('hcRole', hero.role); setText('hcLine', hero.line);
    document.querySelectorAll('#hcDots [data-i]').forEach((d) => d.classList.toggle('on', +d.dataset.i === idx));
    if (!instant) { mesh.scale.multiplyScalar(0.6); mesh.userData.grow = 1; } // grow-in
    autoT = 0;
  }
  const setText = (id, t) => { const el = document.getElementById(id); if (el) { el.style.opacity = 0; setTimeout(() => { el.textContent = t; el.style.opacity = 1; }, 140); } };

  // build the piece selector dots
  const dots = document.getElementById('hcDots');
  if (dots) HEROES.forEach((h, i) => {
    const b = document.createElement('button'); b.dataset.i = i; b.className = 'hcdot';
    b.setAttribute('aria-label', `${h.name} — ${h.role}`);
    b.innerHTML = `<span style="background:${h.col.base}"></span>${h.name}`;
    b.addEventListener('click', () => { show(i); paused = true; setTimeout(() => { paused = false; }, 6000); });
    dots.appendChild(b);
  });

  // drag / hover to control
  canvas.addEventListener('pointerdown', (e) => { dragging = true; lastX = e.clientX; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => { if (dragging && current) current.rotation.y += (e.clientX - lastX) * 0.01, lastX = e.clientX; });
  const endDrag = () => { dragging = false; };
  canvas.addEventListener('pointerup', endDrag); canvas.addEventListener('pointerleave', endDrag);
  canvas.addEventListener('pointerenter', () => { paused = true; });
  canvas.addEventListener('pointerleave', () => { paused = false; });

  function resize() {
    const r = canvas.getBoundingClientRect();
    const w = Math.max(2, r.width), h = Math.max(2, r.height);
    renderer.setSize(w, h, false); composer.setSize(w, h); bloom.setSize(w, h);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);

  let last = performance.now();
  function loop() {
    const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (current) {
      if (!dragging) current.rotation.y += dt * 0.55;
      if (current.userData.grow != null) { const s = current.scale.x; if (s < 1) current.scale.setScalar(Math.min(1, s + dt * 1.6)); }
    }
    halo.sprite.material.rotation += dt * 0.1;
    ring.material.opacity = 1; ring.rotation.z += dt * 0.2;
    if (ready && !paused) { autoT += dt; if (autoT > 4.8) show(idx + 1); }
    composer.render();
  }

  // progressive load: show raja as soon as it's ready, then the rest
  let visible = true;
  const io = new IntersectionObserver((es) => { visible = es[0].isIntersecting; renderer.setAnimationLoop(visible ? loop : null); }, { threshold: 0.05 });
  io.observe(canvas);
  document.addEventListener('visibilitychange', () => { if (document.hidden) renderer.setAnimationLoop(null); else if (visible) renderer.setAnimationLoop(loop); });

  resize();
  loadOne(0).then(() => { show(0, true); ready = true; renderer.setAnimationLoop(loop); });
  // load the rest in the background
  (async () => { for (let i = 1; i < HEROES.length; i++) await loadOne(i); })();

  function loadOne(i) {
    const k = HEROES[i].key;
    if (models[k]) return Promise.resolve();
    return new Promise((res) => {
      loader.load(`${MODEL_BASE}/${k}.glb`, (gltf) => { models[k] = normalize(gltf.scene); res(); }, undefined, () => res());
    });
  }

  function makeHalo() {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d');
    const draw = (hexColor) => {
      g.clearRect(0, 0, 256, 256);
      const grad = g.createRadialGradient(128, 128, 10, 128, 128, 128);
      grad.addColorStop(0, hexColor); grad.addColorStop(0.4, hexColor + '88'); grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad; g.beginPath(); g.arc(128, 128, 128, 0, Math.PI * 2); g.fill();
    };
    draw('#ffcf7a');
    const tex = new THREE.CanvasTexture(c);
    const mat = new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, transparent: true, opacity: 0.55, depthWrite: false });
    const sprite = new THREE.Sprite(mat); sprite.scale.set(5.2, 5.2, 1); sprite.position.set(0, 1.15, -0.6);
    return { sprite, setColor: (hexColor) => { draw(hexColor); tex.needsUpdate = true; } };
  }
}

const cv = document.getElementById('heroCanvas');
if (cv) { try { initShowcase(cv); } catch (e) { const w = document.getElementById('heroShowcase'); if (w) w.classList.add('nofx'); console.warn('showcase disabled', e); } }
