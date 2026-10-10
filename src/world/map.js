// City generation, tile collision, line of sight and the BFS flow field enemies follow. No rendering here.
import { TILE, TAU, clamp, rand, randi, pick } from "../core/util.js";
export const NB = 5, CELL = 20, ROAD = 4, MO = 1;           // blocks per side, cell size, road width, outer margin
export const MW = NB * CELL + ROAD + MO * 2, MH = MW;
export const WORLD_W = MW * TILE, WORLD_H = MH * TILE;
// floors
export const F_ROAD = 0, F_WALK = 1, F_WOOD = 2, F_TILE = 3, F_CONC = 4, F_LOT = 5, F_ALLEY = 6, F_CARPET = 7, F_GRASS = 8;
// objects (anything non-zero blocks movement and bullets)
export const O_NONE = 0, O_WALL = 1, O_GLASS = 2, O_CRATE = 3, O_BARREL = 4, O_METAL = 5, O_FURN = 6, O_BORDER = 7, O_BARRIER = 8;
export const INDOOR_FLOORS = new Set([F_WOOD, F_TILE, F_CONC, F_CARPET]);

export const M = {
  floor: new Uint8Array(MW * MH), obj: new Uint8Array(MW * MH), hp: new Float32Array(MW * MH), hpMax: new Float32Array(MW * MH),
  wcol: new Uint8Array(MW * MH), flow: new Uint16Array(MW * MH), props: [], lights: [], marks: [],
  doors: [], spawnPts: [], dirty: true, flowTx: -1, flowTy: -1, flowT: 0, startX: 0, startY: 0, version: 0, arena: false,
};
export const idx = (tx, ty) => ty * MW + tx;
export const inMap = (tx, ty) => tx >= 0 && ty >= 0 && tx < MW && ty < MH;
export const objAt = (tx, ty) => inMap(tx, ty) ? M.obj[idx(tx, ty)] : O_BORDER;
export const solidAt = (x, y) => objAt(Math.floor(x / TILE), Math.floor(y / TILE)) !== O_NONE;

export function setT(tx, ty, f, o = O_NONE, wc = 0) {
  if (!inMap(tx, ty)) return;
  const i = idx(tx, ty);
  if (f !== null) M.floor[i] = f;
  M.obj[i] = o; M.wcol[i] = wc;
  M.hp[i] = o === O_CRATE ? 45 : o === O_BARREL ? 22 : o === O_GLASS ? 1 : 0;
}
function fillRect(x, y, w, h, f, o = O_NONE, wc = 0) { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) setT(i, j, f, o, wc); }
function room(x, y, w, h, f, wc) {   // floor inside, walls on border
  fillRect(x, y, w, h, f);
  for (let i = x; i < x + w; i++) { setT(i, y, f, O_WALL, wc); setT(i, y + h - 1, f, O_WALL, wc); }
  for (let j = y; j < y + h; j++) { setT(x, j, f, O_WALL, wc); setT(x + w - 1, j, f, O_WALL, wc); }
}
function door(x, y, w, h, f, outward = true) {
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) { setT(i, j, f); M.doors.push([i, j]); }
}
function glassRun(x, y, w, h) { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (objAt(i, j) === O_WALL) setT(i, j, null, O_GLASS); }
function prop(type, tx, ty, w, h, extra = {}, o = O_FURN) {
  fillRect(tx, ty, w, h, null, o);
  for (let j = ty; j < ty + h; j++) for (let i = tx; i < tx + w; i++) M.floor[idx(i, j)] = M.floor[idx(i, j)];
  M.props.push(Object.assign({ type, x: tx * TILE, y: ty * TILE, w: w * TILE, h: h * TILE }, extra));
}
function freeRect(x, y, w, h) { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (objAt(i, j) !== O_NONE) return false; return true; }
function scatter(x, y, w, h, n, types) {
  for (let k = 0; k < n * 4 && n > 0; k++) {
    const tx = randi(x, x + w - 1), ty = randi(y, y + h - 1);
    if (objAt(tx, ty) !== O_NONE) continue;
    const t = pick(types);
    setT(tx, ty, null, t);
    if (t === O_CRATE && rand() < 0.4 && objAt(tx + 1, ty) === O_NONE && tx + 1 < x + w) setT(tx + 1, ty, null, O_CRATE);
    n--;
  }
}
function light(tx, ty, r, kind) { M.lights.push({ x: tx * TILE, y: ty * TILE, r, kind }); }
const CAR_COLS = ['#c8423a', '#3a7bd5', '#e0b23c', '#4aa36b', '#8c8f99', '#7b4fc9', '#e6e6e6', '#d8742a'];
function car(tx, ty, horiz) {
  const w = horiz ? 4 : 2, h = horiz ? 2 : 4;
  if (!freeRect(tx, ty, w, h)) return false;
  prop('car', tx, ty, w, h, { horiz, color: pick(CAR_COLS), flip: rand() < 0.5, wreck: rand() < 0.3 }, O_METAL);
  return true;
}

