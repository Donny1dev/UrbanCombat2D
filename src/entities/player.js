// The player: movement, dash, firing, equipment-driven modifiers and drawing.
import { TAU, damp, clamp, lerp, rand, vrand, dist2 } from '../core/util.js';
import { G } from '../core/registry.js';
import { ctx, R, GLOW, glow } from '../core/canvas.js';
import { Settings } from '../core/settings.js';
import { Sound } from '../core/audio.js';
import { held, mouse } from '../core/input.js';
import { M, moveCircle, collideCircle, objAt, solidAt, O_NONE } from '../world/map.js';
import { TILE } from '../core/util.js';
import { GUN_SHAPES } from '../data/weapons.js';
import { atLeast } from '../data/equipment.js';
import { refreshStats, newEvoState } from '../systems/stats.js';
import { newEqState } from '../systems/equipmentRules.js';
import { Grid } from '../systems/grid.js';
import { FX, P_SPARK, P_RING } from '../rendering/fx.js';
import { drawHuman, drawHumanCached, lookToOpts, armourLook } from '../rendering/sprites.js';
import { Bullets, updateBlades, updateDrone, drawBladesDrones } from './combat.js';

const DASH_TIME = 0.17, BASE_SPEED = 275, BASE_DASH = 175;
export const xpForLevel = l => Math.floor(6 + (l - 1) * 5 + Math.pow(l - 1, 1.75) * 1.6);
export const buff = (p, k) => (p.buffs[k] || 0) > 0;
export const addBuff = (p, k, t) => { p.buffs[k] = Math.max(p.buffs[k] || 0, t); };
export const lastStandOn = p => p.S.laststand > 0 && p.hp < p.maxHp * 0.3;
export const harnessOn = p => p.S.harness > 0 && p.hp < p.maxHp * p.S.harnessAt;
const near = [];

export function newPlayer(loadout, mods) {
  const p = {
    x: M.startX, y: M.startY, px: M.startX, py: M.startY, r: 14, vx: 0, vy: 0, a: 0, hp: 100, maxHp: 100, bonusHp: 0,
    upg: {}, synergies: new Set(), S: null, weapon: loadout.weapon, evo: newEvoState(), gun: null, ammo: 0, reloading: 0, reloadTac: false,
    eq: newEqState(loadout), fireCd: 0, recoil: 0, altRecoil: 0, altSide: 1, phase: 0, moving: false, lean: 0,
    dashT: 0, dashDur: DASH_TIME, dashCdT: 0, dashX: 1, dashY: 0, dashTrailD: 0, dashHits: new Set(), slid: false,
    invuln: 0, hurtT: 0, ghosts: [], ghostT: 0, footT: 0,
    level: 1, xp: 0, xpShown: 0, xpNeed: xpForLevel(1), xpPulse: 0, momentumT: 0,
    overclockT: 0, ocKills: 0, bladeAng: 0, bladeArcT: 1, drones: [], droneOD: 10, droneODT: 0, glowT: 0, glowCol: '#2ef2ff', squash: 0,
    dmgDealt: 0, pickStreak: 0, pickT: 0, xpTotal: 0, weaponTime: {},
    buffs: {}, shield: 0, shieldT: 0, eShield: 0, eShieldT: 99, ironCd: 0, secondWindUsed: false, combatT: 9, vampBudget: 0, reactiveCd: 0,
    shotCount: 0, sustainT: 0, hitStreak: 0, charge: 0, primed: false, thunderN: 0, phantomT: 0, apocT: 2.2, firstShotReady: false,
    locks: 1, rerolls: 1, savedCard: null, transformT: 0, emptyHint: 0, harnessLatch: false, harnessCd: 0, plateCd: 0, capCd: 0, heavyPulseCd: 0,
    mods: mods || { speed: 1, dmgDealt: 1 },
  };
  refreshStats(p); p.ammo = p.gun.mag; p.eShield = p.S.shieldCap;
  return p;
}

