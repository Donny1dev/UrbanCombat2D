import { describe, it, expect } from 'vitest';
import { makeRng } from '../../src/core/util.js';
import { EQ, EQUIPMENT, SLOTS, isValidLoadout, RARITIES } from '../../src/data/equipment.js';
import { newEqState, cooldownOf, consumeCharge, tickCooldown, maxCharges, crateOffers, applyCrateOffer, rollRarity } from '../../src/systems/equipmentRules.js';
import { validateUsername, newProfile, sanitizeProfile, purchase } from '../../src/systems/profiles.js';
import { migrateV2, loadSave, exportSave, importSave, SAVE_KEY, emptySave } from '../../src/systems/persistence.js';
import { applyRunRewards, localLeaderboard } from '../../src/systems/career.js';
import { addCareerXp, careerXpFor, rankFor } from '../../src/data/progression.js';
import { dailyConfig } from '../../src/data/modes.js';

describe('equipment', () => {
  it('has 8 items per slot with complete text', () => {
    for (const s of SLOTS) expect(EQUIPMENT.filter(e => e.slot === s).length).toBe(8);
    for (const e of EQUIPMENT) { expect(e.ranks.length).toBe(3); expect(e.perks.length).toBe(4); }
  });
  it('validates slot compatibility', () => {
    expect(isValidLoadout({ armour: 'kevlar', gadget: 'frag', support: 'injector' })).toBe(true);
    expect(isValidLoadout({ armour: 'frag', gadget: 'kevlar', support: 'injector' })).toBe(false);
    expect(isValidLoadout({ armour: 'kevlar', gadget: 'nope', support: 'injector' })).toBe(false);
  });
  it('cooldowns follow rank and charges refill', () => {
    const eq = newEqState({ armour: 'kevlar', gadget: 'frag', support: 'injector' });
    expect(cooldownOf(eq.gadget)).toBe(9);
    expect(consumeCharge(eq.gadget)).toBe(true);
    expect(consumeCharge(eq.gadget)).toBe(false);
    for (let i = 0; i < 8.9 * 60; i++) tickCooldown(eq.gadget, 1 / 60);
    expect(eq.gadget.charges).toBe(0);
    for (let i = 0; i < 12; i++) tickCooldown(eq.gadget, 1 / 60);
    expect(eq.gadget.charges).toBe(1);
    eq.gadget.rank = 3;
    expect(maxCharges(eq.gadget)).toBe(2);
    expect(cooldownOf(eq.gadget)).toBe(7);
    expect(cooldownOf(eq.armour)).toBe(0);
  });
  it('crate offers are valid, distinct and never swap an item for itself', () => {
    const rng = makeRng(42), unlocked = EQUIPMENT.map(e => e.id);
    for (let i = 0; i < 200; i++) {
      const eq = newEqState({ armour: 'kevlar', gadget: 'frag', support: 'injector' });
      const offers = crateOffers(eq, unlocked, rng, 3);
      expect(offers.length).toBe(3);
      for (const o of offers) {
        if (o.kind === 'eqSwap') { expect(o.id).not.toBe(eq[o.slot].id); expect(EQ[o.id].slot).toBe(o.slot); }
        if (o.kind === 'eqRank') expect(o.to).toBe(2);
      }
      applyCrateOffer(eq, offers[0]);
    }
  });
  it('falls back to a supply cache when everything is maxed', () => {
    const eq = newEqState({ armour: 'kevlar', gadget: 'frag', support: 'injector' });
    for (const s of SLOTS) { eq[s].rank = 3; eq[s].rarity = 'legendary'; }
    const offers = crateOffers(eq, ['kevlar', 'frag', 'injector'], makeRng(1), 3);
    expect(offers).toEqual([{ kind: 'eqCache', slot: null, id: 'cache' }]);
  });
  it('rarity rolls follow the weighting and luck shifts them upward', () => {
    const count = luck => { const rng = makeRng(9), c = Object.fromEntries(RARITIES.map(r => [r, 0])); for (let i = 0; i < 20000; i++) c[rollRarity(rng, luck)]++; return c; };
    const base = count(0), lucky = count(1);
    expect(base.common / 20000).toBeGreaterThan(0.55); expect(base.legendary / 20000).toBeLessThan(0.04);
    expect(lucky.legendary).toBeGreaterThan(base.legendary);
  });
});

