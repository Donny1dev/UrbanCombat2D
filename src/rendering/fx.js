// Particles, floating text, lightning arcs, transient lights and floor decals.
// Fixed-capacity pools (no unbounded growth), quality-scaled spawning, and sprite/batched rendering.
import { TAU, vrand as rand, lerp } from '../core/util.js';
import { ctx, R, GLOW, SOFT, makeCanvas, glow } from '../core/canvas.js';
import { Q, Settings } from '../core/settings.js';
import { G } from '../core/registry.js';
import { solidAt } from '../world/map.js';
import { textSprite, DISPLAY, BODY } from './textcache.js';

export const P_SPARK = 0, P_SMOKE = 1, P_DEBRIS = 2, P_SHARD = 3, P_EMBER = 4, P_CASING = 5, P_RING = 6, P_FLASH = 7, P_DOT = 8;
const IMPORTANT = new Set([P_RING, P_FLASH, P_CASING]);
const MAX_PARTS = 2000, MAX_TEXTS = 120, MAX_ARCS = 40, MAX_LIGHTS = 60;

// tinted sprite caches
const tintCache = new Map();
function tinted(base, color) {
  const key = base === SOFT ? 's' + color : 'd' + color;
  let c = tintCache.get(key);
  if (!c) {
    c = makeCanvas(base.width, base.height); const g = c.getContext('2d');
    g.drawImage(base, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = color; g.fillRect(0, 0, c.width, c.height);
    tintCache.set(key, c);
  }
  return c;
}
const DOT = (() => { const c = makeCanvas(32), g = c.getContext('2d'); g.fillStyle = '#fff'; g.beginPath(); g.arc(16, 16, 15, 0, TAU); g.fill(); return c; })();
const smokeColor = prefix => prefix.replace('rgba(', 'rgb(').replace(/,$/, ')');

function newPart() { return { type: 0, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 1, color: '', rot: 0, vr: 0, z: 0, vz: 0, drag: 4, grow: 0, a: 0, lw: 0, img: null }; }

export const FX = {
  parts: [], texts: [], arcs: [], lights: [], evict: 0, tEvict: 0,
  reset() { this.parts.length = 0; this.texts.length = 0; this.arcs.length = 0; this.lights.length = 0; },
  add(type, x, y, vx, vy, life, size, color, o) {
    if (!IMPORTANT.has(type) && Math.random() > Q.particles) return null;
    if ((type === P_DEBRIS || type === P_SHARD) && !Q.debris && Math.random() < 0.6) return null;
    let p;
    if (this.parts.length < MAX_PARTS) { p = newPart(); this.parts.push(p); }
    else { this.evict = (this.evict + 1) % MAX_PARTS; p = this.parts[this.evict]; }   // recycle in place
    p.type = type; p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.life = life; p.max = life; p.size = size; p.color = color;
    p.rot = rand(TAU); p.vr = rand(-12, 12); p.z = 0; p.vz = 0; p.drag = 4; p.grow = 0; p.a = 0; p.lw = 0; p.img = null;
    if (o) for (const k in o) p[k] = o[k];
    if (type === P_SMOKE) p.img = tinted(SOFT, smokeColor(color));
    else if (type === P_DOT || type === P_EMBER) p.img = tinted(DOT, color);
    return p;
  },
  light(x, y, r, life, img = GLOW.fire, a = 0.6) { if (Q.glow && this.lights.length < MAX_LIGHTS) this.lights.push({ x, y, r, life, max: life, img, a: a * (Settings.reducedFlash ? 0.5 : 1) * (0.4 + 0.6 * Settings.flash) }); },
  text(x, y, str, color, size = 18, o = {}) {
    let t;
    if (this.texts.length < MAX_TEXTS) { t = {}; this.texts.push(t); } else { this.tEvict = (this.tEvict + 1) % MAX_TEXTS; t = this.texts[this.tEvict]; }
    t.x = x + rand(-6, 6); t.y = y; t.vy = -70; t.str = String(str); t.color = color; t.size = size; t.life = 0.75; t.max = 0.75; t.pop = 1; t.crit = false; t.comic = false; t.rot = 0; t.owner = null; t.val = 0;
    for (const k in o) t[k] = o[k];
    return t;
  },
  comic(x, y, word, color = '#ffd23f') { this.text(x, y, word, color, 26, { comic: true, rot: rand(-0.25, 0.25), vy: -40, life: 0.7, max: 0.7 }); },
  arc(x1, y1, x2, y2, color = '#9fe8ff') {
    if (this.arcs.length >= MAX_ARCS) this.arcs.shift();
    const pts = [x1, y1], n = Math.max(3, Math.floor(Math.hypot(x2 - x1, y2 - y1) / 22));
    const nx = -(y2 - y1), ny = x2 - x1, l = Math.hypot(nx, ny) || 1;
    for (let i = 1; i < n; i++) { const t = i / n, j = rand(-14, 14); pts.push(lerp(x1, x2, t) + nx / l * j, lerp(y1, y2, t) + ny / l * j); }
    pts.push(x2, y2);
    this.arcs.push({ pts, life: 0.18, max: 0.18, color });
    this.light((x1 + x2) / 2, (y1 + y2) / 2, 90, 0.15, GLOW.xp, 0.5);
  },
  // ---- composite helpers ----
  muzzle(x, y, a, scale, hue) {
    const img = hue === 'gold' ? GLOW.gold : hue === 'cyan' ? GLOW.xp : hue === 'red' ? GLOW.red : GLOW.fire;
    this.light(x, y, 70 * scale, 0.07, img, 0.75);
    for (let i = 0; i < 3; i++) { const s = rand(-0.5, 0.5) + a, v = rand(200, 520); this.add(P_SPARK, x, y, Math.cos(s) * v, Math.sin(s) * v, rand(0.05, 0.12), 2, '#ffd27a', { drag: 10 }); }
    this.add(P_SMOKE, x + Math.cos(a) * 6, y + Math.sin(a) * 6, Math.cos(a) * 40, Math.sin(a) * 40, 0.35, 5 * scale, 'rgba(200,200,210,', { grow: 30, drag: 3 });
  },
  casing(x, y, a, shell) {
    const s = a + Math.PI / 2 + rand(-0.3, 0.3), v = rand(90, 160);
    this.add(P_CASING, x, y, Math.cos(s) * v, Math.sin(s) * v, rand(2, 3), shell ? 5 : 3.5, shell ? '#d23a2a' : '#e8b54a', { vz: rand(120, 180), drag: 3.5, vr: rand(-25, 25) });
  },
  impact(x, y, a, kind) {
    const back = a + Math.PI, n = kind === 'metal' ? 7 : 4;
    for (let i = 0; i < n; i++) { const s = back + rand(-1, 1), v = rand(150, kind === 'metal' ? 520 : 340); this.add(P_SPARK, x, y, Math.cos(s) * v, Math.sin(s) * v, rand(0.08, 0.2), kind === 'metal' ? 2.2 : 1.6, kind === 'metal' ? '#bfe9ff' : '#ffcf6b', { drag: 7 }); }
    if (kind === 'wall') for (let i = 0; i < 2; i++) this.add(P_SMOKE, x, y, Math.cos(back) * rand(20, 60) + rand(-20, 20), Math.sin(back) * rand(20, 60) + rand(-20, 20), rand(0.4, 0.7), rand(4, 7), 'rgba(170,165,155,', { grow: 22, drag: 3 });
    if (kind === 'wood') for (let i = 0; i < 3; i++) { const s = back + rand(-1, 1), v = rand(60, 200); this.add(P_DEBRIS, x, y, Math.cos(s) * v, Math.sin(s) * v, rand(1.5, 2.5), rand(2, 4), '#a8763c', { vz: rand(60, 150) }); }
    this.light(x, y, 26, 0.06, kind === 'metal' ? GLOW.white : GLOW.fire, 0.6);
  },
  hitBurst(x, y, a, color) {
    for (let i = 0; i < 5; i++) { const s = a + rand(-0.7, 0.7), v = rand(120, 380); this.add(P_DOT, x, y, Math.cos(s) * v, Math.sin(s) * v, rand(0.2, 0.4), rand(2.5, 4.5), i < 3 ? '#e8283c' : color, { drag: 6 }); }
    if (Q.level === 'high' || Math.random() < 0.5) this.add(P_FLASH, x, y, 0, 0, 0.07, 11, '#fff');
  },
  weaponHit(x, y, a, kind, color) {
    if (kind === 'shotgun') { for (let i = 0; i < 4; i++) { const s = a + rand(-0.9, 0.9), v = rand(150, 420); this.add(P_DOT, x, y, Math.cos(s) * v, Math.sin(s) * v, rand(0.2, 0.4), rand(4, 6), i % 2 ? '#e8283c' : color, { drag: 7 }); } }
    else if (kind === 'heavy') { this.add(P_RING, x, y, 0, 0, 0.18, 34, '#fff0b0', { lw: 4 }); for (let i = 0; i < 6; i++) { const s = a + rand(-0.5, 0.5), v = rand(300, 700); this.add(P_SPARK, x, y, Math.cos(s) * v, Math.sin(s) * v, rand(0.1, 0.22), 3, '#fff0b0', { drag: 6 }); } }
    else if (kind === 'rifle') { for (let i = 0; i < 3; i++) { const s = a + rand(-0.3, 0.3), v = rand(300, 600); this.add(P_SPARK, x, y, Math.cos(s) * v, Math.sin(s) * v, rand(0.08, 0.16), 2, '#ffe07a', { drag: 8 }); } }
    else if (kind === 'smg' || kind === 'dual') { for (let i = 0; i < 2; i++) { const s = a + rand(-0.8, 0.8), v = rand(150, 350); this.add(P_SPARK, x, y, Math.cos(s) * v, Math.sin(s) * v, 0.1, 1.5, '#ffb347', { drag: 8 }); } }
  },
  deathPop(x, y, color, big, a = 0) {
    const n = big ? 26 : 14;
    for (let i = 0; i < n; i++) { const s = rand(TAU), v = rand(100, big ? 520 : 380); this.add(P_DOT, x, y, Math.cos(s) * v + Math.cos(a) * 120, Math.sin(s) * v + Math.sin(a) * 120, rand(0.3, 0.65), rand(3, big ? 8 : 6), i % 3 ? '#d81f36' : color, { drag: 5 }); }
    for (let i = 0; i < (big ? 8 : 4); i++) { const s = rand(TAU), v = rand(80, 260); this.add(P_DEBRIS, x, y, Math.cos(s) * v, Math.sin(s) * v, rand(1.2, 2), rand(3, 5), color, { vz: rand(80, 200) }); }
    this.add(P_RING, x, y, 0, 0, 0.3, big ? 70 : 42, '#ffffff');
    this.add(P_FLASH, x, y, 0, 0, 0.12, big ? 60 : 34, '#fff');
    this.light(x, y, big ? 140 : 80, 0.15, GLOW.white, 0.35);
  },
  glassBurst(x, y, a) {
    for (let i = 0; i < 16; i++) { const s = (a || rand(TAU)) + rand(-1.1, 1.1), v = rand(80, 380); this.add(P_SHARD, x + rand(-14, 14), y + rand(-14, 14), Math.cos(s) * v, Math.sin(s) * v, rand(1.4, 2.4), rand(3, 7), i % 2 ? '#c8f0ff' : '#ffffff', { vz: rand(60, 200), drag: 3 }); }
    this.light(x, y, 70, 0.1, GLOW.xp, 0.4);
  },
  crateBurst(x, y) {
    for (let i = 0; i < 14; i++) { const s = rand(TAU), v = rand(80, 340); this.add(P_DEBRIS, x + rand(-10, 10), y + rand(-10, 10), Math.cos(s) * v, Math.sin(s) * v, rand(2, 3.2), rand(4, 9), i % 3 ? '#b07a3e' : '#6e4a22', { vz: rand(100, 260), drag: 3 }); }
    for (let i = 0; i < 5; i++) this.add(P_SMOKE, x + rand(-12, 12), y + rand(-12, 12), rand(-40, 40), rand(-40, 40), rand(0.5, 0.9), rand(8, 13), 'rgba(190,170,140,', { grow: 30 });
    if (G.game) G.game.shake(4);
  },
  explosion(x, y, r) {
    this.add(P_FLASH, x, y, 0, 0, 0.18, r * 1.3, '#fff2c0');
    this.add(P_RING, x, y, 0, 0, 0.35, r * 1.15, '#ffd27a', { lw: 8 });
    for (let i = 0; i < 22; i++) { const s = rand(TAU), v = rand(60, r * 4); this.add(P_EMBER, x, y, Math.cos(s) * v, Math.sin(s) * v, rand(0.25, 0.6), rand(6, 14), i % 3 ? '#ff8a1f' : '#ffd23f', { drag: 5 }); }
    for (let i = 0; i < 12; i++) { const s = rand(TAU), v = rand(30, r * 1.6); this.add(P_SMOKE, x, y, Math.cos(s) * v, Math.sin(s) * v, rand(0.7, 1.3), rand(12, 22), 'rgba(60,55,55,', { grow: 40, drag: 3.5 }); }
    for (let i = 0; i < 10; i++) { const s = rand(TAU), v = rand(120, 420); this.add(P_SPARK, x, y, Math.cos(s) * v, Math.sin(s) * v, rand(0.2, 0.45), 2.5, '#ffe7a0', { drag: 4 }); }
    this.light(x, y, r * 2.4, 0.3, GLOW.fire, 0.9);
  },
  distort(x, y, r) {
    this.add(P_RING, x, y, 0, 0, 0.32, r * 1.1, '#05060a', { lw: 16 });
    this.add(P_RING, x, y, 0, 0, 0.26, r, '#ffffff', { lw: 3 });
  },
  dust(x, y, n = 1, col = 'rgba(160,160,170,') { for (let i = 0; i < n; i++) this.add(P_SMOKE, x + rand(-5, 5), y + rand(-5, 5), rand(-25, 25), rand(-25, 25), rand(0.3, 0.5), rand(3, 5), col, { grow: 14, a: 0.35 }); },
  sparkle(x, y, color = '#7ff6ff', n = 6, spd = 160) { for (let i = 0; i < n; i++) { const s = rand(TAU), v = rand(40, spd); this.add(P_EMBER, x, y, Math.cos(s) * v, Math.sin(s) * v, rand(0.25, 0.5), rand(2, 4), color, { drag: 5 }); } },

  update(dt) {
    const ps = this.parts;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.life -= dt;
      if (p.life <= 0) { ps[i] = ps[ps.length - 1]; ps.pop(); continue; }
      if (p.type === P_DEBRIS || p.type === P_SHARD || p.type === P_CASING) {
        if (p.z > 0 || p.vz > 0) {
          p.vz -= 900 * dt; p.z += p.vz * dt; p.rot += p.vr * dt;
          if (p.z <= 0) { p.z = 0; if (Math.abs(p.vz) > 60) { p.vz = -p.vz * 0.4; p.vx *= 0.6; p.vy *= 0.6; p.vr *= 0.5; } else p.vz = 0; }
          const k = Math.exp(-0.6 * dt); p.vx *= k; p.vy *= k;
        } else { const k = Math.exp(-9 * dt); p.vx *= k; p.vy *= k; p.vr = 0; }
        const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt;
        if (solidAt(nx, p.y)) p.vx = -p.vx * 0.4; else p.x = nx;
        if (solidAt(p.x, ny)) p.vy = -p.vy * 0.4; else p.y = ny;
      } else {
        const d = Math.exp(-p.drag * dt); p.vx *= d; p.vy *= d; p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.grow) p.size += p.grow * dt;
      }
    }
    if (this.evict >= ps.length) this.evict = 0;
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i]; t.life -= dt; t.y += t.vy * dt; t.vy *= Math.exp(-3 * dt); t.pop = Math.max(0, t.pop - dt * 6);
      if (t.life <= 0) { this.texts[i] = this.texts[this.texts.length - 1]; this.texts.pop(); }
    }
    for (let i = this.arcs.length - 1; i >= 0; i--) { this.arcs[i].life -= dt; if (this.arcs[i].life <= 0) this.arcs.splice(i, 1); }
    for (let i = this.lights.length - 1; i >= 0; i--) { this.lights[i].life -= dt; if (this.lights[i].life <= 0) { this.lights[i] = this.lights[this.lights.length - 1]; this.lights.pop(); } }
  },
  // v: { x0, y0, x1, y1 (world cull rect), z (zoom), cx, cy (camera origin in world units) }
  drawGround(v) {
    const z = v.z;
    for (const p of this.parts) {
      if (p.type !== P_DEBRIS && p.type !== P_SHARD && p.type !== P_CASING) continue;
      if (p.x < v.x0 || p.x > v.x1 || p.y < v.y0 || p.y > v.y1) continue;
      const c = Math.cos(p.rot) * z, s = Math.sin(p.rot) * z;
      ctx.setTransform(c, s, -s, c, (p.x - v.cx) * z, (p.y - p.z * 0.25 - v.cy) * z);
      ctx.globalAlpha = Math.min(1, p.life / 0.5);
      ctx.fillStyle = p.color;
      if (p.type === P_SHARD) { ctx.beginPath(); ctx.moveTo(-p.size, -p.size * 0.4); ctx.lineTo(p.size, 0); ctx.lineTo(-p.size * 0.3, p.size * 0.6); ctx.fill(); }
      else if (p.type === P_CASING) { ctx.fillRect(-p.size, -p.size * 0.45, p.size * 2, p.size * 0.9); }
      else ctx.fillRect(-p.size, -p.size * 0.6, p.size * 2, p.size * 1.2);
      R.draws++;
    }
    ctx.globalAlpha = 1;
    ctx.setTransform(z, 0, 0, z, -v.cx * z, -v.cy * z);
  },
  drawAir(v) {
    const ps = this.parts;
    // normal blend: smoke + dots from sprites, rings as strokes
    for (const p of ps) {
      if (p.type !== P_SMOKE && p.type !== P_DOT && p.type !== P_RING) continue;
      if (p.x < v.x0 || p.x > v.x1 || p.y < v.y0 || p.y > v.y1) continue;
      const t = p.life / p.max;
      if (p.type === P_SMOKE) { ctx.globalAlpha = (p.a || 0.5) * t; const r = p.size * 1.6; ctx.drawImage(p.img, p.x - r, p.y - r, r * 2, r * 2); }
      else if (p.type === P_DOT) { ctx.globalAlpha = Math.min(1, t * 2); const r = p.size * (0.5 + t * 0.5); ctx.drawImage(p.img, p.x - r, p.y - r, r * 2, r * 2); }
      else { const k = 1 - t; ctx.strokeStyle = p.color; ctx.globalAlpha = t; ctx.lineWidth = (p.lw || 5) * t + 1; ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.2 + k * 0.8), 0, TAU); ctx.stroke(); }
      R.draws++;
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'lighter';
    // sparks: batched into one path per (colour, width, alpha band)
    const groups = this._groups || (this._groups = new Map());
    for (const arr of groups.values()) arr.length = 0;
    for (const p of ps) {
      if (p.type !== P_SPARK || p.x < v.x0 || p.x > v.x1 || p.y < v.y0 || p.y > v.y1) continue;
      const band = Math.min(2, Math.floor(Math.min(1, (p.life / p.max) * 1.5) * 3));
      const key = p.color + '|' + p.size + '|' + band;
      let arr = groups.get(key); if (!arr) { arr = []; groups.set(key, arr); }
      arr.push(p);
    }
    for (const [key, arr] of groups) {
      if (!arr.length) continue;
      const [col, size, band] = key.split('|');
      ctx.strokeStyle = col; ctx.lineWidth = +size; ctx.globalAlpha = (+band + 1) / 3;
      ctx.beginPath();
      for (const p of arr) { ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03); }
      ctx.stroke(); R.draws++;
    }
    for (const p of ps) {
      if (p.x < v.x0 || p.x > v.x1 || p.y < v.y0 || p.y > v.y1) continue;
      const t = p.life / p.max;
      if (p.type === P_EMBER) { ctx.globalAlpha = t; const r = p.size * t + 0.5; ctx.drawImage(p.img, p.x - r, p.y - r, r * 2, r * 2); R.draws++; }
      else if (p.type === P_FLASH && Q.glow) { const r = p.size * (1.4 - t * 0.4); ctx.globalAlpha = t * (Settings.reducedFlash ? 0.4 : 1) * (0.3 + 0.7 * Settings.flash); ctx.drawImage(GLOW.white, p.x - r, p.y - r, r * 2, r * 2); R.draws++; }
    }
    ctx.globalAlpha = 1;
    for (const l of this.lights) glow(l.img, l.x, l.y, l.r, (l.life / l.max) * l.a);
    for (const a of this.arcs) {
      const t = a.life / a.max, P = a.pts;
      ctx.globalAlpha = t; ctx.strokeStyle = a.color; ctx.lineWidth = 4 * t + 1;
      ctx.beginPath(); ctx.moveTo(P[0], P[1]); for (let i = 2; i < P.length; i += 2) ctx.lineTo(P[i], P[i + 1]); ctx.stroke();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke(); R.draws++;
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  },
  drawTexts(v) {
    if (!this.texts.length) return;
    const z = v.z, zb = Math.max(0.5, Math.round(z * 4) / 4);
    for (const t of this.texts) {
      if (t.x < v.x0 || t.x > v.x1 || t.y < v.y0 || t.y > v.y1) continue;
      const a = Math.min(1, t.life / 0.25), sc = (1 + t.pop * 0.6) / zb;
      const s = t.comic ? comicSprite(t.str, t.color, t.size * zb) : textSprite(t.str, t.size * zb, t.color, t.crit ? DISPLAY : BODY, 800, true);
      ctx.globalAlpha = a;
      if (t.rot) {
        const c = Math.cos(t.rot) * z, sn = Math.sin(t.rot) * z;
        ctx.setTransform(c, sn, -sn, c, (t.x - v.cx) * z, (t.y - v.cy) * z);
        ctx.drawImage(s.c, -s.w * sc / 2, -s.h * sc / 2, s.w * sc, s.h * sc);
        ctx.setTransform(z, 0, 0, z, -v.cx * z, -v.cy * z);
      } else ctx.drawImage(s.c, t.x - s.w * sc / 2, t.y - s.h * sc / 2, s.w * sc, s.h * sc);
      R.draws++;
    }
    ctx.globalAlpha = 1;
  },
};

