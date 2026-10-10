// Enemy archetypes, bosses and difficulty scaling.
export const ETYPES = {
  thug: { name: 'Street Thug', hp: 30, spd: 150, r: 14, xp: 1, melee: 10, scale: 1, armor: 0, jacket: '#c8692c', style: 'bald', weapon: 'bat', col: '#c8692c', pants: '#3a3026' },
  rusher: { name: 'Rusher', hp: 16, spd: 290, r: 12, xp: 1, melee: 7, scale: 0.88, armor: 0, jacket: '#d63a3a', style: 'mohawk', hair: '#59a8ff', weapon: 'knife', col: '#d63a3a', top: 'tank', pants: '#22242c' },
  gunman: { name: 'Gunman', hp: 32, spd: 118, r: 14, xp: 2, armor: 0, ranged: { cd: 1.8, n: 1, spread: 0.12, spd: 320, dmg: 8, min: 220, max: 380 }, scale: 1, jacket: '#7a3fb5', style: 'cap', hair: '#22222a', weapon: 'pistol', col: '#7a3fb5', glasses: 'shades', pants: '#2b2f3a' },
  shotgunner: { name: 'Shotgunner', hp: 55, spd: 128, r: 15, xp: 3, armor: 0.1, ranged: { cd: 2.3, n: 5, spread: 0.5, spd: 300, dmg: 6, min: 110, max: 210, life: 0.9 }, scale: 1.05, jacket: '#2f6e8f', style: 'bandana', hair: '#c42a2a', weapon: 'shotgun', col: '#2f6e8f', mask: 'bandana', maskCol: '#c42a2a', pants: '#3a3026' },
  heavy: { name: 'Heavy', hp: 170, spd: 82, r: 22, xp: 5, melee: 22, scale: 1.5, armor: 0.35, jacket: '#4b5a3a', vest: '#2b3324', style: 'helmet', hair: '#2c3326', weapon: 'fists', resist: 0.65, col: '#4b5a3a', pads: '#2c3326', build: 'broad' },
  elite: { name: 'Elite', hp: 300, spd: 125, r: 20, xp: 14, melee: 16, armor: 0.3, ranged: { cd: 1.9, n: 1, burst: 3, spread: 0.08, spd: 360, dmg: 9, min: 200, max: 340 }, scale: 1.35, jacket: '#1d1d26', vest: '#ffc93c', style: 'hood', hair: '#121217', eyes: '#ff3b4e', weapon: 'rifle', resist: 0.5, glow: true, col: '#ffc93c', mask: 'balaclava', maskCol: '#121217', elite: true },
  // stationary turret deployed by THE ENGINEER
  eturret: { name: 'Sentry', hp: 140, spd: 0, r: 16, xp: 3, armor: 0.2, ranged: { cd: 1.4, n: 1, spread: 0.05, spd: 340, dmg: 7, min: 0, max: 520 }, scale: 1, col: '#ffd23f', resist: 1, structure: true },
  // training dummy: stands still, never attacks
  dummy: { name: 'Target Dummy', hp: 2500, spd: 0, r: 18, xp: 0, armor: 0, scale: 1.2, jacket: '#a8743c', style: 'bald', col: '#a8743c', resist: 1, dummy: true, skin: '#c9a06b' },
};
export const BOSSES = {
  juggernaut: { name: 'THE JUGGERNAUT', title: 'Armoured breacher', hp: 2300, spd: 70, r: 36, xp: 80, melee: 34, armor: 0.6, scale: 2.5, resist: 0.92, col: '#9aa0b4',
    jacket: '#3a3d44', vest: '#6a6e78', style: 'helmet', hair: '#2b2e35', pads: '#4a4d58', build: 'broad', weapon: 'fists', mask: 'gas', maskCol: '#2b2e35', sound: 0 },
  commander: { name: 'THE COMMANDER', title: 'Gang general', hp: 1600, spd: 108, r: 28, xp: 80, melee: 20, armor: 0.3, scale: 2.0, resist: 0.85, col: '#c42a2a',
    jacket: '#3a4a2f', vest: '#7a1d1d', style: 'cap', hair: '#7a1d1d', glasses: 'shades', weapon: 'rifle', pants: '#2b2f3a', sound: 1 },
  engineer: { name: 'THE ENGINEER', title: 'Rogue technician', hp: 1700, spd: 96, r: 28, xp: 80, melee: 18, armor: 0.35, scale: 2.0, resist: 0.85, col: '#ffd23f',
    jacket: '#e0a21f', vest: '#2b2f3a', style: 'helmet', hair: '#ffd23f', mask: 'gas', maskCol: '#3a3d44', backpack: '#3a3d44', weapon: 'smg', sound: 2 },
};
export const BOSS_ORDER = ['juggernaut', 'commander', 'engineer'];
// softer HP growth than v2 (difficulty now leans on numbers, composition and behaviour)
export const hpScale = w => 1 + 0.1 * (w - 1) + 0.0025 * (w - 1) * (w - 1);
export const dmgScale = w => 1 + 0.055 * (w - 1);
export const bossHp = (id, wave, n) => Math.round((BOSSES[id].hp + wave * 120) * (1 + 0.18 * n));

// Squad templates mixed into the spawn director as waves climb
export const SQUADS = [
  { id: 'fireteam', minWave: 3, units: ['gunman', 'gunman', 'shotgunner'] },
  { id: 'rushpack', minWave: 2, units: ['rusher', 'rusher', 'rusher', 'rusher'] },
  { id: 'escort', minWave: 4, units: ['heavy', 'thug', 'thug'] },
  { id: 'breach', minWave: 6, units: ['shotgunner', 'shotgunner', 'rusher', 'rusher'] },
  { id: 'elitesquad', minWave: 8, units: ['elite', 'gunman', 'gunman', 'gunman'] },
];
