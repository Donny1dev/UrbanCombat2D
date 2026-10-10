// Game modes, daily-operation modifiers and in-run objectives.
import { makeRng, seedFromString } from '../core/util.js';
import { WEAPON_IDS } from './weapons.js';

export const MODES = {
  standard: { id: 'standard', name: 'STANDARD SURVIVAL', short: 'Standard', desc: 'The endless Urban Combat experience. Every system enabled.', mods: [] },
  hardcore: { id: 'hardcore', name: 'HARDCORE', short: 'Hardcore', desc: 'Less forgiving. Rewards x1.5.', mods: ['Enemies deal +50% damage', 'Enemies have +15% health', 'All healing halved', 'No world medkits'] },
  daily: { id: 'daily', name: 'DAILY OPERATION', short: 'Daily', desc: "Today's city, weapon and modifiers. Same for every player on this date. Rewards x1.25.", mods: [] },
  training: { id: 'training', name: 'TRAINING GROUNDS', short: 'Training', desc: 'Test weapons, upgrades and equipment on dummies. No rewards or records.', mods: [] },
};
export const DAILY_MODS = [
  { id: 'glass', name: 'Glass Cannon', desc: '+30% damage dealt and taken', dmgDealt: 1.3, enemyDmg: 1.3 },
  { id: 'swarm', name: 'Swarm', desc: '+35% enemy spawns', spawn: 1.35 },
  { id: 'marksmen', name: 'Marksmen', desc: 'Far more gunmen and shotgunners', ranged: 1.8 },
  { id: 'lightsout', name: 'Lights Out', desc: 'Blackouts happen far more often', blackout: true },
  { id: 'adrenaline', name: 'Adrenaline City', desc: 'Everyone moves 15% faster', speed: 1.15 },
  { id: 'scarce', name: 'Scarce Supplies', desc: 'Medkits are rarer · +25% XP', medkit: 0.6, xp: 1.25 },
  { id: 'heavy', name: 'Heavy Metal', desc: 'More heavies and elites · +20% XP', heavy: 1.8, xp: 1.2 },
];
// Deterministic daily configuration: everyone gets the same seed, weapon and two modifiers for a date.
export function dailyConfig(dateKey) {
  const seed = seedFromString('urban-combat-daily-' + dateKey), rng = makeRng(seed);
  const a = Math.floor(rng() * DAILY_MODS.length);
  let b = Math.floor(rng() * (DAILY_MODS.length - 1)); if (b >= a) b++;
  return { dateKey, seed, weapon: WEAPON_IDS[Math.floor(rng() * WEAPON_IDS.length)], mods: [DAILY_MODS[a], DAILY_MODS[b]] };
}
// Fold a list of modifiers into one multiplier set.
export function modifierSet(mode, mods = []) {
  const m = { dmgDealt: 1, enemyDmg: 1, enemyHp: 1, healMul: 1, spawn: 1, ranged: 1, heavy: 1, speed: 1, medkit: 1, xp: 1, blackout: false, worldMedkits: true };
  if (mode === 'hardcore') { m.enemyDmg = 1.5; m.enemyHp = 1.15; m.healMul = 0.5; m.worldMedkits = false; }
  for (const d of mods) for (const k in d) if (k in m) m[k] = typeof m[k] === 'number' ? m[k] * d[k] : d[k];
  return m;
}

// In-run objectives: progress keys are incremented by game events.
export const OBJECTIVES = [
  { id: 'weaponKills', key: 'weaponKills', target: 30, text: o => `Eliminate ${o.target} enemies with the ${o.weaponName}`, credits: 30 },
  { id: 'noDamageWave', key: 'perfectWaves', target: 1, text: () => 'Survive a full wave without taking damage', credits: 40 },
  { id: 'eliteGadget', key: 'eliteGadget', target: 1, text: () => 'Defeat an elite using equipment', credits: 40 },
  { id: 'cache', key: 'caches', target: 1, text: () => 'Collect a supply cache or equipment crate', credits: 25 },
  { id: 'streak', key: 'streak', target: 15, text: o => `Reach a ${o.target}-kill streak`, credits: 30, max: true },
  { id: 'gadgetKills', key: 'gadgetKills', target: 10, text: o => `Score ${o.target} kills with your gadget`, credits: 30 },
  { id: 'explosiveKills', key: 'explosiveKills', target: 15, text: o => `Eliminate ${o.target} enemies with explosions`, credits: 30 },
  { id: 'crits', key: 'crits', target: 50, text: o => `Land ${o.target} critical hits`, credits: 25 },
  { id: 'medkits', key: 'medkits', target: 2, text: o => `Collect ${o.target} medkits`, credits: 20 },
];
