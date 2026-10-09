// ===================== CORE: utils, input, audio =====================
const TAU = Math.PI * 2;
const TILE = 48;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a = 1, b) => b === undefined ? Math.random() * a : a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));
const pick = arr => arr[(Math.random() * arr.length) | 0];
const dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
const angDiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
const damp = (k, dt) => 1 - Math.exp(-k * dt);
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } }
};

// ---------- canvas ----------
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d', { alpha: false });
let VW = 0, VH = 0, DPR = 1, ZOOM = 1;
function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 1.5);
  VW = Math.floor(window.innerWidth * DPR);
  VH = Math.floor(window.innerHeight * DPR);
  canvas.width = VW; canvas.height = VH;
  // keep roughly the same amount of world visible on any screen
  ZOOM = Math.sqrt((VW * VH) / (1260 * 730));
  ZOOM = clamp(ZOOM, 0.55 * DPR, 2.4 * DPR);
}
window.addEventListener('resize', resize);
resize();

// prebaked glow sprite for cheap additive lights
function makeGlow(color, size = 128) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gr.addColorStop(0, color); gr.addColorStop(0.35, color.replace(/[\d.]+\)$/, '0.35)')); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, size, size);
  return c;
}
const GLOW = {
  fire: makeGlow('rgba(255,170,60,1)'),
  xp: makeGlow('rgba(60,240,255,1)'),
  red: makeGlow('rgba(255,60,80,1)'),
  white: makeGlow('rgba(255,255,255,1)'),
  gold: makeGlow('rgba(255,210,70,1)'),
  green: makeGlow('rgba(90,255,150,1)'),
  violet: makeGlow('rgba(170,120,255,1)'),
  warm: makeGlow('rgba(255,200,130,1)', 256),
  cool: makeGlow('rgba(140,190,255,1)', 256),
};
function glow(img, x, y, r, a = 1) {
  if (a <= 0.01) return;
  ctx.globalAlpha = a;
  ctx.drawImage(img, x - r, y - r, r * 2, r * 2);
  ctx.globalAlpha = 1;
}

// ---------- input ----------
const keys = Object.create(null);
const mouse = { sx: 0, sy: 0, x: 0, y: 0, down: false, pressed: false };
window.addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if ([' ', 'arrowup', 'arrowdown', 'tab'].includes(k)) e.preventDefault();
  if (!keys[k]) onKeyPress(k, e);
  keys[k] = true;
});
window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; mouse.down = false; if (typeof onBlur === 'function') onBlur(); });
canvas.addEventListener('mousemove', e => { mouse.sx = e.clientX * DPR; mouse.sy = e.clientY * DPR; });
window.addEventListener('mousemove', e => { mouse.sx = e.clientX * DPR; mouse.sy = e.clientY * DPR; });
canvas.addEventListener('mousedown', e => { if (e.button === 0) { mouse.down = true; mouse.pressed = true; } });
window.addEventListener('mouseup', e => { if (e.button === 0) mouse.down = false; });
canvas.addEventListener('contextmenu', e => e.preventDefault());