// ---- block builders (x,y = inner 14x14 origin) ----
const BUILD = {
  warehouse(x, y) {
    room(x, y, 14, 14, F_CONC, 2);
    const sides = ['n', 's', 'w', 'e'].sort(() => rand() - 0.5).slice(0, randi(2, 3));
    for (const s of sides) {
      const p = randi(3, 8);
      if (s === 'n') door(x + p, y, 3, 1, F_CONC); if (s === 's') door(x + p, y + 13, 3, 1, F_CONC);
      if (s === 'w') door(x, y + p, 1, 3, F_CONC); if (s === 'e') door(x + 13, y + p, 1, 3, F_CONC);
    }
    for (const sx of [x + 3, x + 7, x + 10]) if (rand() < 0.8) prop('shelf', sx, y + randi(3, 4), 1, randi(4, 6), { hue: randi(0, 2) });
    scatter(x + 1, y + 1, 12, 12, randi(8, 13), [O_CRATE, O_CRATE, O_CRATE, O_BARREL]);
    light(x + 4, y + 4, 260, 'warm'); light(x + 10, y + 10, 260, 'warm'); light(x + 10, y + 4, 200, 'warm');
  },
  office(x, y) {
    const wc = 0, fl = pick([F_WOOD, F_CARPET]);
    room(x, y, 14, 14, fl, wc);
    fillRect(x + 1, y + 6, 12, 2, F_TILE);                      // corridor
    for (let i = x; i < x + 14; i++) { setT(i, y + 5, fl, O_WALL, wc); setT(i, y + 8, fl, O_WALL, wc); }
    for (let j = y; j <= y + 5; j++) { setT(x + 5, j, fl, O_WALL, wc); setT(x + 9, j, fl, O_WALL, wc); }
    for (let j = y + 8; j < y + 14; j++) setT(x + 7, j, fl, O_WALL, wc);
    door(x, y + 6, 1, 2, F_TILE); door(x + 13, y + 6, 1, 2, F_TILE);          // corridor exits
    door(x + 2, y + 5, 2, 1, F_TILE); door(x + 6, y + 5, 2, 1, F_TILE); door(x + 11, y + 5, 2, 1, F_TILE);
    door(x + 3, y + 8, 2, 1, F_TILE); door(x + 10, y + 8, 2, 1, F_TILE);
    door(x + randi(2, 4), y + 13, 2, 1, fl);                                   // side entrance
    glassRun(x + 1, y, 3, 1); glassRun(x + 6, y, 2, 1); glassRun(x + 10, y, 3, 1);
    glassRun(x + 9, y + 13, 3, 1); glassRun(x, y + 2, 1, 2); glassRun(x + 13, y + 10, 1, 2);
    const desks = [[x + 2, y + 2], [x + 6, y + 2], [x + 10, y + 2], [x + 2, y + 10], [x + 9, y + 11]];
    for (const [dx, dy] of desks) if (rand() < 0.85 && freeRect(dx, dy, 2, 1)) prop('desk', dx, dy, 2, 1);
    scatter(x + 1, y + 9, 12, 4, randi(1, 3), [O_CRATE]);
    light(x + 3, y + 3, 170, 'warm'); light(x + 7, y + 3, 150, 'warm'); light(x + 11, y + 3, 170, 'warm');
    light(x + 4, y + 11, 190, 'warm'); light(x + 10, y + 11, 190, 'warm'); light(x + 7, y + 7, 160, 'cool');
  },
  shops(x, y) {
    const front = rand() < 0.5 ? 'n' : 's';
    const cuts = [[x, 5], [x + 4, 6], [x + 9, 5]];
    for (const [sx, w] of cuts) {
      const fl = pick([F_TILE, F_WOOD]), wc = 3;
      room(sx, y, w, 14, fl, wc);
      const fy = front === 'n' ? y : y + 13, by = front === 'n' ? y + 13 : y;
      const wallY = front === 'n' ? y + 9 : y + 4;                           // back-room divider
      for (let i = sx; i < sx + w; i++) setT(i, wallY, fl, O_WALL, wc);
      door(sx + 1, wallY, 2, 1, fl);
      glassRun(sx + 1, fy, w - 2, 1);
      door(sx + Math.floor(w / 2) - 1 + (w > 5 ? 1 : 0), fy, 2, 1, fl);
      if (rand() < 0.7) door(sx + w - 3, by, 2, 1, F_CONC);
      const cy = front === 'n' ? y + 6 : y + 7;
      if (freeRect(sx + 2, cy, w - 3, 1)) prop('counter', sx + 2, cy, Math.max(1, w - 3), 1, { col: pick(['#b8432f', '#2f8fb8', '#c49a2a']) });
      const bry = front === 'n' ? y + 10 : y + 1;
      scatter(sx + 1, bry, w - 2, 3, randi(1, 3), [O_CRATE, O_CRATE, O_BARREL]);
      light(sx + w / 2, front === 'n' ? y + 4 : y + 10, 150, 'cool'); light(sx + w / 2, bry + 1.5, 110, 'warm');
    }
  },
  parking(x, y) {
    fillRect(x, y, 14, 14, F_LOT);
    for (let r = 0; r < 2; r++) {
      const ry = y + 1 + r * 7;
      for (let c = 0; c < 6; c++) {
        M.marks.push({ t: 'pline', x: (x + 1 + c * 2) * TILE, y: ry * TILE, h: 4 * TILE });
        if (rand() < 0.55) car(x + 1 + c * 2, ry, false);
      }
      M.marks.push({ t: 'pline', x: (x + 13) * TILE, y: ry * TILE, h: 4 * TILE });
    }
    if (freeRect(x + 11, y + 5, 2, 2)) { room(x + 11, y + 5, 2, 2, F_LOT, 0); }
    scatter(x, y + 5, 14, 2, randi(2, 4), [O_BARREL, O_CRATE]);
    light(x + 3, y + 7, 240, 'cool'); light(x + 11, y + 7, 240, 'cool');
  },
  alley(x, y) {
    room(x, y, 5, 14, pick([F_WOOD, F_CONC]), 1);
    room(x + 8, y, 6, 14, pick([F_WOOD, F_TILE]), 1);
    fillRect(x + 5, y, 3, 14, F_ALLEY);
    setT(x, y + 7, null, O_WALL, 1);
    for (let i = x; i < x + 5; i++) setT(i, y + 6, M.floor[idx(x + 1, y + 1)], O_WALL, 1);
    for (let i = x + 8; i < x + 14; i++) setT(i, y + 7, M.floor[idx(x + 9, y + 1)], O_WALL, 1);
    door(x + 4, y + 2, 1, 2, M.floor[idx(x + 1, y + 1)]); door(x + 4, y + 9, 1, 2, M.floor[idx(x + 1, y + 9)]);
    door(x + 8, y + 3, 1, 2, M.floor[idx(x + 9, y + 1)]); door(x + 8, y + 10, 1, 2, M.floor[idx(x + 9, y + 9)]);
    door(x + 1, y + 6, 2, 1, M.floor[idx(x + 1, y + 1)]); door(x + 10, y + 7, 2, 1, M.floor[idx(x + 9, y + 1)]);
    door(x, y + 10, 1, 2, M.floor[idx(x + 1, y + 9)]); door(x + 13, y + 2, 1, 2, M.floor[idx(x + 9, y + 1)]);
    glassRun(x + 1, y, 3, 1); glassRun(x + 10, y + 13, 3, 1);
    prop('dumpster', x + 5, y + 5, 1, 2, { col: pick(['#2f6b3f', '#2f4f7a']) }, O_METAL);
    prop('dumpster', x + 7, y + 6, 1, 2, { col: pick(['#2f6b3f', '#7a3f2f']) }, O_METAL);
    scatter(x + 5, y + 1, 3, 12, 2, [O_CRATE, O_BARREL]);
    scatter(x + 1, y + 1, 3, 4, 2, [O_CRATE]); scatter(x + 9, y + 8, 4, 4, 2, [O_CRATE]);
    light(x + 6.5, y + 3, 140, 'warm'); light(x + 6.5, y + 11, 140, 'warm');
    light(x + 2.5, y + 3, 120, 'warm'); light(x + 11, y + 11, 130, 'warm');
  },
  plaza(x, y, center) {
    fillRect(x, y, 14, 14, F_WALK);
    fillRect(x + 1, y + 1, 4, 4, F_GRASS); fillRect(x + 9, y + 1, 4, 4, F_GRASS);
    fillRect(x + 1, y + 9, 4, 4, F_GRASS); fillRect(x + 9, y + 9, 4, 4, F_GRASS);
    prop('fountain', x + 6, y + 6, 2, 2, {}, O_WALL);
    prop('bench', x + 2, y + 6, 2, 1); prop('bench', x + 10, y + 7, 2, 1);
    prop('planter', x + 6, y + 2, 2, 1); prop('planter', x + 6, y + 11, 2, 1);
    if (!center) scatter(x + 1, y + 1, 12, 12, randi(3, 5), [O_CRATE, O_BARREL]);
    else { setT(x + 2, y + 2, null, O_CRATE); setT(x + 11, y + 11, null, O_BARREL); setT(x + 11, y + 2, null, O_CRATE); }
    light(x + 7, y + 7, 300, 'cool');
  },
};

