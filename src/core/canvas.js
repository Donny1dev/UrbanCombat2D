// Canvas, view metrics and shared pre-rendered sprites.
import { TAU, clamp } from './util.js';
import { Settings, Q } from './settings.js';

export const canvas = document.getElementById('game');
export const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
// V.w/V.h: backing-store size in pixels; V.px: canvas pixels per CSS pixel; V.zoom: canvas pixels per world unit
export const V = { w: 0, h: 0, px: 1, zoom: 1, cssW: 0, cssH: 0, version: 0 };
export const R = { draws: 0 };   // draw-call counter for the performance overlay

export function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, Q.resCap);
  V.px = dpr * Settings.resScale;
  V.cssW = window.innerWidth; V.cssH = window.innerHeight;
  V.w = Math.max(320, Math.floor(V.cssW * V.px)); V.h = Math.max(200, Math.floor(V.cssH * V.px));
  if (canvas.width !== V.w || canvas.height !== V.h) { canvas.width = V.w; canvas.height = V.h; }
  // keep roughly the same amount of world visible on any screen
  V.zoom = clamp(Math.sqrt((V.w * V.h) / (1260 * 730)), 0.45 * V.px, 2.4 * V.px);
  V.version++;
}

function makeCanvas(w, h = w) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
export { makeCanvas };
function makeGlow(rgb, size = 128) {
  const c = makeCanvas(size), g = c.getContext('2d');
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gr.addColorStop(0, `rgba(${rgb},1)`); gr.addColorStop(0.35, `rgba(${rgb},0.35)`); gr.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = gr; g.fillRect(0, 0, size, size);
  return c;
}
export const GLOW = {
  fire: makeGlow('255,170,60'), xp: makeGlow('60,240,255'), red: makeGlow('255,60,80'), white: makeGlow('255,255,255'),
  gold: makeGlow('255,210,70'), green: makeGlow('90,255,150'), violet: makeGlow('170,120,255'), ice: makeGlow('150,220,255'),
  magenta: makeGlow('255,80,220'), warm: makeGlow('255,200,130', 256), cool: makeGlow('140,190,255', 256), orange: makeGlow('255,140,30'),
};
// soft round sprite (smoke/dots) and a drop shadow sprite: drawImage is far cheaper than path fills
export const SOFT = (() => { const c = makeCanvas(64), g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return c; })();
export const SHADOW = (() => { const c = makeCanvas(64, 48), g = c.getContext('2d'); g.fillStyle = 'rgba(0,0,0,0.33)'; g.beginPath(); g.ellipse(32, 24, 30, 22, 0, 0, TAU); g.fill(); return c; })();

export function glow(img, x, y, r, a = 1) {
  if (a <= 0.01 || !Q.glow) return;
  ctx.globalAlpha = a > 1 ? 1 : a;
  ctx.drawImage(img, x - r, y - r, r * 2, r * 2); R.draws++;
  ctx.globalAlpha = 1;
}
export function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