describe('profiles', () => {
  it('validates usernames', () => {
    expect(validateUsername('Ace_99').ok).toBe(true);
    expect(validateUsername('ab').ok).toBe(false);
    expect(validateUsername('x'.repeat(19)).ok).toBe(false);
    expect(validateUsername('bad name').ok).toBe(false);
    expect(validateUsername('ADMIN').ok).toBe(false);
    expect(validateUsername('Sh1tLord').ok).toBe(false);
    expect(validateUsername('ace_99', ['Ace_99']).ok).toBe(false);
  });
  it('sanitises unknown ids instead of crashing', () => {
    const p = sanitizeProfile({ name: 'Ace', loadout: { weapon: 'laser', armour: 'kevlar', gadget: 'frag', support: 'injector' }, unlocked: { equipment: ['kevlar', 'warp_drive'] }, discoveries: ['hose', 'fake'], achievements: { first_blood: 5, nope: 1 } });
    expect(p.loadout.weapon).toBe('pistol');
    expect(p.unlocked.equipment).not.toContain('warp_drive');
    expect(p.discoveries).toEqual(['hose']);
    expect(Object.keys(p.achievements)).toEqual(['first_blood']);
  });
  it('purchases respect credits and career level', () => {
    const p = newProfile('Ace');
    expect(purchase(p, 'equipment', 'turret', 500, 7).ok).toBe(false);
    p.career.level = 7; p.credits = 499;
    expect(purchase(p, 'equipment', 'turret', 500, 7).ok).toBe(false);
    p.credits = 600;
    expect(purchase(p, 'equipment', 'turret', 500, 7).ok).toBe(true);
    expect(p.credits).toBe(100);
    expect(purchase(p, 'equipment', 'turret', 500, 7).ok).toBe(false);
  });
});

describe('save system', () => {
  const v2 = { uc_settings: JSON.stringify({ volume: 0.5, shake: 0.4, dmgNums: false, comic: true }), uc_muted: 'true', uc_look: JSON.stringify({ skin: 2, style: 'afro', topCol: '#e0422f' }), uc_disc: JSON.stringify(['hose', 'bogus']), uc_stats: JSON.stringify({ kills: 900, deaths: 12, runs: 12, longest: 640, wave: 17, level: 33, streak: 41, xp: 9000, damage: 120000, weaponTime: { smg: 300, laser: 9 } }), uc_best: JSON.stringify({ time: 640, wave: 17, kills: 400, level: 33 }) };
  it('migrates v2 data into a v3 profile', () => {
    const save = migrateV2(k => (k in v2 ? v2[k] : null));
    const p = save.profiles[save.activeId];
    expect(p.needsName).toBe(true);
    expect(p.look.style).toBe('afro'); expect(p.look.skin).toBe(2);
    expect(p.discoveries).toEqual(['hose']);
    expect(p.life.kills).toBe(900); expect(p.life.weaponTime).toEqual({ smg: 300 });
    expect(p.records.wave).toBe(17); expect(p.records.longest).toBe(640); expect(p.records.kills).toBe(400);
    expect(save.settings.master).toBe(0.5); expect(save.settings.muted).toBe(true); expect(save.settings.dmgNums).toBe(false);
  });
  it('keeps a backup of a corrupt save instead of erasing it', () => {
    const store = { [SAVE_KEY]: '{not json', ...v2 }, written = {};
    const { save, issues } = loadSave(k => (k in store ? store[k] : null), (k, val) => { written[k] = val; });
    expect(issues.length).toBe(1);
    expect(Object.keys(written).some(k => k.startsWith(SAVE_KEY + '_corrupt_'))).toBe(true);
    expect(save.profiles[save.activeId].life.kills).toBe(900);
  });
  it('fills defaults for missing fields in an older v3 save', () => {
    const raw = { schema: 3, profiles: { A: { id: 'A', name: 'Ace' } }, activeId: 'A' };
    const { save } = loadSave(k => (k === SAVE_KEY ? JSON.stringify(raw) : null), () => { });
    expect(save.profiles.A.career).toEqual({ level: 1, xp: 0 });
    expect(save.profiles.A.unlocked.equipment).toContain('kevlar');
  });
  it('round-trips export/import and rejects damaged files', () => {
    const s = emptySave(); const p = newProfile('Ace'); p.credits = 77; s.profiles[p.id] = p; s.activeId = p.id;
    const text = exportSave(s);
    const r = importSave(text);
    expect(r.ok).toBe(true); expect(r.save.profiles[p.id].credits).toBe(77);
    expect(importSave(text.replace('"credits":77', '"credits":99999')).ok).toBe(false);
    expect(importSave('hello').ok).toBe(false);
  });
});

