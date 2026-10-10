// Text sprite cache: stroked text is expensive, so each (string, font, size, colour) is rendered once to an
// offscreen canvas and then blitted with drawImage. LRU-bounded; cleared when web fonts finish loading.
import { makeCanvas } from '../core/canvas.js';

export const DISPLAY = 'Bungee, Impact, "Arial Black", sans-serif';
export const BODY = '"Barlow Condensed", "Arial Narrow", sans-serif';
const cache = new Map();
const MAX = 500;
let probe = null;
export function clearTextCache() { cache.clear(); }
if (document.fonts && document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', clearTextCache);

// size is in output pixels (already multiplied by any zoom/HUD scale by the caller)
export function textSprite(str, size, color, font = BODY, weight = 800, stroke = true) {
  size = Math.max(6, Math.round(size));
  const key = `${str}|${size}|${color}|${font === DISPLAY ? 'D' : weight}|${stroke ? 1 : 0}`;
  let s = cache.get(key);
  if (s) { cache.delete(key); cache.set(key, s); return s; }
  if (!probe) probe = makeCanvas(4).getContext('2d');
  const f = `${font === DISPLAY ? 400 : weight} ${size}px ${font}`;
  probe.font = f;
  const pad = stroke ? Math.ceil(size * 0.22) + 2 : 2;
  const w = Math.ceil(probe.measureText(str).width) + pad * 2, h = Math.ceil(size * 1.3) + pad * 2;
  const c = makeCanvas(w, h), g = c.getContext('2d');
  g.font = f; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
  if (stroke) { g.lineWidth = Math.max(2, size * 0.2); g.strokeStyle = 'rgba(8,8,12,0.92)'; g.strokeText(str, w / 2, h / 2); }
  g.fillStyle = color; g.fillText(str, w / 2, h / 2);
  s = { c, w, h, pad };
  cache.set(key, s);
  if (cache.size > MAX) cache.delete(cache.keys().next().value);
  return s;
}
