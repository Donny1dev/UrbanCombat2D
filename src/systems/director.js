// Wave director: spawning (with lulls for pacing), squads, bosses, dynamic events and equipment crates.
import { TAU, TILE, rand, randi, pick, vrand } from '../core/util.js';
import { G, W } from '../core/registry.js';
import { V } from '../core/canvas.js';
import { Sound, Music } from '../core/audio.js';
import { M, inMap, idx, solidAt, FLOW_INF, findReachableSpot } from '../world/map.js';
import { SQUADS, BOSS_ORDER, BOSSES, bossHp } from '../data/enemies.js';
import { spawnEnemy } from '../entities/enemies.js';

export const EVENTS = {
  ambush: { name: 'AMBUSH', dur: 18, color: '#ff3b4e', desc: 'Enemies pouring out of nearby doors' },
  supply: { name: 'SUPPLY DROP', dur: 30, color: '#ffd23f', desc: 'Grab the marked crate' },
  elite: { name: 'ELITE HUNT', dur: 35, color: '#ff4fd8', desc: 'Take down the hunted elite' },
  blackout: { name: 'BLACKOUT', dur: 25, color: '#8c7bff', desc: 'The grid is down' },
  overrun: { name: 'OVERRUN', dur: 20, color: '#ff9a1f', desc: 'Enemy density surging' },
};
const WAVE_LEN = w => (w === 1 ? 25 : 30), LULL = 4;

