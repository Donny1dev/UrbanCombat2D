// Map rendering: static layer pre-rendered into cached chunks; destructibles drawn from sprites.
import { TILE, TAU, hash2 } from "../core/util.js";
import { ctx, R, GLOW, makeCanvas, rr } from "../core/canvas.js";
import { Q } from "../core/settings.js";
import { M, MW, MH, idx, inMap, objAt, INDOOR_FLOORS, F_ROAD, F_WALK, F_WOOD, F_TILE, F_CONC, F_LOT, F_ALLEY, F_CARPET, F_GRASS, O_NONE, O_WALL, O_GLASS, O_CRATE, O_BARREL, O_BORDER, O_BARRIER } from "../world/map.js";

const CHUNK = 12;
export const ChunkCache = {
  map: new Map(), scale: 1, version: -1, lighting: null,
  clear() { this.map.clear(); },
  // drop cached chunks whenever the map, zoom scale or lighting quality changes
  sync(scale) { if (scale !== this.scale || M.version !== this.version || Q.lighting !== this.lighting) { this.clear(); this.scale = scale; this.version = M.version; this.lighting = Q.lighting; } },
  get(cx, cy) {
    const key = cx * 1000 + cy;
    let c = this.map.get(key);
    if (c) { this.map.delete(key); this.map.set(key, c); return c; }   // refresh LRU order
    c = renderChunk(cx, cy, this.scale);
    this.map.set(key, c);
    if (this.map.size > 24) this.map.delete(this.map.keys().next().value);
    return c;
  },
};
const FLOOR_COL = { [F_ROAD]: '#24262c', [F_WALK]: '#474a53', [F_WOOD]: '#7a5233', [F_TILE]: '#c9c3b0', [F_CONC]: '#5b5c60', [F_LOT]: '#2b2d33', [F_ALLEY]: '#2f2a27', [F_CARPET]: '#3b4170', [F_GRASS]: '#2f5a34' };
const WALL_COL = [['#3e414b', '#555a67'], ['#5d3a31', '#7a4c3f'], ['#36495a', '#4c6378'], ['#2f5b5a', '#3f7774']];
function drawFloorTile(g, tx, ty, f) {
  const x = tx * TILE, y = ty * TILE, h = hash2(tx, ty), T = TILE;
  g.fillStyle = FLOOR_COL[f]; g.fillRect(x, y, T, T);
  switch (f) {
    case F_ROAD: case F_LOT: case F_ALLEY:
      g.fillStyle = 'rgba(255,255,255,0.035)';
      for (let k = 0; k < 6; k++) g.fillRect(x + hash2(tx * 7 + k, ty) * T, y + hash2(tx, ty * 5 + k) * T, 2, 2);
      if (h < 0.06) { g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x + 8, y + h * 300 % T); g.lineTo(x + 26, y + 20); g.lineTo(x + 40, y + 30); g.stroke(); }
      if (f === F_ALLEY && h > 0.85) { g.fillStyle = 'rgba(20,30,10,0.35)'; g.beginPath(); g.ellipse(x + 24, y + 24, 18, 11, h * 6, 0, TAU); g.fill(); }
      break;
    case F_WALK:
      g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(x, y, T, 2); g.fillRect(x, y, 2, T);
      g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(x + 2, y + 2, T - 2, 2);
      break;
    case F_WOOD:
      for (let k = 0; k < 4; k++) {
        g.fillStyle = k % 2 ? 'rgba(0,0,0,0.10)' : 'rgba(255,220,170,0.05)'; g.fillRect(x, y + k * 12, T, 12);
        g.fillStyle = 'rgba(30,15,5,0.45)'; g.fillRect(x, y + k * 12, T, 1.5);
        g.fillRect(x + ((hash2(tx, ty * 4 + k) * 4) | 0) * 12, y + k * 12, 1.5, 12);
      }
      break;
    case F_TILE:
      g.fillStyle = (tx + ty) % 2 ? '#d9d3bf' : '#a9c7c2'; g.fillRect(x, y, T, T);
      g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(x, y, T, 1.5); g.fillRect(x, y, 1.5, T);
      break;
    case F_CONC:
      g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(x, y, T, 1); g.fillRect(x, y, 1, T);
      if (h < 0.18) { g.fillStyle = 'rgba(25,20,15,0.25)'; g.beginPath(); g.arc(x + h * 200 % T, y + 24, 6 + h * 40, 0, TAU); g.fill(); }
      if (h > 0.93) { g.fillStyle = 'rgba(255,200,40,0.55)'; for (let k = 0; k < 4; k++) g.fillRect(x + k * 12, y + 20, 7, 8); }
      break;
    case F_CARPET:
      g.fillStyle = 'rgba(255,255,255,0.05)'; if ((tx + ty) % 2) g.fillRect(x + 8, y + 8, T - 16, T - 16);
      break;
    case F_GRASS:
      g.fillStyle = 'rgba(120,200,90,0.18)';
      for (let k = 0; k < 7; k++) g.fillRect(x + hash2(tx + k, ty * 3) * T, y + hash2(tx * 3, ty + k) * T, 2, 5);
      break;
  }
}
function drawProp(g, p) {
  const { x, y, w, h } = p;
  g.lineJoin = 'round';
  if (p.type === 'car') {
    g.save(); g.translate(x + w / 2, y + h / 2);
    if (!p.horiz) g.rotate(Math.PI / 2);
    if (p.flip) g.rotate(Math.PI);
    const L = (p.horiz ? w : h) - 8, W = (p.horiz ? h : w) - 10;
    g.fillStyle = 'rgba(0,0,0,0.35)'; rr(g, -L / 2 + 5, -W / 2 + 7, L, W, 12); g.fill();
    g.fillStyle = p.wreck ? '#3a332e' : p.color; g.strokeStyle = '#0c0d10'; g.lineWidth = 3;
    rr(g, -L / 2, -W / 2, L, W, 12); g.fill(); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.18)'; rr(g, -L / 2 + 6, -W / 2 + 4, L - 12, 6, 3); g.fill();
    g.fillStyle = '#1a2233'; rr(g, L * 0.08, -W / 2 + 6, L * 0.2, W - 12, 5); g.fill();
    g.fillStyle = '#243049'; rr(g, -L * 0.36, -W / 2 + 7, L * 0.14, W - 14, 4); g.fill();
    g.fillStyle = p.wreck ? '#2a2420' : 'rgba(0,0,0,0.12)'; rr(g, -L * 0.2, -W / 2 + 7, L * 0.27, W - 14, 4); g.fill();
    g.fillStyle = p.wreck ? '#553' : '#fff4c0'; g.fillRect(L / 2 - 5, -W / 2 + 5, 4, 9); g.fillRect(L / 2 - 5, W / 2 - 14, 4, 9);
    g.fillStyle = '#b3202c'; g.fillRect(-L / 2 + 1, -W / 2 + 5, 4, 8); g.fillRect(-L / 2 + 1, W / 2 - 13, 4, 8);
    if (p.wreck) { g.fillStyle = 'rgba(0,0,0,0.5)'; g.beginPath(); g.arc(-L * 0.1, 0, W * 0.35, 0, TAU); g.fill(); }
    g.restore();
  } else if (p.type === 'dumpster') {
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x + 8, y + 10, w - 6, h - 6);
    g.fillStyle = p.col; g.strokeStyle = '#0c0d10'; g.lineWidth = 3; rr(g, x + 3, y + 3, w - 6, h - 6, 4); g.fill(); g.stroke();
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x + 6, y + h / 2 - 2, w - 12, 4);
    g.fillStyle = 'rgba(255,255,255,0.15)'; g.fillRect(x + 6, y + 7, w - 12, 3);
  } else if (p.type === 'shelf') {
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x + 7, y + 9, w - 4, h - 4);
    g.fillStyle = '#3d5368'; g.strokeStyle = '#0c0d10'; g.lineWidth = 3; g.fillRect(x + 4, y + 2, w - 8, h - 4); g.strokeRect(x + 4, y + 2, w - 8, h - 4);
    const cols = ['#a0743f', '#7a8f3c', '#b85b3a'];
    for (let k = 0; k < h / TILE; k++) { g.fillStyle = cols[(k + p.hue) % 3]; g.fillRect(x + 9, y + 8 + k * TILE, w - 18, TILE - 16); g.strokeStyle = 'rgba(0,0,0,0.4)'; g.lineWidth = 1.5; g.strokeRect(x + 9, y + 8 + k * TILE, w - 18, TILE - 16); }
  } else if (p.type === 'desk' || p.type === 'counter' || p.type === 'bench') {
    const col = p.type === 'desk' ? '#8a5f3a' : p.type === 'bench' ? '#6b4b2f' : p.col;
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x + 7, y + 10, w - 6, h - 8);
    g.fillStyle = col; g.strokeStyle = '#0c0d10'; g.lineWidth = 3; rr(g, x + 3, y + 5, w - 6, h - 10, 3); g.fill(); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.14)'; g.fillRect(x + 6, y + 8, w - 12, 3);
    if (p.type === 'desk') { g.fillStyle = '#1d2230'; g.fillRect(x + w / 2 - 12, y + 12, 22, 14); g.fillStyle = '#5fd0ff'; g.fillRect(x + w / 2 - 10, y + 14, 18, 10); g.fillStyle = '#ddd'; g.fillRect(x + 10, y + 16, 12, 9); }
    if (p.type === 'bench') { g.fillStyle = 'rgba(0,0,0,0.3)'; for (let k = 1; k < 4; k++) g.fillRect(x + 3, y + 5 + k * (h - 10) / 4, w - 6, 1.5); }
  } else if (p.type === 'planter') {
    g.fillStyle = '#5b5e66'; g.strokeStyle = '#0c0d10'; g.lineWidth = 3; rr(g, x + 3, y + 4, w - 6, h - 8, 5); g.fill(); g.stroke();
    g.fillStyle = '#3f7a3a'; for (let k = 0; k < 4; k++) { g.beginPath(); g.arc(x + 14 + k * 22, y + h / 2, 10, 0, TAU); g.fill(); }
  } else if (p.type === 'fountain') {
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.arc(x + w / 2 + 5, y + h / 2 + 7, w / 2 - 2, 0, TAU); g.fill();
    g.fillStyle = '#6a6d76'; g.strokeStyle = '#0c0d10'; g.lineWidth = 3; g.beginPath(); g.arc(x + w / 2, y + h / 2, w / 2 - 3, 0, TAU); g.fill(); g.stroke();
    g.fillStyle = '#2a7fa8'; g.beginPath(); g.arc(x + w / 2, y + h / 2, w / 2 - 12, 0, TAU); g.fill();
    g.fillStyle = 'rgba(200,240,255,0.5)'; g.beginPath(); g.arc(x + w / 2, y + h / 2, 10, 0, TAU); g.fill();
  }
}
function drawMark(g, m) {
  if (m.t === 'hdash') { g.fillStyle = 'rgba(255,200,60,0.55)'; for (let x = m.x0 + 12; x < m.x1 - 24; x += 48) g.fillRect(x, m.y - 2, 24, 4); }
  else if (m.t === 'vdash') { g.fillStyle = 'rgba(255,200,60,0.55)'; for (let y = m.y0 + 12; y < m.y1 - 24; y += 48) g.fillRect(m.x - 2, y, 4, 24); }
  else if (m.t === 'hcross') { g.fillStyle = 'rgba(235,235,235,0.32)'; for (let k = 0; k < 4 * TILE; k += 16) g.fillRect(m.x + 6, m.y + k + 3, TILE - 12, 9); }
  else if (m.t === 'vcross') { g.fillStyle = 'rgba(235,235,235,0.32)'; for (let k = 0; k < 4 * TILE; k += 16) g.fillRect(m.x + k + 3, m.y + 6, 9, TILE - 12); }
  else if (m.t === 'pline') { g.fillStyle = 'rgba(240,240,240,0.4)'; g.fillRect(m.x - 1.5, m.y + 4, 3, m.h - 8); }
}
function renderChunk(cx, cy, scale) {
  const size = CHUNK * TILE, c = makeCanvas(Math.ceil(size * scale));
  const g = c.getContext('2d');
  g.scale(scale, scale); g.translate(-cx * size, -cy * size);
  const tx0 = cx * CHUNK - 1, ty0 = cy * CHUNK - 1, tx1 = tx0 + CHUNK + 2, ty1 = ty0 + CHUNK + 2;
  for (let ty = ty0; ty < ty1; ty++) for (let tx = tx0; tx < tx1; tx++) if (inMap(tx, ty)) drawFloorTile(g, tx, ty, M.floor[idx(tx, ty)]);
  const bx0 = cx * size - TILE * 5, by0 = cy * size - TILE * 5, bx1 = bx0 + size + TILE * 10, by1 = by0 + size + TILE * 10;
  for (const m of M.marks) drawMark(g, m);
  // indoor dimming + light pools
  for (let ty = ty0; ty < ty1; ty++) for (let tx = tx0; tx < tx1; tx++) {
    if (!inMap(tx, ty)) continue;
    if (!INDOOR_FLOORS.has(M.floor[idx(tx, ty)])) { g.fillStyle = 'rgba(10,20,45,0.28)'; g.fillRect(tx * TILE, ty * TILE, TILE, TILE); }
    else { g.fillStyle = 'rgba(30,15,5,0.22)'; g.fillRect(tx * TILE, ty * TILE, TILE, TILE); }
  }
  g.globalCompositeOperation = 'lighter';
  if (Q.lighting) for (const l of M.lights) {
    if (l.x + l.r < bx0 || l.x - l.r > bx1 || l.y + l.r < by0 || l.y - l.r > by1) continue;
    g.globalAlpha = l.kind === 'warm' ? 0.16 : 0.12;
    g.drawImage(l.kind === 'warm' ? GLOW.warm : GLOW.cool, l.x - l.r, l.y - l.r, l.r * 2, l.r * 2);
  }
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  // wall + prop shadows
  g.fillStyle = 'rgba(0,0,0,0.38)';
  for (let ty = ty0; ty < ty1; ty++) for (let tx = tx0; tx < tx1; tx++) {
    const o = objAt(tx, ty);
    if (o === O_WALL || o === O_BORDER) g.fillRect(tx * TILE + 7, ty * TILE + 9, TILE, TILE);
  }
  for (const p of M.props) if (p.x < bx1 && p.x + p.w > bx0 && p.y < by1 && p.y + p.h > by0) drawProp(g, p);
  // walls (fountain tiles are drawn by their prop)
  const fountain = new Set();
  for (const p of M.props) if (p.type === 'fountain') for (let j = 0; j < p.h / TILE; j++) for (let i = 0; i < p.w / TILE; i++) fountain.add(idx(p.x / TILE + i, p.y / TILE + j));
  for (let ty = ty0; ty < ty1; ty++) for (let tx = tx0; tx < tx1; tx++) {
    const o = objAt(tx, ty);
    if (o !== O_WALL && o !== O_BORDER) continue;
    if (fountain.has(idx(tx, ty))) continue;
    const [base, top] = WALL_COL[o === O_BORDER ? 0 : M.wcol[idx(tx, ty)]] || WALL_COL[0];
    const x = tx * TILE, y = ty * TILE;
    g.fillStyle = base; g.fillRect(x, y, TILE, TILE);
    g.fillStyle = top; g.fillRect(x + 3, y + 3, TILE - 6, TILE - 8);
    if (hash2(tx, ty) < 0.3) { g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(x + 10, y + 12, 14, 8); }
    g.fillStyle = '#101116';
    const wallish = (a, b) => { const q = objAt(a, b); return q === O_WALL || q === O_BORDER || q === O_GLASS; };
    if (!wallish(tx, ty - 1)) g.fillRect(x, y, TILE, 4);
    if (!wallish(tx, ty + 1)) g.fillRect(x, y + TILE - 6, TILE, 6);
    if (!wallish(tx - 1, ty)) g.fillRect(x, y, 4, TILE);
    if (!wallish(tx + 1, ty)) g.fillRect(x + TILE - 4, y, 4, TILE);
  }
  return c;
}
export function drawWorldStatic(camX, camY, vw, vh) {
  const size = CHUNK * TILE;
  const cx0 = Math.max(0, Math.floor(camX / size)), cy0 = Math.max(0, Math.floor(camY / size));
  const cx1 = Math.min(Math.ceil(MW / CHUNK) - 1, Math.floor((camX + vw) / size)), cy1 = Math.min(Math.ceil(MH / CHUNK) - 1, Math.floor((camY + vh) / size));
  for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) { ctx.drawImage(ChunkCache.get(cx, cy), cx * size, cy * size, size, size); R.draws++; }
}
// ---------- dynamic tiles: glass, crates, barrels, barriers (sprite based) ----------
function sprite(draw) { const c = makeCanvas(TILE + 12), g = c.getContext('2d'); g.lineJoin = 'round'; draw(g); return c; }
const CRATE = [0, 1, 2].map(stage => sprite(g => {
  g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(8, 10, TILE - 8, TILE - 8);
  g.fillStyle = '#b07a3e'; g.strokeStyle = '#1a0f06'; g.lineWidth = 3;
  g.fillRect(4, 4, TILE - 8, TILE - 8); g.strokeRect(4, 4, TILE - 8, TILE - 8);
  g.strokeStyle = '#6e4a22'; g.lineWidth = 4;
  g.beginPath(); g.moveTo(8, 8); g.lineTo(TILE - 8, TILE - 8); g.moveTo(TILE - 8, 8); g.lineTo(8, TILE - 8); g.stroke();
  g.fillStyle = 'rgba(255,230,180,0.25)'; g.fillRect(6, 6, TILE - 12, 3);
  if (stage) { g.strokeStyle = '#2a1608'; g.lineWidth = 2; g.beginPath(); g.moveTo(12, 30); g.lineTo(22, 22); g.lineTo(20, 14); if (stage > 1) { g.moveTo(36, 12); g.lineTo(30, 26); g.lineTo(38, 36); } g.stroke(); }
}));
const BARREL = [false, true].map(hot => sprite(g => {
  const c = TILE / 2;
  g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.arc(c + 5, c + 7, 18, 0, TAU); g.fill();
  g.fillStyle = hot ? '#ff7a3a' : '#d9452f'; g.strokeStyle = '#1a0806'; g.lineWidth = 3;
  g.beginPath(); g.arc(c, c, 18, 0, TAU); g.fill(); g.stroke();
  g.strokeStyle = '#ffd23f'; g.lineWidth = 3; g.beginPath(); g.arc(c, c, 12, 0, TAU); g.stroke();
  g.fillStyle = '#1a0806'; g.beginPath(); g.arc(c + 5, c - 5, 3.5, 0, TAU); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.arc(c - 6, c - 7, 4, 0, TAU); g.fill();
}));
const BARRIER = [0, 1].map(enemy => sprite(g => {
  g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(6, 9, TILE - 4, TILE - 6);
  g.fillStyle = enemy ? '#5a3a1a' : '#2f4f5f'; g.strokeStyle = '#0b0b0f'; g.lineWidth = 3;
  rr(g, 2, 3, TILE - 4, TILE - 6, 4); g.fill(); g.stroke();
  g.fillStyle = enemy ? '#ffd23f' : '#2ef2ff';
  for (let k = 0; k < 3; k++) { g.save(); g.translate(8 + k * 14, 8); g.rotate(0.6); g.fillRect(0, 0, 4, 18); g.restore(); }
  g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(6, 6, TILE - 12, 3);
}));
export function drawDynamicTiles(camX, camY, vw, vh, time) {
  const tx0 = Math.max(0, Math.floor(camX / TILE)), ty0 = Math.max(0, Math.floor(camY / TILE));
  const tx1 = Math.min(MW - 1, Math.floor((camX + vw) / TILE)), ty1 = Math.min(MH - 1, Math.floor((camY + vh) / TILE));
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
    const i = idx(tx, ty), o = M.obj[i];
    if (o !== O_GLASS && o !== O_CRATE && o !== O_BARREL && o !== O_BARRIER) continue;
    const x = tx * TILE, y = ty * TILE;
    if (o === O_GLASS) {
      const horiz = objAt(tx - 1, ty) !== O_NONE || objAt(tx + 1, ty) !== O_NONE;
      ctx.fillStyle = '#101116';
      if (horiz) { ctx.fillRect(x, y + 14, TILE, 20); ctx.fillStyle = 'rgba(150,220,255,0.55)'; ctx.fillRect(x, y + 18, TILE, 12); ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillRect(x + 6, y + 20, 14, 3); }
      else { ctx.fillRect(x + 14, y, 20, TILE); ctx.fillStyle = 'rgba(150,220,255,0.55)'; ctx.fillRect(x + 18, y, 12, TILE); ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillRect(x + 20, y + 6, 3, 14); }
    } else if (o === O_CRATE) {
      const dmg = 1 - M.hp[i] / 45;
      ctx.drawImage(CRATE[dmg > 0.6 ? 2 : dmg > 0.3 ? 1 : 0], x, y);
    } else if (o === O_BARREL) {
      ctx.drawImage(BARREL[M.hp[i] < 22 && Math.sin(time * 20) > 0 ? 1 : 0], x, y);
    } else {
      ctx.drawImage(BARRIER[M.wcol[i] === 9 ? 1 : 0], x, y);
      const f = Math.max(0, Math.min(1, M.hp[i] / (M.hpMax[i] || 1)));
      if (f < 1) { ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x + 6, y - 6, TILE - 12, 4); ctx.fillStyle = M.wcol[i] === 9 ? '#ffd23f' : '#2ef2ff'; ctx.fillRect(x + 6, y - 6, (TILE - 12) * f, 4); }
    }
    R.draws++;
  }
}
