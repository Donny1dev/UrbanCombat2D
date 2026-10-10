// Enemies: spawning, statuses, AI (steering + flow field), attacks, death, and drawing.
import { TAU, clamp, lerp, damp, angDiff, dist2, rand, pick, vrand } from '../core/util.js';
import { G, W } from '../core/registry.js';
import { ctx, R, GLOW, glow } from '../core/canvas.js';
import { PAL, Settings } from '../core/settings.js';
import { Sound } from '../core/audio.js';
import { mouse } from '../core/input.js';
import { moveCircle, lineOfSight, flowDir, solidAt } from '../world/map.js';
import { ETYPES, BOSSES, hpScale, dmgScale } from '../data/enemies.js';
import { SKIN } from '../data/cosmetics.js';
import { Grid } from '../systems/grid.js';
import { FX, Decals, P_EMBER, P_SPARK } from '../rendering/fx.js';
import { drawHuman, drawHumanCached, OUTLINE } from '../rendering/sprites.js';
import { textSprite, DISPLAY } from '../rendering/textcache.js';
import { Bullets, enemyArmor } from './combat.js';

let nextId = 1;
const _fd = { x: 0, y: 0 }, near = [];
export function resetEnemies() { W.enemies = []; W.corpses = []; nextId = 1; }

export function spawnEnemy(type, x, y, wave, opts = {}) {
  const d = opts.boss ? BOSSES[opts.boss] : ETYPES[type];
  const mods = G.game.mods;
  const hp = d.hp * hpScale(wave) * mods.enemyHp;
  const e = {
    id: nextId++, type, d, x, y, px: x, py: y, r: d.r, kvx: 0, kvy: 0, vx: 0, vy: 0,
    hp, maxHp: hp, a: vrand(TAU), phase: vrand(TAU), flash: 0, squash: 0, twist: 0,
    atkCd: rand(0.4, 1), windup: 0, swing: 0, fireT: rand(0.8, 2), burst: 0, burstT: 0, aimT: 0, dead: false, bladeCd: 0,
    spd: d.spd * (1 + Math.min(0.25, 0.015 * (wave - 1))) * rand(0.92, 1.08) * mods.speed, dmgMul: dmgScale(wave) * mods.enemyDmg,
    xp: d.xp * (1 + 0.08 * (wave - 1)) * mods.xp, flank: rand(-1, 1), strafe: Math.random() < 0.5 ? 1 : -1, strafeT: rand(1, 3),
    losT: rand(0.2), los: false, stuckT: 0, lastX: x, lastY: y, jitT: 0, jx: 0, jy: 0, spawnT: d.structure ? 0.5 : 0.35, skin: d.skin || pick(SKIN),
    armor: d.armor, shred: 0, burnT: 0, burnDps: 0, burnTick: 0, chill: 0, chillT: 0, supSlow: 0, supT: 0, marks: 0, markT: 0,
    stunT: 0, stunAll: false, shatterCd: 0, age: 0, summoned: !!opts.summoned, hunted: !!opts.hunted, empTagT: 0, reconT: 0, reconSlow: false,
    dodgeCd: rand(1, 3), nadeT: rand(5, 9), lastHitBy: null, lastHitT: 0, cacheKey: type + (opts.hunted ? 'H' : ''),
  };
  if (opts.boss) { e.boss = opts.boss; e.type = 'boss'; e.name = d.name; e.state = 'move'; e.stateT = 2.5; e.cast = 0; e.castDmg = 0; }
  if (e.hunted) { e.hp = e.maxHp = e.maxHp * 2.2; e.xp *= 4; e.spd *= 1.1; }
  if (opts.hpOverride) e.hp = e.maxHp = opts.hpOverride;
  W.enemies.push(e);
  return e;
}
export function enemyLook(e) {
  const d = e.d;
  return { jacket: d.jacket, skin: e.skin, hair: d.hair, style: d.style, vest: e.hunted ? '#ff4fd8' : d.vest, eyes: d.eyes, top: d.top, pants: d.pants, glasses: d.glasses, mask: d.mask, maskCol: d.maskCol, pads: d.pads, build: d.build, backpack: d.backpack, scale: d.scale, weapon: d.weapon };
}
function updateStatuses(e, dt) {
  e.age += dt; e.shatterCd -= dt; e.stunT -= dt; e.empTagT -= dt; e.reconT -= dt; e.lastHitT -= dt;
  if (e.burnT > 0) {
    e.burnT -= dt; e.burnTick -= dt;
    if (e.burnTick <= 0) { e.burnTick = 0.25; G.game.damageEnemy(e, e.burnDps * 0.25, 0, 0, false, 'burn'); }
    if (Math.random() < dt * 12) FX.add(P_EMBER, e.x + vrand(-e.r, e.r), e.y + vrand(-e.r, e.r), vrand(-15, 15), vrand(-70, -30), vrand(0.25, 0.5), vrand(3, 5), Math.random() < 0.5 ? '#ff8a1f' : '#ffd23f', { drag: 2 });
    if (e.burnT <= 0) e.burnDps = 0;
  }
  if (e.chillT > 0) e.chillT -= dt; else e.chill = Math.max(0, e.chill - 0.3 * dt);
  if (e.supT > 0) e.supT -= dt; else e.supSlow = Math.max(0, e.supSlow - 0.4 * dt);
  if (e.markT > 0) e.markT -= dt; else e.marks = 0;
  if (e.stunT <= 0) e.stunAll = false;
  e.twist *= Math.exp(-10 * dt);
}

