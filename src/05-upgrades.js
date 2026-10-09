// ===================== WEAPONS, EVOLUTIONS, UPGRADES =====================
const WEAPONS = {
  pistol: { name: 'Pistol', dmg: 24, rate: 6.5, mag: 12, reload: 0.85, spread: 0.035, speed: 1150, pellets: 1, pierce: 0, knock: 140, life: 0.9, trail: '#ffd27a', width: 3, shake: 1.6, recoil: 5 },
  smg: { name: 'SMG', dmg: 12, rate: 15, mag: 40, reload: 1.05, spread: 0.11, speed: 1080, pellets: 1, pierce: 0, knock: 80, life: 0.75, trail: '#ffb347', width: 2.5, shake: 1.1, recoil: 3 },
  rifle: { name: 'Assault Rifle', dmg: 21, rate: 9, mag: 30, reload: 1.15, spread: 0.04, speed: 1350, pellets: 1, pierce: 1, knock: 130, life: 0.9, trail: '#ffe07a', width: 3, shake: 1.8, recoil: 5 },
  shotgun: { name: 'Shotgun', dmg: 14, rate: 1.7, mag: 6, reload: 0.95, spread: 0.42, speed: 980, pellets: 7, pierce: 0, knock: 260, life: 0.36, trail: '#ffc060', width: 2.5, shake: 6, recoil: 10, shell: true },
  dual: { name: 'Dual Pistols', dmg: 15, rate: 12, mag: 28, reload: 1.0, spread: 0.07, speed: 1150, pellets: 1, pierce: 0, knock: 100, life: 0.85, trail: '#ffd27a', width: 2.5, shake: 1.3, recoil: 5 },
  heavy: { name: 'Heavy Rifle', dmg: 75, rate: 2.1, mag: 8, reload: 1.35, spread: 0.012, speed: 1750, pellets: 1, pierce: 4, knock: 320, life: 1.0, trail: '#fff0b0', width: 5, shake: 5, recoil: 11 },
};
const EVOS = [
  { id: 'hose', weapon: 'smg', req: 'rapid', n: 2, name: 'BULLET HOSE', desc: 'SMG evolves: torrential fire rate, 100-round drum, golden tracers.', hue: 'gold',
    mod: w => { w.rate *= 1.75; w.dmg *= 1.25; w.mag = Math.round(w.mag * 2.5); w.spread *= 0.8; w.trail = '#ffd23f'; w.width = 3; } },
  { id: 'devastator', weapon: 'shotgun', req: 'multi', n: 2, name: 'DEVASTATOR', desc: 'Shotgun evolves: +5 pellets, brutal knockback, longer reach.', hue: 'fire',
    mod: w => { w.pellets += 5; w.dmg *= 1.4; w.knock *= 2.2; w.life *= 1.45; w.trail = '#ff7a2f'; w.width = 3.5; w.shake = 9; } },
  { id: 'railstorm', weapon: 'rifle', req: 'pierce', n: 2, name: 'RAILSTORM', desc: 'Rifle evolves: hypersonic rails that tear through 6 more enemies.', hue: 'cyan',
    mod: w => { w.speed *= 1.8; w.pierce += 6; w.dmg *= 1.5; w.trail = '#5ff4ff'; w.width = 4; w.rail = true; } },
  { id: 'executioner', weapon: 'pistol', req: 'crit', n: 2, name: 'EXECUTIONER', desc: 'Pistol evolves: huge damage, +20% crit chance, crits hit x3.', hue: 'red',
    mod: w => { w.dmg *= 2.2; w.critBonus = 0.2; w.critMulBonus = 1; w.rate *= 1.15; w.trail = '#ff4f5e'; w.width = 4; w.spread = 0.01; } },
  { id: 'twinfury', weapon: 'dual', req: 'ricochet', n: 2, name: 'TWIN FURY', desc: 'Dual Pistols evolve: faster, +2 ricochets, magenta rounds.', hue: 'violet',
    mod: w => { w.rate *= 1.5; w.dmg *= 1.2; w.ricoBonus = 2; w.trail = '#ff4fd8'; w.width = 3; } },
  { id: 'annihilator', weapon: 'heavy', req: 'heavy', n: 2, name: 'ANNIHILATOR', desc: 'Heavy Rifle evolves: every round detonates on impact.', hue: 'fire',
    mod: w => { w.dmg *= 1.3; w.impactBoom = true; w.trail = '#ff9a1f'; w.width = 6; } },
];
const CAT_COL = { weapon: '#ff9a1f', move: '#2ef2ff', survival: '#52f08a', evo: '#ffc93c', swap: '#ff4fd8', misc: '#f4f6fb' };
const UPGRADES = [
  // weapon
  { id: 'rapid', cat: 'weapon', icon: 'rapid', name: 'Rapid Fire', max: 6, desc: () => '+20% fire rate.', apply: S => S.rateMul += 0.2 },
  { id: 'heavy', cat: 'weapon', icon: 'heavy', name: 'Heavy Rounds', max: 6, desc: () => '+25% bullet damage.', apply: S => S.dmgMul += 0.25 },
  { id: 'multi', cat: 'weapon', icon: 'multi', name: 'Multishot', max: 4, desc: () => '+1 projectile per shot.', apply: S => S.extraProj += 1 },
  { id: 'pierce', cat: 'weapon', icon: 'pierce', name: 'Piercing Rounds', max: 4, desc: () => 'Bullets punch through +1 enemy.', apply: S => S.pierce += 1 },
  { id: 'ricochet', cat: 'weapon', icon: 'ricochet', name: 'Ricochet', max: 3, desc: () => 'Bullets bounce off walls and seek a new target (+1 bounce).', apply: S => S.ricochet += 1 },
  { id: 'explosive', cat: 'weapon', icon: 'boom', name: 'Explosive Rounds', max: 4, desc: l => `Kills have a ${15 + l * 15}% chance to explode.`, apply: S => S.explosive += 1 },
  { id: 'mag', cat: 'weapon', icon: 'mag', name: 'Extended Mag', max: 3, desc: () => '+40% magazine size.', apply: S => S.magMul += 0.4 },
  { id: 'reload', cat: 'weapon', icon: 'reload', name: 'Quick Reload', max: 3, desc: () => 'Reload 25% faster.', apply: S => S.reloadMul *= 0.75 },
  { id: 'crit', cat: 'weapon', icon: 'crit', name: 'Critical Strike', max: 4, desc: () => '+12% crit chance; crits deal more.', apply: S => { S.crit += 0.12; S.critMul += 0.25; } },
  { id: 'chain', cat: 'weapon', icon: 'bolt', name: 'Chain Lightning', max: 4, desc: l => `${12 * (l + 1)}% of hits arc lightning through ${l + 3} enemies.`, apply: S => S.chain += 1 },
  { id: 'storm', cat: 'weapon', icon: 'storm', name: 'Bullet Storm', max: 3, desc: () => '+1 projectile, +15% fire rate, wider spray.', apply: S => { S.extraProj += 1; S.rateMul += 0.15; S.stormSpread += 0.04; } },
  { id: 'velocity', cat: 'weapon', icon: 'velocity', name: 'High Velocity', max: 3, desc: () => '+30% bullet speed, +25% knockback, +10% damage.', apply: S => { S.speedMul += 0.3; S.knockMul += 0.25; S.dmgMul += 0.1; } },
  // movement
  { id: 'light', cat: 'move', icon: 'boot', name: 'Lightweight', max: 4, desc: () => '+15% movement speed.', apply: S => S.moveMul += 0.15 },
  { id: 'dashm', cat: 'move', icon: 'dash', name: 'Dash Mastery', max: 4, desc: () => 'Dash cooldown -18%.', apply: S => S.dashCd *= 0.82 },
  { id: 'longd', cat: 'move', icon: 'longdash', name: 'Long Dash', max: 3, desc: () => '+30% dash distance.', apply: S => S.dashDist += 0.3 },
  { id: 'afterburn', cat: 'move', icon: 'fire', name: 'Afterburner', max: 3, desc: l => `Dashing leaves a burning trail (${30 + l * 25} dmg/s).`, apply: S => S.afterburn += 1 },
  { id: 'adren', cat: 'move', icon: 'adrenaline', name: 'Adrenaline', max: 3, desc: () => 'Kills grant a burst of speed (+30%).', apply: S => S.adren += 1 },
  { id: 'evade', cat: 'move', icon: 'evade', name: 'Evasive', max: 4, desc: () => '+8% chance to dodge damage.', apply: S => S.evade += 0.08 },
  { id: 'magnet', cat: 'move', icon: 'magnet', name: 'Magnetic Field', max: 4, desc: () => '+45% XP pickup radius.', apply: S => S.magnet += 0.45 },
  { id: 'momentum', cat: 'move', icon: 'momentum', name: 'Momentum', max: 3, desc: l => `Keep moving to build up to +${(l + 1) * 12}% speed.`, apply: S => S.momentum += 1 },
  // survival
  { id: 'armor', cat: 'survival', icon: 'armor', name: 'Armour', max: 5, desc: () => '+25 max HP and heal 25.', apply: (S, p) => { p.maxHp += 25; p.hp = Math.min(p.maxHp, p.hp + 25); } },
  { id: 'regen', cat: 'survival', icon: 'regen', name: 'Regeneration', max: 4, desc: () => 'Regenerate +0.8 HP per second.', apply: S => S.regen += 0.8 },
  { id: 'vamp', cat: 'survival', icon: 'vamp', name: 'Vampirism', max: 4, desc: () => 'Each kill restores +0.8 HP.', apply: S => S.vamp += 0.8 },
  { id: 'shock', cat: 'survival', icon: 'shock', name: 'Shockwave', max: 3, desc: () => 'Dashing releases a damaging, knockback pulse.', apply: S => S.shock += 1 },
  { id: 'blades', cat: 'survival', icon: 'blades', name: 'Orbiting Blades', max: 5, desc: () => '+1 blade circling you, slicing enemies.', apply: S => S.blades += 1 },
  { id: 'drone', cat: 'survival', icon: 'drone', name: 'Combat Drone', max: 3, desc: () => '+1 drone that guns down nearby enemies.', apply: S => S.drones += 1 },
  { id: 'overclock', cat: 'survival', icon: 'overclock', name: 'Overclock', max: 3, desc: l => `Every ${30 - l * 6} kills: 5s of +70% fire rate and no reloads.`, apply: S => S.overclock += 1 },
];
const UPG = Object.fromEntries(UPGRADES.map(u => [u.id, u]));

