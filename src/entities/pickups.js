// Pickups (XP, medkits, supply caches, equipment crates), hazards (fire, energy trails, enemy grenades,
// artillery marks, line strikes) and Ghost Step decoys.
import { TAU, TILE, dist2, lerp, rand, vrand } from '../core/util.js';
import { G, W } from '../core/registry.js';
import { ctx, R, GLOW, glow, makeCanvas, rr } from '../core/canvas.js';
import { PAL } from '../core/settings.js';
import { Sound } from '../core/audio.js';
import { solidAt, findReachableSpot } from '../world/map.js';
import { Grid } from '../systems/grid.js';
import { FX, P_SMOKE, P_EMBER, P_RING } from '../rendering/fx.js';
import { drawHumanCached, lookToOpts } from '../rendering/sprites.js';
import { applyBurn } from './combat.js';

const MEDKIT_DROP = [0.018, 0.026, 0.035, 0.045];
const WORLD_MEDKIT_MUL = [1, 0.85, 0.7, 0.6];
const OUTLINE = '#0b0b0f';
function gemSprite(col, size) {
  const c = makeCanvas(Math.ceil(size * 7)), g = c.getContext('2d'), m = c.width / 2;
  const gr = g.createRadialGradient(m, m, 0, m, m, m); gr.addColorStop(0, col + 'aa'); gr.addColorStop(1, col + '00');
  g.fillStyle = gr; g.fillRect(0, 0, c.width, c.width);
  g.translate(m, m); g.fillStyle = col; g.strokeStyle = '#06262b'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(0, -size * 1.3); g.lineTo(size, 0); g.lineTo(0, size * 1.3); g.lineTo(-size, 0); g.closePath(); g.fill(); g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.75)'; g.beginPath(); g.moveTo(0, -size * 1.1); g.lineTo(size * 0.45, -size * 0.1); g.lineTo(0, 0); g.closePath(); g.fill();
  return c;
}
const GEM_TIERS = [[25, 9, '#ff4fd8'], [5, 7, '#7c8cff'], [1, 5, '#2ef2ff']].map(([v, s, c]) => ({ v, s, c, img: gemSprite(c, s) }));
const MEDKIT = (() => { const c = makeCanvas(26), g = c.getContext('2d'); g.fillStyle = '#f4f6fb'; g.strokeStyle = OUTLINE; g.lineWidth = 3; rr(g, 2, 2, 22, 22, 4); g.fill(); g.stroke(); g.fillStyle = '#e8283c'; g.fillRect(10, 5, 6, 16); g.fillRect(5, 10, 16, 6); return c; })();