export function updateEnemies(dt, p) {
  const list = W.enemies;
  for (const e of list) {
    if (e.dead) continue;
    e.px = e.x; e.py = e.y;
    e.flash -= dt; e.squash = Math.max(0, e.squash - dt * 6); e.bladeCd -= dt; e.atkCd -= dt; e.spawnT -= dt;
    updateStatuses(e, dt);
    if (e.dead) continue;
    if (e.d.dummy) { updateDummy(e, dt); continue; }
    e.losT -= dt;
    if (e.losT <= 0) { e.losT = 0.18 + vrand(0.08); e.los = Math.hypot(p.x - e.x, p.y - e.y) < 760 && lineOfSight(e.x, e.y, p.x, p.y); }
    const slow = (1 - Math.max(e.chill, e.supSlow)) * (e.reconSlow && e.reconT > 0 ? 0.8 : 1) * (e.stunAll ? 0 : 1);
    if (e.boss) { G.bosses.update(e, dt * (0.6 + 0.4 * slow), p); continue; }
    if (e.d.structure) { updateTurret(e, dt, p); continue; }
    const decoy = (G.decoys && G.decoys.target(e)) || (G.equip && G.equip.decoyTarget(e));
    const tx = decoy ? decoy.x : p.x, ty = decoy ? decoy.y : p.y;
    const dx = tx - e.x, dy = ty - e.y, d = Math.hypot(dx, dy) || 1;
    let mx = 0, my = 0;
    const R2 = e.d.ranged, seeTarget = decoy || e.los;
    const threat = G.equip && !e.d.resist && G.equip.threatNear(e.x, e.y);   // scatter from live grenades
    if (threat) { const ax = e.x - threat.x, ay = e.y - threat.y, al = Math.hypot(ax, ay) || 1; mx = ax / al; my = ay / al; }
    else if (e.jitT > 0) { e.jitT -= dt; mx = e.jx; my = e.jy; }
    else if (seeTarget) {
      const ux = dx / d, uy = dy / d;
      if (R2 && !decoy && (!e.d.melee || d > 90)) {
        e.strafeT -= dt; if (e.strafeT <= 0) { e.strafeT = rand(1.2, 3); e.strafe = -e.strafe; }
        const toward = d > R2.max ? 1 : d < R2.min ? -0.9 : 0.1;
        mx = ux * toward - uy * e.strafe * 0.8; my = uy * toward + ux * e.strafe * 0.8;
      } else { const f = d > 140 && !decoy ? e.flank * 0.6 : 0; mx = ux - uy * f; my = uy + ux * f; }
    } else if (flowDir(e.x, e.y, _fd)) { mx = _fd.x; my = _fd.y; }
    else { mx = dx / d; my = dy / d; }
    // separation from neighbours
    let sx = 0, sy = 0;
    Grid.near(e.x, e.y, e.r * 2.2, near);
    for (const o of near) {
      if (o === e) continue;
      const ox = e.x - o.x, oy = e.y - o.y, rr2 = (e.r + o.r) * 1.05, q = ox * ox + oy * oy;
      if (q < rr2 * rr2 && q > 0.01) { const qd = Math.sqrt(q), f = (rr2 - qd) / rr2; sx += ox / qd * f; sy += oy / qd * f; }
    }
    const ml = Math.hypot(mx, my) || 1;
    let spd = e.spd * slow * (e.windup > 0 ? 0.25 : 1) * (e.aimT > 0 ? 0.3 : 1) * (threat ? 1.3 : 1);
    if (e.spawnT > 0) spd *= 0.4;
    if (decoy && d < 30) spd = 0;
    e.vx += ((mx / ml) * spd + sx * 160 - e.vx) * damp(10, dt);
    e.vy += ((my / ml) * spd + sy * 160 - e.vy) * damp(10, dt);
    e.kvx *= Math.exp(-9 * dt); e.kvy *= Math.exp(-9 * dt);
    moveCircle(e, (e.vx + e.kvx) * dt, (e.vy + e.kvy) * dt);
    e.phase += Math.hypot(e.vx, e.vy) * dt * 0.06;
    e.stuckT += dt;
    if (e.stuckT > 0.8) {
      if (dist2(e.x, e.y, e.lastX, e.lastY) < 100 && d > 60 && !decoy) { const ja = vrand(TAU); e.jx = Math.cos(ja); e.jy = Math.sin(ja); e.jitT = 0.4; }
      e.stuckT = 0; e.lastX = e.x; e.lastY = e.y;
    }
    const pdx = p.x - e.x, pdy = p.y - e.y, pd = Math.hypot(pdx, pdy) || 1;
    const want = decoy ? Math.atan2(dy, dx) : e.los ? Math.atan2(pdy, pdx) : Math.atan2(e.vy, e.vx);
    e.a += angDiff(e.a, want) * damp(e.los ? 12 : 7, dt);
    if (e.d.elite) eliteTricks(e, dt, p, pd);
    if (e.d.melee) {
      const reach = e.r + p.r + 8;
      if (e.stunAll) { e.windup = 0; }
      else if (e.windup > 0) {
        e.windup -= dt; e.swing = 1 - e.windup / 0.3;
        if (e.windup <= 0) {
          e.swing = 0.01; Sound.melee();
          if (pd < reach + 16 && !decoy) G.game.hurtPlayer(e.d.melee * e.dmgMul, Math.atan2(pdy, pdx), { melee: true, elite: !!e.d.elite }, null, e);
          else if (decoy && decoy.damage) decoy.damage(e.d.melee * e.dmgMul);
          e.atkCd = e.type === 'rusher' ? 0.7 : 1.0;
        }
      } else if (e.swing > 0) { e.swing += dt * 4; if (e.swing > 1) e.swing = 0; }
      else if ((pd < reach || (decoy && d < e.r + 26)) && e.atkCd <= 0) { e.windup = e.type === 'heavy' ? 0.45 : 0.3; }
    }
    if (R2) rangedAttack(e, dt, p, pd, decoy, R2);
  }
  for (let i = list.length - 1; i >= 0; i--) if (list[i].dead) { list[i] = list[list.length - 1]; list.pop(); }
  for (let i = W.corpses.length - 1; i >= 0; i--) {
    const c = W.corpses[i]; c.life -= dt;
    c.x += c.vx * dt; c.y += c.vy * dt; c.vx *= Math.exp(-6 * dt); c.vy *= Math.exp(-6 * dt); c.spin *= Math.exp(-5 * dt); c.a += c.spin * dt;
    if (solidAt(c.x, c.y)) { c.vx = -c.vx * 0.3; c.vy = -c.vy * 0.3; }
    if (c.life <= 0) { W.corpses[i] = W.corpses[W.corpses.length - 1]; W.corpses.pop(); }
  }
}
function rangedAttack(e, dt, p, pd, decoy, Rd) {
  e.fireT -= dt;
  if (e.stunT > 0) { e.aimT = 0; e.burst = 0; if (Math.random() < dt * 8) FX.add(P_SPARK, e.x + vrand(-10, 10), e.y + vrand(-10, 10), vrand(-80, 80), vrand(-80, 80), 0.15, 2, '#9fe8ff', { drag: 6 }); return; }
  if (e.aimT > 0) {
    e.aimT -= dt;
    if (e.aimT <= 0) { if (enemyFire(e, p, Rd) && Rd.burst) { e.burst = Rd.burst - 1; e.burstT = 0.12; } }
  } else if (e.burst > 0) {
    e.burstT -= dt; if (e.burstT <= 0) { e.burst--; e.burstT = 0.12; enemyFire(e, p, Rd); }
  } else if (e.fireT <= 0 && e.los && !decoy && pd < Rd.max + 160 && e.spawnT <= 0) {
    e.aimT = 0.35; e.fireT = Rd.cd * rand(0.85, 1.2);
  }
}
// Fires only with a clear line of sight at the moment of the shot (no shooting through walls).
export function enemyFire(e, p, Rd, color) {
  if (!lineOfSight(e.x, e.y, p.x, p.y)) { e.burst = 0; return false; }
  const t = Math.hypot(p.x - e.x, p.y - e.y) / Rd.spd;
  const tx = p.x + p.vx * t * 0.3, ty = p.y + p.vy * t * 0.3;
  const base = Math.atan2(ty - e.y, tx - e.x) + rand(-Rd.spread, Rd.spread) * (Rd.n > 1 ? 0.2 : 1);
  let mx = e.x + Math.cos(e.a) * e.r * 1.6, my = e.y + Math.sin(e.a) * e.r * 1.6;
  if (solidAt(mx, my)) { mx = e.x; my = e.y; }
  for (let i = 0; i < Rd.n; i++) {
    const a = base + (Rd.n > 1 ? (i - (Rd.n - 1) / 2) * (Rd.spread / (Rd.n - 1)) * 2 : 0);
    Bullets.enemy(mx, my, a, Rd.spd * rand(0.95, 1.05), { dmg: Rd.dmg * e.dmgMul, r: 6, life: Rd.life || 2.4, color, elite: !!e.d.elite || !!e.boss });
  }
  FX.light(mx, my, 50, 0.07, GLOW.red, 0.7);
  Sound.enemyShoot();
  return true;
}
// Elites side-step when you aim at them and lob telegraphed grenades.
function eliteTricks(e, dt, p, pd) {
  e.dodgeCd -= dt; e.nadeT -= dt;
  if (e.dodgeCd <= 0 && mouse.down && e.los && Math.abs(angDiff(p.a, Math.atan2(e.y - p.y, e.x - p.x))) < 0.1) {
    e.dodgeCd = 2.6; const s = Math.random() < 0.5 ? 1 : -1, a = Math.atan2(e.y - p.y, e.x - p.x) + s * Math.PI / 2;
    e.kvx += Math.cos(a) * 520; e.kvy += Math.sin(a) * 520; FX.dust(e.x, e.y, 4);
  }
  if (e.nadeT <= 0 && e.los && pd > 180 && pd < 480 && e.stunT <= 0) {
    e.nadeT = rand(7, 10);
    G.hazards.enemyGrenade(e.x, e.y, p.x + p.vx * 0.4, p.y + p.vy * 0.4, 1.3, 95, 22 * e.dmgMul);
  }
}
function updateTurret(e, dt, p) {
  const pdx = p.x - e.x, pdy = p.y - e.y, pd = Math.hypot(pdx, pdy);
  if (e.los) e.a += angDiff(e.a, Math.atan2(pdy, pdx)) * damp(5, dt);
  rangedAttack(e, dt, p, pd, null, e.d.ranged);
}
// Training dummy: never moves or attacks; heals to full when left alone.
function updateDummy(e, dt) {
  e.a = -Math.PI / 2;
  if (e.lastHitT < -3 && e.hp < e.maxHp) e.hp = e.maxHp;
  e.kvx *= Math.exp(-12 * dt); e.kvy *= Math.exp(-12 * dt);
  e.x += e.kvx * dt * 0.1; e.y += e.kvy * dt * 0.1;
}

