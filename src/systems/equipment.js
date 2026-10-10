// Equipment runtime: activation (Q gadget / E support), cooldowns, deployables and their rank/rarity
// mechanics, and equipment synergies. Numbers come from data/equipment.js (shared with tests/UI text).
import { TAU, dist2, lerp, clamp, vrand } from '../core/util.js';
import { G, W } from '../core/registry.js';
import { ctx, R } from '../core/canvas.js';
import { PAL } from '../core/settings.js';
import { Sound } from '../core/audio.js';
import { mouse } from '../core/input.js';
import { solidAt, lineOfSight } from '../world/map.js';
import { EQ, v, atLeast } from '../data/equipment.js';
import { tickCooldown, consumeCharge, canActivate, maxCharges } from './equipmentRules.js';
import { Grid } from './grid.js';
import { FX, P_RING } from '../rendering/fx.js';
import { drawHumanCached, lookToOpts } from '../rendering/sprites.js';
import { Bullets, pickTarget, spawnFragments, applyBurn, drawDrone, nearestEnemy } from '../entities/combat.js';
import { addBuff, buff } from '../entities/player.js';

const near = [];
const scale = () => 1 + 0.08 * (G.game.wave - 1);                 // gadget damage keeps pace with waves
const pdm = p => 0.6 + 0.4 * p.S.dmgMul;                            // and partially with damage upgrades
const aimPoint = (p, range) => {
  const dx = mouse.x - p.x, dy = mouse.y - p.y, d = Math.hypot(dx, dy) || 1, k = Math.min(1, range / d);
  let x = p.x + dx * k, y = p.y + dy * k;
  if (solidAt(x, y) || !lineOfSight(p.x, p.y, x, y)) { for (let t = 0.9; t > 0.1; t -= 0.1) { const tx = p.x + dx * k * t, ty = p.y + dy * k * t; if (!solidAt(tx, ty) && lineOfSight(p.x, p.y, tx, ty)) { x = tx; y = ty; break; } } }
  return [x, y];
};