export const Director = {
  t: 0, spawnT: 0, event: null, nextEvent: 95, lastEvent: null, squadT: 20, nextCrateWave: 4, eliteCrateWave: 4, waveDamage: 0,
  reset() { Object.assign(this, { t: 0, spawnT: 1.2, event: null, nextEvent: rand(85, 105), lastEvent: null, squadT: rand(18, 26), nextCrateWave: 4, eliteCrateWave: 4, waveDamage: 0 }); },
  weights(w) {
    const m = G.game.mods;
    return {
      thug: 10, rusher: w >= 2 ? 3 + w * 0.6 : 0, gunman: (w >= 2 ? 3 + w : 1.2) * m.ranged,
      shotgunner: (w >= 4 ? 2 + w * 0.6 : 0) * m.ranged, heavy: (w >= 3 ? 1 + w * 0.45 : 0) * m.heavy, elite: (w >= 6 ? 0.4 + w * 0.15 : 0) * m.heavy,
    };
  },
  pickType(w) {
    const ws = this.weights(w); let tot = 0; for (const k in ws) tot += ws[k];
    let r = rand(tot); for (const k in ws) { r -= ws[k]; if (r <= 0) return k; }
    return 'thug';
  },
  findSpawn(p, near = false) {
    const halfDiag = Math.hypot(V.w, V.h) / V.zoom / 2;
    const minD = near ? 360 : halfDiag + 50, maxD = near ? 900 : halfDiag + 520;
    const camX = G.game.cam.x - V.w / V.zoom / 2, camY = G.game.cam.y - V.h / V.zoom / 2;
    const pts = near ? M.doors : M.spawnPts;
    for (let k = 0; k < 40; k++) {
      let tx, ty;
      if (k < 28 && pts.length) [tx, ty] = pick(pts);
      else { const a = rand(TAU), r = rand(minD, maxD); tx = Math.floor((p.x + Math.cos(a) * r) / TILE); ty = Math.floor((p.y + Math.sin(a) * r) / TILE); }
      if (!inMap(tx, ty) || M.obj[idx(tx, ty)] !== 0 || M.flow[idx(tx, ty)] === FLOW_INF) continue;
      const x = (tx + 0.5) * TILE, y = (ty + 0.5) * TILE, dd = Math.hypot(x - p.x, y - p.y);
      if (dd < minD || dd > maxD) continue;
      if (!near && x > camX - 40 && x < camX + V.w / V.zoom + 40 && y > camY - 40 && y < camY + V.h / V.zoom + 40) continue;
      return [x, y];
    }
    return null;
  },
  group(p, types, near) {
    const q = this.findSpawn(p, near);
    if (q) for (const t of types) { const x = q[0] + vrand(-40, 40), y = q[1] + vrand(-40, 40); spawnEnemy(t, solidAt(x, y) ? q[0] : x, solidAt(x, y) ? q[1] : y, G.game.wave); }
    return !!q;
  },
  squad(p, n, near) { const types = []; for (let i = 0; i < n; i++) types.push(this.pickType(G.game.wave)); this.group(p, types, near); },
  spawnBoss(p, wave) {
    const pos = this.findSpawn(p); if (!pos) return;
    const id = BOSS_ORDER[G.game.bossCount % BOSS_ORDER.length], d = BOSSES[id];
    const b = spawnEnemy('boss', pos[0], pos[1], wave, { boss: id, hpOverride: bossHp(id, wave, G.game.bossCount) * G.game.mods.enemyHp });
    G.game.boss = b; G.game.bossCount++;
    G.game.banner(d.name, '#ff3b4e', `WAVE ${wave} · ${d.title.toUpperCase()}`);
    Sound.boss(d.sound); Music.set('boss', 1);
  },
  dropCrate(p, label = 'EQUIPMENT CRATE') {
    const s = findReachableSpot(p.x, p.y, 150, 380, false);
    if (s) { G.pickups.equipCrate(s[0], s[1]); G.game.banner(label, '#b46bff', 'Walk over it to upgrade your gear'); Sound.event(); }
  },
  startEvent(p, forced) {
    const blackoutHeavy = G.game.mods.blackout;
    let opts = Object.keys(EVENTS).filter(k => k !== this.lastEvent && (k !== 'elite' || G.game.wave >= 3));
    if (blackoutHeavy && this.lastEvent !== 'blackout') opts = opts.concat(['blackout', 'blackout']);
    const type = forced || pick(opts), def = EVENTS[type];
    this.event = { type, t: def.dur, dur: def.dur, pulse: 0 }; this.lastEvent = type;
    G.game.banner(def.name, def.color, def.desc); Sound.event();
    if (type === 'supply') { const s = findReachableSpot(p.x, p.y, 300, 700, true); if (s) { G.pickups.supply(s[0], s[1], 15 + G.game.wave * 3); this.event.x = s[0]; this.event.y = s[1]; } else this.event.t = 0; }
    if (type === 'elite') { const s = this.findSpawn(p); if (s) this.event.target = spawnEnemy('elite', s[0], s[1], G.game.wave + Math.floor(p.level / 6), { hunted: true }); else this.event.t = 0; }
  },
  endEvent(success) {
    if (!this.event) return;
    const def = EVENTS[this.event.type];
    if (success) {
      G.game.banner(def.name + ' CLEARED', def.color); G.game.addXp(10 + G.game.wave * 2);
      if (this.event.type === 'elite' && this.event.target) G.pickups.equipCrate(this.event.target.x, this.event.target.y, 'elite');
    }
    this.event = null; this.nextEvent = rand(80, 120) * (G.game.mods.blackout ? 0.7 : 1);
  },
  updateEvent(dt, p) {
    const ev = this.event;
    if (!ev) { this.nextEvent -= dt; if (this.nextEvent <= 0 && G.game.wave >= 2) this.startEvent(p); return; }
    ev.t -= dt; ev.pulse -= dt;
    if (ev.type === 'ambush' && ev.pulse <= 0) { ev.pulse = 6; for (let i = 0; i < 3; i++) this.squad(p, 2 + Math.floor(G.game.wave / 3 + p.level / 10), true); }
    if (ev.type === 'supply' && !G.pickups.list.some(g => g.kind === 'supply')) { this.endEvent(true); return; }
    if (ev.type === 'elite' && ev.target && ev.target.dead) { this.endEvent(true); return; }
    if (ev.t <= 0) this.endEvent(ev.type === 'ambush' || ev.type === 'blackout' || ev.type === 'overrun');
  },
  waveComplete(p, wave) {
    const run = G.game.run;
    if (wave >= 2 && run.damageTaken - this.waveDamage <= 0) { run.perfectWaves++; G.game.track('perfectWaves', 1); G.game.toast('PERFECT WAVE', '#52f08a'); }
    this.waveDamage = run.damageTaken;
    if (wave + 1 >= this.nextCrateWave) { this.nextCrateWave = wave + 1 + randi(3, 4); this.dropCrate(p); }
    else if (p.eq.support.id === 'scanner' && p.eq.support.rarity === 'legendary' && (wave + 1) % 6 === 0) this.dropCrate(p, 'BONUS CRATE');
  },
  update(dt, p) {
    this.t += dt;
    const game = G.game, w = game.wave;
    if (this.t >= WAVE_LEN(w)) {
      this.t = 0; this.waveComplete(p, w); game.wave++; p.secondWindUsed = false;
      const nw = game.wave;
      if (nw % 5 === 0) { this.spawnBoss(p, nw); for (let i = 0; i < 1 + Math.floor(nw / 10); i++) { const q = this.findSpawn(p); if (q) spawnEnemy('elite', q[0], q[1], nw); } }
      else { game.banner('WAVE ' + nw, '#2ef2ff'); Sound.wave(); }
      this.squad(p, 4 + nw, false);
    }
    this.updateEvent(dt, p);
    // squads with real compositions arrive every ~20s once unlocked
    this.squadT -= dt;
    if (this.squadT <= 0) { this.squadT = rand(16, 24); const opts = SQUADS.filter(s => w >= s.minWave); if (opts.length) this.group(p, pick(opts).units, Math.random() < 0.4); }
    const over = this.event && this.event.type === 'overrun', lull = this.t < LULL && w > 1;
    const maxAlive = Math.min(over ? 240 : 190, (9 + w * 7) * (over ? 1.4 : 1) * game.mods.spawn);
    const interval = Math.max(0.14, (w === 1 ? 0.95 : 1.05) * Math.pow(0.88, w - 1)) * (over ? 0.4 : 1) * (lull ? 2.5 : 1) / game.mods.spawn;
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnT = interval * rand(0.7, 1.3);
      if (W.enemies.length < maxAlive) {
        const pos = this.findSpawn(p);
        if (pos) {
          const n = 1 + Math.floor(rand(1 + w / 3));
          for (let i = 0; i < n && W.enemies.length < maxAlive; i++) {
            const x = pos[0] + vrand(-30, 30), y = pos[1] + vrand(-30, 30);
            spawnEnemy(this.pickType(w), solidAt(x, y) ? pos[0] : x, solidAt(x, y) ? pos[1] : y, w);
          }
        }
      }
    }
    for (const e of W.enemies) if (!e.boss && !e.hunted && !e.d.structure && (e.x - p.x) ** 2 + (e.y - p.y) ** 2 > 2400 * 2400) { const pos = this.findSpawn(p); if (pos) { e.x = pos[0]; e.y = pos[1]; e.px = e.x; e.py = e.y; } }
  },
};