export function killEnemy(e, ang, src) {
  if (e.dead) return;
  if (e.d.dummy) { e.hp = e.maxHp; FX.text(e.x, e.y - 50, 'RESET', '#9aa0b4', 14); return; }
  e.dead = true;
  const p = W.player, S = p.S, game = G.game;
  const big = e.type === 'heavy' || !!e.d.elite || !!e.boss;
  if (!e.d.structure) W.corpses.push({ x: e.x, y: e.y, a: e.a, vx: Math.cos(ang) * (big ? 160 : 340), vy: Math.sin(ang) * (big ? 160 : 340), spin: vrand(-8, 8), life: big ? 0.9 : 0.5, max: big ? 0.9 : 0.5, e });
  FX.deathPop(e.x, e.y, e.d.col, big, ang);
  if (!e.d.structure) Decals.add('splat', e.x + Math.cos(ang) * 14, e.y + Math.sin(ang) * 14, ang, e.d.scale * vrand(0.8, 1.2));
  Sound.kill(big);
  if (e.xp > 0) G.pickups.gems(e.x, e.y, e.xp * (game.combo >= 5 ? 1.25 : 1));
  if (e.d.elite || e.hunted) {
    FX.sparkle(e.x, e.y, '#ffc93c', 30, 420); FX.distort(e.x, e.y, 150); game.hitstop(0.06);
    if (Settings.comic) FX.comic(e.x, e.y - 30, pick(['KA-BLAM!', 'WHAM!', 'KRAKOOM!']), '#ffc93c');
  }
  if (e.boss) G.bosses.onDeath(e);
  else if ((e.d.elite || e.hunted) && !e.summoned && Math.random() < 0.5) G.pickups.health(e.x, e.y, 25);
  else if (!e.d.structure) G.pickups.rollEnemyDrop(e, p);
  if (S.volatile && e.burnT > 0 && Math.random() < 0.25 + 0.15 * S.volatile) game.explosion(e.x, e.y, 80, (25 + 15 * S.volatile) * S.elemMul, 'volatile');
  else if (p.gun.inferno && Math.random() < 0.35) game.explosion(e.x, e.y, 75, p.gun.dmg * 0.6, 'fire');
  if (e.hunted && G.director.event && G.director.event.type === 'elite') G.director.endEvent(true);
  game.onKill(e, src);
}

