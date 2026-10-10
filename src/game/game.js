// Game: run lifecycle (all modes), damage/heal pipelines, explosions, crates, run tracking and rewards hand-off.
import { TAU, clamp, lerp, damp, angDiff, dist2, vrand, uid, makeRng, setGameRng, todayKey } from '../core/util.js';
import { G, W } from '../core/registry.js';
import { Settings } from '../core/settings.js';
import { Sound, Music } from '../core/audio.js';
import { mouse } from '../core/input.js';
import { V } from '../core/canvas.js';
import { generateMap, generateArena, updateFlow, M } from '../world/map.js';
import { modifierSet, dailyConfig } from '../data/modes.js';
import { atLeast, EQ } from '../data/equipment.js';
import { UPG } from '../data/upgrades.js';
import { refreshStats, incomingDamage, healResult, evoTop } from '../systems/stats.js';
import { crateOffers, applyCrateOffer, maxCharges } from '../systems/equipmentRules.js';
import { Grid } from '../systems/grid.js';
import { FX, Decals, P_RING } from '../rendering/fx.js';
import { GLOW } from '../core/canvas.js';
import { Bullets, enemyArmor, nearestEnemy, applyBurn } from '../entities/combat.js';
import { resetEnemies, updateEnemies, killEnemy, spawnEnemy } from '../entities/enemies.js';
import { newPlayer, updatePlayer, buff, addBuff, harnessOn } from '../entities/player.js';

const COMBO_MSG = { 2: ['DOUBLE KILL', '#ffd23f'], 3: ['TRIPLE KILL', '#ff9a1f'], 5: ['RAMPAGE', '#ff4f5e'], 8: ['UNSTOPPABLE', '#ff4fd8'], 12: ['URBAN MAYHEM', '#2ef2ff'] };
export const STREAKS = [
  { n: 5, label: '+XP BONUS', color: '#2ef2ff', apply: p => G.game.addXp(4 + G.game.wave) },
  { n: 10, label: 'FAST HANDS · RELOAD x2', color: '#ffd23f', apply: p => addBuff(p, 'streakReload', 5) },
  { n: 20, label: 'HOT BARREL · +25% FIRE RATE', color: '#ff9a1f', apply: p => { addBuff(p, 'streakFire', 5); G.game.shake(8); FX.add(P_RING, p.x, p.y, 0, 0, 0.5, 200, '#ff9a1f', { lw: 8 }); } },
  { n: 35, label: 'MAYHEM', color: '#ff4fd8', apply: p => { if (G.game.mayhemCd > 0) return false; addBuff(p, 'mayhem', 6); G.game.mayhemCd = 40; G.game.shake(14); FX.distort(p.x, p.y, 260); } },
];
const BUDGETED = new Set(['round', 'volatile', 'fire', 'impact']);
const EXPLOSIVE_SRC = new Set(['explosion', 'gadgetBoom']), GADGET_SRC = new Set(['gadget', 'gadgetBoom']);
function freshRun(mode, daily) {
  return { id: 'R' + uid(), date: Date.now(), mode, daily: daily ? daily.dateKey : null, kills: 0, streak: 0, time: 0, wave: 1, level: 1, bosses: 0, bossTypes: [], objectives: 0,
    damage: 0, damageTaken: 0, healed: 0, xp: 0, explosiveKills: 0, gadgetKills: 0, crates: 0, avoided: 0, perfectWaves: 0, synergies: 0, legendary: 0, maxed: 0,
    lightningBurst: 0, crits: 0, caches: 0, medkits: 0, eliteGadget: 0, weaponKills: 0, equipUsed: {}, bonusCredits: 0, achievements: [], weaponTime: {}, weapon: 'pistol', evo: null };
}

