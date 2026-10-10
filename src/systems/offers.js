// Level-up offers: eligibility, rarity weighting, evolution nudges, locks/rerolls and applying a choice.
import { G } from '../core/registry.js';
import { pick, rnd } from '../core/util.js';
import { UPG, UPGRADES, RARITY_W } from '../data/upgrades.js';
import { WEAPONS, WEAPON_IDS } from '../data/weapons.js';
import { EVOS, EVO, SYNERGIES } from '../data/evolutions.js';
import { curEvo, evoTop, refreshStats } from './stats.js';

export const reqMet = (p, req) => Object.keys(req).every(id => (p.upg[id] || 0) >= req[id]);
export const reqList = (p, req) => Object.keys(req).map(id => ({ id, name: UPG[id].name, need: req[id], have: p.upg[id] || 0, ok: (p.upg[id] || 0) >= req[id] }));
export function evoEligible(p, e, w = p.weapon) {
  const st = p.evo[w];
  if (e.tier === 1) return e.weapons.includes(w) && !st.t1 && p.level >= e.minLevel && reqMet(p, e.req);
  return st.t1 === e.from && !st.t2 && p.level >= e.minLevel && reqMet(p, e.req);
}
// recipes a weapon could still follow (for codex + offer weighting)
export function evoPaths(w) { const t1 = EVOS.filter(e => e.tier === 1 && e.weapons.includes(w)); return t1.concat(EVOS.filter(e => e.tier === 2 && t1.some(t => t.id === e.from))); }
export function openPaths(p) {
  const st = curEvo(p);
  if (!st.t1) return EVOS.filter(e => e.tier === 1 && e.weapons.includes(p.weapon));
  if (!st.t2) return EVOS.filter(e => e.tier === 2 && e.from === st.t1);
  return [];
}

export function checkSynergies(p) {
  const fresh = [];
  for (const s of SYNERGIES) if (!p.synergies.has(s.id) && reqMet(p, s.req)) { p.synergies.add(s.id); fresh.push(s); }
  if (fresh.length) refreshStats(p);
  return fresh;
}
export const synergiesFor = id => SYNERGIES.filter(s => s.req[id]);
export const evosFor = (p, id) => openPaths(p).filter(e => e.req[id]);

