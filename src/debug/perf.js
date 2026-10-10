// F3 performance overlay + reproducible stress scenarios (window.__UC, enabled with ?bench or ?debug).
import { G, W } from '../core/registry.js';
import { V, R } from '../core/canvas.js';
import { Q } from '../core/settings.js';
import { Perf } from '../core/loop.js';
import { mouse, virtualKeys } from '../core/input.js';
import { FX, Decals } from '../rendering/fx.js';
import { timing } from '../rendering/renderer.js';
import { Grid } from '../systems/grid.js';
import { Bullets } from '../entities/combat.js';
import { spawnEnemy } from '../entities/enemies.js';
import { applyOffer, checkSynergies, makeOffers } from '../systems/offers.js';
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
    soak: Soak,
    resetStats() { stats.upd.length = stats.ren.length = stats.dt.length = 0; stats.last = 0; Perf.reset(); },
    getStats() {
      return { upd: stats.upd.slice(), ren: stats.ren.slice(), dt: stats.dt.slice(), counts: { enemies: W.enemies.length, bullets: Bullets.list.length, particles: FX.parts.length, pickups: G.pickups.list.length }, heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null };
    },
  };
}

// ---------------- soak / stability driver ----------------
// Runs the real simulation far faster than real time with a simple bot. Level-ups and crates use the real
// offer generation + apply logic (only the DOM card animation is skipped). HP is topped up when low so long
// runs reach late waves while every damage path still executes; refills are counted and reported.
const Soak = {
  active: false, refillAt: 0.3, refills: 0, levelUps: 0, crates: 0, deaths: 0, gear: 0, t: 0, stepMs: 0, steps: 0,
  hits: [], deathLog: [], crateFrom: {},
  install() {
    if (this.active) return;
    this.active = true;
    const eqc = G.pickups.equipCrate.bind(G.pickups);
    G.pickups.equipCrate = (x, y, from = 'wave') => { this.crateFrom[from] = (this.crateFrom[from] || 0) + 1; return eqc(x, y, from); };
    // record the last few hits so an unexpected death can be explained
    const hurt = G.game.hurtPlayer.bind(G.game);
    G.game.hurtPlayer = (dmg, ang, kind = {}, bullet = null, attacker = null) => {
      const p = W.player, before = p.hp, r = hurt(dmg, ang, kind, bullet, attacker);
      this.hits.push({ t: +G.game.time.toFixed(2), dmg: Math.round(dmg), lost: Math.round(before - p.hp), hp: Math.round(before), kind: JSON.stringify(kind).slice(0, 60), by: attacker ? attacker.type || attacker.boss : bullet ? 'bullet' : '?' });
      if (this.hits.length > 6) this.hits.shift();
      if (p.hp <= 0 && before > 0) this.deathLog.push({ wave: G.game.wave, hits: this.hits.slice() });
      return r;
    };
    G.ui.openLevelUp = () => {
      const p = W.player, offers = makeOffers(p, []);
      if (offers.length) applyOffer(p, offers[(Math.random() * offers.length) | 0]);
      G.game.pending--; this.levelUps++;
    };
    G.ui.openCrate = offers => { G.game.applyCrate(offers[(Math.random() * offers.length) | 0]); G.game.state = 'play'; this.crates++; };
  },
  start(mode = 'standard') { this.install(); G.ui.startRun({ mode, quick: true }); this.t = 0; },
  bot(p) {
    this.t += 1 / 60;
    if (p.hp < p.maxHp * this.refillAt) { p.hp = p.maxHp; this.refills++; }
    let e = null, bd = 1e12; for (const o of W.enemies) { const d = (o.x - p.x) ** 2 + (o.y - p.y) ** 2; if (d < bd) { bd = d; e = o; } }
    mouse.down = true;
    if (e) { mouse.sx = (e.x - G.game.cam.x) * V.zoom + V.w / 2; mouse.sy = (e.y - G.game.cam.y) * V.zoom + V.h / 2; }
    const ph = Math.floor(this.t / 1.7) % 4; Object.assign(virtualKeys, { up: ph === 0, right: ph === 1, down: ph === 2, left: ph === 3, dash: (this.t % 5) < 0.02 });
    if ((this.t % 3) < 1 / 60) for (const s of ['gadget', 'support']) if (p.eq[s].charges > 0 && G.equip.activate(s)) this.gear++;
  },
  // Advance n fixed steps. Returns the run state afterwards.
  step(n, dt = 1 / 60) {
    const g = G.game, t0 = performance.now();
    for (let i = 0; i < n; i++) {
      if (g.state === 'play') this.bot(W.player);
      if (g.state === 'play' || g.state === 'dying') g.update(dt);
      if (g.state === 'dead') break;
    }
    this.stepMs += performance.now() - t0; this.steps += n;
    return g.state;
  },
  sample() {
    const g = G.game, p = W.player;
    return {
      gameTime: +g.time.toFixed(1), wave: g.wave, level: p.level, hp: Math.round(p.hp), kills: g.run.kills, state: g.state, weapon: p.weapon,
      enemies: W.enemies.length, corpses: W.corpses.length, bullets: Bullets.list.length, particles: FX.parts.length, decals: Decals.list.length,
      pickups: G.pickups.list.length, hazards: G.hazards.list.length, timers: g.timers.length, toasts: g.toasts.length,
      upgrades: Object.keys(p.upg).length, synergies: p.synergies.size, eq: ['armour', 'gadget', 'support'].map(s => p.eq[s].id + ':' + p.eq[s].rarity[0] + p.eq[s].rank).join(' '),
      msPerStep: this.steps ? +(this.stepMs / this.steps).toFixed(3) : 0,
      crateFrom: JSON.stringify(this.crateFrom), refills: this.refills, levelUps: this.levelUps, crates: this.crates, gearUses: this.gear, deaths: this.deaths,
      domNodes: document.getElementsByTagName('*').length, toastsDom: document.getElementById('toasts').childElementCount,
    };
  },
  resetTiming() { this.stepMs = 0; this.steps = 0; },
  // Kill the player through the real damage path and run the death sequence to the results screen.
  die() { const p = W.player; p.invuln = 0; G.game.hurtPlayer(1e9, 0); if (G.game.state === 'play') G.game.die(); this.deaths++; return this.step(600); },
};