export function generateMap() {
  M.arena = false;
  M.floor.fill(F_ROAD); M.obj.fill(0); M.hp.fill(0); M.wcol.fill(0);
  M.props = []; M.lights = []; M.marks = []; M.doors = []; M.spawnPts = [];
  for (let i = 0; i < MW; i++) { setT(i, 0, F_ROAD, O_BORDER); setT(i, MH - 1, F_ROAD, O_BORDER); setT(0, i, F_ROAD, O_BORDER); setT(MW - 1, i, F_ROAD, O_BORDER); }
  const types = [];
  const pool = ['warehouse', 'office', 'shops', 'parking', 'alley', 'warehouse', 'office', 'shops', 'alley', 'plaza'];
  for (let k = 0; k < NB * NB; k++) types.push(pool[k % pool.length]);
  types.sort(() => rand() - 0.5);
  const mid = Math.floor(NB / 2);
  types[mid * NB + mid] = 'plaza';
  for (let j = 0; j < NB; j++) for (let i = 0; i < NB; i++) {
    const bx = MO + i * CELL + ROAD, by = MO + j * CELL + ROAD;
    fillRect(bx, by, CELL - ROAD, CELL - ROAD, F_WALK);
    BUILD[types[j * NB + i]](bx + 1, by + 1, i === mid && j === mid);
    // street lamps on the sidewalk corners
    light(bx + 0.5, by + 0.5, 230, 'cool'); light(bx + 15.5, by + 15.5, 230, 'cool');
  }
  // road markings + abandoned cars
  for (let j = 0; j <= NB; j++) for (let i = 0; i < NB; i++) {
    const r0 = MO + j * CELL, s0 = MO + i * CELL + ROAD, s1 = MO + (i + 1) * CELL;
    M.marks.push({ t: 'hdash', x0: s0 * TILE, x1: s1 * TILE, y: (r0 + 2) * TILE });
    M.marks.push({ t: 'vdash', y0: s0 * TILE, y1: s1 * TILE, x: (r0 + 2) * TILE });
    M.marks.push({ t: 'hcross', x: s0 * TILE, y: r0 * TILE }); M.marks.push({ t: 'hcross', x: (s1 - 1) * TILE, y: r0 * TILE });
    M.marks.push({ t: 'vcross', x: r0 * TILE, y: s0 * TILE }); M.marks.push({ t: 'vcross', x: r0 * TILE, y: (s1 - 1) * TILE });
    if (rand() < 0.35) car(s0 + randi(2, 9), r0 + (rand() < 0.5 ? 0 : 2), true);
    if (rand() < 0.35) car(r0 + (rand() < 0.5 ? 0 : 2), s0 + randi(2, 9), false);
    if (rand() < 0.3) scatter(s0 + 3, r0, 9, 4, randi(1, 3), [O_CRATE, O_BARREL]);
    if (rand() < 0.3) scatter(r0, s0 + 3, 4, 9, randi(1, 3), [O_CRATE, O_BARREL]);
  }
  // keep doorways clear on both sides
  for (const [dx, dy] of M.doors) for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
    if (ox && oy) continue;
    const o = objAt(dx + ox, dy + oy);
    if (o === O_CRATE || o === O_BARREL) setT(dx + ox, dy + oy, null, O_NONE);
  }
  const c = MO + mid * CELL + 2;                       // a road intersection next to the central plaza
  M.startX = c * TILE; M.startY = (c + CELL) * TILE;
  fillRect(c - 2, c + CELL - 2, 4, 4, null, O_NONE);
  // spawn points: doorways and alley/road tiles
  for (const d of M.doors) M.spawnPts.push(d);
  for (let ty = 1; ty < MH - 1; ty += 2) for (let tx = 1; tx < MW - 1; tx += 2) {
    const f = M.floor[idx(tx, ty)];
    if ((f === F_ALLEY || f === F_ROAD) && M.obj[idx(tx, ty)] === 0) M.spawnPts.push([tx, ty]);
  }
  M.dirty = true; M.flowTx = -1;
  M.version++;
}