// ---------- audio (Web Audio synthesis) ----------
const Sound = (() => {
  let ac = null, master = null, comp = null, noiseBuf = null;
  let muted = store.get('uc_muted', false);
  const last = Object.create(null);
  function init() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    try {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      comp = ac.createDynamicsCompressor();
      comp.threshold.value = -16; comp.ratio.value = 6;
      master = ac.createGain(); master.gain.value = muted ? 0 : 0.42;
      master.connect(comp); comp.connect(ac.destination);
      noiseBuf = ac.createBuffer(1, ac.sampleRate * 1.5, ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { ac = null; }
  }
  function ok(name, gap = 0.03) {
    if (!ac || muted) return false;
    const t = ac.currentTime;
    if (last[name] && t - last[name] < gap) return false;
    last[name] = t; return true;
  }
  function env(g, t, a, peak, dec) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
  }
  function noise(t, dur, type, f0, f1, peak, q = 1, dest = master) {
    const s = ac.createBufferSource(); s.buffer = noiseBuf;
    s.playbackRate.value = rand(0.9, 1.1);
    const f = ac.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ac.createGain(); env(g, t, 0.003, peak, dur);
    s.connect(f); f.connect(g); g.connect(dest);
    s.start(t, rand(0, 1)); s.stop(t + dur + 0.05);
  }
  function tone(t, type, f0, f1, dur, peak, a = 0.004) {
    const o = ac.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ac.createGain(); env(g, t, a, peak, dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + a + dur + 0.05);
  }
  const GUN = {
    pistol: [0.10, 2600, 0.5, 190],
    smg: [0.06, 3200, 0.3, 240],
    rifle: [0.09, 2200, 0.45, 150],
    shotgun: [0.24, 1500, 0.8, 90],
    dual: [0.07, 3000, 0.38, 220],
    heavy: [0.30, 1100, 0.9, 70],
  };
  return {
    init,
    get muted() { return muted; },
    toggle() {
      muted = !muted; store.set('uc_muted', muted);
      if (master) master.gain.setTargetAtTime(muted ? 0 : 0.42, ac.currentTime, 0.02);
      return muted;
    },
    shoot(kind, evolved) {
      if (!ok('shoot', kind === 'smg' || kind === 'dual' ? 0.045 : 0.03)) return;
      const t = ac.currentTime, p = GUN[kind] || GUN.pistol;
      noise(t, p[0], 'bandpass', p[1] * rand(0.9, 1.1), p[1] * 0.25, p[2], 0.9);
      tone(t, 'square', p[3] * 2.2, p[3] * 0.5, p[0] * 0.8, p[2] * 0.35);
      if (evolved) tone(t, 'sawtooth', 1400, 300, 0.08, 0.12);
      if (kind === 'shotgun' || kind === 'heavy') tone(t, 'sine', 120, 40, 0.18, 0.6);
    },
    enemyShoot() { if (!ok('eshoot', 0.06)) return; const t = ac.currentTime; noise(t, 0.08, 'bandpass', 1800, 500, 0.18, 1.2); tone(t, 'square', 300, 120, 0.06, 0.06); },
    hit() { if (!ok('hit', 0.025)) return; const t = ac.currentTime; noise(t, 0.05, 'highpass', 3000, 1500, 0.18); tone(t, 'triangle', 520 * rand(.9, 1.1), 200, 0.05, 0.12); },
    crit() { if (!ok('crit', 0.05)) return; const t = ac.currentTime; tone(t, 'square', 1500, 600, 0.09, 0.14); noise(t, 0.07, 'highpass', 5000, 2000, 0.2); },
    wall(metal) {
      if (!ok('wall', 0.04)) return; const t = ac.currentTime;
      if (metal) { tone(t, 'triangle', 2400 * rand(.8, 1.2), 1800, 0.12, 0.08); noise(t, 0.04, 'highpass', 6000, 3000, 0.08); }
      else noise(t, 0.06, 'lowpass', 1600, 300, 0.12);
    },
    kill(big) {
      if (!ok('kill', 0.03)) return; const t = ac.currentTime;
      tone(t, 'square', big ? 220 : 420, big ? 60 : 110, big ? 0.25 : 0.13, 0.16);
      noise(t, big ? 0.3 : 0.12, 'lowpass', 2500, 200, 0.3);
    },
    pickup(n) {
      if (!ok('pick', 0.022)) return; const t = ac.currentTime;
      const f = 700 * Math.pow(1.06, Math.min(n, 24));
      tone(t, 'sine', f, f * 1.5, 0.07, 0.12); tone(t + 0.02, 'triangle', f * 2, f * 2.2, 0.05, 0.05);
    },
    levelUp() {
      if (!ok('lvl', 0.2)) return; const t = ac.currentTime;
      [523, 659, 784, 1047, 1319].forEach((f, i) => { tone(t + i * 0.055, 'square', f, f, 0.16, 0.11); tone(t + i * 0.055, 'sine', f * 2, f * 2, 0.2, 0.06); });
    },
    select(evo) {
      if (!ok('sel', 0.1)) return; const t = ac.currentTime;
      tone(t, 'sawtooth', 300, 1200, 0.18, 0.12); noise(t, 0.25, 'bandpass', 800, 6000, 0.12, 2);
      if (evo) [392, 523, 659, 784, 1047].forEach((f, i) => tone(t + 0.08 + i * 0.07, 'square', f, f, 0.3, 0.1));
    },
    ui() { if (!ok('ui', 0.05)) return; const t = ac.currentTime; tone(t, 'square', 900, 1300, 0.04, 0.07); },
    dash() { if (!ok('dash', 0.1)) return; const t = ac.currentTime; noise(t, 0.22, 'bandpass', 400, 3000, 0.35, 1.5); tone(t, 'sine', 180, 520, 0.16, 0.08); },
    reload() {
      if (!ok('reload', 0.2)) return; const t = ac.currentTime;
      noise(t, 0.03, 'highpass', 4000, 3000, 0.2); tone(t, 'square', 1800, 1200, 0.03, 0.05);
    },
    reloadDone() { if (!ok('reload2', 0.2)) return; const t = ac.currentTime; noise(t, 0.04, 'bandpass', 2500, 1500, 0.25, 2); tone(t + 0.04, 'square', 1200, 2200, 0.04, 0.06); },
    explode() {
      if (!ok('boom', 0.06)) return; const t = ac.currentTime;
      noise(t, 0.7, 'lowpass', 1800, 60, 0.9); tone(t, 'sine', 140, 30, 0.5, 0.8); noise(t, 0.12, 'highpass', 3000, 800, 0.3);
    },
    glass() {
      if (!ok('glass', 0.05)) return; const t = ac.currentTime;
      noise(t, 0.35, 'highpass', 5000, 2500, 0.3);
      for (let i = 0; i < 5; i++) tone(t + i * 0.03 + rand(0.02), 'sine', rand(3000, 6000), rand(2000, 4000), 0.08, 0.05);
    },
    crate() { if (!ok('crate', 0.05)) return; const t = ac.currentTime; noise(t, 0.2, 'lowpass', 900, 150, 0.45); tone(t, 'triangle', 160, 70, 0.12, 0.25); },
    hurt() { if (!ok('hurt', 0.12)) return; const t = ac.currentTime; tone(t, 'sawtooth', 220, 70, 0.25, 0.3); noise(t, 0.18, 'lowpass', 1200, 200, 0.35); },
    melee() { if (!ok('melee', 0.08)) return; const t = ac.currentTime; noise(t, 0.09, 'bandpass', 900, 300, 0.25, 2); },
    zap() { if (!ok('zap', 0.06)) return; const t = ac.currentTime; tone(t, 'sawtooth', 2200, 400, 0.12, 0.1); noise(t, 0.1, 'highpass', 6000, 3000, 0.1); },
    combo(n) {
      if (!ok('combo', 0.15)) return; const t = ac.currentTime;
      const base = 330 * Math.pow(1.12, Math.min(n, 12));
      tone(t, 'square', base, base * 2, 0.12, 0.1); tone(t + 0.06, 'square', base * 1.5, base * 3, 0.14, 0.08);
    },
    wave() { if (!ok('wave', 0.5)) return; const t = ac.currentTime; tone(t, 'sawtooth', 110, 110, 0.5, 0.14, 0.05); tone(t + 0.25, 'sawtooth', 147, 147, 0.6, 0.14, 0.05); },
    boss() { if (!ok('bossw', 1)) return; const t = ac.currentTime; for (let i = 0; i < 3; i++) { tone(t + i * 0.35, 'sawtooth', 90, 70, 0.3, 0.3, 0.01); noise(t + i * 0.35, 0.25, 'lowpass', 600, 80, 0.4); } },
    die() { if (!ok('die', 1)) return; const t = ac.currentTime; tone(t, 'sawtooth', 400, 40, 1.2, 0.35); noise(t, 0.9, 'lowpass', 2000, 60, 0.5); },
  };
})();
