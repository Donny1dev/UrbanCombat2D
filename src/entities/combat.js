// Bullets (pooled, swept collision), the per-hit damage pipeline, elemental statuses, upgrade drones/blades.
import { TAU, TILE, dist2, angDiff, clamp, damp, rand, lerp, vrand } from '../core/util.js';
import { G, W } from '../core/registry.js';
import { ctx, R, GLOW, makeCanvas, glow } from '../core/canvas.js';
import { PAL } from '../core/settings.js';
import { Sound } from '../core/audio.js';
import { objAt, O_NONE, O_GLASS, O_CRATE, O_BARREL, O_METAL, O_FURN, O_BARRIER, lineOfSight } from '../world/map.js';
import { Grid } from '../systems/grid.js';
import { FX, Decals, P_RING } from '../rendering/fx.js';
import { OUTLINE } from '../rendering/sprites.js';

const PROC_SRC = new Set(['gun', 'phantom']);   // sources that trigger on-hit upgrade effects
export const enemyArmor = e => Math.max(0, (e.armor || 0) - (e.shred || 0));
const BKEYS = ['dmg', 'life', 'r', 'pierce', 'rico', 'knock', 'trail', 'width', 'crit', 'critMul', 'src', 'boom', 'rail', 'omega', 'inferno', 'cryoC', 'armorPen', 'massacre', 'canFrag', 'warrant', 'charged', 'seek', 'chained', 'gadget'];
const BDEF = { dmg: 0, life: 1, r: 4, pierce: 0, rico: 0, knock: 0, trail: '#ffd27a', width: 3, crit: 0, critMul: 2, src: 'gun', boom: false, rail: false, omega: false, inferno: false, cryoC: false, armorPen: 0, massacre: false, canFrag: false, warrant: false, charged: false, seek: false, chained: false, gadget: false };
const near = [];
// shortest distance² from point (px,py) to segment (ax,ay)-(bx,by)
function segDist2(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
  const qx = ax + dx * t - px, qy = ay + dy * t - py; return qx * qx + qy * qy;
}
const enemyShotSprites = new Map();
function enemyShotSprite(color, r) {
  const key = color + r; let c = enemyShotSprites.get(key);
  if (!c) {
    const size = Math.ceil(r * 7); c = makeCanvas(size); const g = c.getContext('2d');
    const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gr.addColorStop(0, color); gr.addColorStop(0.3, color + 'aa'); gr.addColorStop(1, color + '00');
    g.fillStyle = gr; g.fillRect(0, 0, size, size);
    g.fillStyle = '#fff'; g.beginPath(); g.arc(size / 2, size / 2, r * 0.55, 0, TAU); g.fill();
    enemyShotSprites.set(key, c);
  }
  return c;
}