export const Equip = {
  grenades: [], mines: [], turrets: [], holos: [], bubbles: [], drones: [], focus: null, revealT: 0, autoReconT: 20, autoBarrierCd: 0, bulwark: 0, stimExt: 0, flash: { gadget: 0, support: 0 },
  reset() { for (const k of ['grenades', 'mines', 'turrets', 'holos', 'bubbles', 'drones']) this[k].length = 0; this.focus = null; this.revealT = 0; this.autoReconT = 20; this.autoBarrierCd = 0; this.bulwark = 0; this.stimExt = 0; },
  activate(slot) {
    const p = W.player, it = p.eq[slot];
    if (!it || !EQ[it.id].active) return false;
    if (!canActivate(it)) { this.flash[slot] = 0.3; Sound.error(); return false; }
    consumeCharge(it);
    G.game.run.equipUsed[it.id] = (G.game.run.equipUsed[it.id] || 0) + 1;
    G.tutorial && G.tutorial.done('gadget');
    this['use_' + it.id](p, it);
    return true;
  },
  // ---------------- gadgets ----------------
  throwNade(p, it, kind, extra = {}) {
    const [tx, ty] = aimPoint(p, 420);
    this.grenades.push(Object.assign({ kind, x: p.x, y: p.y, sx: p.x, sy: p.y, tx, ty, t: 0, flight: 0.4, fuse: 0.9, it: { ...it }, stuck: null }, extra));
    if (this.grenades.length > 8) this.grenades.shift();
    Sound.throwG();
  },
  use_frag(p, it) { this.throwNade(p, it, 'frag'); },
  use_emp(p, it) { this.throwNade(p, it, 'emp'); },
  use_cluster(p, it) { this.throwNade(p, it, 'cluster'); },
  use_mine(p, it) {
    const max = v('mine', 'max', it.rank);
    while (this.mines.filter(m => !m.mini).length >= max) this.mines.splice(this.mines.findIndex(m => !m.mini), 1);
    this.mines.push({ x: p.x, y: p.y, arm: atLeast(it.rarity, 'rare') ? 0.15 : 0.6, it: { ...it }, trig: -1, mini: false });
    Sound.beep();
  },
  use_turret(p, it) {
    const max = v('turret', 'max', it.rank);
    while (this.turrets.length >= max) this.turrets.shift();
    const [x, y] = aimPoint(p, 220);
    this.turrets.push({ x, y, a: p.a, t: v('turret', 'dur', it.rank), max: v('turret', 'dur', it.rank), cd: 0, burstT: 3, it: { ...it } });
    Sound.deploy(); FX.add(P_RING, x, y, 0, 0, 0.3, 40, '#2ef2ff', { lw: 3 });
  },
  use_decoy(p, it) {
    const [x, y] = aimPoint(p, 260), n = atLeast(it.rarity, 'legendary') ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const ox = n > 1 ? (i ? 40 : -40) : 0;
      this.holos.push({ x: x + ox, y, t: v('decoy', 'dur', it.rank), max: v('decoy', 'dur', it.rank), hp: v('decoy', 'hp', it.rank), lure: 380 * (atLeast(it.rarity, 'rare') ? 1.25 : 1), cd: 0, it: { ...it }, damage(d) { this.hp -= d; } });
    }
    while (this.holos.length > 2) this.holos.shift();
    Sound.deploy();
  },
  use_shock(p, it) {
    const pulse = (strength = 1) => {
      const r = v('shock', 'radius', it.rank), dmg = v('shock', 'dmg', it.rank) * scale() * pdm(p) * strength, kb = 450 * (atLeast(it.rarity, 'rare') ? 1.4 : 1);
      FX.add(P_RING, p.x, p.y, 0, 0, 0.3, r, '#9ff6ff', { lw: 8 }); FX.distort(p.x, p.y, r); Sound.zap(); G.game.shake(6);
      Grid.near(p.x, p.y, r + 30, near);
      const hitIds = [];
      for (const e of near) if (dist2(p.x, p.y, e.x, e.y) < (r + e.r) ** 2) { hitIds.push(e.id); FX.arc(p.x, p.y, e.x, e.y); G.game.damageEnemy(e, dmg, Math.atan2(e.y - p.y, e.x - p.x), kb, false, 'gadget'); }
      if (it.rank >= 3) for (let k = 0; k < 3; k++) { const t = nearestEnemy(p.x, p.y, 400, hitIds); if (!t) break; hitIds.push(t.id); FX.arc(p.x, p.y, t.x, t.y, '#d8f4ff'); G.game.damageEnemy(t, dmg * 0.5, Math.atan2(t.y - p.y, t.x - p.x), 120, false, 'gadget'); }
    };
    pulse();
    if (atLeast(it.rarity, 'epic')) p.invuln = Math.max(p.invuln, 0.5);
    if (atLeast(it.rarity, 'legendary')) G.game.later(0.4, () => pulse(0.6));
  },
  use_stim(p, it) {
    addBuff(p, 'eqStim', v('stim', 'dur', it.rank) + (atLeast(it.rarity, 'rare') ? 1 : 0)); this.stimExt = 0;
    if (it.rank >= 3) G.game.heal(p.maxHp * 0.1, 'stim');
    if (atLeast(it.rarity, 'epic')) p.dashCdT = 0;
    FX.add(P_RING, p.x, p.y, 0, 0, 0.35, 70, '#ff9a1f', { lw: 5 }); Sound.select(false);
  },
  // ---------------- support ----------------
  use_injector(p, it) {
    G.game.heal(v('injector', 'heal', it.rank) * (atLeast(it.rarity, 'rare') ? 1.1 : 1), 'injector');
    if (it.rank >= 3) addBuff(p, 'injRegen', 3);
    if (atLeast(it.rarity, 'epic')) addBuff(p, 'injectorDR', 2);
  },
  use_resupply(p, it) { this.resupply(p, it); },
  resupply(p, it) {
    const extra = atLeast(it.rarity, 'rare') ? 2 : 0;
    p.ammo = p.gun.mag; p.reloading = 0;
    addBuff(p, 'resupply', 6 + extra);
    if (it.rank >= 3) addBuff(p, 'resupplyDmg', 6 + extra);
    if (atLeast(it.rarity, 'epic')) addBuff(p, 'infAmmo', 3);
    FX.text(p.x, p.y - 36, 'RESUPPLIED', '#ffd23f', 16); Sound.reloadDone();
  },
  autoResupply(p) {
    const it = p.eq.support;
    if (it.id !== 'resupply' || !atLeast(it.rarity, 'legendary') || !canActivate(it)) return false;
    consumeCharge(it); this.resupply(p, it); return true;
  },
  use_recon(p, it) { this.recon(p, it); },
  recon(p, it) {
    const r = 1100 * (atLeast(it.rarity, 'rare') ? 1.3 : 1), bonus = v('recon', 'bonus', it.rank);
    FX.add(P_RING, p.x, p.y, 0, 0, 0.6, r * 0.4, PAL.danger, { lw: 3 }); FX.add(P_RING, p.x, p.y, 0, 0, 0.9, r * 0.8, PAL.danger, { lw: 2 }); Sound.beep();
    Grid.near(p.x, p.y, r, near);
    for (const e of near) { e.reconT = 6; e.reconBonus = bonus; e.reconSlow = atLeast(it.rarity, 'epic') && (e.boss || e.d.elite); }
    if (it.rank >= 3) this.revealT = 15;
  },
  use_projector(p, it) {
    this.bubbles.length = 0;
    const r = 120 * (atLeast(it.rarity, 'rare') ? 1.2 : 1);
    this.bubbles.push({ x: p.x, y: p.y, r, t: v('projector', 'dur', it.rank), max: v('projector', 'dur', it.rank), it: { ...it } });
    Sound.shield(); FX.add(P_RING, p.x, p.y, 0, 0, 0.3, r, '#2ef2ff', { lw: 5 });
  },
  use_beacon(p, it) {
    const dur = v('beacon', 'dur', it.rank) * (atLeast(it.rarity, 'legendary') ? 2 : 1), n = it.rank >= 3 ? 2 : 1;
    this.drones.length = 0;
    for (let i = 0; i < n; i++) this.drones.push({ x: p.x, y: p.y - 30, px: p.x, py: p.y, a: 0, t: i * Math.PI, cd: 0.3, life: dur, it: { ...it } });
    Sound.deploy();
  },
  use_barrier(p, it) {
    const hp = v('barrier', 'hp', it.rank) * (atLeast(it.rarity, 'rare') ? 1.3 : 1);
    const b = G.destruct.placeBarrier(p.x, p.y, p.a, 3, hp, v('barrier', 'dur', it.rank), 'player', {
      touchDps: atLeast(it.rarity, 'epic') ? 20 : 0,
      onEnd: it.rank >= 3 ? bb => { const [cx, cy] = G.destruct.centre(bb); this.blast(cx, cy, 140, 60 * scale(), 'gadget', '#2ef2ff'); } : null,
    });
    if (!b) { FX.text(p.x, p.y - 34, 'NO ROOM', PAL.danger, 14); it.charges = Math.min(maxCharges(it), it.charges + 1); return; }
    Sound.deploy();
  },
  use_booster(p, it) {
    addBuff(p, 'booster', v('booster', 'dur', it.rank) + (atLeast(it.rarity, 'rare') ? 1 : 0));
    if (it.rank >= 3) p.dashCdT = 0;
    FX.add(P_RING, p.x, p.y, 0, 0, 0.3, 60, '#ff9a1f', { lw: 4 }); Sound.dash();
  },
  // ---------------- shared helpers ----------------
  blast(x, y, r, dmg, src, color = '#ffd27a') {
    G.game.explosion(x, y, r, dmg, 'gadget');
    if (color !== '#ffd27a') FX.add(P_RING, x, y, 0, 0, 0.3, r, color, { lw: 5 });
  },
  detonate(g) {
    const p = W.player, it = g.it;
    if (g.kind === 'frag') {
      const r = v('frag', 'radius', it.rank) * (atLeast(it.rarity, 'rare') ? 1.15 : 1);
      this.blast(g.x, g.y, r, v('frag', 'dmg', it.rank) * scale() * pdm(p), 'gadget');
      if (atLeast(it.rarity, 'legendary')) for (let k = 0; k < 5; k++) Object.assign(G.hazards.fire(g.x + vrand(-r * 0.5, r * 0.5), g.y + vrand(-r * 0.5, r * 0.5), 40 * scale(), false, 3), { gadget: true });
      if (p.S.eqSyn.eq_shrapnel) spawnFragments({ x: g.x, y: g.y, id: 0 }, 25 * scale(), 4, 'gadget');
    } else if (g.kind === 'emp') {
      const r = v('emp', 'radius', it.rank) * (atLeast(it.rarity, 'rare') ? 1.2 : 1);
      const pulse = () => {
        FX.add(P_RING, g.x, g.y, 0, 0, 0.45, r, '#9fe8ff', { lw: 6 }); FX.distort(g.x, g.y, r); Sound.zap();
        Grid.near(g.x, g.y, r + 30, near);
        for (const e of near) {
          if (dist2(g.x, g.y, e.x, e.y) > (r + e.r) ** 2) continue;
          if (e.d.ranged || e.boss) e.stunT = Math.max(e.stunT, e.boss ? 0.8 : v('emp', 'stun', it.rank));
          if (atLeast(it.rarity, 'legendary')) { e.stunT = Math.max(e.stunT, 1); e.stunAll = true; }
          e.supSlow = Math.max(e.supSlow, 0.3); e.supT = 3; e.empTagT = 5; e.empBonus = atLeast(it.rarity, 'epic') ? 0.2 : 0;
          FX.arc(g.x, g.y, e.x, e.y);
          G.game.damageEnemy(e, v('emp', 'dmg', it.rank) * scale(), Math.atan2(e.y - g.y, e.x - g.x), 80, false, 'gadget');
        }
        if (it.rank >= 3) for (const b of Bullets.list) if (b.enemy && dist2(b.x, b.y, g.x, g.y) < r * r) { b.dead = true; FX.sparkle(b.x, b.y, '#9fe8ff', 3, 80); }
      };
      pulse();
      if (atLeast(it.rarity, 'legendary')) G.game.later(1, pulse);
    } else if (g.kind === 'cluster') {
      const dmg = v('cluster', 'dmg', it.rank) * scale() * pdm(p);
      this.blast(g.x, g.y, 110, dmg, 'gadget');
      const n = v('cluster', 'bomblets', it.rank) + (atLeast(it.rarity, 'rare') ? 1 : 0), far = it.rank >= 3 ? 2 : 1;
      for (let k = 0; k < n; k++) {
        const a = vrand(TAU), d = vrand(60, 140) * far;
        this.grenades.push({ kind: 'bomblet', x: g.x, y: g.y, sx: g.x, sy: g.y, tx: g.x + Math.cos(a) * d, ty: g.y + Math.sin(a) * d, t: 0, flight: 0.35 * far, fuse: 0.45 * far + vrand(0, 0.25), it, dmg: dmg * 0.35, seek: atLeast(it.rarity, 'legendary'), ignite: atLeast(it.rarity, 'epic') });
      }
    } else if (g.kind === 'bomblet') {
      this.blast(g.x, g.y, 60, g.dmg, 'gadget');
      if (g.ignite) { Grid.near(g.x, g.y, 80, near); for (const e of near) if (dist2(g.x, g.y, e.x, e.y) < 70 * 70) applyBurn(e, 15 * scale(), 3); }
    }
  },
  update(dt, p) {
    const S = p.S;
    // cooldowns (training's "no cooldowns" mode multiplies the tick)
    const mul = G.training && G.training.noCooldowns ? 60 : 1;
    for (const slot of ['gadget', 'support']) { const it = p.eq[slot]; if (tickCooldown(it, dt, mul) && it.charges === maxCharges(it)) Sound.gadgetReady(); this.flash[slot] = Math.max(0, this.flash[slot] - dt); }
    this.revealT -= dt; this.autoBarrierCd -= dt;
    // passive support behaviours
    const sup = p.eq.support;
    if (sup.id === 'recon' && atLeast(sup.rarity, 'legendary')) { this.autoReconT -= dt; if (this.autoReconT <= 0) { this.autoReconT = 20; this.recon(p, sup); } }
    if (sup.id === 'barrier' && atLeast(sup.rarity, 'legendary') && p.hp < p.maxHp * 0.3 && this.autoBarrierCd <= 0) { this.autoBarrierCd = 60; this.use_barrier(p, sup); FX.text(p.x, p.y - 40, 'EMERGENCY COVER', '#2ef2ff', 16); }
    // grenades / bomblets
    for (let i = this.grenades.length - 1; i >= 0; i--) {
      const g = this.grenades[i]; g.t += dt;
      if (g.stuck && !g.stuck.dead) { g.x = g.stuck.x; g.y = g.stuck.y; }
      else if (g.t < g.flight) {
        const k = g.t / g.flight; g.x = lerp(g.sx, g.tx, k); g.y = lerp(g.sy, g.ty, k);
        if (g.seek) { const t = nearestEnemy(g.x, g.y, 200); if (t) { g.tx = lerp(g.tx, t.x, 0.15); g.ty = lerp(g.ty, t.y, 0.15); } }
        if (g.kind === 'frag' && atLeast(g.it.rarity, 'epic')) { const t = nearestEnemy(g.x, g.y, 30); if (t) { g.stuck = t; FX.text(t.x, t.y - 30, 'STUCK!', '#ffd23f', 14); } }
      }
      if (g.t >= g.flight + g.fuse) { this.grenades.splice(i, 1); this.detonate(g); }
    }
    // mines
    for (let i = this.mines.length - 1; i >= 0; i--) {
      const m = this.mines[i]; m.arm -= dt;
      if (m.arm > 0) continue;
      if (m.trig < 0) {
        Grid.near(m.x, m.y, 80, near);
        if (near.some(e => dist2(e.x, e.y, m.x, m.y) < (70 + e.r) ** 2)) { m.trig = atLeast(m.it.rarity, 'epic') && !m.mini ? 0.3 : 0.05; Sound.beep(); }
        continue;
      }
      m.trig -= dt;
      if (atLeast(m.it.rarity, 'epic') && !m.mini) { Grid.near(m.x, m.y, 180, near); for (const e of near) { const d = Math.hypot(m.x - e.x, m.y - e.y) || 1; e.kvx += (m.x - e.x) / d * 900 * dt; e.kvy += (m.y - e.y) / d * 900 * dt; } }
      if (m.trig <= 0) {
        this.mines.splice(i, 1);
        const dmg = v('mine', 'dmg', m.it.rank) * scale() * pdm(p) * (m.mini ? 0.4 : 1), r = m.mini ? 80 : 130;
        this.blast(m.x, m.y, r, dmg, 'gadget');
        if (S.eqSyn.eq_napalm) { Grid.near(m.x, m.y, r + 20, near); for (const e of near) if (dist2(e.x, e.y, m.x, m.y) < r * r) applyBurn(e, 18 * scale() * S.elemMul, 3.5 * S.elemDur); }
        if (atLeast(m.it.rarity, 'legendary') && !m.mini) for (let k = 0; k < 3; k++) { const a = k * TAU / 3 + vrand(0.5); this.mines.push({ x: m.x + Math.cos(a) * 70, y: m.y + Math.sin(a) * 70, arm: 0.5, it: m.it, trig: -1, mini: true }); }
      }
    }
    // turrets
    const shared = !!S.eqSyn.eq_netwar;
    for (let i = this.turrets.length - 1; i >= 0; i--) {
      const t = this.turrets[i]; t.t -= dt; t.cd -= dt; t.burstT -= dt;
      if (t.t <= 0) { this.turrets.splice(i, 1); FX.dust(t.x, t.y, 6); continue; }
      const rare = atLeast(t.it.rarity, 'rare'), tgt = pickTarget(t.x, t.y, 520, shared, shared ? this.focus : null);
      if (shared && tgt) this.focus = tgt;
      if (tgt) t.a += Math.atan2(Math.sin(Math.atan2(tgt.y - t.y, tgt.x - t.x) - t.a), Math.cos(Math.atan2(tgt.y - t.y, tgt.x - t.x) - t.a)) * Math.min(1, dt * (rare ? 16 : 9));
      if (tgt && t.cd <= 0 && lineOfSight(t.x, t.y, tgt.x, tgt.y)) {
        t.cd = rare ? 0.18 : 0.25;
        Bullets.player(t.x + Math.cos(t.a) * 18, t.y + Math.sin(t.a) * 18, t.a + vrand(-0.03, 0.03), 1150, { dmg: v('turret', 'dmg', t.it.rank) * scale() * pdm(p) * (shared ? 1.15 : 1), life: 0.6, r: 4, knock: 70, trail: '#5ff4ff', width: 2.5, pierce: atLeast(t.it.rarity, 'epic') ? 2 : 0, src: 'gadget', critMul: 2 });
        Sound.turret();
      }
      if (atLeast(t.it.rarity, 'legendary') && t.burstT <= 0) { t.burstT = 3; for (let k = 0; k < 12; k++) Bullets.player(t.x, t.y, k * TAU / 12 + t.a, 900, { dmg: v('turret', 'dmg', t.it.rank) * scale() * 0.6, life: 0.5, r: 4, knock: 120, trail: '#9ff6ff', width: 2, src: 'gadget', critMul: 2 }); FX.add(P_RING, t.x, t.y, 0, 0, 0.25, 60, '#9ff6ff', { lw: 3 }); }
    }
    // holographic decoys
    for (let i = this.holos.length - 1; i >= 0; i--) {
      const h = this.holos[i]; h.t -= dt; h.cd -= dt;
      if (atLeast(h.it.rarity, 'epic') && h.cd <= 0) { const t = nearestEnemy(h.x, h.y, 420, null, true); if (t) { h.cd = 0.5; Bullets.player(h.x, h.y, Math.atan2(t.y - h.y, t.x - h.x), 1000, { dmg: 10 * scale(), life: 0.6, r: 4, knock: 40, trail: '#9ff6ff', width: 2, src: 'gadget', critMul: 2 }); } }
      if (h.t <= 0 || h.hp <= 0) {
        this.holos.splice(i, 1); FX.sparkle(h.x, h.y, '#9ff6ff', 14, 200);
        if (h.it.rank >= 3) this.blast(h.x, h.y, 130, 80 * scale() * pdm(p), 'gadget', '#9ff6ff');
        if (S.eqSyn.eq_phantom) G.decoys.pulse(h);
      }
    }
    // shield bubbles
    for (let i = this.bubbles.length - 1; i >= 0; i--) {
      const b = this.bubbles[i]; b.t -= dt;
      if (atLeast(b.it.rarity, 'legendary')) { b.x = p.x; b.y = p.y; }
      if (atLeast(b.it.rarity, 'epic')) { Grid.near(b.x, b.y, b.r, near); for (const e of near) if (dist2(e.x, e.y, b.x, b.y) < b.r * b.r) { e.supSlow = Math.max(e.supSlow, 0.3); e.supT = Math.max(e.supT, 0.3); } }
      if (b.t <= 0) this.bubbles.splice(i, 1);
    }
    // beacon drones
    for (let i = this.drones.length - 1; i >= 0; i--) {
      const d = this.drones[i]; d.life -= dt; d.t += dt; d.cd -= dt;
      if (d.life <= 0) { this.drones.splice(i, 1); FX.sparkle(d.x, d.y, '#ff9a1f', 10, 160); continue; }
      const a = d.t * 1.6 + i * Math.PI, tx = p.x + Math.cos(a) * 70, ty = p.y + Math.sin(a) * 70 - 10;
      d.px = d.x; d.py = d.y; d.x += (tx - d.x) * Math.min(1, dt * 6); d.y += (ty - d.y) * Math.min(1, dt * 6);
      const tgt = pickTarget(d.x, d.y, 480, true, shared ? this.focus : null);
      if (tgt) d.a = Math.atan2(tgt.y - d.y, tgt.x - d.x);
      if (tgt && d.cd <= 0 && lineOfSight(d.x, d.y, tgt.x, tgt.y)) {
        d.cd = 0.35 * (atLeast(d.it.rarity, 'rare') ? 0.77 : 1);
        Bullets.player(d.x, d.y, d.a, 1050, { dmg: 18 * scale() * pdm(p), life: 0.6, r: 4, knock: 60, trail: '#ffb347', width: 2.5, src: 'gadget', critMul: 2, boom: atLeast(d.it.rarity, 'epic') });
        Sound.turret();
      }
    }
  },
  // ---------------- hooks used by other systems ----------------
  interceptEnemyBullet(b) {
    for (const bub of this.bubbles) {
      if (dist2(b.x, b.y, bub.x, bub.y) < bub.r * bub.r && dist2(b.px, b.py, bub.x, bub.y) >= bub.r * bub.r * 0.8) {
        FX.sparkle(b.x, b.y, '#2ef2ff', 4, 120);
        if (bub.it.rank >= 3) Bullets.player(b.x, b.y, Math.atan2(b.vy, b.vx) + Math.PI, 900, { dmg: b.dmg * 2, life: 0.8, r: 5, knock: 60, trail: '#2ef2ff', width: 3, src: 'gadget', critMul: 2 });
        const p = W.player;
        if (p.S.eqSyn.eq_bulwark) { this.bulwark += b.dmg; if (this.bulwark >= 40) { this.bulwark = 0; G.game.shockwave(bub.x, bub.y, bub.r + 40, 30 * scale()); } }
        return true;
      }
    }
    for (const h of this.holos) if (dist2(b.x, b.y, h.x, h.y) < 18 * 18) { h.hp -= b.dmg; FX.sparkle(b.x, b.y, '#9ff6ff', 3, 80); return true; }
    return false;
  },
  decoyTarget(e) {
    let best = null, bd = Infinity;
    for (const h of this.holos) { const d = dist2(h.x, h.y, e.x, e.y); if (d < h.lure * h.lure && d < bd) { bd = d; best = h; } }
    return best;
  },
  threatNear(x, y) {
    for (const g of this.grenades) if (g.t > g.flight * 0.5 && g.kind !== 'bomblet' && dist2(g.x, g.y, x, y) < 170 * 170) return g;
    return null;
  },
  insideBubble(p) { return this.bubbles.some(b => dist2(p.x, p.y, b.x, b.y) < b.r * b.r); },
  damageMul(p) {
    let m = 1;
    if (buff(p, 'resupplyDmg')) m *= 1.15;
    if (p.eq.armour.id === 'eshield' && atLeast(p.eq.armour.rarity, 'legendary') && p.eShield >= p.S.shieldCap - 0.5) m *= 1.1;
    return m;
  },
  onKill(p) {
    if (!buff(p, 'eqStim') || p.eq.gadget.id !== 'stim') return;
    let ext = 0, cap = 0;
    if (atLeast(p.eq.gadget.rarity, 'legendary')) { ext += 0.3; cap = 4; }
    if (p.S.eqSyn.eq_rush) { ext += 0.25; cap = Math.max(cap, 3); }
    if (ext && this.stimExt < cap) { const add = Math.min(ext, cap - this.stimExt); this.stimExt += add; p.buffs.eqStim += add; }
  },
  onAvoided(p) { if (p.S.eqSyn.eq_regenshield) p.eShieldT = p.S.shieldDelay; },
  // ---------------- drawing ----------------
  draw(view, time, alpha) {          // (not 'v': that name is the equipment stat lookup)
    const p = W.player;
    for (const b of this.bubbles) {
      ctx.fillStyle = 'rgba(46,242,255,0.08)'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill();
      ctx.strokeStyle = `rgba(46,242,255,${0.45 + Math.sin(time * 6) * 0.15})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.stroke();
      if (b.t < 1.2 && Math.floor(time * 10) % 2) { ctx.strokeStyle = '#fff'; ctx.stroke(); }
    }
    for (const m of this.mines) {
      ctx.fillStyle = '#2b2e35'; ctx.strokeStyle = '#0b0b0f'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(m.x, m.y, m.mini ? 7 : 11, m.mini ? 5 : 8, 0, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = m.arm > 0 ? '#ffd23f' : (Math.sin(time * (m.trig > 0 ? 40 : 6)) > 0 ? PAL.danger : '#5a1a20'); ctx.fillRect(m.x - 2, m.y - 2, 4, 4);
      if (m.arm <= 0 && !m.mini) { ctx.strokeStyle = 'rgba(255,59,78,0.12)'; ctx.beginPath(); ctx.arc(m.x, m.y, 70, 0, TAU); ctx.stroke(); }
      R.draws++;
    }
    for (const t of this.turrets) {
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(t.x + 4, t.y + 6, 18, 12, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#0b0b0f'; ctx.lineWidth = 3;
      for (let k = 0; k < 3; k++) { const a = k * TAU / 3 + 0.5; ctx.beginPath(); ctx.moveTo(t.x, t.y); ctx.lineTo(t.x + Math.cos(a) * 18, t.y + Math.sin(a) * 18); ctx.stroke(); }
      ctx.save(); ctx.translate(t.x, t.y); ctx.rotate(t.a);
      ctx.fillStyle = '#2f6e8f'; ctx.beginPath(); ctx.rect(-10, -9, 20, 18); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#1c1d22'; ctx.fillRect(8, -3, 20, 6); ctx.strokeRect(8, -3, 20, 6); ctx.fillStyle = '#2ef2ff'; ctx.fillRect(-3, -3, 6, 6);
      ctx.restore();
      ctx.strokeStyle = 'rgba(46,242,255,0.6)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(t.x, t.y, 24, -Math.PI / 2, -Math.PI / 2 + TAU * t.t / t.max); ctx.stroke();
      R.draws++;
    }
    const look = lookToOpts(G.profileLook());
    for (const h of this.holos) {
      ctx.globalAlpha = 0.45 + Math.sin(time * 14) * 0.15;
      drawHumanCached(v, h.x, h.y, p.a, Object.assign({}, look, { jacket: '#2ef2ff', skin: '#bff9ff', hair: '#2ef2ff', pants: '#2ef2ff', weapon: 'pistol' }), 'holo' + (G.lookVer || 0), 0, false, false, 1, 1, false);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = 'rgba(46,242,255,0.18)'; ctx.setLineDash([5, 7]); ctx.beginPath(); ctx.arc(h.x, h.y, h.lure, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
      const f = clamp(h.hp / v('decoy', 'hp', h.it.rank), 0, 1); ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(h.x - 16, h.y - 30, 32, 4); ctx.fillStyle = '#2ef2ff'; ctx.fillRect(h.x - 16, h.y - 30, 32 * f, 4);
    }
    for (const d of this.drones) drawDrone(d, '#ff9a1f', false, alpha);
    for (const g of this.grenades) {
      const k = Math.min(1, g.t / g.flight), hgt = Math.sin(k * Math.PI) * (g.kind === 'bomblet' ? 12 : 26);
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(g.x, g.y + 4, 6, 4, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = g.kind === 'emp' ? '#2f6e8f' : g.kind === 'cluster' || g.kind === 'bomblet' ? '#5a3a1a' : '#3b4a2f';
      ctx.strokeStyle = '#0b0b0f'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(g.x, g.y - hgt, g.kind === 'bomblet' ? 4 : 6, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = Math.sin(time * 30) > 0 ? (g.kind === 'emp' ? '#2ef2ff' : PAL.danger) : '#fff'; ctx.fillRect(g.x - 1.5, g.y - hgt - 1.5, 3, 3);
      if (g.kind !== 'bomblet' && k >= 1) { const r = g.kind === 'emp' ? v('emp', 'radius', g.it.rank) : g.kind === 'cluster' ? 110 : v('frag', 'radius', g.it.rank); ctx.strokeStyle = 'rgba(255,210,63,0.25)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(g.x, g.y, r, 0, TAU); ctx.stroke(); }
      R.draws++;
    }
  },
};
