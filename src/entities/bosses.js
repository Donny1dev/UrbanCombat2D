// The three bosses. Every attack is telegraphed and avoidable; each has a weakness window.
//  JUGGERNAUT: slow armoured brute. Telegraphed charge -> stuns itself on walls (vulnerable); ground slam.
//  COMMANDER : calls gunmen squads, fires controlled bursts, marks artillery zones, retreats when pressed.
//  ENGINEER  : casts sentries + barriers (interruptible by damage), electrical line strikes.
import { TAU, damp, angDiff, dist2, vrand } from '../core/util.js';
import { G, W } from '../core/registry.js';
import { ctx, R } from '../core/canvas.js';
import { Sound, Music } from '../core/audio.js';
import { moveCircle, flowDir, findReachableSpot } from '../world/map.js';
import { FX, P_RING } from '../rendering/fx.js';
import { drawHuman } from '../rendering/sprites.js';
import { textSprite, DISPLAY } from '../rendering/textcache.js';
import { Bullets } from './combat.js';
import { spawnEnemy, enemyLook, enemyFire } from './enemies.js';

const _fd = { x: 0, y: 0 };
function chase(e, dt, p, speedMul = 1, keep = 0) {
  const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1;
  let mx, my;
  if (e.los || !flowDir(e.x, e.y, _fd)) { mx = dx / d; my = dy / d; if (keep && d < keep) { mx = -mx; my = -my; } }
  else { mx = _fd.x; my = _fd.y; }
  e.vx += (mx * e.spd * speedMul - e.vx) * damp(6, dt); e.vy += (my * e.spd * speedMul - e.vy) * damp(6, dt);
  e.kvx *= Math.exp(-9 * dt); e.kvy *= Math.exp(-9 * dt);
  moveCircle(e, (e.vx + e.kvx) * dt, (e.vy + e.kvy) * dt);
  e.a += angDiff(e.a, Math.atan2(dy, dx)) * damp(6, dt);
  e.phase += Math.hypot(e.vx, e.vy) * dt * 0.05;
  return d;
}
const set = (e, s, t) => { e.state = s; e.stateT = t; };