export function moveSpeed(p) {
  const S = p.S;
  const mom = S.momentum ? Math.min(1, p.momentumT / 2) * 0.08 * S.momentum : 0;
  const bonus = mom + (buff(p, 'adren') ? 0.18 + 0.06 * S.adren : 0) + (buff(p, 'fleet') ? 0.2 + 0.1 * S.fleet : 0) +
    (buff(p, 'stim') ? 0.2 * S.stimulant : 0) + (buff(p, 'bloodrush') ? 0.12 : 0) + (buff(p, 'secondwind') ? 0.4 : 0) +
    (p.reloading > 0 ? S.evreload : 0) + (buff(p, 'mayhem') ? 0.1 : 0) + (harnessOn(p) ? S.harness : 0) +
    (buff(p, 'eqStim') ? 0.3 : 0) + (buff(p, 'booster') ? 0.2 : 0);
  return BASE_SPEED * S.moveMul * (1 - 0.03 * S.fortified) * (1 + bonus) * p.mods.speed;
}
export function fireRate(p) {
  const S = p.S, g = p.gun;
  const bonus = S.rungun * Math.min(1, p.momentumT / 1.5) * (p.moving ? 1 : 0) + (buff(p, 'tactical') ? S.tactical : 0) +
    (lastStandOn(p) ? S.laststand : 0) + (buff(p, 'streakFire') ? 0.25 : 0) + (buff(p, 'surgeon') ? 0.25 : 0) + (buff(p, 'mayhem') ? 0.3 : 0) +
    (buff(p, 'eqStim') ? 0.25 : 0) + (harnessOn(p) && p.eq.armour.rank >= 3 ? 0.15 : 0) + (buff(p, 'booster') && atLeast(p.eq.support.rarity, 'legendary') && p.eq.support.id === 'booster' ? 0.15 : 0);
  return g.rate * (p.overclockT > 0 || buff(p, 'infAmmo') ? 1.7 : 1) * (1 + bonus);
}
export const reloadTime = p => p.gun.reload * (buff(p, 'stim') ? 1 - 0.2 * p.S.stimulant : 1) * (buff(p, 'streakReload') ? 0.5 : 1) *
  (harnessOn(p) ? 1 - p.S.harness : 1) * (buff(p, 'eqStim') ? 1 / 1.4 : 1) * (buff(p, 'resupply') ? 0.5 : 1);
export const infiniteAmmo = p => p.overclockT > 0 || buff(p, 'infAmmo');
function dashCooldown(p) { return p.S.dashCd * (buff(p, 'booster') ? 0.5 : 1) * (buff(p, 'eqStim') && p.eq.gadget.id === 'stim' && atLeast(p.eq.gadget.rarity, 'epic') ? 0.5 : 1); }
function nearWalls(x, y) {
  let n = 0; const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
  for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) if ((ox || oy) && objAt(tx + ox, ty + oy) !== O_NONE) n++;
  return n >= 3;
}