export function drawEnemies(v, time, alpha) {
  const z = v.z;
  for (const c of W.corpses) {
    if (c.x < v.x0 || c.x > v.x1 || c.y < v.y0 || c.y > v.y1) continue;
    const t = c.life / c.max, e = c.e;
    ctx.globalAlpha = Math.min(1, t * 2);
    const look = enemyLook(e); look.weapon = null;
    drawHumanCached(v, c.x, c.y, c.a, look, e.cacheKey + 'C', 0, false, t > 0.8, (0.6 + t * 0.4) * (1 + (1 - t) * 0.5), (0.6 + t * 0.4) * (1 - (1 - t) * 0.4), false);
  }
  ctx.globalAlpha = 1;
  for (const e of W.enemies) {
    const x = lerp(e.px, e.x, alpha), y = lerp(e.py, e.y, alpha);
    if (x < v.x0 - 40 || x > v.x1 + 40 || y < v.y0 - 40 || y > v.y1 + 40) continue;
    if (e.d.glow || e.hunted) { ctx.globalCompositeOperation = 'lighter'; glow(e.boss ? GLOW.red : e.hunted ? GLOW.magenta : GLOW.gold, x, y, e.r * 2.6, 0.35 + Math.sin(time * 6) * 0.1); ctx.globalCompositeOperation = 'source-over'; }
    if (e.burnT > 0) { ctx.globalCompositeOperation = 'lighter'; glow(GLOW.fire, x, y, e.r * 2, 0.35); ctx.globalCompositeOperation = 'source-over'; }
    if (e.aimT > 0) {
      ctx.strokeStyle = `rgba(255,60,80,${0.5 * (1 - e.aimT / 0.35)})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(e.a) * 220, y + Math.sin(e.a) * 220); ctx.stroke();
    }
    const sp = e.spawnT > 0 ? 1 - e.spawnT / 0.35 : 1;
    if (sp < 1) ctx.globalAlpha = Math.max(0, sp);
    if (e.boss) G.bosses.draw(e, x, y, time);
    else if (e.d.structure) drawSentry(e, x, y);
    else if (e.swing > 0 || e.windup > 0) { drawHuman(ctx, x, y, Object.assign(enemyLook(e), { a: e.a + e.twist, phase: e.phase, moving: true, flash: e.flash > 0, swing: e.swing || 0.001, sx: 1 + e.squash * 0.28, sy: 1 - e.squash * 0.22 })); R.draws++; }
    else drawHumanCached(v, x, y, e.a + e.twist, enemyLook(e), e.cacheKey, e.phase, !e.d.dummy, e.flash > 0, 1 + e.squash * 0.28, 1 - e.squash * 0.22);
    ctx.globalAlpha = 1;
    if (e.chill > 0.05) {
      ctx.fillStyle = `rgba(170,230,255,${e.chill * 0.8})`; ctx.beginPath(); ctx.arc(x, y, e.r * e.d.scale * 0.75, 0, TAU); ctx.fill();
      if (e.chill >= 0.45) { ctx.strokeStyle = '#e8f8ff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, e.r + 4, 0, TAU); ctx.stroke(); }
    }
    if (e.stunT > 0) { ctx.strokeStyle = '#9fe8ff'; ctx.lineWidth = 2; ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.arc(x, y, e.r + 6, time * 6, time * 6 + 4); ctx.stroke(); ctx.setLineDash([]); }
    if (e.reconT > 0) { ctx.strokeStyle = PAL.danger; ctx.lineWidth = 2; const s = e.r + 10; ctx.beginPath(); for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { ctx.moveTo(x + a * s, y + b * s * 0.5); ctx.lineTo(x + a * s, y + b * s); ctx.lineTo(x + a * s * 0.5, y + b * s); } ctx.stroke(); }
    if (e.empTagT > 0) { ctx.globalCompositeOperation = 'lighter'; glow(GLOW.xp, x, y, e.r * 1.8, 0.3); ctx.globalCompositeOperation = 'source-over'; }
    if (e.marks > 2) { ctx.strokeStyle = `rgba(255,79,94,${0.3 + e.marks * 0.06})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, e.r + 9, 0, TAU); ctx.stroke(); }
    if (e.windup > 0) { const s = textSprite('!', 18 * z, PAL.danger, DISPLAY); ctx.drawImage(s.c, x - s.w / z / 2, y - e.r - 22 - s.h / z / 2, s.w / z, s.h / z); }
    if (e.hunted) { const s = textSprite('HUNTED', 13 * z, '#ff4fd8', DISPLAY); ctx.drawImage(s.c, x - s.w / z / 2, y - e.r - 30 - s.h / z / 2, s.w / z, s.h / z); }
    if (!e.boss && e.hp < e.maxHp && e.maxHp > 60 && !e.d.dummy) {
      const w = e.r * 2.2, f = clamp(e.hp / e.maxHp, 0, 1);
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x - w / 2 - 1, y - e.r - 12, w + 2, 6);
      ctx.fillStyle = e.hunted ? '#ff4fd8' : e.d.elite ? '#ffc93c' : PAL.danger; ctx.fillRect(x - w / 2, y - e.r - 11, w * f, 4);
      if (e.armor) { ctx.fillStyle = '#9aa0b4'; ctx.fillRect(x - w / 2, y - e.r - 14, w * enemyArmor(e) / e.armor, 2); }
    }
  }
}
function drawSentry(e, x, y) {
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(x + 4, y + 6, 18, 12, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = OUTLINE; ctx.lineWidth = 3;
  for (let k = 0; k < 3; k++) { const a = k * TAU / 3 + 0.5; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * 18, y + Math.sin(a) * 18); ctx.stroke(); }
  ctx.save(); ctx.translate(x, y); ctx.rotate(e.a);
  ctx.fillStyle = e.flash > 0 ? '#fff' : '#ffd23f'; ctx.beginPath(); ctx.rect(-10, -9, 20, 18); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#1c1d22'; ctx.fillRect(8, -3, 18, 6); ctx.strokeRect(8, -3, 18, 6);
  ctx.fillStyle = PAL.danger; ctx.fillRect(-3, -3, 6, 6);
  ctx.restore();
  const f = clamp(e.hp / e.maxHp, 0, 1);
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x - 18, y - 28, 36, 5); ctx.fillStyle = '#ffd23f'; ctx.fillRect(x - 17, y - 27, 34 * f, 3);
  R.draws++;
}