function freshStats() {
  return {
    dmgMul: 1, rateMul: 1, extraProj: 0, pierce: 0, ricochet: 0, explosive: 0, magMul: 1, reloadMul: 1,
    crit: 0.04, critMul: 2, chain: 0, stormSpread: 0, speedMul: 1, knockMul: 1,
    moveMul: 1, dashCd: 1.5, dashDist: 1, afterburn: 0, adren: 0, evade: 0, magnet: 1, momentum: 0,
    regen: 0, vamp: 0, shock: 0, blades: 0, drones: 0, overclock: 0,
  };
}
// compute the effective gun from base weapon + stats + evolution
function buildGun(p) {
  const base = WEAPONS[p.weapon], S = p.S;
  const w = Object.assign({ id: p.weapon }, base);
  if (p.evolved) { const e = EVOS.find(e => e.id === p.evolved); if (e) e.mod(w); }
  w.dmg *= S.dmgMul; w.rate *= S.rateMul; w.mag = Math.max(1, Math.round(w.mag * S.magMul)); w.reload *= S.reloadMul;
  w.speed *= S.speedMul; w.knock *= S.knockMul; w.pierce += S.pierce;
  w.ricochet = S.ricochet + (w.ricoBonus || 0);
  w.critChance = Math.min(0.85, S.crit + (w.critBonus || 0)); w.critMul = S.critMul + (w.critMulBonus || 0);
  if (p.weapon === 'shotgun') { w.pellets += S.extraProj * 2; w.fan = 0; }
  else { w.pellets += S.extraProj; w.fan = 0.085 + S.stormSpread; }
  w.pellets = Math.min(w.pellets, p.weapon === 'shotgun' ? 22 : 9);
  w.spread += S.stormSpread * 0.5;
  return w;
}
// build three level-up offers
function makeOffers(p) {
  const out = [];
  const lv = id => p.upg[id] || 0;
  const evo = EVOS.find(e => e.weapon === p.weapon && !p.evolved && lv(e.req) >= e.n);
  if (evo) out.push({ kind: 'evo', id: evo.id, name: evo.name, desc: evo.desc, cat: 'evo', icon: 'star' });
  if (out.length < 3 && p.level >= 3 && Math.random() < (p.evolved ? 0.07 : 0.2)) {
    const opts = Object.keys(WEAPONS).filter(k => k !== p.weapon);
    const k = pick(opts);
    out.push({ kind: 'swap', id: k, name: WEAPONS[k].name, desc: swapDesc(k) + (p.evolved ? ' (Replaces your evolved weapon.)' : ''), cat: 'swap', icon: 'gun' });
  }
  const pool = UPGRADES.filter(u => lv(u.id) < u.max);
  const weights = pool.map(u => (lv(u.id) > 0 ? 1.35 : 1) * (EVOS.some(e => e.weapon === p.weapon && e.req === u.id && !p.evolved) ? 1.6 : 1));
  while (out.length < 3 && pool.length) {
    let tot = weights.reduce((a, b) => a + b, 0), r = Math.random() * tot, i = 0;
    for (; i < pool.length - 1; i++) { r -= weights[i]; if (r <= 0) break; }
    const u = pool[i];
    out.push({ kind: 'upg', id: u.id, name: u.name, desc: u.desc(lv(u.id)), cat: u.cat, icon: u.icon, lvl: lv(u.id), max: u.max });
    pool.splice(i, 1); weights.splice(i, 1);
  }
  while (out.length < 3) out.push(out.some(o => o.id === 'medkit')
    ? { kind: 'misc', id: 'rations', name: 'Field Rations', desc: '+10 max HP.', cat: 'misc', icon: 'regen' }
    : { kind: 'misc', id: 'medkit', name: 'Med Kit', desc: 'Restore 50% of your health.', cat: 'misc', icon: 'heal' });
  return out.sort(() => Math.random() - 0.5);
}
function swapDesc(k) {
  return { pistol: 'Fast, accurate and balanced.', smg: 'Extremely rapid automatic fire.', rifle: 'Powerful, accurate auto fire that pierces.', shotgun: 'Close-range spread with huge knockback.', dual: 'Alternating rapid shots from both hands.', heavy: 'Slow, devastating rounds that pierce 4 enemies.' }[k] + ' Upgrades carry over.';
}
function applyOffer(p, o) {
  if (o.kind === 'upg') { p.upg[o.id] = (p.upg[o.id] || 0) + 1; UPG[o.id].apply(p.S, p); }
  else if (o.kind === 'evo') { p.evolved = o.id; }
  else if (o.kind === 'swap') { p.weapon = o.id; p.evolved = null; }
  else if (o.id === 'medkit') p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.5);
  else if (o.id === 'rations') { p.maxHp += 10; p.hp += 10; }
  const prevMag = p.gun ? p.gun.mag : 0;
  p.gun = buildGun(p);
  if (o.kind === 'swap' || o.kind === 'evo') { p.ammo = p.gun.mag; p.reloading = 0; }
  else if (p.gun.mag > prevMag) p.ammo += p.gun.mag - prevMag;
}