export function updatePlayer(p, dt) {
  const S = p.S, g = p.gun;
  p.px = p.x; p.py = p.y;
  for (const k in p.buffs) if (p.buffs[k] > 0) p.buffs[k] -= dt;
  p.weaponTime[p.weapon] = (p.weaponTime[p.weapon] || 0) + dt;
  p.a = Math.atan2(mouse.y - p.y, mouse.x - p.x);
  let ix = (held('right') ? 1 : 0) - (held('left') ? 1 : 0), iy = (held('down') ? 1 : 0) - (held('up') ? 1 : 0);
  const il = Math.hypot(ix, iy); if (il) { ix /= il; iy /= il; G.tutorial && G.tutorial.done('move'); }
  p.moving = il > 0;
  p.momentumT = p.moving ? Math.min(2.5, p.momentumT + dt) : Math.max(0, p.momentumT - dt * 3);
  p.dashCdT -= dt;
  if (p.dashT > 0) {
    p.dashT -= dt;
    const dsp = BASE_DASH * S.dashDist / DASH_TIME;
    p.vx = p.dashX * dsp; p.vy = p.dashY * dsp;
    p.ghostT -= dt;
    if (p.ghostT <= 0) { p.ghostT = 0.022; if (p.ghosts.length < 14) p.ghosts.push({ x: p.x, y: p.y, a: p.a, life: 0.28 }); }
    if (Math.random() < 0.8) FX.add(P_SPARK, p.x + vrand(-8, 8), p.y + vrand(-8, 8), -p.vx * 0.3, -p.vy * 0.3, 0.15, 2, p.slid ? '#ffd27a' : '#9ff6ff', { drag: 6 });
    if (S.afterburn) { p.dashTrailD += Math.hypot(p.vx, p.vy) * dt; while (p.dashTrailD > 16) { p.dashTrailD -= 16; G.hazards.fire(p.x, p.y, 30 + S.afterburn * 25, S.syn.scorched); } }
    const jug = p.eq.armour.id === 'juggernaut' && atLeast(p.eq.armour.rarity, 'legendary') ? 60 : 0;
    const boost = buff(p, 'booster') && p.eq.support.id === 'booster' && atLeast(p.eq.support.rarity, 'epic') ? 40 : 0;
    const kin = S.kinimpact ? (25 + 20 * S.kinimpact) * (S.syn.assault ? 2 : 1) : 0;
    if (kin + jug + boost > 0) {
      Grid.near(p.x, p.y, 60, near);
      for (const e of near) {
        if (p.dashHits.has(e.id) || dist2(e.x, e.y, p.x, p.y) > (e.r + p.r + 6) ** 2) continue;
        p.dashHits.add(e.id);
        G.game.damageEnemy(e, (kin + jug + boost) * (0.6 + 0.4 * S.dmgMul), Math.atan2(e.y - p.y, e.x - p.x), 450 * (S.syn.assault ? 1.5 : 1), false, kin ? 'impact' : 'gadget');
        FX.add(P_RING, e.x, e.y, 0, 0, 0.2, 30, '#ffffff', { lw: 4 }); G.game.shake(3);
      }
    }
    if (p.dashT <= 0) {
      const keep = p.slid ? 0.85 : 0.35;
      p.vx *= keep; p.vy *= keep; p.invuln = 0.08 + (S.phase ? 0.06 : 0) + S.dashIframe;
      if (S.shock) G.game.shockwave(p.x, p.y, 110 + S.shock * 28, 32 * S.shock * (0.6 + S.dmgMul * 0.4));
    }
  } else {
    const speed = moveSpeed(p), k = damp(p.moving ? 24 : p.slid && p.dashCdT > S.dashCd - 0.45 ? 4 : 18, dt);
    p.vx += (ix * speed - p.vx) * k; p.vy += (iy * speed - p.vy) * k;
  }
  if (held('dash') && p.dashCdT <= 0 && p.dashT <= 0) startDash(p, ix, iy);
  moveCircle(p, p.vx * dt, p.vy * dt);
  bodyCollide(p);
  const sp = Math.hypot(p.vx, p.vy);
  p.phase += sp * dt * 0.055;
  p.lean = lerp(p.lean, clamp(sp / 300, 0, 1), damp(10, dt));
  p.footT -= dt * (sp / 260);
  if (p.footT <= 0 && sp > 60) { p.footT = 0.3; FX.dust(p.x - p.vx * 0.04, p.y - p.vy * 0.04, 1); }
  for (let i = p.ghosts.length - 1; i >= 0; i--) { p.ghosts[i].life -= dt; if (p.ghosts[i].life <= 0) p.ghosts.splice(i, 1); }
  // timers
  p.invuln -= dt; p.hurtT -= dt; p.recoil = Math.max(0, p.recoil - dt * 60); p.altRecoil = Math.max(0, p.altRecoil - dt * 60);
  p.glowT -= dt; p.squash = Math.max(0, p.squash - dt * 5); p.pickT -= dt; if (p.pickT <= 0) p.pickStreak = 0;
  p.overclockT -= dt; p.ironCd -= dt; p.combatT += dt; p.reactiveCd -= dt; p.transformT = Math.max(0, p.transformT - dt);
  p.harnessCd -= dt; p.plateCd -= dt; p.capCd -= dt; p.heavyPulseCd -= dt; p.emptyHint -= dt;
  p.vampBudget = Math.min(6 + 3 * S.vamp, p.vampBudget + (6 + 3 * S.vamp) * dt);
  const regen = (S.regen * (p.combatT > 4 ? 2 : 1) + (buff(p, 'medregen') ? 3 : 0) + (buff(p, 'injRegen') ? 5 : 0)) * G.game.mods.healMul;
  if (regen && p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + regen * dt);
  if (p.shield > 0) { p.shieldT -= dt; if (p.shieldT <= 0) p.shield = Math.max(0, p.shield - 3 * dt); }
  if (S.shieldCap > 0) { p.eShieldT += dt; if (p.eShieldT >= S.shieldDelay && p.eShield < S.shieldCap) p.eShield = Math.min(S.shieldCap, p.eShield + S.shieldRate * dt); }
  if (S.secondwind && !p.secondWindUsed && p.hp < p.maxHp * 0.35) {
    p.secondWindUsed = true; addBuff(p, 'secondwind', 3 + S.secondwind); p.invuln = 0.5;
    FX.text(p.x, p.y - 40, 'SECOND WIND', '#2ef2ff', 22, { crit: true }); FX.add(P_RING, p.x, p.y, 0, 0, 0.4, 80, '#2ef2ff', { lw: 5 }); Sound.dash();
  }
  const low = harnessOn(p);
  if (low && !p.harnessLatch && p.eq.armour.id === 'harness' && atLeast(p.eq.armour.rarity, 'epic') && p.harnessCd <= 0) { p.invuln = Math.max(p.invuln, 1); p.harnessCd = 30; FX.text(p.x, p.y - 40, 'ADRENALINE', '#ff4fd8', 18, { crit: true }); }
  p.harnessLatch = low;
  // reload
  if (p.reloading > 0) {
    p.reloading -= dt;
    if (p.reloading <= 0) {
      p.ammo = g.mag; Sound.reloadDone();
      if (p.reloadTac && S.tactical) { addBuff(p, 'tactical', 4); FX.text(p.x, p.y - 34, 'TACTICAL', '#ff4f5e', 15); }
      if (S.firstStrike) p.firstShotReady = true;
    }
  }
  if (held('reload') && p.reloading <= 0 && p.ammo < g.mag) startReload(p);
  // shooting
  p.fireCd -= dt;
  const inf = infiniteAmmo(p), firing = mouse.down && p.reloading <= 0 && !G.game.noFire;
  p.sustainT = firing ? p.sustainT + dt : Math.max(0, p.sustainT - dt * 3);
  if (firing) {
    G.tutorial && G.tutorial.done('shoot');
    let shots = 0;
    while (p.fireCd <= 0 && shots < 4) {
      if (p.ammo <= 0 && !inf) { tryReload(p); break; }
      fire(p);
      if (!inf) p.ammo--;
      p.fireCd += 1 / fireRate(p);
      shots++;
    }
    if (p.ammo <= 0 && !inf && p.reloading <= 0) tryReload(p);
    if (g.apocalypse) { p.apocT -= dt; if (p.apocT <= 0) { p.apocT = 2.2; radialBarrage(p); } }
    if (g.phantom) { p.phantomT -= dt; if (p.phantomT <= 0) { p.phantomT = 0.45; phantomVolley(p); } }
  }
  if (p.fireCd < 0) p.fireCd = 0;
  // blades & drones (upgrades)
  p.bladeAng += dt * 3.4 * (1 + 0.25 * S.orbital);
  if (S.blades) updateBlades(p, dt);
  while (p.drones.length < S.drones) p.drones.push({ x: p.x, y: p.y, px: p.x, py: p.y, cd: rand(0.3), a: 0, t: rand(TAU) });
  if (S.overdrive) { p.droneOD -= dt; p.droneODT -= dt; if (p.droneOD <= 0) { p.droneOD = 10; p.droneODT = 2 + S.overdrive; FX.text(p.x, p.y - 44, 'OVERDRIVE', '#8c7bff', 16); } }
  const shared = !!S.eqSyn.eq_netwar;
  let focus = shared && G.equip ? G.equip.focus : null;
  for (let i = 0; i < p.drones.length; i++) focus = updateDrone(p, p.drones[i], i, p.drones.length, dt, focus, shared);
  if (shared && G.equip) G.equip.focus = focus;
}
// When auto-reload is off, an empty magazine waits for R (with a hint), as players expect from that setting.
function tryReload(p) {
  if (Settings.autoReload) { startReload(p); return; }
  if (p.emptyHint <= 0) { p.emptyHint = 1.2; FX.text(p.x, p.y - 30, 'EMPTY · PRESS ' + Settings.keys.reload.toUpperCase(), '#ff3b4e', 14); Sound.wall(true); }
}
function startDash(p, ix, iy) {
  const S = p.S;
  if (p.moving) { p.dashX = ix; p.dashY = iy; } else { p.dashX = Math.cos(p.a); p.dashY = Math.sin(p.a); }
  p.slid = S.slide > 0 && nearWalls(p.x, p.y);
  p.dashDur = DASH_TIME * (p.slid ? 1.35 + 0.15 * S.slide : 1);
  p.dashT = p.dashDur; p.dashCdT = dashCooldown(p); p.dashTrailD = 0; p.dashHits.clear();
  Sound.dash(); FX.dust(p.x, p.y, 5, 'rgba(180,230,255,');
  FX.add(P_RING, p.x, p.y, 0, 0, 0.25, 34, '#9ff6ff', { lw: 3 });
  if (p.slid) FX.text(p.x, p.y - 30, 'SLIDE', '#ffd27a', 14);
  if (S.ghost) G.decoys.add(p.x, p.y, 1.2 + 0.4 * S.ghost, 250 + 50 * S.ghost, S.syn.phantomrun);
  if (S.emp) G.game.emp(p.x, p.y, 220 + 60 * S.emp, 1 + 0.5 * S.emp);
  G.tutorial && G.tutorial.done('dash');
}
// soft body blocking so being surrounded matters (Phase Dash ignores it)
function bodyCollide(p) {
  if (p.dashT > 0 && p.S.phase) return;
  const jugEpic = p.eq.armour.id === 'juggernaut' && atLeast(p.eq.armour.rarity, 'epic');
  Grid.near(p.x, p.y, 80, near);
  for (const e of near) {
    if (e.spawnT > 0 || e.d.structure) continue;
    const dx = p.x - e.x, dy = p.y - e.y, rr2 = p.r + e.r - 4, d2 = dx * dx + dy * dy;
    if (d2 >= rr2 * rr2 || d2 < 0.01) continue;
    const d = Math.sqrt(d2), push = rr2 - d, share = jugEpic ? 0.15 : (e.d.resist || 0) > 0.6 ? 0.7 : 0.3;
    p.x += dx / d * push * share; p.y += dy / d * push * share;
    e.x -= dx / d * push * (1 - share); e.y -= dy / d * push * (1 - share);
    collideCircle(e);
  }
  collideCircle(p);
}
export function startReload(p) {
  if (p.reloading > 0 || p.ammo >= p.gun.mag) return;
  if (G.equip && G.equip.autoResupply(p)) return;      // Ammo Resupply (legendary) fires instead of reloading
  p.reloadTac = p.ammo > 0;
  p.reloading = reloadTime(p); Sound.reload();
  FX.text(p.x, p.y - 30, 'RELOAD', '#ffd23f', 15);
}
function bulletTemplate(p, mul) {
  const g = p.gun;
  return {
    dmg: g.dmg * mul * p.mods.dmgDealt * (G.equip ? G.equip.damageMul(p) : 1), life: g.life, r: g.radius, pierce: g.pierce, rico: g.ricochet, knock: g.knock, trail: g.trail, width: g.width,
    crit: g.critChance, critMul: g.critMul, src: 'gun', boom: g.impactBoom, rail: g.rail, omega: g.omega, inferno: g.inferno,
    cryoC: g.cryoCannon, armorPen: g.armorPen || 0, massacre: g.massacre, canFrag: true, warrant: g.warrant,
  };
}
export function fire(p) {
  const g = p.gun, S = p.S;
  let side = 0;
  if (p.weapon === 'dual') { p.altSide = -p.altSide; side = p.altSide * 8; }
  const ca = Math.cos(p.a), sa = Math.sin(p.a);
  const len = (GUN_SHAPES[p.weapon] || [14])[0] + (p.weapon === 'dual' || p.weapon === 'pistol' ? 14 : 9);
  const mx = p.x + ca * len - sa * side, my = p.y + sa * len + ca * side;
  const blocked = solidAt(mx, my), sx = blocked ? p.x : mx, sy = blocked ? p.y : my;
  // aim from the muzzle to the cursor so close targets aren't missed by the barrel offset
  const cd2 = dist2(mouse.x, mouse.y, p.x, p.y), aim = cd2 > (len + 18) ** 2 ? Math.atan2(mouse.y - sy, mouse.x - sx) : p.a;
  let mul = 1, tag = null;
  if (lastStandOn(p)) mul *= 1 + S.laststand;
  if (buff(p, 'mayhem')) mul *= 1.15;
  if (p.firstShotReady) { mul *= 1 + S.firstStrike; p.firstShotReady = false; tag = 'FIRST STRIKE'; }
  if (S.lastRound && p.ammo === 1 && !infiniteAmmo(p)) { mul *= 1 + S.lastRound; tag = 'LAST ROUND'; }
  const primed = p.primed; if (primed) { mul *= 3; p.primed = false; tag = 'WARRANT'; }
  const tpl = bulletTemplate(p, mul);
  if (primed) tpl.crit = 1;
  if (g.thunder) { p.thunderN = (p.thunderN + 1) % 4; if (p.thunderN === 0) { tpl.charged = true; tpl.width += 2; tpl.trail = '#e8f6ff'; } }
  if (tag) { tpl.width += 1.5; FX.text(p.x, p.y - 34, tag, '#ffd23f', 13); }
  const spread = g.spread * (1 - S.recoilComp * Math.min(1, p.sustainT / 1.2));
  const n = g.pellets;
  for (let i = 0; i < n; i++) {
    let ang = aim + (Math.random() - 0.5) * 2 * spread * (p.weapon === 'shotgun' ? 0.5 : 1);
    if (g.fan && n > 1) ang += (i - (n - 1) / 2) * g.fan;
    Bullets.player(sx, sy, ang, g.speed * (p.weapon === 'shotgun' ? rand(0.8, 1.15) : rand(0.97, 1.03)), tpl);
  }
  p.shotCount++;
  if (S.syn.hurricane && p.shotCount % 12 === 0) {
    const t2 = Object.assign({}, tpl, { dmg: tpl.dmg * 0.6, canFrag: false });
    for (let i = 0; i < 8; i++) Bullets.player(sx, sy, aim + (i - 3.5) * 0.17, g.speed * 0.9, t2);
    FX.add(P_RING, sx, sy, 0, 0, 0.2, 40, '#ffd27a', { lw: 3 });
  }
  if (g.worldbreaker) {
    G.game.coneBlast(sx, sy, aim, 160, g.dmg * 0.9, 520);
    for (let i = 0; i < 4; i++) Bullets.player(sx, sy, aim + rand(-0.6, 0.6), g.speed * 0.7, Object.assign({}, tpl, { dmg: tpl.dmg * 0.35, life: 0.3, r: 3, width: 2, src: 'frag', canFrag: false, pierce: 0 }));
  }
  if (p.weapon === 'dual') { if (p.altSide > 0) p.altRecoil = g.recoil; else p.recoil = g.recoil; } else p.recoil = g.recoil;
  const scale = p.weapon === 'shotgun' || p.weapon === 'heavy' ? 1.5 : 1;
  FX.muzzle(mx, my, aim, scale, g.hue);
  G.game.muzzle = { x: mx, y: my, a: aim, t: 0.05, scale, hue: g.hue };
  FX.casing(p.x + ca * 6, p.y + sa * 6, p.a, g.shell);
  Sound.shoot(p.weapon, g.evolved);
  G.game.shake(g.shake * 0.8);
  p.vx -= ca * g.recoil * 4; p.vy -= sa * g.recoil * 4;
}
function radialBarrage(p) {
  const tpl = Object.assign(bulletTemplate(p, 0.5), { canFrag: false });
  for (let i = 0; i < 18; i++) Bullets.player(p.x, p.y, p.a + i / 18 * TAU, p.gun.speed * 0.8, tpl);
  FX.add(P_RING, p.x, p.y, 0, 0, 0.35, 90, '#ffd23f', { lw: 6 }); Sound.explode(); G.game.shake(4);
}
export function phantomPos(p, i) {
  const s = i ? 1 : -1, ca = Math.cos(p.a), sa = Math.sin(p.a);
  return [p.x - ca * 22 - sa * 46 * s, p.y - sa * 22 + ca * 46 * s];
}
function phantomVolley(p) {
  for (let i = 0; i < 2; i++) {
    const [x, y] = phantomPos(p, i);
    if (solidAt(x, y)) continue;
    Bullets.player(x, y, Math.atan2(mouse.y - y, mouse.x - x), p.gun.speed, Object.assign(bulletTemplate(p, 0.6), { trail: '#c49bff', seek: true, canFrag: false, src: 'phantom' }));
    FX.light(x, y, 40, 0.06, GLOW.violet, 0.7);
  }
}

