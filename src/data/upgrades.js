// Upgrade definitions. Each upgrade's apply(S, rank) is a pure function of its rank, so stats can always be rebuilt from scratch.
import { pct } from '../core/util.js';
// Each upgrade's `apply(S, r)` is a pure function of its rank, so stats can always be rebuilt from scratch.
export const CATS = {
  ballistics: { name: 'Ballistics', col: '#ff9a1f' },
  firepower: { name: 'Firepower', col: '#ff4f5e' },
  mobility: { name: 'Mobility', col: '#2ef2ff' },
  survival: { name: 'Survival', col: '#52f08a' },
  technology: { name: 'Technology', col: '#8c7bff' },
  elemental: { name: 'Elemental', col: '#ff4fd8' },
  utility: { name: 'Utility', col: '#e8e4d8' },
};
export const CAT_ORDER = Object.keys(CATS);
export const RARITY_W = { common: 1, uncommon: 0.7, rare: 0.42 };
export const DASH_CD = [1.5, 1.28, 1.12, 1.0, 0.9];   // diminishing returns, floor 0.9s

export function freshStats() {
  return {
    dmgMul: 1, rateMul: 1, extraProj: 0, multiPenalty: 0, pierce: 0, ricochet: 0, explosive: 0, magMul: 1, reloadMul: 1,
    crit: 0.05, critMul: 2, chain: 0, stormSpread: 0, speedMul: 1, knockMul: 1, spreadMul: 1, recoilComp: 0, calibre: 0,
    frag: 0, accel: 0, hollow: 0, breaker: 0, lastRound: 0, firstStrike: 0, cqc: 0, marked: 0, suppress: 0, execute: 0, discipline: 0, tactical: 0,
    moveMul: 1, dashCd: 1.5, dashDist: 1, afterburn: 0, adren: 0, evade: 0, magnet: 1, momentum: 0, slide: 0, ghost: 0, kinrec: 0,
    fleet: 0, rungun: 0, evreload: 0, phase: 0, kinimpact: 0, secondwind: 0,
    hpAdd: 0, regen: 0, vamp: 0, fortified: 0, ironwill: 0, laststand: 0, overheal: 0, trauma: 0, reactive: 0,
    drones: 0, droneDmg: 1, overdrive: 0, autotarget: 0, blades: 0, orbital: 0, overclock: 0, emp: 0, shock: 0,
    incendiary: 0, cryo: 0, static: 0, volatile: 0, elemMul: 1, elemDur: 1,
    medic: 0, firstaid: 0, scanner: 0, emergency: 0, stimulant: 0, syn: {},
  };
}
export const has = (p, id, n = 1) => (p.upg[id] || 0) >= n;
export const anyElem = p => has(p, 'incendiary') || has(p, 'cryo') || has(p, 'static') || has(p, 'chain') || has(p, 'explosive');
function U(id, cat, name, max, rarity, desc, fx, apply, extra = {}) { return Object.assign({ id, cat, name, max, rarity, desc, fx, apply, icon: id }, extra); }