export const Bosses = {
  update(e, dt, p) {
    e.stateT -= dt;
    const enraged = e.hp < e.maxHp * 0.5, d = Math.hypot(p.x - e.x, p.y - e.y) || 1;
    if (e.stunT > 0 && e.state !== 'stunned') { e.cast = 0; }
    const melee = () => { if (d < e.r + p.r + 6 && e.atkCd <= 0 && e.state !== 'stunned') { e.atkCd = 1; G.game.hurtPlayer(e.d.melee * e.dmgMul, Math.atan2(p.y - e.y, p.x - e.x), { melee: true, elite: true }, null, e); } };
    if (e.boss === 'juggernaut') this.juggernaut(e, dt, p, d, enraged);
    else if (e.boss === 'commander') this.commander(e, dt, p, d, enraged);
    else this.engineer(e, dt, p, d, enraged);
    melee();
  },
  juggernaut(e, dt, p, d, enraged) {
    e.armorBase = e.armorBase ?? e.armor;
    if (e.state === 'move') {
      chase(e, dt, p, 1);
      if (e.stateT <= 0 && e.los) { if (d < 200) { set(e, 'slamWind', 0.8); e.slamX = e.x; e.slamY = e.y; } else { set(e, 'chargeWind', 0.9); } }
    } else if (e.state === 'chargeWind') {
      e.a = Math.atan2(p.y - e.y, p.x - e.x);
      if (e.stateT <= 0) { set(e, 'charge', 1.1); e.cx = Math.cos(e.a); e.cy = Math.sin(e.a); Sound.dash(); }
    } else if (e.state === 'charge') {
      const hit = moveCircle(e, e.cx * 700 * dt, e.cy * 700 * dt);
      if (Math.random() < 0.6) FX.dust(e.x, e.y, 1);
      if (d < e.r + p.r + 4) G.game.hurtPlayer(30 * e.dmgMul, Math.atan2(p.y - e.y, p.x - e.x), { melee: true, elite: true }, null, e);
      if (hit) {   // slammed into a wall: dazed and exposed
        G.game.shake(14); G.destruct.damageTilesInRadius(e.x, e.y, 70, 200); FX.dust(e.x, e.y, 12);
        set(e, 'stunned', enraged ? 2 : 2.6); e.armor = 0; FX.text(e.x, e.y - 70, 'VULNERABLE', '#ffd23f', 22, { crit: true });
      } else if (e.stateT <= 0) set(e, 'move', enraged ? 1.6 : 2.4);
    } else if (e.state === 'slamWind') {
      if (e.stateT <= 0) {
        G.game.shake(12); FX.add(P_RING, e.slamX, e.slamY, 0, 0, 0.4, 170, '#ff9a1f', { lw: 10 }); FX.distort(e.slamX, e.slamY, 170); Sound.explode();
        if (dist2(p.x, p.y, e.slamX, e.slamY) < 170 * 170) G.game.hurtPlayer(26 * e.dmgMul, Math.atan2(p.y - e.y, p.x - e.x), { melee: true, elite: true }, null, e);
        if (enraged) for (let i = 0; i < 12; i++) Bullets.enemy(e.x, e.y, i / 12 * TAU, 210, { dmg: 9 * e.dmgMul, r: 8, color: '#ff9a1f', life: 2.2, elite: true });
        set(e, 'move', 2.2);
      }
    } else if (e.state === 'stunned') {
      if (e.stateT <= 0) { e.armor = e.armorBase; set(e, 'move', 1.8); }
    }
  },
  commander(e, dt, p, d, enraged) {
    e.callT = (e.callT ?? 4) - dt; e.artyT = (e.artyT ?? 6) - dt;
    if (e.state === 'retreat') { chase(e, dt, p, 1.4, 9999); if (e.stateT <= 0) set(e, 'move', 1.2); }
    else { chase(e, dt, p, 1, 260); if (d < 170 && e.state === 'move') { set(e, 'retreat', 1.4); FX.add(1, e.x, e.y, 0, 0, 1.2, 30, 'rgba(120,120,130,', { grow: 40, a: 0.6 }); } }
    if (e.state === 'move' && e.stateT <= 0 && e.los) { set(e, 'burst', 0.9); e.shots = enraged ? 5 : 3; e.shotT = 0.35; }
    if (e.state === 'burst') {
      e.shotT -= dt;
      if (e.shotT <= 0 && e.shots > 0) { e.shots--; e.shotT = 0.18; enemyFire(e, p, { n: 3, spread: 0.18, spd: 360, dmg: 8, life: 2.2 }); }
      if (e.stateT <= 0) set(e, 'move', enraged ? 1.4 : 2);
    }
    if (e.callT <= 0) {   // reinforcements, capped so the field never floods
      e.callT = enraged ? 7 : 10;
      const minions = W.enemies.filter(o => o.summoned && !o.dead).length;
      if (minions < 8) { for (let i = 0; i < (enraged ? 4 : 3); i++) { const s = findReachableSpot(e.x, e.y, 60, 200, false); if (s) spawnEnemy('gunman', s[0], s[1], G.game.wave, { summoned: true }); } FX.text(e.x, e.y - 60, 'SQUAD UP!', '#ffd23f', 24, { crit: true }); Sound.event(); }
    }
    if (e.artyT <= 0 && e.los) {
      e.artyT = enraged ? 4.5 : 6.5;
      for (let i = 0; i < (enraged ? 4 : 3); i++) G.hazards.artillery(p.x + vrand(-120, 120) + p.vx * 0.5, p.y + vrand(-120, 120) + p.vy * 0.5, 1.5 + i * 0.25, 80, 20 * e.dmgMul);
    }
  },
  engineer(e, dt, p, d, enraged) {
    e.buildT = (e.buildT ?? 3) - dt; e.zapT = (e.zapT ?? 5) - dt;
    if (e.cast > 0) {   // channelling a build; taking enough damage interrupts it
      e.cast -= dt;
      if (e.castDmg > 120) { e.cast = 0; e.castDmg = 0; e.stunT = 1.2; FX.text(e.x, e.y - 70, 'INTERRUPTED', '#2ef2ff', 22, { crit: true }); Sound.zap(); return; }
      if (e.cast <= 0) {
        if (e.castKind === 'turret') {
          const turrets = W.enemies.filter(o => o.type === 'eturret' && !o.dead).length;
          if (turrets < (enraged ? 3 : 2)) { const s = findReachableSpot(e.x, e.y, 50, 140, false); if (s) spawnEnemy('eturret', s[0], s[1], G.game.wave, { summoned: true }); }
        } else G.destruct.placeBarrier(e.x, e.y, Math.atan2(p.y - e.y, p.x - e.x), 3, 220, 7, 'enemy', { ahead: 1.4 });
        Sound.deploy();
      }
      return;
    }
    chase(e, dt, p, 1, 280);
    if (e.buildT <= 0 && e.los) { e.buildT = enraged ? 6 : 8; e.cast = 1.3; e.castDmg = 0; e.castKind = Math.random() < 0.6 ? 'turret' : 'barrier'; }
    if (e.zapT <= 0 && e.los && e.stunT <= 0) {
      e.zapT = enraged ? 3.2 : 4.5;
      const n = enraged ? 3 : 1;
      for (let i = 0; i < n; i++) { const a = Math.atan2(p.y - e.y, p.x - e.x) + (i - (n - 1) / 2) * 0.35; G.hazards.lineStrike(e.x, e.y, a, 640, 0.75, 18 * e.dmgMul); }
    }
  },
  onDeath(e) {
    const game = G.game;
    game.explosion(e.x, e.y, 200, 0, 'boss'); game.shake(22); game.hitstop(0.15);
    if (e.boss === 'juggernaut') { for (let i = 0; i < 18; i++) { const a = vrand(TAU), v = vrand(150, 450); FX.add(2, e.x, e.y, Math.cos(a) * v, Math.sin(a) * v, 2.5, vrand(5, 10), '#8c8f99', { vz: vrand(150, 300) }); } }
    else if (e.boss === 'commander') { FX.sparkle(e.x, e.y, '#ff3b4e', 40, 500); for (const o of W.enemies) if (o.summoned && !o.dead) { o.spd *= 0.6; o.fireT += 2; } }
    else { for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; FX.arc(e.x, e.y, e.x + Math.cos(a) * 220, e.y + Math.sin(a) * 220, '#ffd23f'); } for (const o of W.enemies) if (o.type === 'eturret' && !o.dead) G.game.damageEnemy(o, 9999, 0, 0, false, 'chain'); }
    G.pickups.health(e.x + 30, e.y, 50);
    G.pickups.equipCrate(e.x - 30, e.y, 'boss');
    game.banner(e.d.name + ' DOWN', '#ffc93c');
    game.run.bosses++; if (!game.run.bossTypes.includes(e.boss)) game.run.bossTypes.push(e.boss);
    if (game.boss === e) game.boss = null;
    Music.set('combat', Music.intensity);
  },
  draw(e, x, y, time) {
    if (e.state === 'chargeWind') { ctx.fillStyle = `rgba(255,60,80,${0.25 + Math.sin(time * 40) * 0.1})`; ctx.save(); ctx.translate(x, y); ctx.rotate(e.a); ctx.fillRect(0, -e.r, 600, e.r * 2); ctx.restore(); }
    if (e.state === 'slamWind') { const k = 1 - e.stateT / 0.8; ctx.fillStyle = `rgba(255,154,31,${0.15 + 0.15 * k})`; ctx.beginPath(); ctx.arc(e.slamX, e.slamY, 170, 0, TAU); ctx.fill(); ctx.strokeStyle = '#ff9a1f'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(e.slamX, e.slamY, 170 * k, 0, TAU); ctx.stroke(); }
    drawHuman(ctx, x, y, Object.assign(enemyLook(e), { a: e.a + e.twist, phase: e.phase, moving: e.state !== 'stunned', flash: e.flash > 0, sx: 1 + e.squash * 0.15, sy: 1 - e.squash * 0.1 }));
    R.draws++;
    if (e.state === 'stunned') { for (let i = 0; i < 3; i++) { const a = time * 4 + i * TAU / 3; ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.arc(x + Math.cos(a) * 30, y - 50 + Math.sin(a) * 8, 5, 0, TAU); ctx.fill(); } }
    if (e.cast > 0) {
      const f = 1 - e.cast / 1.3, w = 70;
      ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(x - w / 2, y - e.r - 34, w, 8); ctx.fillStyle = '#2ef2ff'; ctx.fillRect(x - w / 2, y - e.r - 34, w * f, 8);
      const s = textSprite('BUILDING ' + (e.castKind === 'turret' ? 'SENTRY' : 'BARRIER'), 12, '#2ef2ff', DISPLAY); ctx.drawImage(s.c, x - s.w / 2, y - e.r - 54);
    }
  },
};