const comicCache = new Map();
function comicSprite(word, color, size) {
  size = Math.round(size);
  const key = word + color + size;
  let s = comicCache.get(key);
  if (s) return s;
  const w = Math.ceil(word.length * size * 0.42 + 18) * 2 + 8, h = Math.ceil(size * 1.2) * 2 + 8;
  const c = makeCanvas(w, h), g = c.getContext('2d');
  g.translate(w / 2, h / 2);
  g.fillStyle = '#fff4c0'; g.strokeStyle = '#0a0a0d'; g.lineWidth = 3;
  const rx = w / 2 - 4, ry = h / 2 - 4;
  g.beginPath(); for (let i = 0; i < 18; i++) { const q = i / 18 * TAU, r = i % 2 ? 0.62 : 1; g.lineTo(Math.cos(q) * rx * r, Math.sin(q) * ry * r); } g.closePath(); g.fill(); g.stroke();
  g.font = `400 ${size}px ${DISPLAY}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
  g.lineWidth = 5; g.strokeText(word, 0, 2); g.fillStyle = color; g.fillText(word, 0, 2);
  s = { c, w, h };
  if (comicCache.size > 60) comicCache.clear();
  comicCache.set(key, s);
  return s;
}

// ---------- floor decals: bullet marks, scorch, splats, glass (sprite based ring buffer) ----------
const DECAL = {
  hole: (() => { const c = makeCanvas(16), g = c.getContext('2d'); g.fillStyle = '#0b0b0d'; g.beginPath(); g.arc(8, 8, 2.5, 0, TAU); g.fill(); g.strokeStyle = 'rgba(0,0,0,0.4)'; g.lineWidth = 1; g.beginPath(); g.moveTo(3, 8); g.lineTo(13, 9); g.moveTo(8, 4); g.lineTo(9, 12); g.stroke(); return c; })(),
  scorch: (() => { const c = makeCanvas(80), g = c.getContext('2d'); g.translate(40, 40); g.fillStyle = 'rgba(10,8,6,0.75)'; g.beginPath(); for (let k = 0; k < 10; k++) { const a = k / 10 * TAU, r = 30 + ((k * 7) % 5) * 5; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.fill(); return c; })(),
  splat: (() => { const c = makeCanvas(56, 44), g = c.getContext('2d'); g.translate(28, 22); g.fillStyle = '#7a0f1c'; g.beginPath(); g.ellipse(0, 0, 16, 11, 0, 0, TAU); g.fill(); for (let k = 0; k < 5; k++) { g.beginPath(); g.arc(Math.cos(k * 1.3) * 18, Math.sin(k * 1.3) * 12, 3 + (k % 3) * 2, 0, TAU); g.fill(); } return c; })(),
  glass: (() => { const c = makeCanvas(48), g = c.getContext('2d'); g.translate(24, 24); g.fillStyle = 'rgba(200,240,255,0.6)'; for (let k = 0; k < 8; k++) g.fillRect(Math.cos(k * 2.1) * 18, Math.sin(k * 1.7) * 18, 4, 2); return c; })(),
};
export const Decals = {
  list: [], cursor: 0, holes: 0,
  reset() { this.list.length = 0; this.cursor = 0; this.holes = 0; },
  add(type, x, y, rot, scale = 1) {
    const life = type === 'hole' ? 7 : type === 'glass' ? 30 : 22, cap = Q.decals;
    if (type === 'hole' && ++this.holes > cap * 0.35) { this.holes--; return; }
    let d;
    if (this.list.length < cap) { d = {}; this.list.push(d); } else { this.cursor = (this.cursor + 1) % this.list.length; d = this.list[this.cursor]; }
    d.type = type; d.x = x; d.y = y; d.rot = rot; d.scale = scale; d.life = life; d.max = life;
  },
  update(dt) { for (let i = this.list.length - 1; i >= 0; i--) { const d = this.list[i]; d.life -= dt; if (d.life <= 0) { if (d.type === 'hole') this.holes--; this.list[i] = this.list[this.list.length - 1]; this.list.pop(); } } if (this.cursor >= this.list.length) this.cursor = 0; },
  draw(v) {
    const z = v.z;
    for (const d of this.list) {
      if (d.x < v.x0 || d.x > v.x1 || d.y < v.y0 || d.y > v.y1) continue;
      const img = DECAL[d.type]; if (!img) continue;
      ctx.globalAlpha = Math.min(1, d.life / 2) * (d.type === 'hole' ? 0.8 : 0.7);
      const c = Math.cos(d.rot) * z * d.scale, s = Math.sin(d.rot) * z * d.scale;
      ctx.setTransform(c, s, -s, c, (d.x - v.cx) * z, (d.y - v.cy) * z);
      ctx.drawImage(img, -img.width / 2, -img.height / 2); R.draws++;
    }
    ctx.globalAlpha = 1;
    ctx.setTransform(z, 0, 0, z, -v.cx * z, -v.cy * z);
  },
};
