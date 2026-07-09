// Chaturanga — procedural sound design (Web Audio API). No audio files: everything is
// synthesized, so it is tiny, offline, and works inside the Capacitor webview and on Pages.
//
// Sound world: an Indian-classical palette. Music is a soft tanpura-like drone (Sa + Pa)
// under a slow, generative raga melody (Bhairav for Kurukshetra at dawn; Kafi for moonlit
// Lanka). SFX are short synthesized gestures: a pluck on select, a wooden "tok" on move, a
// bright clash on capture, a tense swell on check, an ascending bell on promotion, and a
// resolving cadence at game over.
//
// Autoplay policy: nothing sounds until unlock() is called from a user gesture.

let ctx = null;
let master = null, musicBus = null, sfxBus = null;
let noiseBuf = null;
let drone = [];
let melodyTimer = null;
let musicOn = true, sfxOn = true, musicWorld = 'kurukshetra';

const RAGAS = {
  // semitone offsets from the tonic (one octave)
  kurukshetra: { tonic: 220.0, scale: [0, 1, 4, 5, 7, 8, 11] }, // Bhairav — grave, devotional
  ramayana: { tonic: 196.0, scale: [0, 2, 3, 5, 7, 9, 10] },    // Kafi — cool, longing
};

try {
  musicOn = localStorage.getItem('chaturanga_music') !== '0';
  sfxOn = localStorage.getItem('chaturanga_sfx') !== '0';
} catch { /* ignore */ }

function ensureCtx() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  try {
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
    musicBus = ctx.createGain(); musicBus.gain.value = musicOn ? 0.5 : 0.0; musicBus.connect(master);
    sfxBus = ctx.createGain(); sfxBus.gain.value = sfxOn ? 0.9 : 0.0; sfxBus.connect(master);
    // a short white-noise buffer reused by percussive SFX
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch { ctx = null; }
  return ctx;
}

function noteFreq(scaleIdx, octave = 0, world = musicWorld) {
  const r = RAGAS[world] || RAGAS.kurukshetra;
  const s = r.scale;
  const semis = s[((scaleIdx % s.length) + s.length) % s.length] + 12 * (octave + Math.floor(scaleIdx / s.length));
  return r.tonic * Math.pow(2, semis / 12);
}

// enveloped oscillator voice
function voice(bus, freq, when, dur, opts = {}) {
  if (!ctx) return;
  const { type = 'triangle', gain = 0.2, attack = 0.01, release = 0.3, detune = 0, filter = 0, glideTo = 0 } = opts;
  const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, when); if (detune) o.detune.value = detune;
  if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, when + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(gain, when + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur + release);
  let node = o;
  if (filter) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filter; o.connect(f); node = f; }
  node.connect(g); g.connect(bus);
  o.start(when); o.stop(when + dur + release + 0.05);
}

function noise(bus, when, dur, opts = {}) {
  if (!ctx || !noiseBuf) return;
  const { gain = 0.3, filter = 1800, q = 1, type = 'bandpass', release = 0.05 } = opts;
  const src = ctx.createBufferSource(); src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = filter; f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, when);
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur + release);
  src.connect(f); f.connect(g); g.connect(bus);
  src.start(when); src.stop(when + dur + release + 0.02);
}

// ---------- SFX ----------
const SFX = {
  select(t) { voice(sfxBus, noteFreq(2, 0), t, 0.12, { type: 'triangle', gain: 0.14, attack: 0.005, release: 0.2, filter: 2200 }); },
  move(t) { noise(sfxBus, t, 0.03, { gain: 0.22, filter: 900, q: 0.7, type: 'lowpass', release: 0.04 }); voice(sfxBus, 150, t, 0.05, { type: 'sine', gain: 0.28, attack: 0.002, release: 0.08, glideTo: 90 }); },
  capture(t) { noise(sfxBus, t, 0.06, { gain: 0.32, filter: 2600, q: 0.8, type: 'bandpass', release: 0.12 }); voice(sfxBus, 220, t, 0.06, { type: 'sawtooth', gain: 0.16, attack: 0.002, release: 0.14, filter: 1400, detune: 8 }); voice(sfxBus, 110, t, 0.08, { type: 'sine', gain: 0.3, attack: 0.002, release: 0.16, glideTo: 70 }); },
  check(t) { voice(sfxBus, noteFreq(1, -1), t, 0.5, { type: 'sawtooth', gain: 0.16, attack: 0.03, release: 0.5, filter: 700 }); voice(sfxBus, noteFreq(1, -1) * 1.02, t, 0.5, { type: 'triangle', gain: 0.12, attack: 0.03, release: 0.5, filter: 900 }); },
  castle(t) { noise(sfxBus, t, 0.04, { gain: 0.2, filter: 800, type: 'lowpass', release: 0.05 }); noise(sfxBus, t + 0.09, 0.04, { gain: 0.2, filter: 800, type: 'lowpass', release: 0.05 }); },
  promote(t) { [0, 2, 4, 6].forEach((n, i) => voice(sfxBus, noteFreq(n, 0), t + i * 0.09, 0.14, { type: 'sine', gain: 0.16, attack: 0.004, release: 0.35 })); voice(sfxBus, noteFreq(7, 1), t + 0.36, 0.5, { type: 'triangle', gain: 0.18, attack: 0.006, release: 0.7 }); },
  win(t) { [4, 2, 0].forEach((n, i) => voice(sfxBus, noteFreq(n, 0), t + i * 0.18, 0.4, { type: 'triangle', gain: 0.2, attack: 0.006, release: 0.6, filter: 2400 })); voice(sfxBus, noteFreq(0, -1), t, 1.4, { type: 'sine', gain: 0.16, attack: 0.05, release: 1.2 }); },
  ui(t) { voice(sfxBus, 1200, t, 0.015, { type: 'square', gain: 0.05, attack: 0.001, release: 0.03, filter: 3000 }); },
};