// ---------------- level-up offers ----------------
export const offerKey = o => o.kind + ':' + o.id;
export function upgOffer(p, id) {
  const u = UPG[id], lvl = p.upg[id] || 0;
  return { kind: 'upg', id, cat: u.cat, name: u.name, icon: u.icon, lvl, max: u.max, rarity: u.rarity, desc: u.desc, now: lvl ? u.fx(lvl) : null, next: u.fx(lvl + 1) };
}
export function evoOffer(p, e) {
  const from = e.tier === 2 ? EVO[e.from].name : WEAPONS[p.weapon].name.toUpperCase();
  return { kind: 'evo', id: e.id, tier: e.tier, cat: 'evo', name: e.name, icon: 'star', from, desc: e.desc, benefits: e.benefits, hue: e.hue };
}
export function swapOffer(p, w) {
  const top = evoTop(p, w);
  return { kind: 'swap', id: w, cat: 'swap', name: WEAPONS[w].name, icon: 'gun', desc: WEAPONS[w].blurb + (top ? ` Restores your ${top.name} evolution.` : ' Upgrades carry over.') };
}
export function offerValid(p, o) {
  if (!o) return false;
  if (o.kind === 'upg') { const u = UPG[o.id]; return !!u && (p.upg[o.id] || 0) < u.max && (!u.req || u.req(p)); }
  if (o.kind === 'evo') return evoEligible(p, EVO[o.id]);
  if (o.kind === 'swap') return o.id !== p.weapon;
  return true;
}
export function upgWeight(p, u) {
  let w = RARITY_W[u.rarity];
  if (p.upg[u.id]) w *= 1.25;
  // gently steer toward synergies / evolutions the player is already building
  if (SYNERGIES.some(s => s.req[u.id] && !p.synergies.has(s.id) && Object.keys(s.req).some(k => k !== u.id && p.upg[k]))) w *= 1.4;
  if (openPaths(p).some(e => e.req[u.id])) w *= 1.5;
  if (p.level < 4 && u.rarity === 'rare') w *= 0.5;
  return w;
}
// keep: cards that must appear (saved/locked); avoid: ids to steer away from (reroll)
export function makeOffers(p, keep = [], avoid = []) {
  const out = keep.filter(o => offerValid(p, o)).map(o => Object.assign({}, o, o.kind === 'upg' ? upgOffer(p, o.id) : {}));
  const taken = new Set(out.map(offerKey));
  const add = o => { if (out.length < 3 && !taken.has(offerKey(o))) { out.push(o); taken.add(offerKey(o)); } };
  // evolutions first (tier II before tier I); let the player choose between multiple eligible paths
  const evos = EVOS.filter(e => evoEligible(p, e)).sort((a, b) => b.tier - a.tier).slice(0, 2);
  for (const e of evos) add(evoOffer(p, e));
  if (p.level >= 3 && rnd() < 0.16) add(swapOffer(p, pick(WEAPON_IDS.filter(w => w !== p.weapon))));
  const avoidSet = new Set(avoid);
  // evolution nudge: often offer a missing prerequisite of the path closest to completion
  if (p.level >= 4 && out.length < 3 && rnd() < 0.45) {
    const paths = openPaths(p).map(e => ({ e, miss: reqList(p, e.req).filter(q => !q.ok) })).filter(x => x.miss.length);
    paths.sort((a, b) => a.miss.reduce((t, q) => t + q.need - q.have, 0) - b.miss.reduce((t, q) => t + q.need - q.have, 0));
    const cand = paths.length ? paths[0].miss.map(q => q.id).filter(id => offerValid(p, { kind: 'upg', id }) && !taken.has('upg:' + id) && !avoidSet.has('upg:' + id)) : [];
    if (cand.length) add(upgOffer(p, pick(cand)));
  }
  for (const strict of [true, false]) {
    const pool = UPGRADES.filter(u => offerValid(p, { kind: 'upg', id: u.id }) && !taken.has('upg:' + u.id) && (!strict || !avoidSet.has('upg:' + u.id)));
    const weights = pool.map(u => upgWeight(p, u));
    while (out.length < 3 && pool.length) {
      let r = rnd() * weights.reduce((a, b) => a + b, 0), i = 0;
      for (; i < pool.length - 1; i++) { r -= weights[i]; if (r <= 0) break; }
      add(upgOffer(p, pool[i].id)); pool.splice(i, 1); weights.splice(i, 1);
    }
  }
  if (out.length < 3) add({ kind: 'misc', id: 'medkit', cat: 'misc', name: 'Med Kit', icon: 'heal', desc: 'Restore 50% of your health.' });
  if (out.length < 3) add({ kind: 'misc', id: 'rations', cat: 'misc', name: 'Field Rations', icon: 'regen', desc: '+10 max HP.' });
  if (out.length < 3) add({ kind: 'misc', id: 'cache', cat: 'misc', name: 'XP Cache', icon: 'star', desc: 'Bank a burst of experience.' });
  // saved cards keep their slot at the front; others shuffle
  const fixed = out.filter(o => o.saved), rest = out.filter(o => !o.saved).sort(() => rnd() - 0.5);
  return fixed.concat(rest);
}
export function applyOffer(p, o) {
  if (o.kind === 'upg') { p.upg[o.id] = (p.upg[o.id] || 0) + 1; if (UPG[o.id].onGain) UPG[o.id].onGain(p); }
  else if (o.kind === 'evo') {
    const st = curEvo(p); if (o.tier === 1) st.t1 = o.id; else st.t2 = o.id;
    if (G.game) G.game.onDiscover(o.id);
  }
  else if (o.kind === 'swap') { p.weapon = o.id; }
  else if (o.id === 'medkit') { if (G.game) G.game.heal(p.maxHp * 0.5, 'supply'); else p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.5); }
  else if (o.id === 'rations') { p.bonusHp = (p.bonusHp || 0) + 10; p.hp += 10; }
  else if (o.id === 'cache') { if (G.game) G.game.addXp(Math.round(p.xpNeed * 0.5)); }
  refreshStats(p);
  if (o.kind === 'swap' || o.kind === 'evo') { p.ammo = p.gun.mag; p.reloading = 0; }
  return checkSynergies(p);
}
