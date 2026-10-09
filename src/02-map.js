// ===================== MAP: generation, collision, pathing, rendering =====================
const NB = 5, CELL = 20, ROAD = 4, MO = 1;           // blocks per side, cell size, road width, outer margin
const MW = NB * CELL + ROAD + MO * 2, MH = MW;
const WORLD_W = MW * TILE, WORLD_H = MH * TILE;
// floors
const F_ROAD = 0, F_WALK = 1, F_WOOD = 2, F_TILE = 3, F_CONC = 4, F_LOT = 5, F_ALLEY = 6, F_CARPET = 7, F_GRASS = 8;
// objects (anything non-zero blocks movement and bullets)
const O_NONE = 0, O_WALL = 1, O_GLASS = 2, O_CRATE = 3, O_BARREL = 4, O_METAL = 5, O_FURN = 6, O_BORDER = 7;
const INDOOR_FLOORS = new Set([F_WOOD, F_TILE, F_CONC, F_CARPET]);

const Map = {
  floor: new Uint8Array(MW * MH), obj: new Uint8Array(MW * MH), hp: new Float32Array(MW * MH),
  wcol: new Uint8Array(MW * MH), flow: new Uint16Array(MW * MH), props: [], lights: [], marks: [],
  doors: [], spawnPts: [], dirty: true, flowTx: -1, flowTy: -1, flowT: 0, startX: 0, startY: 0,
};
const idx = (tx, ty) => ty * MW + tx;
const inMap = (tx, ty) => tx >= 0 && ty >= 0 && tx < MW && ty < MH;
const objAt = (tx, ty) => inMap(tx, ty) ? Map.obj[idx(tx, ty)] : O_BORDER;
const solidAt = (x, y) => objAt(Math.floor(x / TILE), Math.floor(y / TILE)) !== O_NONE;
const hash2 = (x, y) => { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };

function setT(tx, ty, f, o = O_NONE, wc = 0) {
  if (!inMap(tx, ty)) return;
  const i = idx(tx, ty);
  if (f !== null) Map.floor[i] = f;
  Map.obj[i] = o; Map.wcol[i] = wc;
  Map.hp[i] = o === O_CRATE ? 45 : o === O_BARREL ? 22 : o === O_GLASS ? 1 : 0;
}
function fillRect(x, y, w, h, f, o = O_NONE, wc = 0) { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) setT(i, j, f, o, wc); }
function room(x, y, w, h, f, wc) {   // floor inside, walls on border
  fillRect(x, y, w, h, f);
  for (let i = x; i < x + w; i++) { setT(i, y, f, O_WALL, wc); setT(i, y + h - 1, f, O_WALL, wc); }
  for (let j = y; j < y + h; j++) { setT(x, j, f, O_WALL, wc); setT(x + w - 1, j, f, O_WALL, wc); }
}
function door(x, y, w, h, f, outward = true) {
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) { setT(i, j, f); Map.doors.push([i, j]); }
}
function glassRun(x, y, w, h) { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (objAt(i, j) === O_WALL) setT(i, j, null, O_GLASS); }
function prop(type, tx, ty, w, h, extra = {}, o = O_FURN) {
  fillRect(tx, ty, w, h, null, o);
  for (let j = ty; j < ty + h; j++) for (let i = tx; i < tx + w; i++) Map.floor[idx(i, j)] = Map.floor[idx(i, j)];
  Map.props.push(Object.assign({ type, x: tx * TILE, y: ty * TILE, w: w * TILE, h: h * TILE }, extra));
}
function freeRect(x, y, w, h) { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (objAt(i, j) !== O_NONE) return false; return true; }
function scatter(x, y, w, h, n, types) {
  for (let k = 0; k < n * 4 && n > 0; k++) {
    const tx = randi(x, x + w - 1), ty = randi(y, y + h - 1);
    if (objAt(tx, ty) !== O_NONE) continue;
    const t = pick(types);
    setT(tx, ty, null, t);
    if (t === O_CRATE && Math.random() < 0.4 && objAt(tx + 1, ty) === O_NONE && tx + 1 < x + w) setT(tx + 1, ty, null, O_CRATE);
    n--;
  }
}
function light(tx, ty, r, kind) { Map.lights.push({ x: tx * TILE, y: ty * TILE, r, kind }); }
const CAR_COLS = ['#c8423a', '#3a7bd5', '#e0b23c', '#4aa36b', '#8c8f99', '#7b4fc9', '#e6e6e6', '#d8742a'];
function car(tx, ty, horiz) {
  const w = horiz ? 4 : 2, h = horiz ? 2 : 4;
  if (!freeRect(tx, ty, w, h)) return false;
  prop('car', tx, ty, w, h, { horiz, color: pick(CAR_COLS), flip: Math.random() < 0.5, wreck: Math.random() < 0.3 }, O_METAL);
  return true;
}

