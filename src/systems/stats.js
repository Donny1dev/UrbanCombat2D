// Central stat calculation: base -> upgrade ranks -> synergies -> equipment passives. Pure (no DOM).
import { UPG, freshStats } from '../data/upgrades.js';
import { WEAPONS, WEAPON_IDS } from '../data/weapons.js';
import { EVO } from '../data/evolutions.js';
import { EQ, v, atLeast, EQ_SYNERGIES } from '../data/equipment.js';

export const newEvoState = () => Object.fromEntries(WEAPON_IDS.map(w => [w, { t1: null, t2: null }]));
export const curEvo = p => p.evo[p.weapon];
export const evoTop = (p, w = p.weapon) => { const e = p.evo[w]; return EVO[e.t2] || EVO[e.t1] || null; };

// Equipment passive contributions (armour + passive support + rarity perks that are plain stats)
export function equipmentStats(S, eq) {
  Object.assign(S, {
    takenMul: 1, rangedTaken: 1, meleeTaken: 1, bigTaken: 1, eliteTaken: 1, explosionTaken: 1, knockTaken: 1,
    shieldCap: 0, shieldDelay: 0, shieldRate: 0, dashIframe: 0, medkitDrop: 1, medkitHeal: 1, crateChoices: 3,
    bulletStop: 0, harness: 0, harnessAt: 0.4, hitCap: 0, eqSyn: {},
  });
  if (!eq) return S;
  const a = eq.armour;
  if (a && EQ[a.id]) {
    const r = a.rank, rar = a.rarity;
    switch (a.id) {
      case 'kevlar': S.rangedTaken *= v('kevlar', 'ranged', r); if (r >= 3) S.bulletStop = 0.2; if (atLeast(rar, 'rare')) S.hpAdd += 10; if (atLeast(rar, 'epic')) S.meleeTaken *= 0.9; break;
      case 'carrier': S.moveMul += v('carrier', 'move', r) + (atLeast(rar, 'rare') ? 0.05 : 0); S.takenMul *= v('carrier', 'taken', r); if (r >= 3) S.dashCd *= 0.9; if (atLeast(rar, 'epic')) S.evade += 0.05; if (atLeast(rar, 'legendary')) S.dashIframe += 0.15; break;
      case 'ceramic': S.bigTaken *= v('ceramic', 'big', r); if (atLeast(rar, 'rare')) S.hpAdd += 15; break;
      case 'reactiveA': if (atLeast(rar, 'rare')) S.takenMul *= 0.95; break;
      case 'helmet': S.eliteTaken *= v('helmet', 'elite', r); S.knockTaken *= 0.5; if (r >= 3) S.hitCap = 0.35; if (atLeast(rar, 'rare')) S.hpAdd += 10; if (atLeast(rar, 'epic')) S.explosionTaken *= 0.5; break;
      case 'harness': S.harness = v('harness', 'bonus', r); S.harnessAt = atLeast(rar, 'rare') ? 0.5 : 0.4; break;
      case 'eshield': S.shieldCap = v('eshield', 'cap', r) + (atLeast(rar, 'rare') ? 10 : 0); S.shieldDelay = v('eshield', 'delay', r) - (atLeast(rar, 'epic') ? 1 : 0); S.shieldRate = v('eshield', 'rate', r); break;
      case 'juggernaut': S.takenMul *= v('juggernaut', 'taken', r); S.moveMul -= v('juggernaut', 'slow', r); if (r >= 3) S.knockTaken = 0; if (atLeast(rar, 'rare')) S.hpAdd += 20; break;
    }
  }
  const s = eq.support;
  if (s && s.id === 'scanner') {
    S.medkitDrop *= v('scanner', 'drop', s.rank); if (s.rank >= 3) S.crateChoices = 4;
    if (atLeast(s.rarity, 'rare')) S.magnet += 0.2; if (atLeast(s.rarity, 'epic')) S.medkitHeal *= 1.2;
  }
  return S;
}
export function equipmentSynergies(p) {
  const out = {};
  for (const s of EQ_SYNERGIES) {
    const slot = EQ[s.eq].slot, item = p.eq && p.eq[slot];
    if (item && item.id === s.eq && (p.upg[s.upg] || 0) >= 1) out[s.id] = true;
  }
  return out;
}

