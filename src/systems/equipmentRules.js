// Equipment rules: loadout state, cooldowns, charges, crate offers and rarity rolls. Pure; rng injectable.
import { EQ, EQUIPMENT, SLOTS, RARITIES, rarityIdx, atLeast, v } from '../data/equipment.js';

export function newEqState(loadout) {
  const st = {};
  for (const s of SLOTS) {
    const id = EQ[loadout[s]] && EQ[loadout[s]].slot === s ? loadout[s] : EQUIPMENT.find(e => e.slot === s).id;
    st[s] = { id, rank: 1, rarity: 'common', cd: 0, charges: 1 };
    st[s].charges = maxCharges(st[s]);
  }
  return st;
}
export function maxCharges(item) {
  if (item.id === 'frag' && item.rank >= 3) return 2;
  if (item.id === 'injector' && atLeast(item.rarity, 'legendary')) return 2;
  return 1;
}
export function cooldownOf(item) {
  const e = EQ[item.id]; if (!e || !e.active) return 0;
  return v(item.id, 'cd', item.rank);
}
// Advance cooldowns by dt; recharges one charge at a time. Returns true when a charge became ready.
export function tickCooldown(item, dt, mul = 1) {
  const max = maxCharges(item);
  if (item.charges >= max) { item.cd = 0; return false; }
  item.cd -= dt * mul;
  if (item.cd <= 0) { item.charges++; item.cd = item.charges < max ? cooldownOf(item) : 0; return true; }
  return false;
}
export function canActivate(item) { return !!item && EQ[item.id] && EQ[item.id].active && item.charges > 0; }
export function consumeCharge(item) {
  if (!canActivate(item)) return false;
  item.charges--;
  if (item.cd <= 0) item.cd = cooldownOf(item);
  return true;
}

const RARITY_WEIGHTS = [60, 28, 10, 2];
// Weighted rarity roll; luck (0..1) shifts weight toward higher tiers.
export function rollRarity(rng, luck = 0) {
  const w = RARITY_WEIGHTS.map((x, i) => x * (1 + luck * i * 1.5));
  let r = rng() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < w.length; i++) { r -= w[i]; if (r <= 0) return RARITIES[i]; }
  return RARITIES[0];
}
export const nextRarity = r => RARITIES[Math.min(RARITIES.length - 1, rarityIdx(r) + 1)];

// Crate choices: upgrade a rank, raise a rarity, or swap an equipped item for another unlocked one in the
// same slot (keeping its rank and at least its rarity, so a swap is a sidegrade, never strictly worse).
export function crateOffers(eq, unlocked, rng, n = 3, luck = 0) {
  const pool = [];
  for (const s of SLOTS) {
    const it = eq[s];
    if (it.rank < 3) pool.push({ kind: 'eqRank', slot: s, id: it.id, from: it.rank, to: it.rank + 1 });
    if (it.rarity !== 'legendary') pool.push({ kind: 'eqRarity', slot: s, id: it.id, from: it.rarity, to: nextRarity(it.rarity) });
    const alts = unlocked.filter(id => EQ[id] && EQ[id].slot === s && id !== it.id);
    if (alts.length) {
      const id = alts[Math.floor(rng() * alts.length)], rolled = rollRarity(rng, luck);
      pool.push({ kind: 'eqSwap', slot: s, id, from: it.id, rank: it.rank, rarity: rarityIdx(rolled) > rarityIdx(it.rarity) ? rolled : it.rarity });
    }
  }
  const out = [], kinds = ['eqRank', 'eqRarity', 'eqSwap'];
  // one of each kind first (when possible) for a contextual mix, then fill from what's left
  for (const k of kinds) {
    const opts = pool.filter(o => o.kind === k && !out.includes(o));
    if (opts.length && out.length < n) out.push(opts[Math.floor(rng() * opts.length)]);
  }
  while (out.length < n) {
    const rest = pool.filter(o => !out.includes(o));
    if (!rest.length) break;
    out.push(rest[Math.floor(rng() * rest.length)]);
  }
  if (!out.length) out.push({ kind: 'eqCache', slot: null, id: 'cache' });
  return out;
}
export function applyCrateOffer(eq, o) {
  const it = o.slot ? eq[o.slot] : null;
  if (o.kind === 'eqRank') it.rank = Math.min(3, it.rank + 1);
  else if (o.kind === 'eqRarity') it.rarity = nextRarity(it.rarity);
  else if (o.kind === 'eqSwap') { eq[o.slot] = { id: o.id, rank: o.rank, rarity: o.rarity, cd: 0, charges: 1 }; }
  if (it || o.kind === 'eqSwap') { const t = eq[o.slot]; t.charges = Math.min(Math.max(t.charges, 1), maxCharges(t)); }
  return eq;
}
