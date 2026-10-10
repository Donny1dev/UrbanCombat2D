// Equipment catalogue: 3 slots × 8 items. Every number lives here so the runtime and tests share it.
// Each item: v(key, rank) reads a per-rank value; rank 3 adds a mechanic; rarity perks add functionality.
export const SLOTS = ['armour', 'gadget', 'support'];
export const SLOT_NAMES = { armour: 'Armour', gadget: 'Tactical Gadget', support: 'Support' };
export const RARITIES = ['common', 'rare', 'epic', 'legendary'];
export const RARITY_COL = { common: '#c8ccd8', rare: '#3d9bff', epic: '#b46bff', legendary: '#ffc93c' };
export const rarityIdx = r => Math.max(0, RARITIES.indexOf(r));
export const atLeast = (have, want) => rarityIdx(have) >= rarityIdx(want);

const E = (id, slot, name, o) => Object.assign({ id, slot, name, icon: 'eq_' + id, cost: 0, minCareer: 1, active: slot !== 'armour' }, o);
export const EQUIPMENT = [
  // ---------------- ARMOUR (passive) ----------------
  E('kevlar', 'armour', 'Kevlar Vest', { desc: 'Soaks incoming bullets.', vals: { ranged: [0.88, 0.82, 0.76] },
    ranks: ['-12% bullet damage', '-18% bullet damage', '-24% bullet damage · 20% chance to fully stop a bullet'],
    perks: ['', '+10 max HP', 'Also -10% melee damage', 'Stopped bullets ricochet back at enemies'] }),
  E('carrier', 'armour', 'Lightweight Carrier', { desc: 'Speed first, with modest protection.', vals: { move: [0.08, 0.12, 0.16], taken: [0.94, 0.92, 0.9] },
    ranks: ['+8% speed · -6% damage', '+12% speed · -8% damage', '+16% speed · -10% damage · dash cooldown -10%'],
    perks: ['', '+5% move speed', '+5% dodge chance', 'Dash invulnerability +0.15s'] }),
  E('ceramic', 'armour', 'Ceramic Plating', { cost: 200, desc: 'Blunts heavy hits (15+ damage).', vals: { big: [0.8, 0.72, 0.64] },
    ranks: ['-20% damage from heavy hits', '-28% damage from heavy hits', '-36% heavy hits · plate negates one heavy hit every 20s'],
    perks: ['', '+15 max HP', 'Melee attackers are knocked back', 'Heavy hits release a shockwave (4s cooldown)'] }),
  E('reactiveA', 'armour', 'Reactive Armour', { cost: 300, minCareer: 3, desc: 'Erupts in a shockwave when you are hit.', vals: { radius: [110, 140, 170], dmg: [25, 40, 55], cd: [6, 5, 4] },
    ranks: ['110px blast · 25 dmg · 6s', '140px blast · 40 dmg · 5s', '170px · 55 dmg · 4s · stuns gunmen 0.8s'],
    perks: ['', '-5% damage taken', 'Blast destroys enemy bullets', 'Heals 2 HP per enemy hit (max 12)'] }),
  E('helmet', 'armour', 'Ballistic Helmet', { cost: 250, desc: 'Cuts high-impact damage from elites and bosses.', vals: { elite: [0.85, 0.78, 0.7] },
    ranks: ['-15% elite/boss damage · half knockback', '-22% elite/boss damage · half knockback', '-30% · no single hit exceeds 35% max HP (30s)'],
    perks: ['', '+10 max HP', '-50% explosion damage', 'Capped hits grant 1.5s invulnerability'] }),
  E('harness', 'armour', 'Adrenaline Harness', { cost: 300, minCareer: 4, desc: 'Turns low health into speed.', vals: { bonus: [0.15, 0.22, 0.3] },
    ranks: ['Below 40% HP: +15% speed & reload', 'Below 40% HP: +22% speed & reload', '+30% speed & reload · +15% fire rate when low'],
    perks: ['', 'Triggers below 50% HP', 'Dropping low grants 1s invulnerability (30s)', 'Kills while low heal 2 HP'] }),
  E('eshield', 'armour', 'Energy Shield', { cost: 450, minCareer: 6, desc: 'A recharging shield layer over your health.', vals: { cap: [20, 30, 40], delay: [4, 3.5, 3], rate: [10, 14, 18] },
    ranks: ['20 shield · recharges after 4s', '30 shield · recharges after 3.5s', '40 shield · 3s · breaking emits an EMP pulse'],
    perks: ['', '+10 shield capacity', 'Recharge starts 1s sooner', '+10% damage while shield is full'] }),
  E('juggernaut', 'armour', 'Juggernaut Rig', { cost: 500, minCareer: 8, desc: 'Heavy protection that slows you down.', vals: { taken: [0.8, 0.73, 0.66], slow: [0.1, 0.1, 0.06] },
    ranks: ['-20% damage · -10% speed', '-27% damage · -10% speed', '-34% damage · -6% speed · no knockback, melee attackers take 15'],
    perks: ['', '+20 max HP', 'You shove crowds aside', 'Dashes become 60-damage shoulder charges'] }),
  // ---------------- TACTICAL GADGETS (Q) ----------------
  E('frag', 'gadget', 'Frag Grenade', { desc: 'Thrown toward the cursor; detonates after a short fuse.', vals: { cd: [9, 8, 7], dmg: [90, 130, 170], radius: [120, 135, 150] },
    ranks: ['90 dmg · 9s', '130 dmg · 8s', '170 dmg · 7s · 2 charges'],
    perks: ['', '+15% blast radius', 'Sticks to the first enemy it touches', 'Leaves burning ground'] }),
  E('emp', 'gadget', 'EMP Grenade', { cost: 250, minCareer: 2, desc: 'Jams gunmen and slows everything caught in it.', vals: { cd: [12, 11, 10], radius: [170, 190, 210], stun: [2, 2.5, 3], dmg: [30, 45, 60] },
    ranks: ['Jams gunmen 2s · 12s', 'Jams gunmen 2.5s · 11s', 'Jams 3s · 10s · erases enemy bullets'],
    perks: ['', '+20% radius', 'EMP-tagged enemies take +20% damage', 'Also stuns melee 1s and pulses twice'] }),
  E('mine', 'gadget', 'Proximity Mine', { cost: 200, desc: 'Drop a mine that blows when enemies get close.', vals: { cd: [6, 5, 4], dmg: [120, 160, 200], max: [3, 3, 5] },
    ranks: ['120 dmg · 3 mines · 6s', '160 dmg · 3 mines · 5s', '200 dmg · 5 mines · 4s'],
    perks: ['', 'Arms almost instantly', 'Pulls enemies in before detonating', 'First blast scatters 3 mini-mines'] }),
  E('turret', 'gadget', 'Portable Turret', { cost: 500, minCareer: 7, desc: 'Deploy an automated gun at the cursor.', vals: { cd: [18, 16, 14], dur: [10, 12, 14], dmg: [14, 18, 22], max: [1, 1, 2] },
    ranks: ['10s turret · 14 dmg', '12s turret · 18 dmg', '14s · 22 dmg · up to 2 turrets'],
    perks: ['', 'Faster targeting and fire', 'Piercing rounds', 'Rotating suppression burst every 3s'] }),
  E('decoy', 'gadget', 'Decoy Projector', { cost: 350, minCareer: 4, desc: 'A hologram that draws enemy attention.', vals: { cd: [14, 12, 10], dur: [5, 6, 7], hp: [200, 280, 360] },
    ranks: ['5s decoy', '6s decoy', '7s decoy · explodes when it ends'],
    perks: ['', '+25% lure radius', 'Decoy shoots back', 'Projects two decoys'] }),
  E('shock', 'gadget', 'Shock Pulse', { cost: 300, minCareer: 3, desc: 'An instant electric blast around you.', vals: { cd: [8, 7, 6], radius: [150, 175, 200], dmg: [50, 75, 100] },
    ranks: ['150px · 50 dmg · 8s', '175px · 75 dmg · 7s', '200px · 100 dmg · 6s · arcs to 3 more enemies'],
    perks: ['', '+40% knockback', '0.5s invulnerability on use', 'A second pulse follows'] }),
  E('cluster', 'gadget', 'Cluster Grenade', { cost: 400, minCareer: 5, desc: 'Bursts into a spray of bomblets.', vals: { cd: [13, 12, 11], dmg: [70, 90, 110], bomblets: [5, 5, 5] },
    ranks: ['70 dmg + 5 bomblets', '90 dmg + 5 bomblets', '110 dmg · bomblets bounce wider'],
    perks: ['', '+1 bomblet', 'Bomblets ignite', 'Bomblets seek enemies'] }),
  E('stim', 'gadget', 'Tactical Stim', { desc: 'A burst of speed, reload and fire rate.', vals: { cd: [20, 18, 16], dur: [5, 6, 7] },
    ranks: ['5s boost · 20s', '6s boost · 18s', '7s · 16s · heals 10% on use'],
    perks: ['', '+1s duration', 'Resets dash; dash cooldown halved while active', 'Kills extend it (up to +4s)'] }),
  // ---------------- SUPPORT (E) ----------------
  E('injector', 'support', 'Field Med Injector', { desc: 'Instant heal on a cooldown.', vals: { cd: [25, 22, 18], heal: [20, 28, 36] },
    ranks: ['+20 HP · 25s', '+28 HP · 22s', '+36 HP · 18s · then 5 HP/s for 3s'],
    perks: ['', '+10% healing', '2s of -30% damage taken', '2 charges'] }),
  E('resupply', 'support', 'Ammo Resupply', { desc: 'Instantly refills your magazine.', vals: { cd: [14, 12, 10] },
    ranks: ['Refill + faster reloads 6s · 14s', 'Refill + faster reloads 6s · 12s', '10s · +15% damage for 6s'],
    perks: ['', 'Buffs last 2s longer', '3s of infinite ammo', 'Fires automatically instead of a reload'] }),
  E('recon', 'support', 'Recon Pulse', { cost: 200, desc: 'Marks enemies so they take extra damage.', vals: { cd: [15, 13, 11], bonus: [0.1, 0.15, 0.2] },
    ranks: ['Marked +10% damage taken', 'Marked +15% damage taken', '+20% · reveals medkits & crates 15s'],
    perks: ['', '+30% scan radius', 'Marked elites and bosses are slowed', 'Pulses automatically every 20s'] }),
  E('projector', 'support', 'Shield Projector', { cost: 400, minCareer: 5, desc: 'A bubble that stops enemy bullets.', vals: { cd: [20, 18, 16], dur: [4, 5, 6] },
    ranks: ['4s bubble', '5s bubble', '6s bubble · reflects bullets'],
    perks: ['', '+20% bubble size', 'Enemies inside are slowed', 'Bubble follows you'] }),
  E('beacon', 'support', 'Combat Drone Beacon', { cost: 500, minCareer: 8, desc: 'Calls in a temporary attack drone.', vals: { cd: [22, 20, 18], dur: [12, 15, 18] },
    ranks: ['12s drone', '15s drone', '18s · two drones'],
    perks: ['', '+30% drone fire rate', 'Explosive drone rounds', 'Drones last twice as long'] }),
  E('scanner', 'support', 'Supply Scanner', { cost: 250, minCareer: 3, active: false, desc: 'Passive: finds medkits, crates and drops.', vals: { drop: [1.15, 1.25, 1.35] },
    ranks: ['Map-wide pickup markers · +15% medkit drops', '+25% medkit drops', '+35% · equipment crates offer 4 choices'],
    perks: ['', '+20% XP pickup radius', 'Medkits heal 20% more', 'An extra equipment crate every 6 waves'] }),
  E('barrier', 'support', 'Emergency Barrier', { cost: 400, minCareer: 6, desc: 'Drops a wall of cover where you aim.', vals: { cd: [18, 16, 14], dur: [8, 10, 12], hp: [300, 450, 600] },
    ranks: ['8s cover · 300 HP', '10s cover · 450 HP', '12s · 600 HP · pulses when it falls'],
    perks: ['', '+30% barrier HP', 'Enemies touching it take damage', 'Auto-deploys below 30% HP (60s)'] }),
  E('booster', 'support', 'Kinetic Booster', { cost: 250, minCareer: 2, desc: 'Supercharges your dash and speed.', vals: { cd: [18, 16, 14], dur: [6, 7, 8] },
    ranks: ['6s: dash cooldown halved, +20% speed', '7s boost', '8s · refreshes your dash instantly'],
    perks: ['', '+1s duration', 'Dashes deal 40 impact damage', '+15% fire rate while boosted'] }),
];
export const EQ = Object.fromEntries(EQUIPMENT.map(e => [e.id, e]));
export const STARTER = ['kevlar', 'carrier', 'frag', 'stim', 'injector', 'resupply'];
export const DEFAULT_LOADOUT = { weapon: 'pistol', armour: 'kevlar', gadget: 'frag', support: 'injector' };
// per-rank value lookup (rank 1..3)
export const v = (id, key, rank) => { const a = EQ[id].vals[key]; return a ? a[Math.max(0, Math.min(2, rank - 1))] : 0; };
export function isValidLoadout(l) {
  return !!l && SLOTS.every(s => EQ[l[s]] && EQ[l[s]].slot === s);
}
export const slotOf = id => (EQ[id] ? EQ[id].slot : null);