export const Game = {
  state: 'boot', mode: 'standard', mods: modifierSet('standard'), daily: null, run: freshRun('standard'),
  time: 0, wave: 1, combo: 0, comboT: 0, bestCombo: 0, comboMsg: null, bannerMsg: null, streakMsg: null, synMsg: null,
  shakeAmt: 0, shakeX: 0, shakeY: 0, cam: { x: 0, y: 0, px: 0, py: 0 }, muzzle: null, hitstopT: 0, boss: null, bossCount: 0,
  pending: 0, xpFlash: 0, hurtFlash: 0, deathT: 0, levelFlash: 0, boomBudget: 8, chainCd: 0, mayhemCd: 0, blackout: 0,
  streakDone: new Set(), timers: [], toasts: [], zapHits: [], achT: 0, noFire: false, lastResult: null,

  startRun({ mode = 'standard', loadout }) {
    this.mode = mode;
    this.daily = mode === 'daily' ? dailyConfig(todayKey()) : null;
    if (mode === 'training') { setGameRng(Math.random); generateArena(); }
    else if (this.daily) { setGameRng(makeRng(this.daily.seed)); generateMap(); setGameRng(makeRng(this.daily.seed ^ 0x5bd1e995)); }
    else { setGameRng(Math.random); generateMap(); }
    this.mods = modifierSet(mode, this.daily ? this.daily.mods : []);
    const lo = { ...loadout }; if (this.daily) lo.weapon = this.daily.weapon;
    resetEnemies(); FX.reset(); Decals.reset(); Bullets.reset();
    for (const k of ['pickups', 'hazards', 'decoys', 'destruct', 'equip', 'director']) G[k].reset();
    const p = newPlayer(lo, { speed: this.mods.speed, dmgDealt: this.mods.dmgDealt });
    W.player = p;
    Object.assign(this, { time: 0, wave: 1, combo: 0, comboT: 0, bestCombo: 0, comboMsg: null, bannerMsg: null, streakMsg: null, synMsg: null, shakeAmt: 0, muzzle: null, hitstopT: 0, boss: null, bossCount: 0, pending: 0, xpFlash: 0, hurtFlash: 0, deathT: 0, levelFlash: 0, boomBudget: 8, chainCd: 0, mayhemCd: 0, blackout: 0, achT: 0, noFire: false, lastResult: null });
    this.timers.length = 0; this.toasts.length = 0; this.zapHits.length = 0; this.streakDone = new Set();
    this.run = freshRun(mode, this.daily);
    this.cam.x = this.cam.px = p.x; this.cam.y = this.cam.py = p.y;
    updateFlow(p.x, p.y, 1);
    G.objectives.reset(); G.tutorial.start(G.save.profile());
    if (mode === 'training') G.training.start();
    else for (let i = 0; i < 4; i++) { const pos = G.director.findSpawn(p); if (pos) spawnEnemy('thug', pos[0], pos[1], 1); }
    Grid.build(W.enemies);
    this.banner(mode === 'training' ? 'TRAINING GROUNDS' : mode === 'daily' ? 'DAILY OPERATION' : mode === 'hardcore' ? 'HARDCORE · WAVE 1' : 'WAVE 1', mode === 'hardcore' ? '#ff3b4e' : '#2ef2ff', this.daily ? this.daily.mods.map(m => m.name).join(' · ') : null);
    Music.set('combat', 0.15);
    this.state = 'play';
  },
  shake(a) { this.shakeAmt = Math.min(26, Math.max(this.shakeAmt, a * Settings.shake * (Settings.reducedMotion ? 0.3 : 1))); },
  hitstop(t) { this.hitstopT = Math.max(this.hitstopT, t); },
  banner(text, color, sub) { this.bannerMsg = { text, color, sub, t: 2.4 }; },
  toast(text, color = '#f4f6fb', t = 2.6) { this.toasts.push({ text, color, t, max: t }); if (this.toasts.length > 4) this.toasts.shift(); },
  later(t, fn) { this.timers.push({ t, fn }); },
  track(key, n = 1, ctx) {
    const r = this.run;
    if (key === 'streak') r.streak = Math.max(r.streak, n); else r[key] = (r[key] || 0) + n;
    G.objectives.on(key, key === 'streak' ? n : n, ctx);
  },
  onDiscover(id) { const p = G.save.profile(); if (p && !p.discoveries.includes(id)) { p.discoveries.push(id); G.save.markDirty(); } this.achT = 0; },

  // ---------------- outgoing damage ----------------
  damageEnemy(e, dmg, ang, knock, crit, src, armor) {
    if (e.dead) return;
    if (armor === undefined) armor = src === 'burn' || src === 'fire' ? 0 : enemyArmor(e);
    if (e.reconT > 0) dmg *= 1 + (e.reconBonus || 0);
    if (e.empTagT > 0) { dmg *= 1 + (e.empBonus || 0); if (src === 'chain' && W.player.S.eqSyn.eq_overload) dmg *= 1.6; }
    dmg *= 1 - armor;
    e.hp -= dmg; e.flash = 0.07; e.squash = 1; e.lastHitT = 0;
    if (e.cast > 0) e.castDmg += dmg;
    if (e.d.dummy && G.training) G.training.onDamage(dmg, crit);
    const k = knock * (1 - (e.d.resist || 0));
    e.kvx += Math.cos(ang) * k; e.kvy += Math.sin(ang) * k;
    if (k > 0) e.twist = clamp(angDiff(e.a, ang) > 0 ? -k / 700 : k / 700, -0.6, 0.6);
    const p = W.player; p.dmgDealt += dmg; p.combatT = 0;
    if (src === 'chain') { const now = this.time; this.zapHits.push(e.id, now); }
    if (Settings.dmgNums) {
      const n = Math.round(dmg);
      if (crit) { FX.text(e.x, e.y - e.r - 6, n + '!', '#ffd23f', 22, { crit: true }); FX.add(P_RING, e.x, e.y, 0, 0, 0.2, 30, '#ffd23f', { lw: 3 }); }
      else if ((src !== 'fire' && src !== 'burn') || Math.random() < 0.25) {
        const t = e.dmgText;
        if (t && t.owner === e && t.life > t.max - 0.18 && !t.crit) { t.val += dmg; t.str = String(Math.round(t.val)); t.pop = 1; t.size = clamp(13 + Math.sqrt(t.val) * 1.1, 14, 26); }
        else e.dmgText = FX.text(e.x, e.y - e.r - 6, n, src === 'fire' || src === 'burn' ? '#ff9a1f' : src === 'chain' ? '#9fe8ff' : armor > 0.2 ? '#c0c4d0' : '#ffffff', clamp(13 + Math.sqrt(dmg) * 1.1, 14, 26), { owner: e, val: dmg });
      }
    }
    if (crit) Sound.crit();
    if (src === 'gun' || src === 'drone' || src === 'blade' || src === 'phantom' || src === 'gadget') {
      FX.hitBurst(e.x - Math.cos(ang) * e.r * 0.5, e.y - Math.sin(ang) * e.r * 0.5, ang, e.d.col);
      if (src === 'gun') FX.weaponHit(e.x, e.y, ang, p.weapon, e.d.col);
      Sound.hit();
    }
    if (e.hp <= 0) {
      if (Settings.comic && src === 'gun' && (crit && dmg > 70 || p.weapon === 'shotgun' || p.weapon === 'heavy') && Math.random() < 0.12) FX.comic(e.x, e.y - 24, ['POW!', 'BLAM!', 'KRAK!', 'WHAM!', 'BOOM!'][(Math.random() * 5) | 0]);
      killEnemy(e, ang, src);
    }
  },
  onKill(e, src) {
    const p = W.player, S = p.S, r = this.run;
    r.kills++;
    this.combo = this.comboT > 0 ? this.combo + 1 : 1; this.comboT = 1.5;
    if (this.combo === 1) this.streakDone.clear();
    if (this.combo > this.bestCombo) this.bestCombo = this.combo;
    this.track('streak', this.combo);
    const m = COMBO_MSG[this.combo] || (this.combo >= 20 && this.combo % 10 === 0 ? ['URBAN MAYHEM x' + this.combo / 10, '#2ef2ff'] : null);
    if (m) { this.comboMsg = { text: m[0], color: m[1], t: 1.3, n: this.combo }; Sound.combo(this.combo); }
    for (const s of STREAKS) if (this.combo >= s.n && !this.streakDone.has(s.n)) { this.streakDone.add(s.n); if (s.apply(p) !== false) { this.streakMsg = { text: s.label, color: s.color, t: 1.8 }; Sound.streak(STREAKS.indexOf(s)); } }
    if (EXPLOSIVE_SRC.has(src)) this.track('explosiveKills', 1);
    if (GADGET_SRC.has(src)) { this.track('gadgetKills', 1); if (e.d.elite || e.hunted) this.track('eliteGadget', 1); }
    if (src === 'gun') this.track('weaponKills', 1, { weapon: p.weapon });
    if (S.vamp && p.hp < p.maxHp) { const want = 0.6 * S.vamp * (buff(p, 'bloodrush') ? 1.5 : 1) * this.mods.healMul, got = Math.min(want, p.vampBudget); p.vampBudget -= got; p.hp = Math.min(p.maxHp, p.hp + got); }
    if (harnessOn(p) && p.eq.armour.id === 'harness' && atLeast(p.eq.armour.rarity, 'legendary')) p.hp = Math.min(p.maxHp, p.hp + 2 * this.mods.healMul);
    if (S.adren) addBuff(p, 'adren', 1.5);
    if (S.syn.bloodrush) addBuff(p, 'bloodrush', 2);
    if (S.kinrec) p.dashCdT -= S.kinrec;
    if (S.overclock) { p.ocKills++; if (p.ocKills >= 35 - S.overclock * 5 && p.overclockT <= 0) { p.ocKills = 0; p.overclockT = 5; p.glowT = 5; p.glowCol = '#ff9a1f'; FX.text(p.x, p.y - 44, 'OVERCLOCK', '#ff9a1f', 24, { crit: true }); Sound.select(false); } }
    if (S.explosive && !BUDGETED.has(src) && !EXPLOSIVE_SRC.has(src) && Math.random() < 0.1 + S.explosive * 0.12) this.explosion(e.x, e.y, 85 + S.explosive * 14, (28 + S.explosive * 14) * S.dmgMul, 'round');
    if ((e.d.elite && !e.hunted) && Math.random() < 0.08) G.pickups.equipCrate(e.x, e.y, 'elite');
    G.equip.onKill(p);
    if (e === this.boss) this.boss = null;
  },
  addXp(v) {
    const p = W.player;
    v *= this.mods.xp;
    p.xp += v; p.xpTotal += v; p.xpPulse = 1;
    while (p.xp >= p.xpNeed) {
      p.xp -= p.xpNeed; p.level++; p.xpNeed = Math.floor(6 + (p.level - 1) * 5 + Math.pow(p.level - 1, 1.75) * 1.6); this.pending++; this.xpFlash = 1;
      if (p.level % 6 === 0 && p.locks < 2) { p.locks++; FX.text(p.x, p.y - 56, '+1 LOCK', '#ffd23f', 14); }
      if (p.level % 7 === 0 && p.rerolls < 2) { p.rerolls++; FX.text(p.x, p.y - 70, '+1 REROLL', '#2ef2ff', 14); }
    }
  },
  heal(amount, source) {
    const p = W.player, S = p.S;
    if (source === 'medkit') { if (S.trauma) addBuff(p, 'trauma', 5); if (S.syn.surgeon) addBuff(p, 'surgeon', 6); if (S.medic >= 3) addBuff(p, 'medregen', 4); }
    const r = healResult(amount, source, p, this.mods);
    p.hp += r.used; this.run.healed += r.used;
    if (r.shieldGain > 0) { p.shield += r.shieldGain; p.shieldT = 5; Sound.shield(); }
    if (S.stimulant && r.amount >= 10) addBuff(p, 'stim', 4);
    FX.text(p.x, p.y - 26, '+' + Math.round(r.used) + ' HP' + (r.shieldGain >= 1 ? '  +' + Math.round(r.shieldGain) + ' SHIELD' : ''), '#52f08a', 18);
    if (source === 'medkit' && (S.trauma || S.syn.surgeon)) FX.add(P_RING, p.x, p.y, 0, 0, 0.4, 60, '#52f08a', { lw: 4 });
    Sound.heal();
  },
  explosion(x, y, r, dmg, kind) {
    if (BUDGETED.has(kind)) { if (this.boomBudget < 1) { FX.sparkle(x, y, '#ff9a1f', 6, 160); return; } this.boomBudget -= 1; }
    const S = W.player.S, src = kind === 'gadget' ? 'gadgetBoom' : 'explosion';
    FX.explosion(x, y, r); Sound.explode(); this.shake(kind === 'round' || kind === 'impact' ? 5 : 14);
    if (r > 100) FX.distort(x, y, r * 1.2);
    if (kind !== 'round' && kind !== 'impact') Decals.add('scorch', x, y, vrand(TAU), r / 60);
    if (dmg > 0) Grid.query(x, y, r + 30, e => {
      const d = Math.hypot(e.x - x, e.y - y);
      if (d >= r + e.r) return;
      if (S.syn.firestorm || kind === 'fire') applyBurn(e, (10 + 5 * S.incendiary) * S.elemMul, 3 * S.elemDur);
      this.damageEnemy(e, dmg * (1 - 0.5 * d / (r + e.r)), Math.atan2(e.y - y, e.x - x), 420, false, src);
    });
    if (S.syn.chainreact && kind === 'round' && Math.random() < 0.5) for (let i = 0; i < 2; i++) Bullets.player(x, y, vrand(TAU), 750, { dmg: dmg * 0.6, life: 0.7, r: 4, knock: 120, trail: '#ff9a1f', width: 3, critMul: 1, src: 'frag', seek: true });
    G.destruct.damageTilesInRadius(x, y, r * 0.8, 60);
    if (kind === 'barrel' && dist2(x, y, W.player.x, W.player.y) < r * r) this.hurtPlayer(14, Math.atan2(W.player.y - y, W.player.x - x), { explosion: true });
  },
  chainLightning(e0, dmg, n, isStatic) {
    if (!isStatic) { if (this.chainCd > 0) return; this.chainCd = 0.08; }
    const hit = [e0.id], S = W.player.S; let cur = e0;
    for (let k = 0; k < n; k++) {
      const best = nearestEnemy(cur.x, cur.y, 210, hit);
      if (!best) break;
      FX.arc(cur.x, cur.y, best.x, best.y, isStatic ? '#d8f4ff' : '#9fe8ff'); hit.push(best.id);
      this.damageEnemy(best, dmg, Math.atan2(best.y - cur.y, best.x - cur.x), 60, false, 'chain');
      if (S.syn.thunderstorm && Math.random() < 0.35) {
        const bx = best.x, by = best.y;
        FX.add(P_RING, bx, by, 0, 0, 0.2, 70, '#9fe8ff', { lw: 4 });
        Grid.query(bx, by, 90, o => { if (o !== best && dist2(bx, by, o.x, o.y) < 70 * 70) this.damageEnemy(o, dmg * 0.4, Math.atan2(o.y - by, o.x - bx), 80, false, 'chain'); });
      }
      cur = best;
    }
    if (hit.length > 1) Sound.zap();
  },
  shockwave(x, y, r, dmg) {
    FX.add(P_RING, x, y, 0, 0, 0.35, r, '#9ff6ff', { lw: 10 }); FX.distort(x, y, r);
    FX.light(x, y, r * 1.6, 0.25, GLOW.xp, 0.6); FX.sparkle(x, y, '#9ff6ff', 18, r * 3);
    Sound.explode(); this.shake(8);
    Grid.query(x, y, r + 30, e => { if (dist2(x, y, e.x, e.y) < (r + e.r) ** 2) this.damageEnemy(e, dmg, Math.atan2(e.y - y, e.x - x), 480, false, 'shock'); });
    for (const b of Bullets.list) if (b.enemy && dist2(b.x, b.y, x, y) < r * r) { b.dead = true; FX.sparkle(b.x, b.y, '#ff8090', 3, 80); }
  },
  coneBlast(x, y, a, r, dmg, knock) {
    FX.add(P_RING, x + Math.cos(a) * r * 0.4, y + Math.sin(a) * r * 0.4, 0, 0, 0.2, r * 0.7, '#ffb347', { lw: 6 });
    Grid.query(x, y, r + 30, e => { const d = Math.hypot(e.x - x, e.y - y), ea = Math.atan2(e.y - y, e.x - x); if (d < r + e.r && Math.abs(angDiff(a, ea)) < 0.6) this.damageEnemy(e, dmg, ea, knock, false, 'shock'); });
  },
  emp(x, y, r, dur) {
    FX.add(P_RING, x, y, 0, 0, 0.4, r, '#9fe8ff', { lw: 4 }); FX.add(P_RING, x, y, 0, 0, 0.3, r * 0.6, '#ffffff', { lw: 2 });
    Sound.zap();
    Grid.query(x, y, r, e => { if ((e.d.ranged || e.boss) && dist2(x, y, e.x, e.y) < r * r) e.stunT = e.boss ? 0.6 : dur; });
    for (const b of Bullets.list) if (b.enemy && dist2(b.x, b.y, x, y) < r * r * 0.36) { b.dead = true; FX.sparkle(b.x, b.y, '#9fe8ff', 3, 80); }
  },
  // ---------------- incoming damage ----------------
  avoided(p, bullet) {
    if (bullet) { if (bullet.avoidedCounted) return; bullet.avoidedCounted = true; }
    this.run.avoided++;
    if (p.S.fleet) addBuff(p, 'fleet', 2);
    G.equip.onAvoided(p);
  },
  // returns true when the hit lands (bullet consumed), false when it passes through (dash / invulnerable)
  hurtPlayer(dmg, ang, kind = {}, bullet = null, attacker = null) {
    const p = W.player, S = p.S, arm = p.eq.armour;
    if (this.state !== 'play' || (this.mode === 'training' && G.training.godMode)) return false;
    if (p.dashT > 0 || p.invuln > 0 || p.hurtT > 0) { if (p.dashT > 0) this.avoided(p, bullet); return false; }
    if (Math.random() < S.evade) {
      FX.text(p.x, p.y - 30, 'DODGE', '#2ef2ff', 20, { crit: true }); p.invuln = S.syn.untouchable ? 0.6 : 0.3;
      if (S.syn.untouchable) p.dashCdT -= 0.5;
      this.avoided(p, null); return true;
    }
    // Kevlar rank III: stop a bullet outright (legendary: send it back)
    if (kind.ranged && S.bulletStop && Math.random() < S.bulletStop) {
      FX.sparkle(p.x, p.y, '#c8ccd8', 8, 160); FX.text(p.x, p.y - 30, 'STOPPED', '#c8ccd8', 14);
      if (atLeast(arm.rarity, 'legendary')) Bullets.player(p.x, p.y, ang + Math.PI, 950, { dmg: dmg * 3 * (0.6 + 0.4 * S.dmgMul), life: 0.8, r: 5, knock: 80, trail: '#c8ccd8', width: 3, src: 'gadget', critMul: 2 });
      return true;
    }
    let d = incomingDamage(dmg, kind, S, { trauma: buff(p, 'trauma'), surgeon: buff(p, 'surgeon'), injectorDR: buff(p, 'injectorDR'), projector: G.equip.insideBubble(p) });
    if (arm.id === 'ceramic') {
      if (arm.rank >= 3 && dmg >= 15 && p.plateCd <= 0) { d = 0; p.plateCd = 20; FX.text(p.x, p.y - 34, 'PLATE BLOCK', '#c8ccd8', 16, { crit: true }); FX.add(P_RING, p.x, p.y, 0, 0, 0.3, 50, '#c8ccd8', { lw: 4 }); }
      if (atLeast(arm.rarity, 'legendary') && dmg >= 15 && p.heavyPulseCd <= 0) { p.heavyPulseCd = 4; this.shockwave(p.x, p.y, 120, 40 * (1 + 0.08 * (this.wave - 1))); }
      if (atLeast(arm.rarity, 'epic') && kind.melee && attacker) { const a = Math.atan2(attacker.y - p.y, attacker.x - p.x), k = 520 * (1 - (attacker.d.resist || 0) * 0.7); attacker.kvx += Math.cos(a) * k; attacker.kvy += Math.sin(a) * k; }
    }
    if (S.hitCap && d > p.maxHp * S.hitCap && p.capCd <= 0) { d = p.maxHp * S.hitCap; p.capCd = 30; FX.text(p.x, p.y - 34, 'HELMET', '#c8ccd8', 16, { crit: true }); if (atLeast(arm.rarity, 'legendary')) p.invuln = 1.5; }
    if (arm.id === 'juggernaut' && arm.rank >= 3 && kind.melee && attacker) this.damageEnemy(attacker, 15, Math.atan2(attacker.y - p.y, attacker.x - p.x), 200, false, 'gadget');
    if (arm.id === 'reactiveA' && p.reactiveCd <= 0 && d > 0) this.reactiveBlast(p, arm);
    p.combatT = 0;
    // shields soak first: overheal shield, then the energy shield
    if (p.shield > 0 && d > 0) { const a = Math.min(p.shield, d); p.shield -= a; d -= a; p.shieldT = 5; }
    if (p.eShield > 0 && d > 0) {
      const a = Math.min(p.eShield, d); p.eShield -= a; d -= a; FX.sparkle(p.x, p.y, '#2ef2ff', 6, 140);
      if (p.eShield <= 0.01 && arm.id === 'eshield' && arm.rank >= 3) { this.emp(p.x, p.y, 160, 1); FX.text(p.x, p.y - 34, 'SHIELD BREAK', '#2ef2ff', 16); }
    }
    p.eShieldT = 0;
    if (d <= 0) { p.hurtT = 0.3; Sound.shield(); return true; }
    p.hp -= d; p.hurtT = 0.55; this.hurtFlash = 0.4; this.run.damageTaken += d;
    p.vx += Math.cos(ang) * 260 * S.knockTaken; p.vy += Math.sin(ang) * 260 * S.knockTaken;
    this.shake(9); Sound.hurt();
    FX.hitBurst(p.x, p.y, ang, '#1fa6b8');
    FX.text(p.x, p.y - 30, '-' + Math.round(d), '#ff3b4e', 20);
    if (S.reactive && p.reactiveCd <= 0) { p.reactiveCd = 3; this.shockwave(p.x, p.y, 100 + 25 * S.reactive, 20 + 15 * S.reactive); }
    if (p.hp <= 0 && S.ironwill && p.ironCd <= 0) { p.hp = p.maxHp * 0.15; p.ironCd = S.ironwill === 1 ? 150 : 100; p.invuln = 1.5; this.banner('IRON WILL', '#52f08a'); this.hitstop(0.2); FX.distort(p.x, p.y, 200); Sound.synergy(); }
    if (p.hp <= 0) this.die();
    return true;
  },
  reactiveBlast(p, arm) {
    const val = key => EQ.reactiveA.vals[key][arm.rank - 1];
    p.reactiveCd = val('cd');
    const r = val('radius'), dmg = val('dmg') * (1 + 0.08 * (this.wave - 1));
    FX.add(P_RING, p.x, p.y, 0, 0, 0.3, r, '#ff9a1f', { lw: 8 }); FX.distort(p.x, p.y, r); Sound.explode();
    let hits = 0;
    Grid.query(p.x, p.y, r + 30, e => {
      if (dist2(p.x, p.y, e.x, e.y) > (r + e.r) ** 2) return;
      hits++; this.damageEnemy(e, dmg, Math.atan2(e.y - p.y, e.x - p.x), 420, false, 'gadget');
      if (arm.rank >= 3 && e.d.ranged) e.stunT = Math.max(e.stunT, 0.8);
    });
    if (atLeast(arm.rarity, 'epic')) for (const b of Bullets.list) if (b.enemy && dist2(b.x, b.y, p.x, p.y) < r * r) b.dead = true;
    if (atLeast(arm.rarity, 'legendary') && hits) p.hp = Math.min(p.maxHp, p.hp + Math.min(12, hits * 2) * this.mods.healMul);
  },
  die() {
    const p = W.player;
    p.hp = 0; this.state = 'dying'; this.deathT = 1.3;
    Sound.die(); this.shake(24); Music.set('off');
    FX.deathPop(p.x, p.y, '#1fa6b8', true); FX.explosion(p.x, p.y, 80);
    Decals.add('splat', p.x, p.y, vrand(TAU), 1.5);
  },
  // Folds the run into the profile (once) and returns the summary shown on the results screen.
  finalizeRun() {
    const p = W.player, r = this.run;
    if (r.finalized) return this.lastResult;
    r.finalized = true;
    Object.assign(r, { time: this.time, wave: this.wave, level: p.level, xp: p.xpTotal, damage: p.dmgDealt, weaponTime: { ...p.weaponTime }, weapon: p.weapon,
      evo: (evoTop(p) || {}).name || null, synergies: p.synergies.size, legendary: ['armour', 'gadget', 'support'].some(s => p.eq[s].rarity === 'legendary') ? 1 : 0,
      maxed: Object.keys(p.upg).filter(id => p.upg[id] >= UPG[id].max).length, streak: Math.max(r.streak, this.bestCombo), equipment: JSON.parse(JSON.stringify(p.eq)) });
    const res = G.save.finishRun(r);
    if (res && res.applied && r.bonusCredits) { G.save.profile().credits += r.bonusCredits; res.credits += r.bonusCredits; G.save.flush(); }
    this.lastResult = { run: r, res };
    return this.lastResult;
  },
  // ---------------- equipment crates ----------------
  openCrate(g) {
    const p = W.player, prof = G.save.profile();
    const luck = g.from === 'boss' ? 0.6 : g.from === 'elite' ? 0.3 : 0;
    const offers = crateOffers(p.eq, prof ? prof.unlocked.equipment : [], Math.random, p.S.crateChoices, luck);
    this.run.crates++; this.track('caches', 1);
    this.state = 'crate'; Sound.event();
    G.ui.openCrate(offers);
  },
  applyCrate(o) {
    const p = W.player;
    if (o.kind === 'eqCache') { this.addXp(Math.round(p.xpNeed * 0.4)); this.heal(25, 'supply'); }
    else {
      const prevCap = p.S.shieldCap;
      applyCrateOffer(p.eq, o); refreshStats(p);
      if (p.S.shieldCap > prevCap) p.eShield += p.S.shieldCap - prevCap;
      if (['armour', 'gadget', 'support'].some(s => p.eq[s].rarity === 'legendary')) this.run.legendary = 1;
    }
    p.glowT = 1.2; p.glowCol = '#b46bff'; FX.sparkle(p.x, p.y, '#b46bff', 30, 320); Sound.select(o.kind === 'eqRarity');
  },
  levelUpPush() {
    const p = W.player;
    FX.add(P_RING, p.x, p.y, 0, 0, 0.5, 240, '#2ef2ff', { lw: 8 }); FX.sparkle(p.x, p.y, '#7ff6ff', 30, 420);
    Grid.query(p.x, p.y, 260, e => { const d = Math.hypot(e.x - p.x, e.y - p.y) || 1; if (d < 240) { const k = 500 * (1 - d / 240) * (1 - (e.d.resist || 0) * 0.6); e.kvx += (e.x - p.x) / d * k; e.kvy += (e.y - p.y) / d * k; } });
    for (const b of Bullets.list) if (b.enemy && dist2(b.x, b.y, p.x, p.y) < 240 * 240) b.dead = true;
  },
  onSynergy(s) {
    this.synMsg = { text: s.name.toUpperCase(), desc: s.desc, t: 2.8, eq: !!s.eq };
    Sound.synergy(); FX.distort(W.player.x, W.player.y, 180); FX.sparkle(W.player.x, W.player.y, '#ff4fd8', 30, 360);
  },
  // ---------------- simulation step ----------------
  update(dt) {
    if (this.hitstopT > 0) { this.hitstopT -= dt; dt *= 0.08; }
    const playing = this.state === 'play';
    if (this.state === 'dying') { this.deathT -= dt; dt *= 0.3; if (this.deathT <= 0) { this.state = 'dead'; this.finalizeRun(); G.ui.gameOver(this.lastResult); } }
    if (playing) { this.time += dt; this.run.time = this.time; }
    const p = W.player;
    this.cam.px = this.cam.x; this.cam.py = this.cam.y;
    this.boomBudget = Math.min(8, this.boomBudget + dt * 14); this.chainCd -= dt; this.mayhemCd -= dt;
    for (let i = this.timers.length - 1; i >= 0; i--) { const t = this.timers[i]; t.t -= dt; if (t.t <= 0) { this.timers.splice(i, 1); t.fn(); } }
    updateFlow(p.x, p.y, dt);
    Grid.candidates = 0; Grid.queries = 0;
    updateEnemies(dt, p);
    Grid.build(W.enemies);
    mouse.x = this.cam.x + (mouse.sx - V.w / 2) / V.zoom; mouse.y = this.cam.y + (mouse.sy - V.h / 2) / V.zoom;
    if (playing) {
      updatePlayer(p, dt);
      if (this.mode === 'training') G.training.update(dt); else { G.director.update(dt, p); G.pickups.updateWorld(dt, p); }
      G.equip.update(dt, p); G.objectives.update(dt); G.tutorial.update(dt);
      this.run.level = p.level; this.run.wave = this.wave;
      // lightning-burst metric: distinct enemies electrified within the last second
      while (this.zapHits.length && this.zapHits[1] < this.time - 1) this.zapHits.splice(0, 2);
      if (this.zapHits.length) { const s = new Set(); for (let i = 0; i < this.zapHits.length; i += 2) s.add(this.zapHits[i]); this.run.lightningBurst = Math.max(this.run.lightningBurst, s.size); }
      this.achT -= dt;
      if (this.achT <= 0 && this.mode !== 'training') { this.achT = 0.5; G.achievements.check(G.save.profile(), this.run); }
      Music.intensity = Math.min(1, W.enemies.length / 90 + (this.wave - 1) * 0.04);
    } else { p.vx *= 0.9; p.vy *= 0.9; }
    Bullets.update(dt); G.hazards.update(dt); G.decoys.update(dt); G.destruct.update(dt); G.pickups.update(dt, p);
    FX.update(dt); Decals.update(dt);
    const look = 0.2, ox = clamp((mouse.x - p.x) * look, -200, 200), oy = clamp((mouse.y - p.y) * look, -140, 140);
    const k = damp(lerp(16, 4, Settings.camSmooth), dt);
    this.cam.x += (p.x + ox - this.cam.x) * k; this.cam.y += (p.y + oy - this.cam.y) * k;
    this.shakeAmt = Math.max(0, this.shakeAmt - dt * 60);
    this.comboT -= dt; if (this.comboT <= 0) this.combo = 0;
    for (const key of ['comboMsg', 'bannerMsg', 'streakMsg', 'synMsg']) if (this[key]) { this[key].t -= dt; if (this[key].t <= 0) this[key] = null; }
    for (let i = this.toasts.length - 1; i >= 0; i--) { this.toasts[i].t -= dt; if (this.toasts[i].t <= 0) this.toasts.splice(i, 1); }
    if (this.muzzle) { this.muzzle.t -= dt; if (this.muzzle.t <= 0) this.muzzle = null; }
    const wantDark = G.director.event && G.director.event.type === 'blackout' ? 1 : 0;
    this.blackout += (wantDark - this.blackout) * damp(2, dt);
    this.xpFlash = Math.max(0, this.xpFlash - dt * 2); this.hurtFlash = Math.max(0, this.hurtFlash - dt); this.levelFlash = Math.max(0, this.levelFlash - dt * 2.5);
    p.xpPulse = Math.max(0, p.xpPulse - dt * 4);
    p.xpShown += ((p.xp / p.xpNeed) - p.xpShown) * damp(10, dt);
    if (p.xpShown > p.xp / p.xpNeed + 0.02 && this.pending === 0) p.xpShown = p.xp / p.xpNeed;
    if (playing && this.pending > 0) { this.levelFlash = 1; G.tutorial.done('upgrade'); G.ui.openLevelUp(); }
  },
};
