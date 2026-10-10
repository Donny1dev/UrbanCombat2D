// Career progression: levels, rank titles, rewards, cosmetic unlocks and profile frames. Pure functions.
export const careerXpFor = l => 250 + 75 * (l - 1) + 3 * (l - 1) * (l - 1);   // XP to go from level l to l+1
export const RANKS = [
  { min: 1, title: 'Rookie', col: '#9aa0b4' }, { min: 6, title: 'Enforcer', col: '#52f08a' }, { min: 11, title: 'Operative', col: '#2ef2ff' },
  { min: 21, title: 'Specialist', col: '#3d9bff' }, { min: 36, title: 'Veteran', col: '#b46bff' }, { min: 51, title: 'Elite', col: '#ff4fd8' },
  { min: 76, title: 'Legend', col: '#ffc93c' }, { min: 101, title: 'Urban Legend', col: '#ff9a1f' },
];
export const rankFor = level => { let r = RANKS[0]; for (const k of RANKS) if (level >= k.min) r = k; return r; };

// Apply career XP; returns { level, xp, levelsGained }. xp is progress inside the current level.
export function addCareerXp(career, gain) {
  let { level, xp } = career; xp += Math.max(0, Math.round(gain));
  let levelsGained = 0;
  while (xp >= careerXpFor(level)) { xp -= careerXpFor(level); level++; levelsGained++; }
  return { level, xp, levelsGained };
}
export const MODE_REWARD = { standard: 1, hardcore: 1.5, daily: 1.25, training: 0 };
export function runScore(r) {
  return Math.round((r.kills * 10 + Math.floor(r.time) * 5 + (r.wave - 1) * 250 + r.bosses * 1000 + r.level * 50) * (r.mode === 'hardcore' ? 1.5 : 1));
}
export function runRewards(r) {
  const m = MODE_REWARD[r.mode] ?? 1;
  const careerXp = Math.floor((r.time * 0.5 + r.kills + (r.wave - 1) * 25 + r.bosses * 150 + r.objectives * 60) * m);
  const credits = Math.floor((r.kills / 8 + (r.wave - 1) * 6 + r.bosses * 60 + r.objectives * 25 + r.time / 30) * m);
  return { careerXp, credits };
}

// Cosmetic options gated by career level (horizontal progression only; no stat advantages)
export const COSMETIC_LOCKS = {
  'style:afro': 3, 'style:mohawk': 5, 'style:beanie': 2, 'style:hood': 7, 'style:helmet': 9,
  'mask:bandana': 2, 'mask:balaclava': 6, 'mask:skull': 12, 'mask:gas': 16,
  'glasses:shades': 3, 'glasses:visor': 10, 'backpack:pack': 4, 'top:hoodie': 4, 'top:vest': 8,
  'accent:cyan': 5, 'accent:gold': 20, 'accent:magenta': 15, 'accent:red': 10, 'pads:true': 7,
};
export const lookLock = (key, value) => COSMETIC_LOCKS[`${key}:${value}`] || 1;
export const FRAMES = [
  { id: 'none', name: 'Standard', level: 1, col: '#343744' }, { id: 'bronze', name: 'Bronze', level: 5, col: '#c8692c' },
  { id: 'silver', name: 'Silver', level: 15, col: '#c8ccd8' }, { id: 'gold', name: 'Gold', level: 30, col: '#ffc93c' },
  { id: 'neon', name: 'Neon', level: 50, col: '#ff4fd8' }, { id: 'legend', name: 'Legend', level: 76, col: '#ff9a1f' },
];