export function sfx(name) {
  if (!sfxOn || !ensureCtx()) return;
  if (ctx.state === 'suspended') { ctx.resume().catch(() => {}); }
  const fn = SFX[name]; if (fn) { try { fn(ctx.currentTime + 0.001); } catch { /* ignore */ } }
}

// ---------- Music: tanpura drone + generative raga melody ----------
function startDrone() {
  if (!ctx) return;
  stopDrone();
  const r = RAGAS[musicWorld] || RAGAS.kurukshetra;
  const bus = ctx.createGain(); bus.gain.value = 0.0; bus.connect(musicBus);
  bus.gain.setTargetAtTime(0.5, ctx.currentTime, 1.5);
  // Sa (tonic), Sa-1oct, Pa (fifth) — slightly detuned pairs for a tanpura shimmer
  const parts = [[r.tonic / 2, 0.5], [r.tonic, 0.35], [r.tonic * Math.pow(2, 7 / 12), 0.22]];
  const oscs = [];
  for (const [f, g] of parts) {
    for (const det of [-4, 4]) {
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f; o.detune.value = det;
      const vg = ctx.createGain(); vg.gain.value = g;
      // slow shimmer
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.12 + Math.random() * 0.1;
      const lg = ctx.createGain(); lg.gain.value = g * 0.25; lfo.connect(lg); lg.connect(vg.gain);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400;
      o.connect(vg); vg.connect(lp); lp.connect(bus);
      o.start(); lfo.start(); oscs.push(o, lfo);
    }
  }
  drone = { bus, oscs };
}
function stopDrone() {
  if (drone && drone.oscs) {
    const now = ctx ? ctx.currentTime : 0;
    try { drone.bus.gain.setTargetAtTime(0.0001, now, 0.6); } catch { /* ignore */ }
    drone.oscs.forEach((o) => { try { o.stop(now + 1.6); } catch { /* ignore */ } });
  }
  drone = [];
}
function scheduleMelody() {
  clearTimeout(melodyTimer);
  const step = () => {
    if (musicOn && ctx && musicBus.gain.value > 0.001) {
      // a soft flute/veena-like note from the raga, mostly low-mid, occasional rests
      if (Math.random() > 0.25) {
        const deg = [0, 1, 2, 3, 4, 5, 6][Math.floor(Math.random() * 7)];
        const oct = Math.random() < 0.35 ? 1 : 0;
        const f = noteFreq(deg, oct);
        const g = ctx.createGain(); g.gain.value = 0.0; g.connect(musicBus);
        voice(g, f, ctx.currentTime + 0.02, 0.5 + Math.random() * 0.8, { type: 'sine', gain: 0.12, attack: 0.08, release: 0.9, filter: 1600 });
        g.gain.setValueAtTime(1, ctx.currentTime); setTimeout(() => { try { g.disconnect(); } catch { /* ignore */ } }, 4000);
      }
    }
    melodyTimer = setTimeout(step, 1400 + Math.random() * 2200);
  };
  melodyTimer = setTimeout(step, 1500);
}

export function startMusic(worldId) {
  if (worldId) musicWorld = RAGAS[worldId] ? worldId : 'kurukshetra';
  if (!musicOn || !ensureCtx()) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  startDrone(); scheduleMelody();
}
export function stopMusic() { stopDrone(); clearTimeout(melodyTimer); melodyTimer = null; }

export function setMusic(on) {
  musicOn = !!on;
  try { localStorage.setItem('chaturanga_music', on ? '1' : '0'); } catch { /* ignore */ }
  if (!ctx) { if (on) startMusic(); return; }
  musicBus.gain.setTargetAtTime(on ? 0.5 : 0.0, ctx.currentTime, 0.3);
  if (on) startMusic(); else stopMusic();
}
export function setSfx(on) {
  sfxOn = !!on;
  try { localStorage.setItem('chaturanga_sfx', on ? '1' : '0'); } catch { /* ignore */ }
  if (ctx) sfxBus.gain.setTargetAtTime(on ? 0.9 : 0.0, ctx.currentTime, 0.1);
}
export const isMusicOn = () => musicOn;
export const isSfxOn = () => sfxOn;

// Unlock + (optionally) begin the ambience from the first user gesture.
export function unlock(worldId, autostartMusic = true) {
  if (!ensureCtx()) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  if (autostartMusic && musicOn && !melodyTimer) startMusic(worldId);
}