export const EQ_SYNERGIES = [
  { id: 'eq_regenshield', eq: 'eshield', upg: 'regen', name: 'Regenerative Field', desc: 'Avoiding damage instantly restarts shield recharge.' },
  { id: 'eq_netwar', eq: 'turret', upg: 'drone', name: 'Network Warfare', desc: 'Turrets and drones share targets and deal +15% damage.' },
  { id: 'eq_overload', eq: 'emp', upg: 'chain', name: 'Overload', desc: 'EMP-tagged enemies take +60% chain-lightning damage.' },
  { id: 'eq_shrapnel', eq: 'frag', upg: 'explosive', name: 'Shrapnel', desc: 'Grenade blasts release 4 fragments.' },
  { id: 'eq_rush', eq: 'stim', upg: 'adren', name: 'Combat Rush', desc: 'Kills extend your stim by 0.25s (up to +3s).' },
  { id: 'eq_bulwark', eq: 'projector', upg: 'armor', name: 'Bulwark', desc: 'Every 40 damage the bubble absorbs releases a pulse.' },
  { id: 'eq_napalm', eq: 'mine', upg: 'incendiary', name: 'Napalm Mines', desc: 'Mine blasts set enemies on fire.' },
  { id: 'eq_phantom', eq: 'decoy', upg: 'ghost', name: 'Phantom Projection', desc: 'Decoys release damaging pulses when they end.' },
];