export const Pickups = {
  list: [], worldT: 0, dropCd: 0,
  reset() { this.list.length = 0; this.worldT = rand(75, 100); this.dropCd = 0; },
  gems(x, y, value) {
    let v = Math.max(1, Math.round(value));
    for (const t of GEM_TIERS) while (v >= t.v) {
      v -= t.v; const a = vrand(TAU), s = vrand(80, 220);
      this.list.push({ kind: 'xp', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, z: 0, vz: vrand(120, 220), value: t.v, tier: t, t: vrand(TAU), mag: false, age: 0, spd: 0 });
    }
    if (this.list.length > 320) { let n = 0; for (const g of this.list) if (g.kind === 'xp' && !g.mag && n++ < 60) g.mag = true; }
  },
  health(x, y, amt = 25, world = false) {
    if (solidAt(x, y)) { const s = findReachableSpot(x, y, 0, 120, false); if (s) { x = s[0]; y = s[1]; } }
    this.list.push({ kind: 'hp', x, y, vx: world ? 0 : vrand(-60, 60), vy: world ? 0 : vrand(-60, 60), z: 0, vz: world ? 0 : 180, value: amt, t: 0, mag: false, age: 0, life: world ? 45 : 35, world, spd: 0 });
  },
  supply(x, y, xp) { this.list.push({ kind: 'supply', x, y, vx: 0, vy: 0, z: 0, vz: 0, land: 3.2, xp, t: 0, age: 0, life: 40, mag: false, crate: Math.random() < 0.5 }); },
  // equipment crate: walk over it to open the equipment choice cards
  equipCrate(x, y, from = 'wave') {
    if (G.game.mode === 'training') return;
    if (solidAt(x, y)) { const s = findReachableSpot(x, y, 0, 150, false); if (s) { x = s[0]; y = s[1]; } }
    this.list.push({ kind: 'crate', x, y, vx: 0, vy: 0, z: 0, vz: 0, t: 0, age: 0, life: 90, mag: false, from });
    FX.add(P_RING, x, y, 0, 0, 0.6, 80, '#b46bff', { lw: 6 });
  },
  rollEnemyDrop(e, p) {
    if (e.summoned || e.age < 1.5 || this.dropCd > 0) return false;   // no farming boss minions or fresh spawns
    let c = MEDKIT_DROP[p.S.medic] * p.S.medkitDrop * G.game.mods.medkit;
    if (p.S.emergency && p.hp < p.maxHp * 0.4) c *= 1.6 + 0.6 * p.S.emergency;
    if (Math.random() < c) { this.health(e.x, e.y, 25); this.dropCd = 6; return true; }
    return false;
  },
  updateWorld(dt, p) {
    this.dropCd -= dt;
    if (!G.game.mods.worldMedkits) return;
    this.worldT -= dt * (p.S.emergency && p.hp < p.maxHp * 0.4 ? 2 : 1);
    if (this.worldT <= 0) {
      this.worldT = rand(75, 100) * WORLD_MEDKIT_MUL[p.S.medic];
      if (!this.list.some(g => g.kind === 'hp' && g.world)) {
        const s = findReachableSpot(p.x, p.y, 350, 850, true);
        if (s) { this.health(s[0], s[1], 30, true); FX.text(p.x, p.y - 40, 'MEDKIT NEARBY', PAL.heal, 16); }
      }
    }
  },
  update(dt, p) {
    const R2 = 95 * p.S.magnet, L = this.list;
    for (let i = L.length - 1; i >= 0; i--) {
      const g = L[i];
      g.t += dt * 4; g.age += dt;
      const remove = () => { L[i] = L[L.length - 1]; L.pop(); };
      if (g.life !== undefined) { g.life -= dt; if (g.life <= 0) { if (g.kind === 'hp') FX.dust(g.x, g.y, 4); remove(); continue; } }
      if (g.kind === 'supply') {
        if (g.land > 0) { g.land -= dt; if (Math.random() < dt * 20) FX.add(P_SMOKE, g.x + vrand(-6, 6), g.y + vrand(-6, 6), vrand(-10, 10), vrand(-40, -15), 1.2, 6, 'rgba(255,80,90,', { grow: 14, a: 0.5 }); if (g.land <= 0) { FX.crateBurst(g.x, g.y); Sound.crate(); G.game.shake(6); } }
        else if (dist2(g.x, g.y, p.x, p.y) < 40 * 40) {
          this.health(g.x + 20, g.y, 35); this.gems(g.x, g.y, g.xp);
          if (g.crate) this.equipCrate(g.x - 24, g.y);
          FX.sparkle(g.x, g.y, '#ffd23f', 24, 300); FX.text(g.x, g.y - 30, 'SUPPLIES', '#ffd23f', 20, { crit: true }); Sound.confirm();
          G.game.track('caches', 1); remove();
        }
        continue;
      }
      if (g.kind === 'crate') {
        if (dist2(g.x, g.y, p.x, p.y) < 42 * 42 && G.game.state === 'play') { remove(); G.game.openCrate(g); }
        continue;
      }
      if (g.z > 0 || g.vz > 0) { g.vz -= 800 * dt; g.z += g.vz * dt; if (g.z < 0) { g.z = 0; g.vz = Math.abs(g.vz) > 50 ? -g.vz * 0.45 : 0; } }
      const d2 = dist2(g.x, g.y, p.x, p.y);
      if (!g.mag && g.age > 0.25 && d2 < R2 * R2 && (g.kind === 'xp' || p.hp < p.maxHp)) g.mag = true;
      if (g.mag) {
        const d = Math.sqrt(d2) || 1;
        g.spd = Math.min(1600, (g.spd || 260) + 2200 * dt);
        if (d < p.r + 10 + g.spd * dt) { this.collect(g, p); remove(); continue; }
        g.vx = (p.x - g.x) / d * g.spd; g.vy = (p.y - g.y) / d * g.spd;
        g.x += g.vx * dt; g.y += g.vy * dt;
      } else if (g.vx || g.vy) {
        const k = Math.exp(-4 * dt); g.vx *= k; g.vy *= k;
        if (Math.abs(g.vx) + Math.abs(g.vy) < 2) { g.vx = 0; g.vy = 0; }
        const nx = g.x + g.vx * dt, ny = g.y + g.vy * dt;
        if (!solidAt(nx, g.y)) g.x = nx; else g.vx = -g.vx;
        if (!solidAt(g.x, ny)) g.y = ny; else g.vy = -g.vy;
      }
    }
  },
  collect(g, p) {
    if (g.kind === 'hp') { G.game.heal(g.value, 'medkit'); FX.sparkle(p.x, p.y, '#7dffa8', 12, 200); G.game.track('medkits', 1); return; }
    p.pickStreak++; p.pickT = 0.6;
    G.game.addXp(g.value);
    FX.sparkle(g.x, g.y, g.tier.c, g.value >= 5 ? 8 : 4, 120);
    Sound.pickup(p.pickStreak);
    G.tutorial && G.tutorial.done('xp');
  },
  draw(v, time) {
    for (const g of this.list) {
      if (g.x < v.x0 || g.x > v.x1 || g.y < v.y0 || g.y > v.y1) continue;
      const y = g.y - g.z * 0.3;
      if (g.kind === 'xp') { const s = 1 + Math.sin(g.t) * 0.12, w = g.tier.img.width * s; ctx.drawImage(g.tier.img, g.x - w / 2, y - w / 2, w, w); R.draws++; continue; }
      if (g.kind === 'supply') { drawSupply(g, time); continue; }
      if (g.kind === 'crate') { drawCrate(g, time); continue; }
      if (g.life < 8 && Math.floor(time * 8) % 2) continue;
      ctx.globalCompositeOperation = 'lighter'; glow(GLOW.green, g.x, y, g.world ? 44 : 30, 0.5 + (g.world ? Math.sin(time * 4) * 0.2 : 0)); ctx.globalCompositeOperation = 'source-over';
      if (g.world) { ctx.strokeStyle = 'rgba(82,240,138,0.6)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(g.x, y, 22 + Math.sin(time * 4) * 4, 0, TAU); ctx.stroke(); }
      ctx.drawImage(MEDKIT, g.x - 13, y - 13); R.draws++;
    }
  },
};
function drawSupply(g, time) {
  if (g.land > 0) {
    const k = 1 - g.land / 3.2;
    ctx.strokeStyle = `rgba(255,210,63,${0.5 + Math.sin(time * 10) * 0.3})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(g.x, g.y, 34, 0, TAU); ctx.stroke();
    ctx.fillStyle = `rgba(0,0,0,${0.15 + k * 0.35})`; ctx.beginPath(); ctx.ellipse(g.x, g.y, 10 + k * 18, 6 + k * 12, 0, 0, TAU); ctx.fill();
    return;
  }
  ctx.globalCompositeOperation = 'lighter'; glow(GLOW.gold, g.x, g.y, 50, 0.4 + Math.sin(time * 5) * 0.15); ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#4b5a3a'; ctx.strokeStyle = OUTLINE; ctx.lineWidth = 3; rr(ctx, g.x - 18, g.y - 14, 36, 28, 4); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#ffd23f'; ctx.fillRect(g.x - 18, g.y - 3, 36, 6); ctx.fillStyle = '#f4f6fb'; ctx.fillRect(g.x - 3, g.y - 11, 6, 22);
}
function drawCrate(g, time) {
  const bob = Math.sin(time * 3) * 2;
  ctx.globalCompositeOperation = 'lighter'; glow(GLOW.violet, g.x, g.y, 64, 0.45 + Math.sin(time * 4) * 0.15); ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = `rgba(180,107,255,${0.5 + Math.sin(time * 6) * 0.3})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(g.x, g.y, 30 + Math.sin(time * 3) * 3, 0, TAU); ctx.stroke();
  ctx.fillStyle = '#2b2440'; ctx.strokeStyle = OUTLINE; ctx.lineWidth = 3; rr(ctx, g.x - 20, g.y - 16 + bob, 40, 32, 5); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#b46bff'; ctx.fillRect(g.x - 20, g.y - 3 + bob, 40, 6); ctx.fillStyle = '#ffc93c'; ctx.fillRect(g.x - 4, g.y - 16 + bob, 8, 32);
  ctx.fillStyle = '#fff'; ctx.fillRect(g.x - 2, g.y - 2 + bob, 4, 4);
  R.draws++;
}

// ---------- hazards ----------
const near = [];
export const Hazards = {
  list: [],
  reset() { this.list.length = 0; },
  push(h) { if (this.list.length < 220) this.list.push(h); return h; },
  fire(x, y, dps, ignite, dur = 1.6) { return this.push({ kind: 'fire', x, y, r: 26, life: dur, max: dur, dps, ignite, t: 0 }); },
  energy(x, y, dps) { return this.push({ kind: 'energy', x, y, r: 18, life: 0.6, max: 0.6, dps, t: 0 }); },
  // enemy hazards (all telegraphed, avoidable)
  enemyGrenade(x, y, tx, ty, fuse, r, dmg) { return this.push({ kind: 'egrenade', x, y, sx: x, sy: y, tx, ty, life: fuse, max: fuse, r, dmg }); },
  artillery(x, y, delay, r, dmg) { return this.push({ kind: 'arty', x, y, life: delay, max: delay, r, dmg }); },
  lineStrike(x, y, a, len, delay, dmg) { return this.push({ kind: 'line', x, y, a, len, life: delay, max: delay, dmg }); },
  update(dt) {
    const S = W.player.S, p = W.player;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const h = this.list[i]; h.life -= dt; h.t = (h.t || 0) - dt;
      if (h.kind === 'egrenade') { const k = 1 - h.life / h.max; h.x = lerp(h.sx, h.tx, Math.min(1, k * 2)); h.y = lerp(h.sy, h.ty, Math.min(1, k * 2)); }
      if (h.life <= 0) {
        if (h.kind === 'egrenade' || h.kind === 'arty') {
          FX.explosion(h.x, h.y, h.r); Sound.explode(); G.game.shake(6);
          if (dist2(p.x, p.y, h.x, h.y) < (h.r + p.r) ** 2) G.game.hurtPlayer(h.dmg, Math.atan2(p.y - h.y, p.x - h.x), { explosion: true, elite: true });
          G.destruct.damageTilesInRadius(h.x, h.y, h.r * 0.7, 40);
        } else if (h.kind === 'line') {
          const ex = h.x + Math.cos(h.a) * h.len, ey = h.y + Math.sin(h.a) * h.len;
          FX.arc(h.x, h.y, ex, ey, '#ffd23f'); FX.arc(h.x, h.y, ex, ey, '#fff7c0'); Sound.zap();
          const dx = ex - h.x, dy = ey - h.y, l2 = dx * dx + dy * dy, t = Math.max(0, Math.min(1, ((p.x - h.x) * dx + (p.y - h.y) * dy) / l2));
          if (dist2(p.x, p.y, h.x + dx * t, h.y + dy * t) < (p.r + 16) ** 2) G.game.hurtPlayer(h.dmg, h.a, { ranged: true, elite: true });
        }
        this.list.splice(i, 1); continue;
      }
      if (h.kind === 'fire' && Math.random() < dt * 14) FX.add(P_EMBER, h.x + vrand(-14, 14), h.y + vrand(-14, 14), vrand(-20, 20), vrand(-60, -20), vrand(0.3, 0.6), vrand(3, 6), Math.random() < 0.5 ? '#ff8a1f' : '#ffd23f', { drag: 2 });
      if ((h.kind === 'fire' || h.kind === 'energy') && h.t <= 0) {
        h.t = 0.2;
        Grid.near(h.x, h.y, h.r + 30, near);
        for (const e of near) {
          if (dist2(h.x, h.y, e.x, e.y) > (h.r + e.r) ** 2) continue;
          G.game.damageEnemy(e, h.dps * 0.2, 0, 0, false, h.kind === 'fire' ? (h.gadget ? 'gadget' : 'fire') : 'chain');
          if (h.ignite) applyBurn(e, (10 + 5 * S.incendiary) * S.elemMul, 2.5 * S.elemDur);
        }
      }
    }
  },
  draw(v, time) {
    ctx.globalCompositeOperation = 'lighter';
    for (const h of this.list) if ((h.kind === 'fire' || h.kind === 'energy') && h.x > v.x0 && h.x < v.x1 && h.y > v.y0 && h.y < v.y1) glow(h.kind === 'fire' ? GLOW.fire : GLOW.xp, h.x, h.y, h.r * 1.8, (h.life / h.max) * 0.7);
    ctx.globalCompositeOperation = 'source-over';
    for (const h of this.list) {
      const k = 1 - h.life / h.max;
      if (h.kind === 'egrenade' || h.kind === 'arty') {
        ctx.fillStyle = `rgba(255,59,78,${0.1 + 0.18 * k})`; ctx.beginPath(); ctx.arc(h.tx ?? h.x, h.ty ?? h.y, h.r, 0, TAU); ctx.fill();
        ctx.strokeStyle = PAL.danger; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(h.tx ?? h.x, h.ty ?? h.y, h.r * k, 0, TAU); ctx.stroke();
        if (h.kind === 'egrenade') { ctx.fillStyle = '#2b2e35'; ctx.beginPath(); ctx.arc(h.x, h.y, 6, 0, TAU); ctx.fill(); ctx.fillStyle = Math.sin(time * 30) > 0 ? PAL.danger : '#fff'; ctx.fillRect(h.x - 1.5, h.y - 1.5, 3, 3); }
      } else if (h.kind === 'line') {
        ctx.save(); ctx.translate(h.x, h.y); ctx.rotate(h.a);
        ctx.fillStyle = `rgba(255,210,63,${0.1 + 0.25 * k})`; ctx.fillRect(0, -14, h.len, 28);
        ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 1.5; ctx.setLineDash([8, 6]); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(h.len, 0); ctx.stroke(); ctx.setLineDash([]);
        ctx.restore();
      }
    }
  },
};

// ---------- Ghost Step decoys ----------
export const Decoys = {
  list: [],
  reset() { this.list.length = 0; },
  add(x, y, life, lure, pulses) { if (this.list.length > 4) this.list.shift(); this.list.push({ x, y, life, max: life, lure, pulses, pulseT: 0.6 }); },
  target(e) { for (const d of this.list) if (dist2(d.x, d.y, e.x, e.y) < d.lure * d.lure) return d; return null; },
  pulse(d) {
    const dmg = 30 * Math.sqrt(W.player.S.dmgMul);
    FX.add(P_RING, d.x, d.y, 0, 0, 0.3, 110, '#c49bff', { lw: 5 });
    Grid.near(d.x, d.y, 140, near);
    for (const e of near) if (dist2(d.x, d.y, e.x, e.y) < 120 * 120) G.game.damageEnemy(e, dmg, Math.atan2(e.y - d.y, e.x - d.x), 300, false, 'shock');
  },
  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const d = this.list[i]; d.life -= dt;
      if (d.pulses) { d.pulseT -= dt; if (d.pulseT <= 0) { d.pulseT = 0.6; this.pulse(d); } }
      if (d.life <= 0) { if (d.pulses) this.pulse(d); FX.sparkle(d.x, d.y, '#c49bff', 10, 160); this.list.splice(i, 1); }
    }
  },
  draw(v, time) {
    const look = lookToOpts(G.profileLook());
    for (const d of this.list) {
      ctx.globalAlpha = Math.min(1, d.life / 0.3) * (0.4 + Math.sin(time * 10) * 0.1);
      drawHumanCached(v, d.x, d.y, W.player.a, Object.assign({}, look, { jacket: '#9ff6ff', skin: '#d8fbff', hair: '#9ff6ff', pants: '#9ff6ff', weapon: W.player.weapon }), 'gdecoy' + W.player.weapon, 0, false, false, 1, 1, false);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = 'rgba(196,155,255,0.25)'; ctx.lineWidth = 2; ctx.setLineDash([6, 8]);
      ctx.beginPath(); ctx.arc(d.x, d.y, d.lure * (1 - d.life / d.max * 0.15), 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    }
  },
};
