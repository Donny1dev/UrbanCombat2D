// Base weapons. Stats are the starting point that upgrades and evolutions modify.
export const WEAPONS = {
  pistol: { name: 'Pistol', dmg: 24, rate: 6.5, mag: 12, reload: 0.85, spread: 0.035, speed: 1150, pellets: 1, pierce: 0, knock: 140, life: 0.9, trail: '#ffd27a', width: 3, shake: 1.6, recoil: 5, blurb: 'Fast, accurate and balanced.' },
  smg: { name: 'SMG', dmg: 12, rate: 15, mag: 40, reload: 1.05, spread: 0.11, speed: 1080, pellets: 1, pierce: 0, knock: 80, life: 0.75, trail: '#ffb347', width: 2.5, shake: 1.1, recoil: 3, auto: true, blurb: 'Extremely rapid automatic fire.' },
  rifle: { name: 'Assault Rifle', dmg: 21, rate: 9, mag: 30, reload: 1.15, spread: 0.04, speed: 1350, pellets: 1, pierce: 1, knock: 130, life: 0.9, trail: '#ffe07a', width: 3, shake: 1.8, recoil: 5, auto: true, blurb: 'Powerful, accurate auto fire that pierces.' },
  shotgun: { name: 'Shotgun', dmg: 14, rate: 1.7, mag: 6, reload: 0.95, spread: 0.42, speed: 980, pellets: 7, pierce: 0, knock: 260, life: 0.36, trail: '#ffc060', width: 2.5, shake: 6, recoil: 10, shell: true, blurb: 'Close-range spread with huge knockback.' },
  dual: { name: 'Dual Pistols', dmg: 15, rate: 12, mag: 28, reload: 1.0, spread: 0.07, speed: 1150, pellets: 1, pierce: 0, knock: 100, life: 0.85, trail: '#ffd27a', width: 2.5, shake: 1.3, recoil: 5, auto: true, blurb: 'Alternating rapid shots from both hands.' },
  heavy: { name: 'Heavy Rifle', dmg: 75, rate: 2.1, mag: 8, reload: 1.35, spread: 0.012, speed: 1750, pellets: 1, pierce: 4, knock: 320, life: 1.0, trail: '#fff0b0', width: 5, shake: 5, recoil: 11, blurb: 'Slow, devastating rounds that pierce 4 enemies.' },
};
export const WEAPON_IDS = Object.keys(WEAPONS);
export const HUE_COL = { gold: '#ffd23f', fire: '#ff7a2f', cyan: '#5ff4ff', red: '#ff4f5e', violet: '#ff4fd8', ice: '#a8e8ff', storm: '#9fd4ff', ghost: '#c49bff' };


export const GUN_SHAPES = { pistol: [13, 5], smg: [18, 6], rifle: [28, 5], shotgun: [25, 7], dual: [12, 5], heavy: [34, 7] };
// Supply Credits needed to unlock a weapon as a starting choice (pistol + SMG are starter gear).
export const WEAPON_COST = { pistol: 0, smg: 0, rifle: 250, shotgun: 250, dual: 300, heavy: 400 };