export function computeStats(p) {
  const S = freshStats();
  for (const id in p.upg) if (UPG[id]) UPG[id].apply(S, p.upg[id]);
  for (const id of p.synergies) S.syn[id] = true;
  equipmentStats(S, p.eq);
  S.eqSyn = equipmentSynergies(p);
  S.moveMul = Math.max(0.6, S.moveMul);
  S.evade = Math.min(0.45, S.evade);
  p.S = S;
  p.maxHp = 100 + S.hpAdd + (p.bonusHp || 0);
  p.hp = Math.min(p.hp, p.maxHp);
  return S;
}
// Effective gun = base weapon -> evolution mods -> stat multipliers. Temporary buffs are applied at fire time.
export function buildGun(p) {
  const S = p.S, st = curEvo(p);
  const w = Object.assign({ id: p.weapon }, WEAPONS[p.weapon]);
  if (st.t1 && EVO[st.t1]) EVO[st.t1].mod(w);
  if (st.t2 && EVO[st.t2]) EVO[st.t2].mod(w);
  w.evolved = !!st.t1; w.hue = (evoTop(p) || {}).hue || null;
  w.dmg *= S.dmgMul; w.rate *= S.rateMul; w.mag = Math.max(1, Math.round(w.mag * S.magMul)); w.reload *= S.reloadMul;
  w.speed *= S.speedMul; w.knock *= S.knockMul; w.pierce += S.pierce;
  w.ricochet = S.ricochet + (w.ricoBonus || 0);
  w.critChance = Math.min(0.85, S.crit + (w.critBonus || 0)); w.critMul = S.critMul + (w.critMulBonus || 0);
  w.spread = w.spread * S.spreadMul + S.stormSpread * 0.5;
  if (p.weapon === 'shotgun') { w.pellets = Math.min(22, w.pellets + S.extraProj * 2); w.fan = 0; w.dmg *= 1 - S.multiPenalty * 0.5; }
  else { w.pellets = Math.min(7, w.pellets + S.extraProj); w.fan = 0.075 + S.stormSpread + 0.02 * S.extraProj; w.dmg *= 1 - S.multiPenalty; }
  w.radius = 4 + (w.width > 4 ? 2 : 0) + S.calibre * 1.5;
  w.width += S.calibre * 0.8;
  return w;
}
export function refreshStats(p) {
  const prevMag = p.gun ? p.gun.mag : 0;
  computeStats(p);
  p.gun = buildGun(p);
  if (prevMag && p.gun.mag > prevMag) p.ammo += p.gun.mag - prevMag;
  p.ammo = Math.min(p.ammo, p.gun.mag);
}

// Incoming damage after all reductions (before shields). kind: { ranged, melee, elite, explosion }.
// Never reduces a hit below 15% of its original value, so defensive stacks can't reach immunity.
export function incomingDamage(dmg, kind, S, buffs = {}) {
  let m = S.takenMul * (1 - 0.08 * S.fortified);
  if (kind.ranged) m *= S.rangedTaken;
  if (kind.melee) m *= S.meleeTaken;
  if (kind.elite) m *= S.eliteTaken;
  if (kind.explosion) m *= S.explosionTaken;
  if (dmg >= 15) m *= S.bigTaken;
  if (buffs.trauma) m *= 1 - (0.2 + 0.1 * S.trauma);
  if (buffs.surgeon) m *= 0.75;
  if (buffs.injectorDR) m *= 0.7;
  if (buffs.projector) m *= 0.7;
  return dmg * Math.max(0.15, m);
}
// Healing pipeline (pure): returns { used, shieldGain } for an incoming heal.
export function healResult(amount, source, p, mode = { healMul: 1 }) {
  const S = p.S;
  if (source === 'medkit') amount *= (1 + 0.25 * S.firstaid) * S.medkitHeal;
  amount *= mode.healMul;
  const room = Math.max(0, p.maxHp - p.hp), used = Math.min(room, amount), over = amount - used;
  let shieldGain = 0;
  if (S.overheal && over > 0) {
    const cap = p.maxHp * (0.15 + 0.1 * S.overheal);
    shieldGain = Math.max(0, Math.min(cap - (p.shield || 0), over * 0.3 * S.overheal));
  }
  return { amount, used, shieldGain };
}
