// Weapon evolutions (tier I paths + tier II upgrades), upgrade synergies and build archetypes.
// tier 1 = primary path (one per weapon), tier 2 = upgrade of a specific tier 1
export const EVOS = [
  { id: 'hose', tier: 1, name: 'BULLET HOSE', weapons: ['smg'], req: { rapid: 3, mag: 2 }, minLevel: 7, hue: 'gold',
    desc: 'Torrential sustained fire from a 100-round drum.', benefits: ['+75% fire rate', 'x2.5 magazine', '+25% damage', 'Golden tracers'],
    mod: w => { w.rate *= 1.75; w.dmg *= 1.25; w.mag = Math.round(w.mag * 2.5); w.spread *= 0.8; w.trail = '#ffd23f'; w.width = 3; } },
  { id: 'devastator', tier: 1, name: 'DEVASTATOR', weapons: ['shotgun'], req: { multi: 2, heavy: 2 }, minLevel: 7, hue: 'fire',
    desc: 'A monstrous close-range blast that bowls enemies over.', benefits: ['+5 pellets', '+40% damage', 'x2.2 knockback', '+45% range'],
    mod: w => { w.pellets += 5; w.dmg *= 1.4; w.knock *= 2.2; w.life *= 1.45; w.trail = '#ff7a2f'; w.width = 3.5; w.shake = 9; } },
  { id: 'railstorm', tier: 1, name: 'RAILSTORM', weapons: ['rifle'], req: { pierce: 2, velocity: 2 }, minLevel: 7, hue: 'cyan',
    desc: 'Hypersonic rails that tear through whole crowds.', benefits: ['x1.8 bullet speed', '+6 pierce', '+50% damage', 'Rail tracers'],
    mod: w => { w.speed *= 1.8; w.pierce += 6; w.dmg *= 1.5; w.trail = '#5ff4ff'; w.width = 4; w.rail = true; } },
  { id: 'executioner', tier: 1, name: 'EXECUTIONER', weapons: ['pistol'], req: { crit: 3, precision: 2 }, minLevel: 7, hue: 'red',
    desc: 'Surgical, brutal precision. Crits become finishing blows.', benefits: ['x2.2 damage', '+20% crit chance', 'Crits +1x multiplier', 'Pinpoint accuracy'],
    mod: w => { w.dmg *= 2.2; w.critBonus = 0.2; w.critMulBonus = 1; w.rate *= 1.15; w.trail = '#ff4f5e'; w.width = 4; w.spread = 0.008; } },
  { id: 'twinfury', tier: 1, name: 'TWIN FURY', weapons: ['dual'], req: { ricochet: 2, rapid: 2 }, minLevel: 7, hue: 'violet',
    desc: 'Alternating ricochet rounds that ping-pong through crowds.', benefits: ['+50% fire rate', '+2 ricochets', '+20% damage', 'Magenta rounds'],
    mod: w => { w.rate *= 1.5; w.dmg *= 1.2; w.ricoBonus = 2; w.trail = '#ff4fd8'; w.width = 3; } },
  { id: 'annihilator', tier: 1, name: 'ANNIHILATOR', weapons: ['heavy'], req: { heavy: 3, explosive: 2 }, minLevel: 7, hue: 'fire',
    desc: 'Armour-piercing rounds that detonate on impact.', benefits: ['Every round explodes', '+30% damage', 'Ignores 50% armour'],
    mod: w => { w.dmg *= 1.3; w.impactBoom = true; w.armorPen = 0.5; w.trail = '#ff9a1f'; w.width = 6; } },
  // alternative paths
  { id: 'inferno', tier: 1, name: 'INFERNO', weapons: ['smg', 'rifle', 'dual'], req: { incendiary: 3, explosive: 2 }, minLevel: 9, hue: 'fire',
    desc: 'Every round is a firebrand; kills erupt in flame.', benefits: ['All hits ignite (x2 burn)', 'Kills burst into fire', '+25% damage'],
    mod: w => { w.dmg *= 1.25; w.inferno = true; w.trail = '#ff5a1f'; w.width = 3.5; } },
  { id: 'cryocannon', tier: 1, name: 'CRYO CANNON', weapons: ['rifle', 'heavy'], req: { cryo: 3, pierce: 2 }, minLevel: 9, hue: 'ice',
    desc: 'Penetrating ice rounds that freeze and shatter targets.', benefits: ['+3 pierce', 'Heavy chill per hit', 'Frozen enemies shatter', '+40% damage'],
    mod: w => { w.dmg *= 1.4; w.pierce += 3; w.speed *= 1.3; w.cryoCannon = true; w.trail = '#a8e8ff'; w.width = 4; } },
  { id: 'thunderstrike', tier: 1, name: 'THUNDERSTRIKE', weapons: ['pistol', 'rifle'], req: { chain: 3, static: 2 }, minLevel: 9, hue: 'storm',
    desc: 'Every 4th shot is charged and erupts in lightning.', benefits: ['Charged shot every 4th round', 'x2 static gain', '+30% damage'],
    mod: w => { w.dmg *= 1.3; w.thunder = true; w.trail = '#9fd4ff'; w.width = 3.5; } },
  { id: 'phantom', tier: 1, name: 'PHANTOM ARSENAL', weapons: ['dual', 'smg'], req: { ghost: 2, crit: 2 }, minLevel: 9, hue: 'ghost',
    desc: 'Spectral echoes fight beside you, firing phantom rounds.', benefits: ['2 phantom gunners', 'Phantom shots seek', '+10% crit chance'],
    mod: w => { w.phantom = true; w.critBonus = (w.critBonus || 0) + 0.1; w.trail = '#c49bff'; w.width = 3; } },
  // tier II
  { id: 'apocalypse', tier: 2, from: 'hose', name: 'LEAD APOCALYPSE', req: { storm: 1, mag: 3 }, minLevel: 18, hue: 'gold',
    desc: 'Radial barrages erupt while the hose keeps pouring.', benefits: ['Radial barrage every 2.2s', '+15% fire rate'],
    mod: w => { w.rate *= 1.15; w.apocalypse = true; } },
  { id: 'worldbreaker', tier: 2, from: 'devastator', name: 'WORLD BREAKER', req: { calibre: 2, frag: 1 }, minLevel: 18, hue: 'fire',
    desc: 'Each blast sends a shockwave and shrapnel ahead.', benefits: ['Forward shockwave per shot', '4 fragments per shot', '+20% damage'],
    mod: w => { w.dmg *= 1.2; w.worldbreaker = true; } },
  { id: 'omega', tier: 2, from: 'railstorm', name: 'OMEGA RAILSTORM', req: { accel: 1, calibre: 1 }, minLevel: 18, hue: 'cyan',
    desc: 'Rails burn damaging energy trails into the street.', benefits: ['Damaging energy trails', '+4 pierce'],
    mod: w => { w.pierce += 4; w.omega = true; w.width = 5; } },
  { id: 'warrant', tier: 2, from: 'executioner', name: 'DEATH WARRANT', req: { execute: 2, discipline: 1 }, minLevel: 18, hue: 'red',
    desc: 'Critical kills prime your next shot for triple damage.', benefits: ['Crit kill = next shot x3', '+20% damage'],
    mod: w => { w.dmg *= 1.2; w.warrant = true; } },
  { id: 'massacre', tier: 2, from: 'twinfury', name: 'CHAIN MASSACRE', req: { ricochet: 3, marked: 1 }, minLevel: 18, hue: 'violet',
    desc: 'Ricochet kills spawn a fresh controlled ricochet chain.', benefits: ['Ricochet kills chain again', '+15% damage'],
    mod: w => { w.dmg *= 1.15; w.massacre = true; } },
  { id: 'armageddon', tier: 2, from: 'annihilator', name: 'ARMAGEDDON', req: { explosive: 4, calibre: 1 }, minLevel: 18, hue: 'fire',
    desc: 'Impact detonations become towering blasts.', benefits: ['x1.7 blast radius', 'x1.6 blast damage'],
    mod: w => { w.armageddon = true; } },
];
export const EVO = Object.fromEntries(EVOS.map(e => [e.id, e]));