describe('career progression', () => {
  it('levels up across thresholds', () => {
    const r = addCareerXp({ level: 1, xp: 0 }, careerXpFor(1) + careerXpFor(2) + 5);
    expect(r.level).toBe(3); expect(r.xp).toBe(5); expect(r.levelsGained).toBe(2);
    expect(rankFor(1).title).toBe('Rookie'); expect(rankFor(12).title).toBe('Operative'); expect(rankFor(120).title).toBe('Urban Legend');
  });
  const run = (o = {}) => ({ id: 'R1', mode: 'standard', time: 300, wave: 10, kills: 200, level: 15, bosses: 1, objectives: 2, streak: 30, xp: 1000, damage: 50000, weaponTime: { pistol: 300 }, weapon: 'pistol', ...o });
  it('grants rewards exactly once per run', () => {
    const p = newProfile('Ace');
    const a = applyRunRewards(p, run());
    expect(a.applied).toBe(true); expect(a.credits).toBeGreaterThan(0);
    const credits = p.credits;
    expect(applyRunRewards(p, run()).applied).toBe(false);
    expect(p.credits).toBe(credits);
    expect(p.life.runs).toBe(1);
  });
  it('training gives no rewards or records', () => {
    const p = newProfile('Ace');
    const a = applyRunRewards(p, run({ id: 'T', mode: 'training' }));
    expect(a.credits).toBe(0); expect(a.careerXp).toBe(0); expect(p.runs.length).toBe(0); expect(p.records.wave).toBe(0);
  });
  it('local leaderboard filters by category and date range', () => {
    const p = newProfile('Ace'), now = Date.now();
    applyRunRewards(p, run({ id: 'a', wave: 5, date: now - 2 * 864e5 }));
    applyRunRewards(p, run({ id: 'b', wave: 9, date: now - 1000 }));
    applyRunRewards(p, run({ id: 'c', wave: 3, mode: 'daily', daily: '20261010', date: now }));
    expect(localLeaderboard([p], 'wave', 'all', now).map(r => r.wave)).toEqual([9, 5, 3]);
    expect(localLeaderboard([p], 'wave', 'daily', now).map(r => r.wave)).toEqual([9, 3]);
    expect(localLeaderboard([p], 'daily', 'all', now, '20261010').map(r => r.wave)).toEqual([3]);
  });
  it('daily configuration is deterministic per date', () => {
    expect(dailyConfig('20261010')).toEqual(dailyConfig('20261010'));
    expect(dailyConfig('20261010').mods[0].id).not.toBe(dailyConfig('20261010').mods[1].id);
  });
});
