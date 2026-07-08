// Procedural 3D Chaturanga pieces (Three.js). Each piece is a rotational
// "turned" form (LatheGeometry) built from a silhouette profile, except the
// Ashva (horse) which is sculpted. One material per army colour is passed in.
//
// Board square = 1 unit. Pieces sit on the square centre, base at y = 0.
import * as THREE from '../vendor/three.module.js';

function lathe(profile, mat, seg = 28) {
  const pts = profile.map(([x, y]) => new THREE.Vector2(x, y));
  const g = new THREE.LatheGeometry(pts, seg);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat);
  m.castShadow = true;
  return m;
}

function felt(mat) {
  // a slightly wider soft base disk
  return lathe([[0, 0], [0.34, 0], [0.34, 0.03], [0.30, 0.045], [0, 0.045]], mat);
}

// silhouette profiles (radius, height) from base upward
const PROFILE = {
  padati: [
    [0.30, 0.00], [0.30, 0.05], [0.20, 0.09], [0.16, 0.13], [0.19, 0.17],
    [0.11, 0.24], [0.085, 0.33], [0.13, 0.38], [0.115, 0.42], [0.02, 0.43],
  ],
  ratha: [
    [0.30, 0.00], [0.30, 0.05], [0.21, 0.09], [0.18, 0.15], [0.185, 0.44],
    [0.24, 0.50], [0.24, 0.56], [0.02, 0.56],
  ],
  gaja: [
    [0.30, 0.00], [0.30, 0.05], [0.20, 0.09], [0.16, 0.14], [0.17, 0.26],
    [0.135, 0.40], [0.10, 0.50], [0.155, 0.55], [0.10, 0.60], [0.11, 0.66],
    [0.05, 0.72], [0.02, 0.74],
  ],
  mantri: [
    [0.32, 0.00], [0.32, 0.05], [0.22, 0.10], [0.17, 0.16], [0.15, 0.40],
    [0.12, 0.58], [0.16, 0.66], [0.21, 0.72], [0.19, 0.78], [0.10, 0.80], [0.02, 0.81],
  ],
  raja: [
    [0.33, 0.00], [0.33, 0.05], [0.23, 0.10], [0.18, 0.16], [0.16, 0.42],
    [0.13, 0.62], [0.17, 0.70], [0.22, 0.77], [0.20, 0.84], [0.12, 0.87], [0.09, 0.92], [0.02, 0.93],
  ],
};

function turned(key, mat) {
  const g = new THREE.Group();
  g.add(felt(mat));
  g.add(lathe(PROFILE[key], mat));
  return g;
}

// Ratha (chariot/rook): tower body + crenellations
function makeRatha(mat) {
  const g = turned('ratha', mat);
  const merlon = new THREE.BoxGeometry(0.11, 0.09, 0.11);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const b = new THREE.Mesh(merlon, mat);
    b.position.set(Math.cos(a) * 0.17, 0.585, Math.sin(a) * 0.17);
    b.castShadow = true;
    g.add(b);
  }
  return g;
}

// Gaja (elephant/bishop): mitre body + a slit and a top bead
function makeGaja(mat) {
  const g = turned('gaja', mat);
  const bead = new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 12), mat);
  bead.position.y = 0.76; bead.castShadow = true;
  g.add(bead);
  return g;
}

// Mantri (minister/queen): body + coronet of beads
function makeMantri(mat) {
  const g = turned('mantri', mat);
  const beadGeo = new THREE.SphereGeometry(0.038, 14, 10);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const b = new THREE.Mesh(beadGeo, mat);
    b.position.set(Math.cos(a) * 0.15, 0.80, Math.sin(a) * 0.15);
    b.castShadow = true;
    g.add(b);
  }
  const top = new THREE.Mesh(new THREE.SphereGeometry(0.055, 16, 12), mat);
  top.position.y = 0.85; top.castShadow = true; g.add(top);
  return g;
}

// Raja (king): body + a chhatra (parasol dome + finial), an Indian royal umbrella
function makeRaja(mat) {
  const g = turned('raja', mat);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.10, 10), mat);
  pole.position.y = 0.98; pole.castShadow = true; g.add(pole);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.10, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat);
  dome.position.y = 1.03; dome.castShadow = true; g.add(dome);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 10), mat);
  tip.position.y = 1.12; tip.castShadow = true; g.add(tip);
  return g;
}

// Ashva (horse/knight): base + a sculpted, extruded horse-head silhouette
function makeAshva(mat) {
  const g = new THREE.Group();
  g.add(felt(mat));
  // stubby turned neck base
  g.add(lathe([[0.30, 0.00], [0.30, 0.05], [0.21, 0.09], [0.17, 0.14], [0.16, 0.24], [0.15, 0.30], [0.02, 0.31]], mat));
  // horse-head profile in the X-Y plane, extruded along Z for thickness
  const s = new THREE.Shape();
  s.moveTo(-0.10, 0.26);
  s.lineTo(-0.12, 0.42);
  s.quadraticCurveTo(-0.14, 0.56, -0.05, 0.62); // back of neck up to ears
  s.lineTo(-0.02, 0.70);                         // ear
  s.lineTo(0.03, 0.60);
  s.lineTo(0.10, 0.62);                          // brow/forelock
  s.quadraticCurveTo(0.20, 0.58, 0.22, 0.48);    // muzzle top
  s.lineTo(0.20, 0.40);                          // nose
  s.lineTo(0.10, 0.40);                          // jaw
  s.quadraticCurveTo(0.06, 0.34, 0.08, 0.26);    // throat
  s.lineTo(-0.10, 0.26);
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.18, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 2 });
  geo.translate(0, 0, -0.09);
  geo.computeVertexNormals();
  const head = new THREE.Mesh(geo, mat);
  head.castShadow = true;
  g.add(head);
  g.userData.facing = true; // renderer will orient toward the opponent
  return g;
}

const BUILDERS = {
  padati: (m) => turned('padati', m),
  ratha: makeRatha,
  gaja: makeGaja,
  ashva: makeAshva,
  mantri: makeMantri,
  raja: makeRaja,
};

// key: chaturanga key ('padati'...). Returns a THREE.Group centred on the square.
export function makePiece(key, mat) {
  const build = BUILDERS[key] || BUILDERS.padati;
  const g = build(mat);
  g.userData.key = key;
  return g;
}

export const PIECE_HEIGHT = { padati: 0.43, ratha: 0.56, gaja: 0.74, ashva: 0.70, mantri: 0.81, raja: 1.15 };