// ---------- collision ----------
export function collideCircle(e) {
  const r = e.r, x0 = Math.floor((e.x - r) / TILE), x1 = Math.floor((e.x + r) / TILE);
  const y0 = Math.floor((e.y - r) / TILE), y1 = Math.floor((e.y + r) / TILE);
  let hit = false;
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
    if (objAt(tx, ty) === O_NONE) continue;
    const rx = tx * TILE, ry = ty * TILE;
    const cx = clamp(e.x, rx, rx + TILE), cy = clamp(e.y, ry, ry + TILE);
    let dx = e.x - cx, dy = e.y - cy, d2 = dx * dx + dy * dy;
    if (d2 >= r * r) continue;
    hit = true;
    if (d2 < 0.0001) {        // centre inside the tile: push out along the shortest axis
      const l = e.x - rx, rr = rx + TILE - e.x, t = e.y - ry, b = ry + TILE - e.y, m = Math.min(l, rr, t, b);
      if (m === l) e.x = rx - r; else if (m === rr) e.x = rx + TILE + r; else if (m === t) e.y = ry - r; else e.y = ry + TILE + r;
    } else {
      const d = Math.sqrt(d2), push = r - d;
      e.x += dx / d * push; e.y += dy / d * push;
    }
  }
  e.x = clamp(e.x, TILE + r, WORLD_W - TILE - r); e.y = clamp(e.y, TILE + r, WORLD_H - TILE - r);
  if (hit && solidAt(e.x, e.y)) unstick(e);
  return hit;
}
// Last-resort recovery so dashes, knockback or new cover can never leave an entity embedded in a wall.
export function unstick(e) {
  const tx = Math.floor(e.x / TILE), ty = Math.floor(e.y / TILE);
  for (let rad = 1; rad <= 4; rad++) for (let oy = -rad; oy <= rad; oy++) for (let ox = -rad; ox <= rad; ox++) {
    if (Math.max(Math.abs(ox), Math.abs(oy)) !== rad || objAt(tx + ox, ty + oy) !== O_NONE) continue;
    e.x = (tx + ox + 0.5) * TILE; e.y = (ty + oy + 0.5) * TILE; return true;
  }
  return false;
}
export function moveCircle(e, dx, dy) {
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / (e.r * 0.8)));
  let hit = false;
  for (let s = 0; s < steps; s++) { e.x += dx / steps; e.y += dy / steps; if (collideCircle(e)) hit = true; }
  return hit;
}
// Grid walk along a segment; returns true if nothing solid is in the way.
export function lineOfSight(x0, y0, x1, y1) {
  let tx = Math.floor(x0 / TILE), ty = Math.floor(y0 / TILE);
  const ex = Math.floor(x1 / TILE), ey = Math.floor(y1 / TILE);
  const dx = x1 - x0, dy = y1 - y0;
  const sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1;
  const tdx = dx !== 0 ? Math.abs(TILE / dx) : Infinity, tdy = dy !== 0 ? Math.abs(TILE / dy) : Infinity;
  let tmx = dx !== 0 ? ((sx > 0 ? (tx + 1) * TILE - x0 : x0 - tx * TILE) / Math.abs(dx)) : Infinity;
  let tmy = dy !== 0 ? ((sy > 0 ? (ty + 1) * TILE - y0 : y0 - ty * TILE) / Math.abs(dy)) : Infinity;
  for (let n = 0; n < 80; n++) {
    if (tx === ex && ty === ey) return true;
    if (tmx < tmy) { tmx += tdx; tx += sx; } else { tmy += tdy; ty += sy; }
    if (objAt(tx, ty) !== O_NONE) return false;
  }
  return true;
}