export const SYNERGIES = [
  { id: 'hurricane', name: 'Lead Hurricane', req: { rapid: 2, multi: 2 }, desc: 'Every 12th shot releases a wide burst.' },
  { id: 'chainreact', name: 'Chain Reaction', req: { explosive: 2, ricochet: 1 }, desc: 'Explosions can launch seeking fragments.' },
  { id: 'thunderstorm', name: 'Thunderstorm', req: { chain: 2, static: 2 }, desc: 'Lightning strikes release extra electric pulses.' },
  { id: 'firestorm', name: 'Firestorm', req: { incendiary: 2, explosive: 2 }, desc: 'Explosions ignite everything they hit.' },
  { id: 'shatter', name: 'Cryo Shatter', req: { cryo: 2, heavy: 2 }, desc: 'Heavily chilled enemies shatter for bonus damage.' },
  { id: 'phantomrun', name: 'Phantom Runner', req: { ghost: 2, dashm: 2 }, desc: 'Dash decoys pulse with damaging shockwaves.' },
  { id: 'bloodrush', name: 'Blood Rush', req: { vamp: 2, adren: 2 }, desc: 'Kills boost speed and healing efficiency.' },
  { id: 'assault', name: 'Armoured Assault', req: { armor: 2, kinimpact: 2 }, desc: 'Dash collisions hit twice as hard.' },
  { id: 'tactprec', name: 'Tactical Precision', req: { precision: 2, crit: 2 }, desc: 'Consecutive hits raise critical damage.' },
  { id: 'army', name: 'Mechanical Army', req: { drone: 2, overdrive: 2 }, desc: 'Drones focus fire on one target, +25% damage.' },
  { id: 'bladestorm', name: 'Bladestorm', req: { blades: 3, orbital: 2 }, desc: 'Blades periodically lash out with energy arcs.' },
  { id: 'surgeon', name: 'Combat Surgeon', req: { medic: 2, trauma: 2 }, desc: 'Medkits also grant +25% fire rate.' },
  { id: 'scorched', name: 'Scorched Earth', req: { afterburn: 2, incendiary: 1 }, desc: 'Dash fire trails ignite enemies.' },
  { id: 'untouchable', name: 'Untouchable', req: { evade: 2, fleet: 2 }, desc: 'Dodges grant brief invulnerability and dash refunds.' },
];
export const SYN = Object.fromEntries(SYNERGIES.map(s => [s.id, s]));

