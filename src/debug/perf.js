// F3 performance overlay + reproducible stress scenarios (window.__UC, enabled with ?bench or ?debug).
import { G, W } from '../core/registry.js';
import { ctx, V, R } from '../core/canvas.js';
import { Q } from '../core/settings.js';
import { Perf } from '../core/loop.js';
import { mouse, virtualKeys } from '../core/input.js';
import { FX } from '../rendering/fx.js';
import { timing } from '../rendering/renderer.js';
import { Grid } from '../systems/grid.js';
import { Bullets } from '../entities/combat.js';
import { spawnEnemy } from '../entities/enemies.js';
import { applyOffer, checkSynergies } from '../systems/offers.js';
import { findReachableSpot, M, MW, F_CONC } from '../world/map.js';
import { txt, panel } from '../rendering/hud.js';
import { BODY, DISPLAY } from '../rendering/textcache.js';

export const PerfOverlay = {
  visible: false,
  toggle() { this.visible = !this.visible; },
  draw(u) {
    const s = Perf.summary(); if (!s) return;
    const mem = performance.memory ? (performance.memory.usedJSHeapSize / 1048576).toFixed(1) + ' MB' : 'n/a';
    const rows = [
      ['FPS', s.fps.toFixed(0)], ['Frame avg / p95 / p99', `${s.avg.toFixed(1)} / ${s.p95.toFixed(1)} / ${s.p99.toFixed(1)} ms`],
      ['Update / render', `${s.upd.toFixed(2)} / ${s.ren.toFixed(2)} ms`],
      ['World / actors / fx / hud', `${timing.world.toFixed(1)} / ${timing.actors.toFixed(1)} / ${timing.fx.toFixed(1)} / ${timing.hud.toFixed(1)}`],
      ['Sim steps · dropped', `${Perf.steps} · ${Perf.dropped}`],
      ['Enemies', W.enemies.length], ['Bullets', Bullets.list.length], ['Particles', FX.parts.length], ['Pickups', G.pickups.list.length], ['Texts', FX.texts.length],
      ['Collision candidates', `${Grid.candidates} (${Grid.queries} queries)`], ['Draw calls', R.draws], ['JS heap', mem],
      ['Quality', Q.level.toUpperCase() + ` · ${V.w}x${V.h}`],
    ];
    const x = 16 * V.px, y = V.h * 0.3, w = 330 * u, h = 22 * u + rows.length * 17 * u;
    panel(x, y, w, h, 6 * u, 0.88);
    txt('PERFORMANCE (F3)', x + 10 * u, y + 12 * u, 11 * u, '#2ef2ff', DISPLAY, 400, 'left', false);
    rows.forEach(([k, v], i) => { txt(k, x + 10 * u, y + 30 * u + i * 17 * u, 12 * u, '#9aa0b4', BODY, 700, 'left', false); txt(v, x + w - 10 * u, y + 30 * u + i * 17 * u, 12 * u, '#f4f6fb', BODY, 800, 'right', false); });
  },
};

