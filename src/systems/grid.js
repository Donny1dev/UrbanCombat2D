// Uniform spatial grid over enemies, rebuilt once per simulation step.
// near() fills a caller-owned array (no per-query allocations) for hot loops; query() takes a callback.
import { clamp } from '../core/util.js';
import { WORLD_W, WORLD_H } from '../world/map.js';

const CELL = 64, GW = Math.ceil(WORLD_W / CELL), GH = Math.ceil(WORLD_H / CELL), MAXE = 900;
export const Grid = {
  head: new Int32Array(GW * GH).fill(-1), next: new Int32Array(MAXE), list: [], candidates: 0, queries: 0,
  build(list) {
    this.head.fill(-1); this.list = list;
    const n = Math.min(list.length, MAXE);
    for (let i = 0; i < n; i++) {
      const e = list[i];
      const c = clamp(Math.floor(e.y / CELL), 0, GH - 1) * GW + clamp(Math.floor(e.x / CELL), 0, GW - 1);
      this.next[i] = this.head[c]; this.head[c] = i;
    }
  },
  near(x, y, r, out) {
    out.length = 0;
    const x0 = clamp(Math.floor((x - r) / CELL), 0, GW - 1), x1 = clamp(Math.floor((x + r) / CELL), 0, GW - 1);
    const y0 = clamp(Math.floor((y - r) / CELL), 0, GH - 1), y1 = clamp(Math.floor((y + r) / CELL), 0, GH - 1);
    const L = this.list;
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++)
      for (let j = this.head[cy * GW + cx]; j !== -1; j = this.next[j]) { const e = L[j]; if (e && !e.dead) out.push(e); }
    this.candidates += out.length; this.queries++;
    return out;
  },
  query(x, y, r, cb) {
    const x0 = clamp(Math.floor((x - r) / CELL), 0, GW - 1), x1 = clamp(Math.floor((x + r) / CELL), 0, GW - 1);
    const y0 = clamp(Math.floor((y - r) / CELL), 0, GH - 1), y1 = clamp(Math.floor((y + r) / CELL), 0, GH - 1);
    const L = this.list; let n = 0;
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++)
      for (let j = this.head[cy * GW + cx]; j !== -1; j = this.next[j]) { const e = L[j]; if (e && !e.dead) { n++; cb(e); } }
    this.candidates += n; this.queries++;
  },
};