export const Bullets = {
  list: [], pool: [],
  reset() { for (const b of this.list) this.pool.push(b); this.list.length = 0; },
  player(x, y, ang, spd, tpl) {
    if (this.list.length > 1200) return null;
    const b = this.pool.pop() || { hit: [] };
    for (let i = 0; i < BKEYS.length; i++) { const k = BKEYS[i], v = tpl[k]; b[k] = v === undefined ? BDEF[k] : v; }
    b.x = x; b.y = y; b.px = x; b.py = y; b.vx = Math.cos(ang) * spd; b.vy = Math.sin(ang) * spd;
    b.enemy = false; b.hit.length = 0; b.dead = false; b.travel = 0; b.trailD = 0; b.bounced = 0; b.color = null;
    this.list.push(b); return b;
  },
  enemy(x, y, ang, spd, o) {
    if (this.list.length > 1400) return null;
    const b = this.pool.pop() || { hit: [] };
    for (let i = 0; i < BKEYS.length; i++) b[BKEYS[i]] = BDEF[BKEYS[i]];
    b.x = x; b.y = y; b.px = x; b.py = y; b.vx = Math.cos(ang) * spd; b.vy = Math.sin(ang) * spd;
    b.enemy = true; b.dmg = o.dmg; b.r = o.r || 6; b.color = o.color || null; b.life = o.life || 2.4; b.dead = false; b.hit.length = 0;
    b.kind = o.kind || 'ranged'; b.elite = !!o.elite;
    this.list.push(b); return b;
  },
  update(dt) {
    const L = this.list, p = W.player;
    for (let i = L.length - 1; i >= 0; i--) {
      const b = L[i];
      b.life -= dt; b.px = b.x; b.py = b.y;
      if (b.life > 0 && !b.dead) {
        if (b.seek) this.steer(b, dt);
        const spd = Math.hypot(b.vx, b.vy), dist = spd * dt, steps = Math.max(1, Math.ceil(dist / 12));
        for (let s = 0; s < steps && !b.dead; s++) {
          const ox = b.x, oy = b.y;
          b.x += b.vx * dt / steps; b.y += b.vy * dt / steps;
          if (!b.enemy) {
            b.travel += dist / steps;
            if (b.omega) { b.trailD += dist / steps; if (b.trailD > 42) { b.trailD = 0; G.hazards.energy(b.x, b.y, b.dmg * 0.5); } }
          }
          const tx = Math.floor(b.x / TILE), ty = Math.floor(b.y / TILE), o = objAt(tx, ty);
          if (o !== O_NONE) { this.hitTile(b, o, tx, ty, ox, oy); continue; }
          if (b.enemy) {
            if (G.equip && G.equip.interceptEnemyBullet(b)) { b.dead = true; continue; }
            if (p && segDist2(p.x, p.y, ox, oy, b.x, b.y) < (b.r + p.r - 3) ** 2) {
              if (G.game.hurtPlayer(b.dmg, Math.atan2(b.vy, b.vx), { ranged: true, elite: b.elite }, b)) { b.dead = true; FX.impact(b.x, b.y, Math.atan2(b.vy, b.vx), 'flesh'); }
            }
          } else this.hitEnemies(b, ox, oy);
        }
      }
      if (b.life <= 0 || b.dead) { L[i] = L[L.length - 1]; L.pop(); this.pool.push(b); }
    }
  },
  steer(b, dt) {
    const t = nearestEnemy(b.x, b.y, 320, b.hit);
    if (!t) return;
    const a = Math.atan2(b.vy, b.vx), want = Math.atan2(t.y - b.y, t.x - b.x), sp = Math.hypot(b.vx, b.vy);
    const na = a + clamp(angDiff(a, want), -7 * dt, 7 * dt);
    b.vx = Math.cos(na) * sp; b.vy = Math.sin(na) * sp;
  },
  hitTile(b, o, tx, ty, ox, oy) {
    const ang = Math.atan2(b.vy, b.vx);
    if (o === O_GLASS) { G.destruct.damageTile(tx, ty, 1, ang); b.vx *= 0.85; b.vy *= 0.85; return; }
    if (o === O_CRATE || o === O_BARREL || o === O_BARRIER) {
      G.destruct.damageTile(tx, ty, b.enemy ? b.dmg * 0.5 : b.dmg, ang, b.enemy);
      FX.impact(ox, oy, ang, o === O_CRATE ? 'wood' : 'metal');
      if (!b.enemy && b.boom) this.impactBoom(b, ox, oy);
      b.dead = true; return;
    }
    const metal = o === O_METAL;
    if (!b.enemy && b.rico > 0) {
      b.rico--; b.bounced++;
      const hx = objAt(Math.floor(b.x / TILE), Math.floor(oy / TILE)) !== O_NONE;
      const hy = objAt(Math.floor(ox / TILE), Math.floor(b.y / TILE)) !== O_NONE;
      if (hx || !hy) b.vx = -b.vx;
      if (hy || !hx) b.vy = -b.vy;
      b.x = ox; b.y = oy; b.hit.length = 0; b.life = Math.max(b.life, 0.4); b.dmg *= 0.8;
      FX.impact(ox, oy, ang, 'metal'); Sound.wall(true);
      return;
    }
    b.dead = true;
    FX.impact(ox, oy, ang, metal ? 'metal' : o === O_FURN ? 'wood' : 'wall');
    if (!b.enemy) {
      if (PROC_SRC.has(b.src) && !b.hit.length && W.player) W.player.hitStreak = 0;   // a miss breaks Trigger Discipline
      Decals.add('hole', ox, oy, vrand(TAU)); if (Math.random() < 0.3) Sound.wall(metal);
      if (b.boom) this.impactBoom(b, ox, oy);
    }
  },
  impactBoom(b, x, y) { const arm = b.src === 'gun' && W.player.gun.armageddon; G.game.explosion(x, y, arm ? 136 : 80, b.dmg * (arm ? 0.8 : 0.5), 'impact'); },
  hitEnemies(b, ox, oy) {
    const mx = (ox + b.x) / 2, my = (oy + b.y) / 2;
    Grid.near(mx, my, 56, near);
    for (let k = 0; k < near.length && !b.dead; k++) {
      const e = near[k];
      if (e.dead || b.hit.includes(e.id)) continue;
      if (segDist2(e.x, e.y, ox, oy, b.x, b.y) > (e.r + b.r) ** 2) continue;
      resolveHit(b, e);
    }
  },
  // batched draw: one path per (trail colour, width) group, enemy shots from cached sprites
  draw(v, alpha) {
    const groups = this._g || (this._g = new Map());
    for (const arr of groups.values()) arr.length = 0;
    ctx.globalCompositeOperation = 'lighter';
    for (const b of this.list) {
      const x = lerp(b.px, b.x, alpha), y = lerp(b.py, b.y, alpha);
      if (x < v.x0 || x > v.x1 || y < v.y0 || y > v.y1) continue;
      if (b.enemy) { const c = b.color || PAL.enemyShot, img = enemyShotSprite(c, b.r); ctx.drawImage(img, x - img.width / 2, y - img.height / 2); R.draws++; continue; }
      const key = b.trail + '|' + b.width + '|' + (b.rail || b.omega ? 1 : 0);
      let arr = groups.get(key); if (!arr) { arr = []; groups.set(key, arr); }
      arr.push(b, x, y);
    }
    ctx.lineCap = 'round';
    for (const [key, arr] of groups) {
      if (!arr.length) continue;
      const [trail, width, long] = key.split('|'), w = +width, tl0 = long === '1' ? 0.045 : 0.03;
      ctx.strokeStyle = trail; ctx.globalAlpha = 0.55; ctx.lineWidth = w * 2.4; ctx.beginPath();
      for (let i = 0; i < arr.length; i += 3) { const b = arr[i], x = arr[i + 1], y = arr[i + 2], sp = Math.hypot(b.vx, b.vy) || 1, tl = Math.min(tl0, b.life + 0.02) * sp; ctx.moveTo(x - b.vx / sp * tl, y - b.vy / sp * tl); ctx.lineTo(x, y); }
      ctx.stroke();
      ctx.strokeStyle = '#fffbe8'; ctx.globalAlpha = 1; ctx.lineWidth = w * 0.8; ctx.beginPath();
      for (let i = 0; i < arr.length; i += 3) { const b = arr[i], x = arr[i + 1], y = arr[i + 2], sp = Math.hypot(b.vx, b.vy) || 1, tl = Math.min(tl0, b.life + 0.02) * sp * 0.6; ctx.moveTo(x - b.vx / sp * tl, y - b.vy / sp * tl); ctx.lineTo(x, y); }
      ctx.stroke(); R.draws += 2;
      for (let i = 0; i < arr.length; i += 3) if (arr[i].charged) glow(GLOW.xp, arr[i + 1], arr[i + 2], 22, 0.7);
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  },
};

// The full damage pipeline for one player bullet striking one enemy.
export function resolveHit(b, e) {
  const p = W.player, S = p.S, ang = Math.atan2(b.vy, b.vx), procs = PROC_SRC.has(b.src);
  let dmg = b.dmg;
  if (S.accel) dmg *= 1 + Math.min(0.3 * S.accel, b.travel / 100 * 0.06 * S.accel);
  if (S.cqc) dmg *= 1 + S.cqc * clamp(1 - Math.hypot(e.x - p.x, e.y - p.y) / 240, 0, 1);
  if (S.hollow && !e.armor) dmg *= 1 + S.hollow;
  if (S.execute && e.hp / e.maxHp < 0.25 + 0.05 * S.execute) dmg *= 1 + 0.25 * S.execute;
  if (S.marked) dmg *= 1 + S.marked * e.marks;
  const streak = Math.min(10, p.hitStreak);
  const crit = Math.random() < b.crit + (procs ? S.discipline * streak : 0);
  if (crit) { dmg *= b.critMul + (S.syn.tactprec && procs ? Math.min(0.5, streak * 0.05) : 0); G.game.track('crits', 1); }
  if (e.chill >= 0.4 && (S.syn.shatter || b.cryoC) && e.shatterCd <= 0) {
    dmg *= b.cryoC ? 1.8 : 1.4; e.shatterCd = 0.8;
    FX.glassBurst(e.x, e.y, ang); FX.text(e.x, e.y - e.r - 20, 'SHATTER', '#a8e8ff', 16, { crit: true }); Sound.freeze();
  }
  const armor = enemyArmor(e) * (1 - (b.armorPen || 0));
  G.game.damageEnemy(e, dmg * rand(0.92, 1.08), ang, b.knock, crit, b.src, armor);
  if (crit && e.dead && b.warrant && !p.primed) { p.primed = true; FX.text(p.x, p.y - 40, 'PRIMED', '#ff4f5e', 16, { crit: true }); }
  if (procs) {
    p.hitStreak++;
    if (S.marked) { e.marks = Math.min(10, e.marks + 1); e.markT = 2; }
    if (S.breaker && e.armor) e.shred = Math.min(e.armor, (e.shred || 0) + S.breaker);
    if (S.suppress) { e.supSlow = Math.min(0.15 + 0.1 * S.suppress, e.supSlow + 0.05 * S.suppress); e.supT = 1.2; }
    if (S.incendiary || b.inferno) applyBurn(e, (6 + 5 * S.incendiary) * (b.inferno ? 2 : 1) * S.elemMul * Math.sqrt(S.dmgMul), 3 * S.elemDur);
    if (S.cryo || b.cryoC) applyChill(e, (0.1 + 0.04 * S.cryo) * S.elemMul * (b.cryoC ? 2 : 1), 1.2 * S.elemDur);
    if (S.static) {
      p.charge += p.gun.thunder ? 2 : 1;
      if (p.charge >= 14 - 2 * S.static) { p.charge = 0; G.game.chainLightning(e, (18 + 14 * S.static) * Math.sqrt(S.dmgMul) * S.elemMul, 2 + S.static, true); }
    }
    if (S.chain && Math.random() < 0.06 + 0.04 * S.chain) G.game.chainLightning(e, b.dmg * (0.4 + 0.1 * S.chain) * S.elemMul, 2 + S.chain);
    if (b.charged) G.game.chainLightning(e, b.dmg * 0.8, 4);
    if (b.canFrag && S.frag && Math.random() < 0.12 * S.frag * (p.weapon === 'shotgun' ? 0.5 : 1)) spawnFragments(e, b.dmg * 0.25);
  }
  if (b.boom) Bullets.impactBoom(b, b.x, b.y);
  b.hit.push(e.id);
  if (e.dead && b.massacre && b.bounced && !b.chained) {   // Chain Massacre: one fresh controlled chain
    const t = nearestEnemy(b.x, b.y, 380, b.hit);
    if (t) { const tpl = {}; for (const k of BKEYS) tpl[k] = b[k]; tpl.chained = true; tpl.rico = 2; tpl.life = 0.6; const n = Bullets.player(b.x, b.y, Math.atan2(t.y - b.y, t.x - b.x), Math.hypot(b.vx, b.vy), tpl); if (n) for (const id of b.hit) n.hit.push(id); }
  }
  if (b.pierce > 0) { b.pierce--; b.dmg *= 0.85; return; }
  if (b.rico > 0) {
    const t = nearestEnemy(b.x, b.y, 380, b.hit, true);
    if (t) {
      b.rico--; b.bounced++; b.dmg *= 0.8;
      const sp = Math.hypot(b.vx, b.vy), na = Math.atan2(t.y - b.y, t.x - b.x);
      b.vx = Math.cos(na) * sp; b.vy = Math.sin(na) * sp; b.life = Math.max(b.life, 0.5);
      FX.add(P_RING, b.x, b.y, 0, 0, 0.15, 14, '#bfe9ff', { lw: 2 });
      return;
    }
  }
  b.dead = true;
}
const nearTmp = [];
export function nearestEnemy(x, y, r, exclude = null, los = false) {
  let best = null, bd = r * r;
  Grid.near(x, y, r, nearTmp);
  for (const o of nearTmp) {
    if (o.dead || o.d.dummyIgnore || (exclude && exclude.includes(o.id))) continue;
    const d = dist2(x, y, o.x, o.y);
    if (d < bd && (!los || lineOfSight(x, y, o.x, o.y))) { bd = d; best = o; }
  }
  return best;
}
export function spawnFragments(e, dmg, n = 3, src = 'frag') {
  for (let i = 0; i < n; i++) {
    const b = Bullets.player(e.x, e.y, vrand(TAU), 700, { dmg, life: 0.25, r: 3, knock: 60, trail: '#ffc060', width: 2, critMul: 1, src, canFrag: false });
    if (b && e.id) b.hit.push(e.id);
  }
  FX.sparkle(e.x, e.y, '#ffc060', 6, 200);
}
export function applyBurn(e, dps, dur) {
  if (!e.burnT || e.burnT <= 0) Sound.burn();
  e.burnDps = Math.max(e.burnDps || 0, dps); e.burnT = Math.max(e.burnT || 0, dur);
}
export function applyChill(e, amt, dur) {
  const was = e.chill;
  e.chill = Math.min(0.5, e.chill + amt); e.chillT = dur;
  if (was < 0.45 && e.chill >= 0.45) { FX.sparkle(e.x, e.y, '#d8f4ff', 8, 120); Sound.freeze(); }
}

// ---------------- upgrade blades & drones ----------------
export function bladePos(p, i, out) {
  const n = p.S.blades, a = p.bladeAng + i * TAU / n, r = 70 + n * 3 + p.S.orbital * 6;
  out[0] = p.x + Math.cos(a) * r; out[1] = p.y + Math.sin(a) * r; out[2] = a; return out;
}
const bp = [0, 0, 0];
export function updateBlades(p, dt) {
  const S = p.S, dmg = 16 * (0.6 + S.dmgMul * 0.4) * (1 + 0.2 * S.orbital);
  for (let i = 0; i < S.blades; i++) {
    const [bx, by, a] = bladePos(p, i, bp);
    Grid.near(bx, by, 50, nearTmp);
    for (const e of nearTmp) {
      if (e.dead || e.bladeCd > 0 || dist2(bx, by, e.x, e.y) > (e.r + 16) ** 2) continue;
      e.bladeCd = 0.28;
      G.game.damageEnemy(e, dmg, a + Math.PI / 2, 140, false, 'blade');
      FX.impact(bx, by, a, 'metal');
    }
  }
  if (S.syn.bladestorm) {
    p.bladeArcT -= dt;
    if (p.bladeArcT <= 0) {
      p.bladeArcT = 1.2;
      for (let i = 0; i < S.blades; i++) {
        const [bx, by] = bladePos(p, i, bp), t = nearestEnemy(bx, by, 170);
        if (t) { FX.arc(bx, by, t.x, t.y, '#9ff6ff'); G.game.damageEnemy(t, dmg * 1.6, Math.atan2(t.y - by, t.x - bx), 120, false, 'chain'); }
      }
      Sound.zap();
    }
  }
}
export const droneThreat = e => (e.type === 'boss' ? 4 : e.d.elite ? 3 : e.d.ranged ? 2 : 1) + (e.aimT > 0 ? 1 : 0);
// Picks a drone/turret target: shared focus (Mechanical Army / Network Warfare) or priority/nearest.
export function pickTarget(x, y, range, priority, focus) {
  if (focus && !focus.dead && dist2(x, y, focus.x, focus.y) < range * range) return focus;
  let best = null, bs = -1e9;
  Grid.near(x, y, range, nearTmp);
  for (const e of nearTmp) {
    if (e.dead || e.d.dummyIgnore) continue;
    const dd = Math.sqrt(dist2(x, y, e.x, e.y)); if (dd > range) continue;
    const sc = (priority ? droneThreat(e) * 200 : 0) - dd;
    if (sc > bs) { bs = sc; best = e; }
  }
  return best;
}
export function updateDrone(p, d, i, n, dt, focus, shared) {
  const S = p.S;
  d.t += dt;
  const a = d.t * 1.3 + i * TAU / n;
  const tx = p.x + Math.cos(a) * 46, ty = p.y + Math.sin(a) * 46 - 8;
  d.px = d.x; d.py = d.y;
  d.x += (tx - d.x) * damp(8, dt); d.y += (ty - d.y) * damp(8, dt);
  d.cd -= dt;
  const range = 430 + 100 * S.autotarget;
  const best = pickTarget(d.x, d.y, range, S.autotarget > 0, (S.syn.army || shared) ? focus : null);
  if (best) d.a = Math.atan2(best.y - d.y, best.x - d.x);
  if (best && d.cd <= 0 && lineOfSight(d.x, d.y, best.x, best.y)) {
    d.cd = 0.42 / (p.droneODT > 0 ? 3 : 1);
    const dmg = 13 * (0.5 + S.dmgMul * 0.5) * S.droneDmg * (S.syn.army ? 1.25 : 1) * (shared ? 1.15 : 1);
    Bullets.player(d.x, d.y, d.a + rand(-0.04, 0.04), 1000, { dmg, life: 0.6, r: 4, knock: 60, trail: p.droneODT > 0 ? '#c4b8ff' : '#5ff4ff', width: 2, crit: p.gun.critChance, critMul: p.gun.critMul, src: 'drone' });
    FX.light(d.x, d.y, 30, 0.05, GLOW.xp, 0.6);
    Sound.turret();
  }
  return best || focus;
}
export function drawDrone(d, accent, od, alpha = 1) {
  const x = lerp(d.px ?? d.x, d.x, alpha), y = lerp(d.py ?? d.y, d.y, alpha);
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(x + 10, y + 18, 10, 6, 0, 0, TAU); ctx.fill();
  if (od) { ctx.globalCompositeOperation = 'lighter'; glow(GLOW.violet, x, y, 30, 0.7); ctx.globalCompositeOperation = 'source-over'; }
  ctx.save(); ctx.translate(x, y); ctx.rotate(d.a);
  ctx.strokeStyle = OUTLINE; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(-9, -9); ctx.lineTo(9, 9); ctx.moveTo(9, -9); ctx.lineTo(-9, 9); ctx.stroke();
  ctx.fillStyle = 'rgba(200,240,255,0.35)';
  for (const [qx, qy] of [[-9, -9], [9, -9], [-9, 9], [9, 9]]) { ctx.beginPath(); ctx.arc(qx, qy, 6, 0, TAU); ctx.fill(); }
  ctx.fillStyle = '#2b3a4a'; ctx.beginPath(); ctx.rect(-6, -6, 12, 12); ctx.fill(); ctx.stroke();
  ctx.fillStyle = accent; ctx.fillRect(4, -2, 6, 4);
  ctx.restore(); R.draws++;
}
export function drawBladesDrones(p, alpha) {
  if (p.S.blades) {
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < p.S.blades; i++) { const [bx, by] = bladePos(p, i, bp); glow(GLOW.xp, bx, by, 26 + p.S.orbital * 3, 0.45); }
    ctx.globalCompositeOperation = 'source-over';
    for (let i = 0; i < p.S.blades; i++) {
      const [bx, by, a] = bladePos(p, i, bp);
      ctx.save(); ctx.translate(bx, by); ctx.rotate(a * 3);
      ctx.fillStyle = p.S.orbital ? '#bff7ff' : '#e8fbff'; ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2.5;
      ctx.beginPath(); for (let k = 0; k < 3; k++) { const q = k * TAU / 3; ctx.moveTo(Math.cos(q) * 4, Math.sin(q) * 4); ctx.lineTo(Math.cos(q + 0.25) * 17, Math.sin(q + 0.25) * 17); ctx.lineTo(Math.cos(q + 0.9) * 5, Math.sin(q + 0.9) * 5); }
      ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore(); R.draws++;
    }
  }
  for (const d of p.drones) drawDrone(d, p.S.autotarget ? '#ff4f5e' : '#5ff4ff', p.droneODT > 0, alpha);
}