// ---- block builders (x,y = inner 14x14 origin) ----
const BUILD = {
  warehouse(x, y) {
    room(x, y, 14, 14, F_CONC, 2);
    const sides = ['n', 's', 'w', 'e'].sort(() => Math.random() - 0.5).slice(0, randi(2, 3));
    for (const s of sides) {
      const p = randi(3, 8);
      if (s === 'n') door(x + p, y, 3, 1, F_CONC); if (s === 's') door(x + p, y + 13, 3, 1, F_CONC);
      if (s === 'w') door(x, y + p, 1, 3, F_CONC); if (s === 'e') door(x + 13, y + p, 1, 3, F_CONC);
    }
    for (const sx of [x + 3, x + 7, x + 10]) if (Math.random() < 0.8) prop('shelf', sx, y + randi(3, 4), 1, randi(4, 6), { hue: randi(0, 2) });
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
    for (const [dx, dy] of desks) if (Math.random() < 0.85 && freeRect(dx, dy, 2, 1)) prop('desk', dx, dy, 2, 1);
    scatter(x + 1, y + 9, 12, 4, randi(1, 3), [O_CRATE]);
    light(x + 3, y + 3, 170, 'warm'); light(x + 7, y + 3, 150, 'warm'); light(x + 11, y + 3, 170, 'warm');
    light(x + 4, y + 11, 190, 'warm'); light(x + 10, y + 11, 190, 'warm'); light(x + 7, y + 7, 160, 'cool');
  },
  shops(x, y) {
    const front = Math.random() < 0.5 ? 'n' : 's';
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
      if (Math.random() < 0.7) door(sx + w - 3, by, 2, 1, F_CONC);
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
        Map.marks.push({ t: 'pline', x: (x + 1 + c * 2) * TILE, y: ry * TILE, h: 4 * TILE });
        if (Math.random() < 0.55) car(x + 1 + c * 2, ry, false);
      }
      Map.marks.push({ t: 'pline', x: (x + 13) * TILE, y: ry * TILE, h: 4 * TILE });
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
    for (let i = x; i < x + 5; i++) setT(i, y + 6, Map.floor[idx(x + 1, y + 1)], O_WALL, 1);
    for (let i = x + 8; i < x + 14; i++) setT(i, y + 7, Map.floor[idx(x + 9, y + 1)], O_WALL, 1);
    door(x + 4, y + 2, 1, 2, Map.floor[idx(x + 1, y + 1)]); door(x + 4, y + 9, 1, 2, Map.floor[idx(x + 1, y + 9)]);
    door(x + 8, y + 3, 1, 2, Map.floor[idx(x + 9, y + 1)]); door(x + 8, y + 10, 1, 2, Map.floor[idx(x + 9, y + 9)]);
    door(x + 1, y + 6, 2, 1, Map.floor[idx(x + 1, y + 1)]); door(x + 10, y + 7, 2, 1, Map.floor[idx(x + 9, y + 1)]);
    door(x, y + 10, 1, 2, Map.floor[idx(x + 1, y + 9)]); door(x + 13, y + 2, 1, 2, Map.floor[idx(x + 9, y + 1)]);
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

function generateMap() {
  Map.floor.fill(F_ROAD); Map.obj.fill(0); Map.hp.fill(0); Map.wcol.fill(0);
  Map.props = []; Map.lights = []; Map.marks = []; Map.doors = []; Map.spawnPts = [];
  for (let i = 0; i < MW; i++) { setT(i, 0, F_ROAD, O_BORDER); setT(i, MH - 1, F_ROAD, O_BORDER); setT(0, i, F_ROAD, O_BORDER); setT(MW - 1, i, F_ROAD, O_BORDER); }
  const types = [];
  const pool = ['warehouse', 'office', 'shops', 'parking', 'alley', 'warehouse', 'office', 'shops', 'alley', 'plaza'];
  for (let k = 0; k < NB * NB; k++) types.push(pool[k % pool.length]);
  types.sort(() => Math.random() - 0.5);
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
    Map.marks.push({ t: 'hdash', x0: s0 * TILE, x1: s1 * TILE, y: (r0 + 2) * TILE });
    Map.marks.push({ t: 'vdash', y0: s0 * TILE, y1: s1 * TILE, x: (r0 + 2) * TILE });
    Map.marks.push({ t: 'hcross', x: s0 * TILE, y: r0 * TILE }); Map.marks.push({ t: 'hcross', x: (s1 - 1) * TILE, y: r0 * TILE });
    Map.marks.push({ t: 'vcross', x: r0 * TILE, y: s0 * TILE }); Map.marks.push({ t: 'vcross', x: r0 * TILE, y: (s1 - 1) * TILE });
    if (Math.random() < 0.35) car(s0 + randi(2, 9), r0 + (Math.random() < 0.5 ? 0 : 2), true);
    if (Math.random() < 0.35) car(r0 + (Math.random() < 0.5 ? 0 : 2), s0 + randi(2, 9), false);
    if (Math.random() < 0.3) scatter(s0 + 3, r0, 9, 4, randi(1, 3), [O_CRATE, O_BARREL]);
    if (Math.random() < 0.3) scatter(r0, s0 + 3, 4, 9, randi(1, 3), [O_CRATE, O_BARREL]);
  }
  // keep doorways clear on both sides
  for (const [dx, dy] of Map.doors) for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
    if (ox && oy) continue;
    const o = objAt(dx + ox, dy + oy);
    if (o === O_CRATE || o === O_BARREL) setT(dx + ox, dy + oy, null, O_NONE);
  }
  const c = MO + mid * CELL + 2;                       // a road intersection next to the central plaza
  Map.startX = c * TILE; Map.startY = (c + CELL) * TILE;
  fillRect(c - 2, c + CELL - 2, 4, 4, null, O_NONE);
  // spawn points: doorways and alley/road tiles
  for (const d of Map.doors) Map.spawnPts.push(d);
  for (let ty = 1; ty < MH - 1; ty += 2) for (let tx = 1; tx < MW - 1; tx += 2) {
    const f = Map.floor[idx(tx, ty)];
    if ((f === F_ALLEY || f === F_ROAD) && Map.obj[idx(tx, ty)] === 0) Map.spawnPts.push([tx, ty]);
  }
  Map.dirty = true; Map.flowTx = -1;
  ChunkCache.clear();
}