export const ARCHETYPES = [
  { id: 'gunslinger', name: 'GUNSLINGER', desc: 'Precision, crits and finishing shots.', ups: ['crit', 'precision', 'discipline', 'execute', 'lastround', 'firststrike', 'hollow', 'marked'], weapons: ['pistol', 'dual'] },
  { id: 'berserker', name: 'BERSERKER', desc: 'Speed, close range and blood-fuelled healing.', ups: ['light', 'cqc', 'vamp', 'adren', 'kinimpact', 'momentum', 'rungun', 'laststand'], weapons: ['shotgun'] },
  { id: 'engineer', name: 'ENGINEER', desc: 'Drones, blades and energy tech.', ups: ['drone', 'overdrive', 'autotarget', 'blades', 'orbital', 'overclock', 'emp', 'reactive'], weapons: [] },
  { id: 'demolitionist', name: 'DEMOLITIONIST', desc: 'Explosions, shrapnel and area damage.', ups: ['explosive', 'frag', 'volatile', 'calibre', 'shock', 'storm'], weapons: ['heavy'] },
  { id: 'phantomA', name: 'PHANTOM', desc: 'Dashes, decoys and evasion.', ups: ['dashm', 'longd', 'ghost', 'phase', 'evade', 'fleet', 'slide', 'kinrec', 'secondwind'], weapons: [] },
  { id: 'elementalist', name: 'ELEMENTALIST', desc: 'Fire, ice and lightning.', ups: ['incendiary', 'cryo', 'static', 'chain', 'capacitor', 'volatile', 'afterburn'], weapons: [] },
  { id: 'survivor', name: 'SURVIVOR', desc: 'Armour, healing and staying power.', ups: ['armor', 'regen', 'fortified', 'ironwill', 'overheal', 'trauma', 'medic', 'firstaid'], weapons: [] },
];
export function archetypeOf(p) {
  let best = null, bs = 0;
  for (const a of ARCHETYPES) {
    let s = a.ups.reduce((t, id) => t + (p.upg[id] || 0), 0) + (a.weapons.includes(p.weapon) ? 2 : 0);
    if (s > bs) { bs = s; best = a; }
  }
  return bs >= 4 ? best : { id: 'rookie', name: 'ROOKIE', desc: 'Your build is still taking shape.' };
}
