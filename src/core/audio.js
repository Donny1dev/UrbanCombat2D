// Web Audio synthesis: sound effects on separate buses + a small procedural music sequencer.
import { Settings } from './settings.js';

let ac = null, master = null, buses = null, noiseBuf = null, failed = false;
const last = Object.create(null);
const r = (a, b) => a + Math.random() * (b - a);

export function audioInit() {
  if (failed) return;
  if (ac) { if (ac.state === 'suspended') ac.resume().catch(() => { }); return; }
  try {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    const comp = ac.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 6;
    master = ac.createGain(); master.connect(comp); comp.connect(ac.destination);
    buses = {};
    for (const b of ['combat', 'ui', 'music']) { buses[b] = ac.createGain(); buses[b].connect(master); }
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 1.5, ac.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    applyVolumes();
  } catch (e) { failed = true; ac = null; console.warn('Audio unavailable:', e); }
}
export function applyVolumes() {
  if (!ac) return;
  const t = ac.currentTime;
  master.gain.setTargetAtTime(Settings.muted ? 0 : 0.45 * Settings.master, t, 0.03);
  buses.combat.gain.setTargetAtTime(Settings.gunfire, t, 0.03);
  buses.ui.gain.setTargetAtTime(Settings.uiVol, t, 0.03);
  buses.music.gain.setTargetAtTime(Settings.music * 0.55, t, 0.05);
}
let winT = 0, winN = 0;
const ok = (name, gap = 0.03) => {
  if (!ac || Settings.muted) return false;
  const t = ac.currentTime; if (last[name] && t - last[name] < gap) return false;
  // voice limiter: heavy combat would otherwise create hundreds of audio nodes per second
  if (t - winT > 0.1) { winT = t; winN = 0; }
  if (++winN > 14) return false;
  last[name] = t; return true;
};
function env(g, t, a, peak, dec) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec); }
function noise(t, dur, type, f0, f1, peak, q = 1, bus = 'combat') {
  const s = ac.createBufferSource(); s.buffer = noiseBuf; s.playbackRate.value = r(0.9, 1.1);
  const f = ac.createBiquadFilter(); f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = ac.createGain(); env(g, t, 0.003, peak, dur);
  s.connect(f); f.connect(g); g.connect(buses[bus]); s.start(t, r(0, 1)); s.stop(t + dur + 0.05);
}
function tone(t, type, f0, f1, dur, peak, a = 0.004, bus = 'combat') {
  const o = ac.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = ac.createGain(); env(g, t, a, peak, dur);
  o.connect(g); g.connect(buses[bus]); o.start(t); o.stop(t + a + dur + 0.05);
}
const GUN = { pistol: [0.10, 2600, 0.5, 190], smg: [0.06, 3200, 0.3, 240], rifle: [0.09, 2200, 0.45, 150], shotgun: [0.24, 1500, 0.8, 90], dual: [0.07, 3000, 0.38, 220], heavy: [0.30, 1100, 0.9, 70] };
const U = 'ui';
export const Sound = {
  shoot(kind, evolved) {
    if (!ok('shoot', kind === 'smg' || kind === 'dual' ? 0.045 : 0.03)) return;
    const t = ac.currentTime, p = GUN[kind] || GUN.pistol;
    noise(t, p[0], 'bandpass', p[1] * r(0.9, 1.1), p[1] * 0.25, p[2], 0.9);
    tone(t, 'square', p[3] * 2.2, p[3] * 0.5, p[0] * 0.8, p[2] * 0.35);
    if (evolved) tone(t, 'sawtooth', 1400, 300, 0.08, 0.12);
    if (kind === 'shotgun' || kind === 'heavy') tone(t, 'sine', 120, 40, 0.18, 0.6);
  },
  turret() { if (!ok('turret', 0.06)) return; const t = ac.currentTime; noise(t, 0.05, 'bandpass', 3800, 1200, 0.2, 1.2); tone(t, 'square', 700, 300, 0.04, 0.05); },
  enemyShoot() { if (!ok('eshoot', 0.06)) return; const t = ac.currentTime; noise(t, 0.08, 'bandpass', 1800, 500, 0.18, 1.2); tone(t, 'square', 300, 120, 0.06, 0.06); },
  hit() { if (!ok('hit', 0.025)) return; const t = ac.currentTime; noise(t, 0.05, 'highpass', 3000, 1500, 0.18); tone(t, 'triangle', 520 * r(0.9, 1.1), 200, 0.05, 0.12); },
  crit() { if (!ok('crit', 0.05)) return; const t = ac.currentTime; tone(t, 'square', 1500, 600, 0.09, 0.14); noise(t, 0.07, 'highpass', 5000, 2000, 0.2); },
  wall(metal) { if (!ok('wall', 0.04)) return; const t = ac.currentTime; if (metal) { tone(t, 'triangle', 2400 * r(0.8, 1.2), 1800, 0.12, 0.08); noise(t, 0.04, 'highpass', 6000, 3000, 0.08); } else noise(t, 0.06, 'lowpass', 1600, 300, 0.12); },
  kill(big) { if (!ok('kill', 0.03)) return; const t = ac.currentTime; tone(t, 'square', big ? 220 : 420, big ? 60 : 110, big ? 0.25 : 0.13, 0.16); noise(t, big ? 0.3 : 0.12, 'lowpass', 2500, 200, 0.3); },
  pickup(n) { if (!ok('pick', 0.022)) return; const t = ac.currentTime, f = 700 * Math.pow(1.06, Math.min(n, 24)); tone(t, 'sine', f, f * 1.5, 0.07, 0.12, 0.004, U); tone(t + 0.02, 'triangle', f * 2, f * 2.2, 0.05, 0.05, 0.004, U); },
  levelUp() { if (!ok('lvl', 0.2)) return; const t = ac.currentTime; [523, 659, 784, 1047, 1319].forEach((f, i) => { tone(t + i * 0.055, 'square', f, f, 0.16, 0.11, 0.004, U); tone(t + i * 0.055, 'sine', f * 2, f * 2, 0.2, 0.06, 0.004, U); }); },
  select(evo) { if (!ok('sel', 0.1)) return; const t = ac.currentTime; tone(t, 'sawtooth', 300, 1200, 0.18, 0.12, 0.004, U); noise(t, 0.25, 'bandpass', 800, 6000, 0.12, 2, U); if (evo) [392, 523, 659, 784, 1047].forEach((f, i) => tone(t + 0.08 + i * 0.07, 'square', f, f, 0.3, 0.1, 0.004, U)); },
  ui() { if (!ok('ui', 0.05)) return; const t = ac.currentTime; tone(t, 'square', 900, 1300, 0.04, 0.07, 0.004, U); },
  hover() { if (!ok('hover', 0.04)) return; const t = ac.currentTime; tone(t, 'sine', 1400, 1700, 0.03, 0.04, 0.004, U); },
  confirm() { if (!ok('confirm', 0.1)) return; const t = ac.currentTime; tone(t, 'square', 523, 523, 0.06, 0.08, 0.004, U); tone(t + 0.06, 'square', 784, 784, 0.1, 0.08, 0.004, U); noise(t, 0.15, 'bandpass', 1500, 4000, 0.08, 2, U); },
  error() { if (!ok('err', 0.15)) return; const t = ac.currentTime; tone(t, 'square', 220, 180, 0.12, 0.08, 0.004, U); tone(t + 0.1, 'square', 180, 140, 0.14, 0.08, 0.004, U); },
  lock() { if (!ok('lock', 0.08)) return; const t = ac.currentTime; tone(t, 'square', 600, 300, 0.05, 0.1, 0.004, U); noise(t, 0.04, 'highpass', 5000, 3000, 0.15, 1, U); },
  reroll() { if (!ok('reroll', 0.1)) return; const t = ac.currentTime; for (let i = 0; i < 6; i++) tone(t + i * 0.03, 'square', 400 + i * 160, 500 + i * 160, 0.03, 0.06, 0.004, U); },
  dash() { if (!ok('dash', 0.1)) return; const t = ac.currentTime; noise(t, 0.22, 'bandpass', 400, 3000, 0.35, 1.5); tone(t, 'sine', 180, 520, 0.16, 0.08); },
  reload() { if (!ok('reload', 0.2)) return; const t = ac.currentTime; noise(t, 0.03, 'highpass', 4000, 3000, 0.2); tone(t, 'square', 1800, 1200, 0.03, 0.05); },
  reloadDone() { if (!ok('reload2', 0.2)) return; const t = ac.currentTime; noise(t, 0.04, 'bandpass', 2500, 1500, 0.25, 2); tone(t + 0.04, 'square', 1200, 2200, 0.04, 0.06); },
  explode() { if (!ok('boom', 0.06)) return; const t = ac.currentTime; noise(t, 0.7, 'lowpass', 1800, 60, 0.9); tone(t, 'sine', 140, 30, 0.5, 0.8); noise(t, 0.12, 'highpass', 3000, 800, 0.3); },
  glass() { if (!ok('glass', 0.05)) return; const t = ac.currentTime; noise(t, 0.35, 'highpass', 5000, 2500, 0.3); for (let i = 0; i < 5; i++) tone(t + i * 0.03 + r(0, 0.02), 'sine', r(3000, 6000), r(2000, 4000), 0.08, 0.05); },
  crate() { if (!ok('crate', 0.05)) return; const t = ac.currentTime; noise(t, 0.2, 'lowpass', 900, 150, 0.45); tone(t, 'triangle', 160, 70, 0.12, 0.25); },
  hurt() { if (!ok('hurt', 0.12)) return; const t = ac.currentTime; tone(t, 'sawtooth', 220, 70, 0.25, 0.3); noise(t, 0.18, 'lowpass', 1200, 200, 0.35); },
  melee() { if (!ok('melee', 0.08)) return; noise(ac.currentTime, 0.09, 'bandpass', 900, 300, 0.25, 2); },
  zap() { if (!ok('zap', 0.06)) return; const t = ac.currentTime; tone(t, 'sawtooth', 2200, 400, 0.12, 0.1); noise(t, 0.1, 'highpass', 6000, 3000, 0.1); },
  combo(n) { if (!ok('combo', 0.15)) return; const t = ac.currentTime, b = 330 * Math.pow(1.12, Math.min(n, 12)); tone(t, 'square', b, b * 2, 0.12, 0.1, 0.004, U); tone(t + 0.06, 'square', b * 1.5, b * 3, 0.14, 0.08, 0.004, U); },
  wave() { if (!ok('wave', 0.5)) return; const t = ac.currentTime; tone(t, 'sawtooth', 110, 110, 0.5, 0.14, 0.05, U); tone(t + 0.25, 'sawtooth', 147, 147, 0.6, 0.14, 0.05, U); },
  boss(kind = 0) { if (!ok('bossw', 1)) return; const t = ac.currentTime, base = [90, 70, 120][kind] || 90; for (let i = 0; i < 3; i++) { tone(t + i * 0.35, 'sawtooth', base, base * 0.78, 0.3, 0.3, 0.01); noise(t + i * 0.35, 0.25, 'lowpass', 600, 80, 0.4); } },
  die() { if (!ok('die', 1)) return; const t = ac.currentTime; tone(t, 'sawtooth', 400, 40, 1.2, 0.35); noise(t, 0.9, 'lowpass', 2000, 60, 0.5); },
  synergy() { if (!ok('syn', 0.3)) return; const t = ac.currentTime; [659, 880, 1175, 1568].forEach((f, i) => { tone(t + i * 0.06, 'triangle', f, f * 1.01, 0.28, 0.12, 0.004, U); tone(t + i * 0.06, 'sine', f / 2, f / 2, 0.3, 0.08, 0.004, U); }); noise(t, 0.5, 'bandpass', 2000, 8000, 0.08, 3, U); },
  evolve() { if (!ok('evo', 0.5)) return; const t = ac.currentTime; tone(t, 'sawtooth', 80, 640, 0.6, 0.18, 0.02, U); noise(t, 0.6, 'bandpass', 300, 6000, 0.2, 2, U); [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => tone(t + 0.45 + i * 0.07, 'square', f, f, 0.35, 0.09, 0.004, U)); tone(t + 0.45, 'sine', 65, 40, 0.8, 0.5, 0.004, U); },
  achievement() { if (!ok('ach', 0.4)) return; const t = ac.currentTime; [784, 988, 1175, 1568].forEach((f, i) => tone(t + i * 0.08, 'triangle', f, f, 0.3, 0.12, 0.004, U)); tone(t, 'sine', 196, 196, 0.6, 0.12, 0.02, U); },
  event() { if (!ok('event', 1)) return; const t = ac.currentTime; for (let i = 0; i < 2; i++) { tone(t + i * 0.3, 'square', 880, 660, 0.25, 0.1, 0.004, U); tone(t + i * 0.3, 'square', 440, 330, 0.25, 0.06, 0.004, U); } },
  heal() { if (!ok('heal', 0.15)) return; const t = ac.currentTime; [523, 784, 1047].forEach((f, i) => tone(t + i * 0.05, 'sine', f, f * 1.02, 0.18, 0.12)); },
  shield() { if (!ok('shield', 0.1)) return; tone(ac.currentTime, 'triangle', 1800, 900, 0.1, 0.1); },
  streak(n) { if (!ok('streak', 0.4)) return; const t = ac.currentTime; tone(t, 'sawtooth', 110, 220, 0.4, 0.2, 0.01, U); [392, 523, 659, 784].slice(0, 2 + Math.min(2, n)).forEach((f, i) => tone(t + i * 0.08, 'square', f, f, 0.2, 0.1, 0.004, U)); },
  freeze() { if (!ok('freeze', 0.08)) return; const t = ac.currentTime; noise(t, 0.2, 'highpass', 7000, 4000, 0.15); tone(t, 'sine', 2600, 3200, 0.12, 0.05); },
  burn() { if (!ok('burn', 0.15)) return; noise(ac.currentTime, 0.25, 'bandpass', 600, 1500, 0.12, 0.8); },
  throwG() { if (!ok('throw', 0.1)) return; const t = ac.currentTime; noise(t, 0.15, 'bandpass', 900, 2600, 0.2, 1.4); tone(t, 'sine', 300, 600, 0.1, 0.05); },
  beep() { if (!ok('beep', 0.08)) return; tone(ac.currentTime, 'square', 1760, 1760, 0.05, 0.06); },
  deploy() { if (!ok('deploy', 0.15)) return; const t = ac.currentTime; tone(t, 'square', 330, 660, 0.12, 0.08); noise(t, 0.12, 'bandpass', 2000, 600, 0.15, 2); tone(t + 0.1, 'square', 990, 990, 0.06, 0.07); },
  gadgetReady() { if (!ok('gready', 0.3)) return; const t = ac.currentTime; tone(t, 'sine', 1320, 1320, 0.07, 0.05, 0.004, U); tone(t + 0.07, 'sine', 1760, 1760, 0.09, 0.05, 0.004, U); },
  ambience() { if (!ac || Settings.muted) return; const t = ac.currentTime; noise(t, 4, 'lowpass', 400, 200, 0.12, 1, 'music'); tone(t + 1, 'sine', 55, 52, 3, 0.05, 0.5, 'music'); },
};