// ---------------- bench scenarios ----------------
const MIX = ['thug', 'rusher', 'gunman', 'shotgunner', 'heavy', 'thug', 'gunman'];
let scen = null, t = 0;
const stats = { upd: [], ren: [], dt: [], last: 0 };
const give = (p, list) => { for (const [id, n] of list) for (let i = 0; i < n; i++) applyOffer(p, { kind: 'upg', id }); checkSynergies(p); };
const topUp = (p, n) => { let k = 0; while (W.enemies.length < n && k++ < 12) { const s = findReachableSpot(p.x, p.y, 250, 700, false); if (s) spawnEnemy(MIX[(Math.random() * MIX.length) | 0], s[0], s[1], 8); } };
function bot(p) {
  t += 1 / 60; p.hp = p.maxHp; p.invuln = 0.2; G.game.pending = 0;
  let e = null, bd = 1e12; for (const o of W.enemies) { const d = (o.x - p.x) ** 2 + (o.y - p.y) ** 2; if (d < bd) { bd = d; e = o; } }
  mouse.down = true;
  if (e) { mouse.sx = (e.x - G.game.cam.x) * V.zoom + V.w / 2; mouse.sy = (e.y - G.game.cam.y) * V.zoom + V.h / 2; }
  const ph = Math.floor(t / 1.5) % 4; Object.assign(virtualKeys, { up: ph === 0, right: ph === 1, down: ph === 2, left: ph === 3 });
}
const SC = {
  early: () => p => bot(p),
  dense: p0 => { give(p0, [['multi', 3], ['rapid', 5], ['pierce', 2], ['heavy', 3]]); return p => { bot(p); topUp(p, 150); }; },
  projectiles: p0 => { give(p0, [['multi', 3], ['storm', 3], ['rapid', 5]]); return p => { bot(p); topUp(p, 60); let n = 0; for (const b of Bullets.list) if (b.enemy) n++; for (let i = n; i < 520; i++) { const a = Math.random() * Math.PI * 2, r = 380; Bullets.enemy(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r, a + Math.PI + (Math.random() - 0.5) * 0.6, 140, { dmg: 1, r: 6, life: 5 }); } }; },
  explosions: p0 => { give(p0, [['explosive', 4], ['frag', 3], ['ricochet', 1], ['rapid', 3], ['multi', 2]]); let bt = 0; return p => { bot(p); topUp(p, 90); bt -= 1 / 60; if (bt <= 0) { bt = 0.1; const e = W.enemies[(Math.random() * W.enemies.length) | 0]; if (e) G.game.explosion(e.x, e.y, 110, 60, 'barrel'); } }; },
  xp: p0 => { p0.S.magnet = 0.2; for (let i = 0; i < 1500; i++) { const a = Math.random() * 6.28, r = 150 + Math.random() * 900; G.pickups.gems(p0.x + Math.cos(a) * r, p0.y + Math.sin(a) * r, 1); } return p => { bot(p); topUp(p, 40); }; },
  drones: p0 => { give(p0, [['drone', 3], ['overdrive', 3], ['autotarget', 2], ['blades', 5], ['orbital', 3]]); return p => { bot(p); topUp(p, 120); }; },
  indoor: p0 => { let best = null; for (let ty = 2; ty < 100 && !best; ty++) for (let tx = 2; tx < 100; tx++) { const i = ty * MW + tx; if (M.floor[i] === F_CONC && M.obj[i] === 0 && M.floor[i + MW + 1] === F_CONC) { best = [tx, ty]; break; } } if (best) { p0.x = p0.px = (best[0] + 0.5) * 48; p0.y = p0.py = (best[1] + 0.5) * 48; G.game.cam.x = p0.x; G.game.cam.y = p0.y; } return p => { bot(p); topUp(p, 100); }; },
};
export function installBench() {
  const g = G.game, ou = g.update.bind(g);
  Perf.onPush = (f, u, r) => { stats.dt.push(f); stats.upd.push(u); stats.ren.push(r); };
  g.update = dt => { if (scen && g.state === 'play') scen(W.player); ou(dt); };
  window.__UC = {
    ready: true,
    startScenario(name) {
      G.ui.openLevelUp = () => { G.game.pending = 0; }; G.ui.openCrate = () => { G.game.state = 'play'; };
      G.ui.startRun({ mode: 'standard', quick: true }); g.addXp = () => { }; t = 0;
      scen = SC[name](W.player);
    },
    resetStats() { stats.upd.length = stats.ren.length = stats.dt.length = 0; stats.last = 0; Perf.reset(); },
    getStats() {
      return { upd: stats.upd.slice(), ren: stats.ren.slice(), dt: stats.dt.slice(), counts: { enemies: W.enemies.length, bullets: Bullets.list.length, particles: FX.parts.length, pickups: G.pickups.list.length }, heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null };
    },
  };
}