export const UPGRADES = [
  // ---------------- BALLISTICS ----------------
  U('multi', 'ballistics', 'Multishot', 3, 'uncommon', 'Fire extra projectiles in a fan. Extra bullets spread wider and hit a little softer.',
    r => `+${r} projectile${r > 1 ? 's' : ''}, -${8 * r}% damage each`, (S, r) => { S.extraProj += r; S.multiPenalty += 0.08 * r; }),
  U('pierce', 'ballistics', 'Piercing Rounds', 4, 'common', 'Bullets punch through enemies, losing 15% damage per penetration.',
    r => `Pierce ${r} enem${r > 1 ? 'ies' : 'y'}`, (S, r) => { S.pierce += r; }),
  U('ricochet', 'ballistics', 'Ricochet', 3, 'uncommon', 'Bullets bounce off walls and seek a nearby target at 80% damage.',
    r => `${r} bounce${r > 1 ? 's' : ''}`, (S, r) => { S.ricochet += r; }),
  U('velocity', 'ballistics', 'High Velocity', 3, 'common', 'Faster bullets that hit harder and shove further.',
    r => `+${25 * r}% bullet speed, +${20 * r}% knockback, +${6 * r}% dmg`, (S, r) => { S.speedMul += 0.25 * r; S.knockMul += 0.2 * r; S.dmgMul += 0.06 * r; }),
  U('storm', 'ballistics', 'Bullet Storm', 3, 'rare', 'A heavier spray: extra projectiles and fire rate with wider spread.',
    r => `+${Math.ceil(r / 2) + (r === 3 ? 1 : 0)} projectiles, +${10 * r}% fire rate`, (S, r) => { S.extraProj += Math.ceil(r / 2) + (r === 3 ? 1 : 0); S.rateMul += 0.1 * r; S.stormSpread += 0.03 * r; }, { icon: 'storm' }),
  U('precision', 'ballistics', 'Precision Training', 3, 'common', 'Tighter spread and steadier aim.',
    r => `-${18 * r}% spread, +${5 * r}% bullet speed`, (S, r) => { S.spreadMul *= 1 - 0.18 * r; S.speedMul += 0.05 * r; }),
  U('recoil', 'ballistics', 'Recoil Compensation', 3, 'common', 'Holding the trigger steadily tightens your spread.',
    r => `Up to -${25 + 15 * r}% spread while firing`, (S, r) => { S.recoilComp = 0.25 + 0.15 * r; }),
  U('calibre', 'ballistics', 'High Calibre', 3, 'common', 'Bigger rounds: larger hitbox, more impact force and damage.',
    r => `+${8 * r}% dmg, +${25 * r}% knockback, bigger bullets`, (S, r) => { S.calibre = r; S.dmgMul += 0.08 * r; S.knockMul += 0.25 * r; }),
  U('frag', 'ballistics', 'Fragmentation', 3, 'uncommon', 'Hits can burst into small shrapnel fragments.',
    r => `${12 * r}% chance: 3 fragments`, (S, r) => { S.frag = r; }),
  U('accel', 'ballistics', 'Bullet Accelerator', 3, 'uncommon', 'Bullets gain damage the further they travel.',
    r => `+${6 * r}% dmg per 100px (max +${30 * r}%)`, (S, r) => { S.accel = r; }),
  // ---------------- FIREPOWER ----------------
  U('rapid', 'firepower', 'Rapid Fire', 5, 'common', 'Shoot faster.', r => `+${12 * r}% fire rate`, (S, r) => { S.rateMul += 0.12 * r; }),
  U('heavy', 'firepower', 'Heavy Rounds', 5, 'common', 'Raw bullet damage.', r => `+${18 * r}% damage`, (S, r) => { S.dmgMul += 0.18 * r; }),
  U('crit', 'firepower', 'Critical Strike', 4, 'common', 'Chance for amplified critical hits.',
    r => `+${8 * r}% crit chance, crits x${(2 + 0.3 * r).toFixed(1)}`, (S, r) => { S.crit += 0.08 * r; S.critMul += 0.3 * r; }),
  U('mag', 'firepower', 'Extended Mag', 3, 'common', 'Bigger magazines.', r => `+${35 * r}% magazine size`, (S, r) => { S.magMul += 0.35 * r; }),
  U('reload', 'firepower', 'Quick Reload', 3, 'common', 'Faster reloads.', r => `-${Math.round((1 - Math.pow(0.8, r)) * 100)}% reload time`, (S, r) => { S.reloadMul *= Math.pow(0.8, r); }),
  U('hollow', 'firepower', 'Hollow Point', 3, 'common', 'Extra damage against unarmoured enemies.', r => `+${15 * r}% vs unarmoured`, (S, r) => { S.hollow = 0.15 * r; }),
  U('breaker', 'firepower', 'Armour Breaker', 3, 'uncommon', 'Each hit strips some of the target\'s armour.', r => `-${4 + 3 * r}% armour per hit`, (S, r) => { S.breaker = 0.04 + 0.03 * r; }),
  U('lastround', 'firepower', 'Last Round', 3, 'common', 'The final bullet in each magazine hits much harder.', r => `Last bullet x${(1.5 + 0.75 * r).toFixed(2)} damage`, (S, r) => { S.lastRound = 0.5 + 0.75 * r; }),
  U('firststrike', 'firepower', 'First Strike', 3, 'common', 'Your first shot after a reload deals bonus damage.', r => `First shot +${40 * r}% damage`, (S, r) => { S.firstStrike = 0.4 * r; }),
  U('cqc', 'firepower', 'Close Quarters', 3, 'common', 'Bonus damage the closer the target is.', r => `Up to +${25 * r}% dmg point-blank`, (S, r) => { S.cqc = 0.25 * r; }),
  U('marked', 'firepower', 'Marked Target', 3, 'uncommon', 'Repeated hits on the same target stack bonus damage.', r => `+${3 * r}% per hit (10 stacks)`, (S, r) => { S.marked = 0.03 * r; }),
  U('suppress', 'firepower', 'Suppressive Fire', 3, 'common', 'Sustained hits slow enemies down.', r => `Hits slow up to ${15 + 10 * r}%`, (S, r) => { S.suppress = r; }),
  U('execute', 'firepower', 'Execution Rounds', 3, 'uncommon', 'Bonus damage against badly wounded enemies.', r => `+${25 * r}% vs enemies below ${25 + 5 * r}% HP`, (S, r) => { S.execute = r; }),
  U('discipline', 'firepower', 'Trigger Discipline', 3, 'uncommon', 'Consecutive hits without missing raise crit chance.', r => `+${1.5 * r}% crit per streak hit (max 10)`, (S, r) => { S.discipline = 0.015 * r; }),
  U('tactical', 'firepower', 'Tactical Reload', 3, 'common', 'Reloading with ammo left (R) grants a fire-rate burst.', r => `+${15 * r}% fire rate for 4s`, (S, r) => { S.tactical = 0.15 * r; }),
  // ---------------- MOBILITY ----------------
  U('light', 'mobility', 'Lightweight', 4, 'common', 'Move faster.', r => `+${10 * r}% move speed`, (S, r) => { S.moveMul += 0.1 * r; }, { icon: 'boot' }),
  U('dashm', 'mobility', 'Dash Mastery', 4, 'common', 'Shorter dash cooldown (diminishing, 0.9s floor).', r => `Dash cooldown ${DASH_CD[r]}s`, (S, r) => { S.dashCd = DASH_CD[r]; }, { icon: 'dash' }),
  U('longd', 'mobility', 'Long Dash', 3, 'common', 'Dash further.', r => `+${25 * r}% dash distance`, (S, r) => { S.dashDist += 0.25 * r; }, { icon: 'longdash' }),
  U('adren', 'mobility', 'Adrenaline', 3, 'common', 'Kills give a burst of speed.', r => `Kills: +${18 + 6 * r}% speed for 1.5s`, (S, r) => { S.adren = r; }, { icon: 'adrenaline' }),
  U('evade', 'mobility', 'Evasive', 4, 'common', 'Chance to dodge damage entirely.', r => `${5 * r}% dodge chance`, (S, r) => { S.evade = 0.05 * r; }),
  U('momentum', 'mobility', 'Momentum', 3, 'common', 'Keep moving to build speed.', r => `Up to +${8 * r}% speed`, (S, r) => { S.momentum = r; }),
  U('slide', 'mobility', 'Combat Slide', 2, 'uncommon', 'Dashing in tight spaces becomes a longer, gliding slide.', r => `+${35 + 15 * r}% dash length near walls`, (S, r) => { S.slide = r; }),
  U('ghost', 'mobility', 'Ghost Step', 3, 'uncommon', 'Dashing leaves a decoy that lures nearby enemies.', r => `Decoy lasts ${(1.2 + 0.4 * r).toFixed(1)}s, ${250 + 50 * r}px lure`, (S, r) => { S.ghost = r; }),
  U('kinrec', 'mobility', 'Kinetic Recovery', 3, 'common', 'Every kill shaves time off your dash cooldown.', r => `-${(0.08 * r).toFixed(2)}s dash cooldown per kill`, (S, r) => { S.kinrec = 0.08 * r; }),
  U('fleet', 'mobility', 'Fleet Footed', 3, 'common', 'Avoiding damage (dash or dodge) gives a speed boost.', r => `+${20 + 10 * r}% speed for 2s`, (S, r) => { S.fleet = r; }),
  U('rungun', 'mobility', 'Run and Gun', 3, 'common', 'Sustained movement increases fire rate.', r => `Up to +${10 * r}% fire rate while moving`, (S, r) => { S.rungun = 0.1 * r; }),
  U('evreload', 'mobility', 'Evasive Reload', 2, 'common', 'Move faster while reloading.', r => `+${20 * r}% speed while reloading`, (S, r) => { S.evreload = 0.2 * r; }),
  U('phase', 'mobility', 'Phase Dash', 1, 'uncommon', 'Dash straight through enemy bodies (never walls).', () => 'Dash ignores enemy bodies', (S, r) => { S.phase = r; }),
  U('kinimpact', 'mobility', 'Kinetic Impact', 3, 'uncommon', 'Dashing into enemies damages and bowls them over.', r => `${25 + 20 * r} dash collision damage`, (S, r) => { S.kinimpact = r; }),
  U('secondwind', 'mobility', 'Second Wind', 2, 'uncommon', 'Once per wave, dropping low gives a burst of speed.', r => `+40% speed for ${3 + r}s below 35% HP`, (S, r) => { S.secondwind = r; }),
  // ---------------- SURVIVAL ----------------
  U('armor', 'survival', 'Armour', 5, 'common', 'More maximum health (heals the bonus on pickup).', r => `+${20 * r} max HP`, (S, r) => { S.hpAdd += 20 * r; }, { onGain: p => { p.hp += 20; } }),
  U('regen', 'survival', 'Regeneration', 4, 'common', 'Regenerate health; doubled when out of combat for 4s.', r => `${(0.5 * r).toFixed(1)} HP/s (x2 out of combat)`, (S, r) => { S.regen = 0.5 * r; }),
  U('vamp', 'survival', 'Vampirism', 4, 'common', 'Kills restore health, up to a per-second cap.', r => `+${(0.6 * r).toFixed(1)} HP per kill (max ${6 + 3 * r}/s)`, (S, r) => { S.vamp = r; }),
  U('fortified', 'survival', 'Fortified', 3, 'common', 'Take less damage, move slightly slower.', r => `-${8 * r}% damage taken, -${3 * r}% speed`, (S, r) => { S.fortified = r; }),
  U('ironwill', 'survival', 'Iron Will', 2, 'rare', 'Survive one fatal hit with 15% HP. Long cooldown.', r => `Cheat death every ${r === 1 ? 150 : 100}s`, (S, r) => { S.ironwill = r; }),
  U('laststand', 'survival', 'Last Stand', 3, 'common', 'Extra firepower when you are on the brink.', r => `Below 30% HP: +${15 * r}% dmg and fire rate`, (S, r) => { S.laststand = 0.15 * r; }),
  U('overheal', 'survival', 'Overheal', 3, 'uncommon', 'Excess healing becomes a temporary shield.', r => `${30 * r}% of overflow to shield (cap ${15 + 10 * r}% HP)`, (S, r) => { S.overheal = r; }),
  U('trauma', 'survival', 'Trauma Response', 3, 'common', 'Medkits grant temporary damage resistance.', r => `Medkit: -${20 + 10 * r}% damage taken for 5s`, (S, r) => { S.trauma = r; }),
  U('medic', 'survival', 'Field Medic', 3, 'common', 'Medkits drop more often and spawn sooner.', r => `${[1.8, 2.6, 3.5, 4.5][r]}% drop chance${r === 3 ? ', medkits also regen' : ''}`, (S, r) => { S.medic = r; }),
  U('firstaid', 'survival', 'Advanced First Aid', 3, 'common', 'Medkits heal more.', r => `+${25 * r}% medkit healing`, (S, r) => { S.firstaid = r; }),
  // ---------------- TECHNOLOGY ----------------
  U('drone', 'technology', 'Combat Drone', 3, 'uncommon', 'Adds a drone; every rank also boosts all drones.', r => `${r} drone${r > 1 ? 's' : ''}, +${20 * (r - 1)}% drone dmg`, (S, r) => { S.drones = r; S.droneDmg += 0.2 * (r - 1); }),
  U('overdrive', 'technology', 'Drone Overdrive', 3, 'uncommon', 'Drones periodically enter rapid-fire mode.', r => `Every 10s: ${2 + r}s of 3x fire rate`, (S, r) => { S.overdrive = r; }, { req: p => has(p, 'drone') }),
  U('autotarget', 'technology', 'Automated Targeting', 2, 'common', 'Drones prioritise dangerous enemies and reach further.', r => `+${15 * r}% drone dmg, priority targeting`, (S, r) => { S.autotarget = r; S.droneDmg += 0.15 * r; }, { req: p => has(p, 'drone') }),
  U('blades', 'technology', 'Orbiting Blades', 5, 'uncommon', 'A blade circles you, slicing enemies.', r => `${r} blade${r > 1 ? 's' : ''}`, (S, r) => { S.blades = r; }),
  U('orbital', 'technology', 'Orbital Accelerator', 3, 'common', 'Blades spin faster, reach further and cut deeper.', r => `+${25 * r}% spin, +${20 * r}% blade dmg`, (S, r) => { S.orbital = r; }, { req: p => has(p, 'blades') }),
  U('overclock', 'technology', 'Overclock', 3, 'uncommon', 'Kill streams trigger 5s of +70% fire rate with no reloads.', r => `Every ${35 - r * 5} kills`, (S, r) => { S.overclock = r; }),
  U('emp', 'technology', 'EMP Dash', 2, 'uncommon', 'Dashing jams nearby gunmen and fries their bullets.', r => `Disable ranged enemies ${(1 + 0.5 * r).toFixed(1)}s in ${220 + 60 * r}px`, (S, r) => { S.emp = r; }),
  U('shock', 'technology', 'Shockwave', 3, 'uncommon', 'Dashing releases a damaging knockback pulse.', r => `${32 * r} pulse damage`, (S, r) => { S.shock = r; }),
  U('reactive', 'technology', 'Retaliation Field', 3, 'common', 'Taking damage releases a short-range shockwave.', r => `${20 + 15 * r} dmg burst (3s cooldown)`, (S, r) => { S.reactive = r; }),
  // ---------------- ELEMENTAL ----------------
  U('explosive', 'elemental', 'Explosive Rounds', 4, 'uncommon', 'Kills can detonate (explosion density is capped).', r => `${10 + 12 * r}% kill explosion chance`, (S, r) => { S.explosive = r; }, { icon: 'boom' }),
  U('chain', 'elemental', 'Chain Lightning', 4, 'uncommon', 'Hits can arc lightning between enemies.', r => `${6 + 4 * r}% chance, ${2 + r} jumps, ${40 + 10 * r}% dmg`, (S, r) => { S.chain = r; }, { icon: 'bolt' }),
  U('incendiary', 'elemental', 'Incendiary Rounds', 3, 'common', 'Hits set enemies on fire.', r => `Burn ${6 + 5 * r} dmg/s for 3s`, (S, r) => { S.incendiary = r; }),
  U('cryo', 'elemental', 'Cryo Rounds', 3, 'common', 'Each hit chills; chilled enemies slow down.', r => `+${10 + 4 * r}% slow per hit (max 50%)`, (S, r) => { S.cryo = r; }),
  U('static', 'elemental', 'Static Charge', 3, 'common', 'Hits build charge that discharges as an arc.', r => `Every ${14 - 2 * r} hits: arc to ${2 + r} enemies`, (S, r) => { S.static = r; }),
  U('volatile', 'elemental', 'Volatile Enemies', 3, 'uncommon', 'Burning enemies may explode on death.', r => `${25 + 15 * r}% blast chance`, (S, r) => { S.volatile = r; }, { req: p => has(p, 'incendiary') }),
  U('capacitor', 'elemental', 'Energy Capacitor', 3, 'uncommon', 'Elemental effects hit harder and last longer.', r => `+${20 * r}% elemental dmg, +${15 * r}% duration`, (S, r) => { S.elemMul += 0.2 * r; S.elemDur += 0.15 * r; }, { req: anyElem }),
  U('afterburn', 'elemental', 'Afterburner', 3, 'common', 'Dashing leaves a burning trail.', r => `Trail burns ${30 + r * 25} dmg/s`, (S, r) => { S.afterburn = r; }, { icon: 'fire' }),
  // ---------------- UTILITY ----------------
  U('magnet', 'utility', 'Magnetic Field', 4, 'common', 'Bigger XP pickup radius.', r => `+${40 * r}% pickup radius`, (S, r) => { S.magnet += 0.4 * r; }),
  U('scanner', 'utility', 'Medical Scanner', 1, 'uncommon', 'Medkits anywhere on the map are marked at the screen edge.', () => 'Track all medkits', (S, r) => { S.scanner = r; }),
  U('emergency', 'utility', 'Emergency Supplies', 2, 'common', 'Medkits drop far more often while badly hurt.', r => `Below 40% HP: x${(1.6 + 0.6 * r).toFixed(1)} drop chance`, (S, r) => { S.emergency = r; }),
  U('stimulant', 'utility', 'Combat Stimulant', 2, 'common', 'Big heals boost movement and reload speed.', r => `+${20 * r}% speed, -${20 * r}% reload for 4s`, (S, r) => { S.stimulant = r; }),
];
export const UPG = Object.fromEntries(UPGRADES.map(u => [u.id, u]));