// ---------- collision ----------
function collideCircle(e) {
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
  return hit;
}
function moveCircle(e, dx, dy) {
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / (e.r * 0.8)));
  let hit = false;
  for (let s = 0; s < steps; s++) { e.x += dx / steps; e.y += dy / steps; if (collideCircle(e)) hit = true; }
  return hit;
}
// Grid walk along a segment; returns true if nothing solid is in the way.
function lineOfSight(x0, y0, x1, y1) {
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
const FLOW_INF = 65535;
const flowQueue = new Int32Array(MW * MH);
function updateFlow(px, py, dt) {
  Map.flowT -= dt;
  const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
  if (!Map.dirty && tx === Map.flowTx && ty === Map.flowTy) return;
  if (Map.flowT > 0 && !Map.dirty) return;
  Map.flowT = 0.12; Map.dirty = false; Map.flowTx = tx; Map.flowTy = ty;
  const flow = Map.flow, obj = Map.obj;
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
function flowDir(x, y, out) {
  const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
  if (!inMap(tx, ty)) return null;
  let best = Map.flow[idx(tx, ty)], bx = 0, by = 0;
  for (const [ox, oy] of DIR8) {
    const nx = tx + ox, ny = ty + oy;
    if (!inMap(nx, ny) || Map.obj[idx(nx, ny)] !== 0) continue;
    if (ox && oy && (Map.obj[idx(tx + ox, ty)] !== 0 || Map.obj[idx(tx, ty + oy)] !== 0)) continue;
    const d = Map.flow[idx(nx, ny)] + (ox && oy ? 0.4 : 0);
    if (d < best) { best = d; bx = ox; by = oy; }
  }
  if (!bx && !by) return null;
  const gx = (tx + bx + 0.5) * TILE - x, gy = (ty + by + 0.5) * TILE - y, l = Math.hypot(gx, gy) || 1;
  out.x = gx / l; out.y = gy / l;
  return out;
}

// ---------- destructibles ----------
function damageTile(tx, ty, dmg, bx, by, srcAngle) {
  if (!inMap(tx, ty)) return false;
  const i = idx(tx, ty), o = Map.obj[i];
  const cx = (tx + 0.5) * TILE, cy = (ty + 0.5) * TILE;
  if (o === O_GLASS) {
    setT(tx, ty, null, O_NONE); Map.dirty = true;
    FX.glassBurst(cx, cy, srcAngle); Sound.glass(); Decals.add('glass', cx, cy, rand(TAU), 1);
    return true;
  }
  if (o === O_CRATE || o === O_BARREL) {
    Map.hp[i] -= dmg;
    if (Map.hp[i] <= 0) {
      setT(tx, ty, null, O_NONE); Map.dirty = true;
      if (o === O_CRATE) { FX.crateBurst(cx, cy); Sound.crate(); if (Math.random() < 0.12) spawnHealth(cx, cy); }
      else { Game.explosion(cx, cy, 120, 80, 'barrel'); Decals.add('scorch', cx, cy, rand(TAU), 1.6); }
      return true;
    }
  }
  return false;
}
function damageTilesInRadius(x, y, r, dmg) {
  const x0 = Math.floor((x - r) / TILE), x1 = Math.floor((x + r) / TILE), y0 = Math.floor((y - r) / TILE), y1 = Math.floor((y + r) / TILE);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
    const o = objAt(tx, ty);
    if ((o === O_CRATE || o === O_BARREL || o === O_GLASS) && dist2((tx + .5) * TILE, (ty + .5) * TILE, x, y) < r * r) damageTile(tx, ty, dmg, x, y, Math.atan2((ty + .5) * TILE - y, (tx + .5) * TILE - x));
  }
}

// ---------- rendering: static layer cached in chunks ----------
const CHUNK = 12;
const ChunkCache = {
  map: new globalThis.Map(), scale: 1,
  clear() { this.map.clear(); },
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
function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function drawMark(g, m) {
  if (m.t === 'hdash') { g.fillStyle = 'rgba(255,200,60,0.55)'; for (let x = m.x0 + 12; x < m.x1 - 24; x += 48) g.fillRect(x, m.y - 2, 24, 4); }
  else if (m.t === 'vdash') { g.fillStyle = 'rgba(255,200,60,0.55)'; for (let y = m.y0 + 12; y < m.y1 - 24; y += 48) g.fillRect(m.x - 2, y, 4, 24); }
  else if (m.t === 'hcross') { g.fillStyle = 'rgba(235,235,235,0.32)'; for (let k = 0; k < 4 * TILE; k += 16) g.fillRect(m.x + 6, m.y + k + 3, TILE - 12, 9); }
  else if (m.t === 'vcross') { g.fillStyle = 'rgba(235,235,235,0.32)'; for (let k = 0; k < 4 * TILE; k += 16) g.fillRect(m.x + k + 3, m.y + 6, 9, TILE - 12); }
  else if (m.t === 'pline') { g.fillStyle = 'rgba(240,240,240,0.4)'; g.fillRect(m.x - 1.5, m.y + 4, 3, m.h - 8); }
}
function renderChunk(cx, cy, scale) {
  const size = CHUNK * TILE, c = document.createElement('canvas');
  c.width = c.height = Math.ceil(size * scale);
  const g = c.getContext('2d');
  g.scale(scale, scale); g.translate(-cx * size, -cy * size);
  const tx0 = cx * CHUNK - 1, ty0 = cy * CHUNK - 1, tx1 = tx0 + CHUNK + 2, ty1 = ty0 + CHUNK + 2;
  for (let ty = ty0; ty < ty1; ty++) for (let tx = tx0; tx < tx1; tx++) if (inMap(tx, ty)) drawFloorTile(g, tx, ty, Map.floor[idx(tx, ty)]);
  const bx0 = cx * size - TILE * 5, by0 = cy * size - TILE * 5, bx1 = bx0 + size + TILE * 10, by1 = by0 + size + TILE * 10;
  for (const m of Map.marks) drawMark(g, m);
  // indoor dimming + light pools
  for (let ty = ty0; ty < ty1; ty++) for (let tx = tx0; tx < tx1; tx++) {
    if (!inMap(tx, ty)) continue;
    if (!INDOOR_FLOORS.has(Map.floor[idx(tx, ty)])) { g.fillStyle = 'rgba(10,20,45,0.28)'; g.fillRect(tx * TILE, ty * TILE, TILE, TILE); }
    else { g.fillStyle = 'rgba(30,15,5,0.22)'; g.fillRect(tx * TILE, ty * TILE, TILE, TILE); }
  }
  g.globalCompositeOperation = 'lighter';
  for (const l of Map.lights) {
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
  for (const p of Map.props) if (p.x < bx1 && p.x + p.w > bx0 && p.y < by1 && p.y + p.h > by0) drawProp(g, p);
  // walls
  for (let ty = ty0; ty < ty1; ty++) for (let tx = tx0; tx < tx1; tx++) {
    const o = objAt(tx, ty);
    if (o !== O_WALL && o !== O_BORDER) continue;
    if (Map.props.some(p => p.type === 'fountain' && tx * TILE >= p.x && tx * TILE < p.x + p.w && ty * TILE >= p.y && ty * TILE < p.y + p.h)) continue;
    const [base, top] = WALL_COL[o === O_BORDER ? 0 : Map.wcol[idx(tx, ty)]] || WALL_COL[0];
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
function drawWorldStatic(camX, camY, vw, vh) {
  const size = CHUNK * TILE;
  const cx0 = Math.max(0, Math.floor(camX / size)), cy0 = Math.max(0, Math.floor(camY / size));
  const cx1 = Math.min(Math.ceil(MW / CHUNK) - 1, Math.floor((camX + vw) / size)), cy1 = Math.min(Math.ceil(MH / CHUNK) - 1, Math.floor((camY + vh) / size));
  for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) ctx.drawImage(ChunkCache.get(cx, cy), cx * size, cy * size, size, size);
}
// dynamic tiles: glass, crates, barrels
function drawDynamicTiles(camX, camY, vw, vh, time) {
  const tx0 = Math.max(0, Math.floor(camX / TILE)), ty0 = Math.max(0, Math.floor(camY / TILE));
  const tx1 = Math.min(MW - 1, Math.floor((camX + vw) / TILE)), ty1 = Math.min(MH - 1, Math.floor((camY + vh) / TILE));
  ctx.lineJoin = 'round';
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
    const i = idx(tx, ty), o = Map.obj[i];
    if (o !== O_GLASS && o !== O_CRATE && o !== O_BARREL) continue;
    const x = tx * TILE, y = ty * TILE;
    if (o === O_GLASS) {
      const horiz = objAt(tx - 1, ty) !== O_NONE || objAt(tx + 1, ty) !== O_NONE;
      ctx.fillStyle = '#101116';
      if (horiz) { ctx.fillRect(x, y + 14, TILE, 20); ctx.fillStyle = 'rgba(150,220,255,0.55)'; ctx.fillRect(x, y + 18, TILE, 12); ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillRect(x + 6, y + 20, 14, 3); }
      else { ctx.fillRect(x + 14, y, 20, TILE); ctx.fillStyle = 'rgba(150,220,255,0.55)'; ctx.fillRect(x + 18, y, 12, TILE); ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillRect(x + 20, y + 6, 3, 14); }
    } else if (o === O_CRATE) {
      const dmg = 1 - Map.hp[i] / 45;
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(x + 8, y + 10, TILE - 8, TILE - 8);
      ctx.fillStyle = '#b07a3e'; ctx.strokeStyle = '#1a0f06'; ctx.lineWidth = 3;
      ctx.fillRect(x + 4, y + 4, TILE - 8, TILE - 8); ctx.strokeRect(x + 4, y + 4, TILE - 8, TILE - 8);
      ctx.strokeStyle = '#6e4a22'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(x + 8, y + 8); ctx.lineTo(x + TILE - 8, y + TILE - 8); ctx.moveTo(x + TILE - 8, y + 8); ctx.lineTo(x + 8, y + TILE - 8); ctx.stroke();
      ctx.fillStyle = 'rgba(255,230,180,0.25)'; ctx.fillRect(x + 6, y + 6, TILE - 12, 3);
      if (dmg > 0.3) { ctx.strokeStyle = '#2a1608'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + 12, y + 30); ctx.lineTo(x + 22, y + 22); ctx.lineTo(x + 20, y + 14); if (dmg > 0.6) { ctx.moveTo(x + 36, y + 12); ctx.lineTo(x + 30, y + 26); ctx.lineTo(x + 38, y + 36); } ctx.stroke(); }
    } else {
      const cx = x + TILE / 2, cy = y + TILE / 2, pulse = Map.hp[i] < 22 ? 0.5 + 0.5 * Math.sin(time * 20) : 0;
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.arc(cx + 5, cy + 7, 18, 0, TAU); ctx.fill();
      ctx.fillStyle = pulse ? `rgb(${220 + pulse * 35},${60 + pulse * 80},40)` : '#d9452f'; ctx.strokeStyle = '#1a0806'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(cx, cy, 18, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx, cy, 12, 0, TAU); ctx.stroke();
      ctx.fillStyle = '#1a0806'; ctx.beginPath(); ctx.arc(cx + 5, cy - 5, 3.5, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.arc(cx - 6, cy - 7, 4, 0, TAU); ctx.fill();
    }
  }
}

// reachable open tile in a distance ring around (px,py); used for medkits and supply drops
function findReachableSpot(px, py, minD, maxD, preferOutdoor = true) {
  let fallback = null;
  for (let k = 0; k < 60; k++) {
    const a = rand(TAU), r = rand(minD, maxD);
    const tx = Math.floor((px + Math.cos(a) * r) / TILE), ty = Math.floor((py + Math.sin(a) * r) / TILE);
    if (!inMap(tx, ty)) continue;
    const i = idx(tx, ty);
    if (Map.obj[i] !== 0 || Map.flow[i] === FLOW_INF) continue;
    // keep a clear ring so pickups never sit inside or against walls
    let clear = true;
    for (let oy = -1; oy <= 1 && clear; oy++) for (let ox = -1; ox <= 1; ox++) if (objAt(tx + ox, ty + oy) !== O_NONE) { clear = false; break; }
    if (!clear) continue;
    const spot = [(tx + 0.5) * TILE, (ty + 0.5) * TILE];
    if (!preferOutdoor || !INDOOR_FLOORS.has(Map.floor[i])) return spot;
    fallback = fallback || spot;
  }
  return fallback;
}