export function drawPlayer(p, time, v, alpha) {
  const x = lerp(p.px, p.x, alpha), y = lerp(p.py, p.y, alpha);
  const look = armourLook(lookToOpts(G.profileLook()), p.eq.armour.id);
  for (const g of p.ghosts) {
    ctx.globalAlpha = (g.life / 0.28) * 0.45;
    drawHumanCached(v, g.x, g.y, g.a, Object.assign({}, look, { jacket: '#5ff4ff', skin: '#bff9ff', hair: '#5ff4ff', pants: '#5ff4ff', vest: null, backpack: null, weapon: p.weapon }), 'ghost' + p.weapon, 0, false, false, 1, 1, false);
  }
  ctx.globalAlpha = 1;
  if (p.gun.phantom) for (let i = 0; i < 2; i++) {
    const [px, py] = phantomPos(p, i);
    ctx.globalAlpha = 0.35 + Math.sin(time * 6 + i) * 0.1;
    drawHuman(ctx, px, py, Object.assign({}, look, { a: p.a, jacket: '#c49bff', skin: '#e6d6ff', hair: '#c49bff', pants: '#8a6bd6', weapon: p.weapon, scale: 0.9 }));
    ctx.globalAlpha = 1;
  }
  ctx.globalCompositeOperation = 'lighter';
  if (p.glowT > 0 || G.game.levelFlash > 0) glow(p.overclockT > 0 ? GLOW.fire : p.transformT > 0 ? GLOW.gold : GLOW.xp, x, y, 60 + G.game.levelFlash * 60 + p.transformT * 60, 0.45 + G.game.levelFlash * 0.4);
  if (p.dashT > 0) glow(GLOW.xp, x, y, 50, 0.6);
  if (buff(p, 'mayhem')) glow(GLOW.magenta, x, y, 70 + Math.sin(time * 12) * 8, 0.5);
  if (lastStandOn(p) || harnessOn(p)) glow(GLOW.red, x, y, 54, 0.35 + Math.sin(time * 8) * 0.15);
  if (buff(p, 'eqStim') || buff(p, 'booster')) glow(GLOW.orange, x, y, 50, 0.35);
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = look.accent ? look.accent + '88' : 'rgba(46,242,255,0.35)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(x, y, 22, 0, TAU); ctx.stroke();
  if (p.shield > 0) { ctx.strokeStyle = `rgba(120,200,255,${0.4 + Math.min(0.5, p.shield / 40)})`; ctx.lineWidth = 3 + Math.min(4, p.shield / 10); ctx.beginPath(); ctx.arc(x, y, 26, 0, TAU); ctx.stroke(); }
  if (p.eShield > 0.5) { ctx.strokeStyle = `rgba(46,242,255,${0.25 + 0.5 * p.eShield / Math.max(1, p.S.shieldCap)})`; ctx.lineWidth = 2; ctx.setLineDash([6, 4]); ctx.lineDashOffset = -time * 20; ctx.beginPath(); ctx.arc(x, y, 30, 0, TAU); ctx.stroke(); ctx.setLineDash([]); }
  const blink = p.hurtT > 0 && Math.floor(time * 30) % 2 === 0;
  const ma = Math.atan2(p.vy, p.vx), lx = Math.cos(ma) * p.lean * 2, ly = Math.sin(ma) * p.lean * 2;
  drawHuman(ctx, x + lx, y + ly, Object.assign({}, look, { a: p.a, phase: p.phase, moving: Math.hypot(p.vx, p.vy) > 40, scale: 1.05, weapon: p.weapon, flash: blink, recoil: p.recoil, altRecoil: p.altRecoil, evolved: p.gun.evolved, sx: 1 + p.squash * 0.15, sy: 1 - p.squash * 0.1 }));
  R.draws++;
  if (p.transformT > 0) {
    const t = p.transformT;
    ctx.strokeStyle = `rgba(255,201,60,${t})`; ctx.lineWidth = 4;
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(x, y, 30 + (1 - t) * 120 + i * 18, 0, TAU); ctx.stroke(); }
  }
  drawBladesDrones(p, alpha);
}