// ---------------- procedural music ----------------
// 16-step patterns in A minor; "combat" intensity adds layers, "boss" switches to a harder pattern.
const BASS = [[45, 0, 45, 0, 0, 45, 0, 48, 45, 0, 45, 0, 0, 43, 0, 40], [45, 45, 0, 45, 48, 0, 45, 0, 43, 43, 0, 43, 46, 0, 43, 0]];
const midi = n => 440 * Math.pow(2, (n - 69) / 12);
export const Music = {
  mode: 'off', intensity: 0, step: 0, next: 0, timer: null, bpm: 112,
  set(mode, intensity = this.intensity) {
    this.intensity = intensity;
    if (mode === this.mode) return;
    this.mode = mode;
    if (!ac || failed) return;
    if (mode === 'off') { clearInterval(this.timer); this.timer = null; return; }
    if (!this.timer) { this.next = ac.currentTime + 0.1; this.timer = setInterval(() => this.tick(), 60); }
  },
  tick() {
    if (!ac || Settings.muted || Settings.music <= 0) { if (ac) this.next = ac.currentTime + 0.1; return; }
    const spb = 60 / (this.mode === 'boss' ? 132 : this.bpm) / 4;
    while (this.next < ac.currentTime + 0.25) { this.play(this.step, this.next); this.step = (this.step + 1) % 32; this.next += spb; }
  },
  play(s, t) {
    const m = this.mode, i = s % 16, bar = (s / 16) | 0, B = 'music';
    if (m === 'menu') {
      if (i === 0) { tone(t, 'sine', midi(57 - (bar % 2) * 2), midi(57 - (bar % 2) * 2), 1.8, 0.05, 0.4, B); tone(t, 'triangle', midi(64), midi(64), 1.8, 0.025, 0.5, B); }
      if (i % 4 === 2) noise(t, 0.05, 'highpass', 8000, 6000, 0.015, 1, B);
      return;
    }
    const pat = BASS[m === 'boss' ? 1 : 0][i], lvl = this.intensity;
    if (i % 4 === 0) { tone(t, 'sine', 120, 40, 0.18, 0.35, 0.002, B); }                 // kick
    if (i % 8 === 4) noise(t, 0.12, 'bandpass', 1800, 900, 0.18 + lvl * 0.06, 0.8, B);   // snare
    if (lvl > 0.25 || m === 'boss') noise(t, 0.03, 'highpass', 9000, 7000, 0.04, 1, B);   // hats
    if (pat) tone(t, m === 'boss' ? 'sawtooth' : 'square', midi(pat - 12), midi(pat - 12), 0.12, 0.05 + lvl * 0.03, 0.004, B);
    if (lvl > 0.6 && i % 8 === 0) tone(t, 'triangle', midi(69 + (bar % 2 ? 3 : 0)), midi(69), 0.4, 0.03, 0.02, B);
  },
};
