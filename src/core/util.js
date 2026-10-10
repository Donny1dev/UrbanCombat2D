// Small math + RNG helpers. Pure module: no DOM access, safe to import from tests.
export const TAU = Math.PI * 2;
export const TILE = 48;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
export const angDiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
export const damp = (k, dt) => 1 - Math.exp(-k * dt);
export const hash2 = (x, y) => { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };
export const pct = v => Math.round(v * 100) + '%';
export const fmtTime = t => { const m = Math.floor(t / 60), s = Math.floor(t % 60); return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0'); };

// mulberry32: tiny seedable PRNG (used for the daily operation + reproducible map generation)
export function makeRng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function seedFromString(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

// Gameplay RNG is swappable so a run (or just its map) can be seeded. Visual-only randomness keeps Math.random.
let gameRng = Math.random;
export const setGameRng = fn => { gameRng = fn || Math.random; };
export const rnd = () => gameRng();
export const rand = (a = 1, b) => (b === undefined ? gameRng() * a : a + gameRng() * (b - a));
export const randi = (a, b) => Math.floor(rand(a, b + 1));
export const pick = arr => arr[(gameRng() * arr.length) | 0];
export const shuffle = arr => { for (let i = arr.length - 1; i > 0; i--) { const j = (gameRng() * (i + 1)) | 0; [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
// visual randomness (never affects simulation determinism)
export const vrand = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));

export const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const todayKey = (d = new Date()) => d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
export const uid = () => (Date.now().toString(36) + Math.random().toString(36).slice(2, 8)).toUpperCase();