// ---------- flow field toward the player (BFS) ----------
export const FLOW_INF = 65535;
const flowQueue = new Int32Array(MW * MH);
export function updateFlow(px, py, dt) {
  M.flowT -= dt;
  const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
  if (!M.dirty && tx === M.flowTx && ty === M.flowTy) return;
  if (M.flowT > 0 && !M.dirty) return;
  M.flowT = 0.12; M.dirty = false; M.flowTx = tx; M.flowTy = ty;
  const flow = M.flow, obj = M.obj;
  flow.fill(FLOW_INF);
  let h = 0, t = 0;
  const s = idx(tx, ty); flow[s] = 0; flowQueue[t++] = s;
  while (h < t) {
    const c = flowQueue[h++], cd = flow[c] + 1, cx = c % MW;
    if (cx > 0 && flow[c - 1] === FLOW_INF && obj[c - 1] === 0) { flow[c - 1] = cd; flowQueue[t++] = c - 1; }
    if (cx < MW - 1 && flow[c + 1] === FLOW_INF && obj[c + 1] === 0) { flow[c + 1] = cd; flowQueue[t++] = c + 1; }
    if (c >= MW && flow[c - MW] === FLOW_INF && obj[c - MW] === 0) { flow[c - MW] = cd; flowQueue[t++] = c - MW; }
    if (c < MW * (MH - 1) && flow[c + MW] === FLOW_INF && obj[c + MW] === 0) { flow[c + MW] = cd; flowQueue[t++] = c + MW; }
  }
}
const DIR8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
// returns a unit vector toward the next tile along the flow field, or null
export function flowDir(x, y, out) {
  const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
  if (!inMap(tx, ty)) return null;
  let best = M.flow[idx(tx, ty)], bx = 0, by = 0;
  for (const [ox, oy] of DIR8) {
    const nx = tx + ox, ny = ty + oy;
    if (!inMap(nx, ny) || M.obj[idx(nx, ny)] !== 0) continue;
    if (ox && oy && (M.obj[idx(tx + ox, ty)] !== 0 || M.obj[idx(tx, ty + oy)] !== 0)) continue;
    const d = M.flow[idx(nx, ny)] + (ox && oy ? 0.4 : 0);
    if (d < best) { best = d; bx = ox; by = oy; }
  }
  if (!bx && !by) return null;
  const gx = (tx + bx + 0.5) * TILE - x, gy = (ty + by + 0.5) * TILE - y, l = Math.hypot(gx, gy) || 1;
  out.x = gx / l; out.y = gy / l;
  return out;
}


