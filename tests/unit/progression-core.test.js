import { describe, it, expect } from 'vitest';
import { setGameRng, makeRng } from '../../src/core/util.js';
import { UPG, UPGRADES } from '../../src/data/upgrades.js';
import { EVO, EVOS, SYNERGIES } from '../../src/data/evolutions.js';
import { computeStats, buildGun, refreshStats, newEvoState, incomingDamage, healResult } from '../../src/systems/stats.js';
import { makeOffers, offerValid, applyOffer, checkSynergies, evoEligible, reqMet } from '../../src/systems/offers.js';
import { newEqState } from '../../src/systems/equipmentRules.js';

function player(over = {}) {
  const p = { upg: {}, synergies: new Set(), weapon: 'pistol', evo: newEvoState(), level: 1, hp: 100, maxHp: 100, bonusHp: 0, ammo: 0, gun: null, xpNeed: 6, locks: 1, rerolls: 1,
    eq: newEqState({ armour: 'kevlar', gadget: 'frag', support: 'injector' }), ...over };
  refreshStats(p); p.ammo = p.gun.mag;
  return p;
}

describe('upgrade ranks and stat calculation', () => {
  it('enforces maximum ranks in offers', () => {
    setGameRng(makeRng(1));
    const p = player();
    p.upg.rapid = UPG.rapid.max;
    expect(offerValid(p, { kind: 'upg', id: 'rapid' })).toBe(false);
    for (let i = 0; i < 200; i++) expect(makeOffers(p).some(o => o.kind === 'upg' && o.id === 'rapid')).toBe(false);
  });
  it('rebuilds stats from ranks without double-stacking', () => {
    const p = player();
    for (let i = 0; i < 3; i++) applyOffer(p, { kind: 'upg', id: 'rapid' });
    expect(p.S.rateMul).toBeCloseTo(1.36, 5);
    const rate = p.gun.rate;
    refreshStats(p); refreshStats(p);
    expect(p.gun.rate).toBeCloseTo(rate, 9);
  });
  it('respects eligibility rules (Drone Overdrive needs Combat Drone)', () => {
    const p = player();
    expect(offerValid(p, { kind: 'upg', id: 'overdrive' })).toBe(false);
    p.upg.drone = 1;
    expect(offerValid(p, { kind: 'upg', id: 'overdrive' })).toBe(true);
  });
  it('every upgrade definition is well-formed', () => {
    for (const u of UPGRADES) { expect(u.max).toBeGreaterThan(0); expect(typeof u.fx(1)).toBe('string'); const S = { syn: {} }; expect(() => u.apply(computeStats(player()), 1)).not.toThrow(); }
  });
  it('always produces three valid, non-duplicate cards', () => {
    setGameRng(makeRng(7));
    const p = player({ level: 20 });
    for (let i = 0; i < 300; i++) {
      const offers = makeOffers(p);
      expect(offers.length).toBe(3);
      expect(new Set(offers.map(o => o.kind + o.id)).size).toBe(3);
      offers.forEach(o => expect(offerValid(p, o) || o.kind === 'misc').toBe(true));
      applyOffer(p, offers[i % 3]);
    }
  });
});

describe('synergies', () => {
  it('unlock exactly when the required ranks are met, once', () => {
    const p = player();
    p.upg.rapid = 2; p.upg.multi = 1;
    expect(checkSynergies(p).length).toBe(0);
    p.upg.multi = 2;
    const fresh = checkSynergies(p);
    expect(fresh.map(s => s.id)).toContain('hurricane');
    expect(checkSynergies(p).length).toBe(0);
    expect(p.S.syn.hurricane).toBe(true);
  });
  it('all 14 synergies reference real upgrades', () => {
    expect(SYNERGIES.length).toBe(14);
    for (const s of SYNERGIES) for (const id in s.req) expect(UPG[id]).toBeTruthy();
  });
});

describe('evolutions', () => {
  it('require weapon, both upgrades and the minimum level', () => {
    const p = player({ weapon: 'smg' });
    const hose = EVO.hose;
    p.upg.rapid = 3; p.upg.mag = 2; p.level = 6;
    expect(evoEligible(p, hose)).toBe(false);
    p.level = 7;
    expect(evoEligible(p, hose)).toBe(true);
    p.weapon = 'pistol';
    expect(evoEligible(p, hose)).toBe(false);
  });
  it('tier II needs the matching tier I', () => {
    const p = player({ weapon: 'smg', level: 20 });
    Object.assign(p.upg, { rapid: 3, mag: 3, storm: 1 });
    expect(evoEligible(p, EVO.apocalypse)).toBe(false);
    p.evo.smg.t1 = 'hose';
    expect(evoEligible(p, EVO.apocalypse)).toBe(true);
  });
  it('evolution state is kept per weapon across swaps', () => {
    const p = player({ weapon: 'smg' });
    p.evo.smg.t1 = 'hose'; refreshStats(p);
    applyOffer(p, { kind: 'swap', id: 'pistol' });
    expect(p.gun.evolved).toBe(false);
    applyOffer(p, { kind: 'swap', id: 'smg' });
    expect(p.gun.evolved).toBe(true);
  });
  it('every recipe is reachable within rank limits', () => {
    for (const e of EVOS) for (const id in e.req) expect(e.req[id]).toBeLessThanOrEqual(UPG[id].max);
  });
});

describe('damage and healing', () => {
  it('applies armour reductions by damage type', () => {
    const p = player(); const S = p.S;
    expect(incomingDamage(10, { ranged: true }, S)).toBeCloseTo(8.8, 5);   // Kevlar rank 1
    expect(incomingDamage(10, { melee: true }, S)).toBeCloseTo(10, 5);
  });
  it('never reduces a hit below 15%', () => {
    const p = player(); const S = p.S;
    S.takenMul = 0.01; S.fortified = 3;
    expect(incomingDamage(100, {}, S, { trauma: true, surgeon: true, injectorDR: true, projector: true })).toBeCloseTo(15, 5);
  });
  it('heals with first aid and converts overflow to shield with Overheal', () => {
    const p = player(); p.hp = 90; p.upg.firstaid = 2; p.upg.overheal = 1; computeStats(p);
    const r = healResult(20, 'medkit', p);
    expect(r.amount).toBeCloseTo(30, 5);
    expect(r.used).toBeCloseTo(10, 5);
    expect(r.shieldGain).toBeCloseTo(6, 5);
  });
  it('hardcore halves healing', () => {
    const p = player(); p.hp = 10;
    expect(healResult(40, 'supply', p, { healMul: 0.5 }).used).toBeCloseTo(20, 5);
  });
});