// reachable open tile in a distance ring around (px,py); used for medkits and supply drops
export function findReachableSpot(px, py, minD, maxD, preferOutdoor = true) {
  let fallback = null;
  for (let k = 0; k < 60; k++) {
    const a = rand(TAU), r = rand(minD, maxD);
    const tx = Math.floor((px + Math.cos(a) * r) / TILE), ty = Math.floor((py + Math.sin(a) * r) / TILE);
    if (!inMap(tx, ty)) continue;
    const i = idx(tx, ty);
    if (M.obj[i] !== 0 || M.flow[i] === FLOW_INF) continue;
    // keep a clear ring so pickups never sit inside or against walls
    let clear = true;
    for (let oy = -1; oy <= 1 && clear; oy++) for (let ox = -1; ox <= 1; ox++) if (objAt(tx + ox, ty + oy) !== O_NONE) { clear = false; break; }
    if (!clear) continue;
    const spot = [(tx + 0.5) * TILE, (ty + 0.5) * TILE];
    if (!preferOutdoor || !INDOOR_FLOORS.has(M.floor[i])) return spot;
    fallback = fallback || spot;
  }
  return fallback;
}

// Training Grounds: one large walled warehouse floor with cover, pillars and a few barrels.
export function generateArena() {
  M.floor.fill(F_CONC); M.obj.fill(O_WALL); M.hp.fill(0); M.wcol.fill(2);
  M.props = []; M.lights = []; M.marks = []; M.doors = []; M.spawnPts = [];
  const x0 = 38, y0 = 40, w = 30, h = 24;
  for (let ty = 0; ty < MH; ty++) for (let tx = 0; tx < MW; tx++) { if (tx === 0 || ty === 0 || tx === MW - 1 || ty === MH - 1) setT(tx, ty, F_CONC, O_BORDER); }
  fillRect(x0, y0, w, h, F_CONC, O_NONE);
  for (let i = x0; i < x0 + w; i++) { setT(i, y0 - 1, F_CONC, O_WALL, 2); setT(i, y0 + h, F_CONC, O_WALL, 2); }
  for (let j = y0; j < y0 + h; j++) { setT(x0 - 1, j, F_CONC, O_WALL, 2); setT(x0 + w, j, F_CONC, O_WALL, 2); }
  for (const [px, py] of [[x0 + 8, y0 + 6], [x0 + 21, y0 + 6], [x0 + 8, y0 + 17], [x0 + 21, y0 + 17]]) fillRect(px, py, 2, 2, null, O_WALL, 1);
  for (const [cx, cy] of [[x0 + 14, y0 + 4], [x0 + 15, y0 + 4], [x0 + 3, y0 + 12], [x0 + 26, y0 + 12], [x0 + 14, y0 + 19]]) setT(cx, cy, null, O_CRATE);
  setT(x0 + 4, y0 + 3, null, O_BARREL); setT(x0 + 25, y0 + 20, null, O_BARREL);
  for (let j = y0 + 1; j < y0 + h - 1; j += 2) for (let i = x0 + 1; i < x0 + w - 1; i += 2) if (M.obj[idx(i, j)] === O_NONE) M.spawnPts.push([i, j]);
  for (let k = 0; k < 4; k++) light(x0 + 5 + k * 7, y0 + 12, 320, "warm");
  M.startX = (x0 + 6) * TILE; M.startY = (y0 + 12) * TILE;
  M.arena = true; M.dirty = true; M.flowTx = -1; M.version++;
}
