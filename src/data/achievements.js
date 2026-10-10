// Achievements. Each has a metric(ctx) returning current progress and a target, so progress can be shown
// for locked achievements. ctx = { run, life, profile } (run is null outside a run).
const R = k => ctx => (ctx.run ? ctx.run[k] || 0 : 0);
const L = k => ctx => ctx.life[k] || 0;
export const ACHIEVEMENTS = [
  { id: 'first_blood', name: 'FIRST BLOOD', desc: 'Eliminate your first enemy.', target: 1, metric: L('kills'), credits: 25, icon: 'crit' },
  { id: 'centurion', name: 'CENTURION', desc: 'Eliminate 100 enemies in one run.', target: 100, metric: R('kills'), credits: 50, icon: 'multi' },
  { id: 'massacre', name: 'CITY CLEANER', desc: 'Eliminate 500 enemies in one run.', target: 500, metric: R('kills'), credits: 150, icon: 'storm' },
  { id: 'survivor', name: 'SURVIVOR', desc: 'Survive 10 minutes.', target: 600, metric: R('time'), credits: 100, icon: 'regen', fmt: 'time' },
  { id: 'urban_legend', name: 'URBAN LEGEND', desc: 'Survive 30 minutes in one run.', target: 1800, metric: R('time'), credits: 300, icon: 'star', fmt: 'time' },
  { id: 'unstoppable', name: 'UNSTOPPABLE', desc: 'Achieve a 50-kill streak.', target: 50, metric: R('streak'), credits: 150, icon: 'adrenaline' },
  { id: 'wave10', name: 'HOLDING THE LINE', desc: 'Reach wave 10.', target: 10, metric: R('wave'), credits: 75, icon: 'armor' },
  { id: 'wave20', name: 'LAST ONE STANDING', desc: 'Reach wave 20.', target: 20, metric: R('wave'), credits: 200, icon: 'fortified' },
  { id: 'arsenal_expert', name: 'ARSENAL EXPERT', desc: 'Use every base weapon.', target: 6, metric: ctx => Object.keys(ctx.life.weaponTime || {}).length, credits: 100, icon: 'gun' },
  { id: 'evolved', name: 'EVOLVED', desc: 'Unlock your first weapon evolution.', target: 1, metric: ctx => ctx.profile.discoveries.length, credits: 75, icon: 'star' },
  { id: 'tier_two', name: 'BEYOND LIMITS', desc: 'Unlock a Tier II evolution.', target: 1, metric: ctx => ctx.profile.discoveries.filter(d => ctx.tier2.includes(d)).length, credits: 150, icon: 'star' },
  { id: 'master_of_arms', name: 'MASTER OF ARMS', desc: 'Discover every primary evolution.', target: 10, metric: ctx => ctx.profile.discoveries.filter(d => ctx.tier1.includes(d)).length, credits: 300, icon: 'star' },
  { id: 'ironclad', name: 'IRONCLAD', desc: 'Take 1,500 damage in a single run.', target: 1500, metric: R('damageTaken'), credits: 100, icon: 'armor' },
  { id: 'demolition', name: 'DEMOLITION EXPERT', desc: 'Eliminate 100 enemies with explosives.', target: 100, metric: L('explosiveKills'), credits: 100, icon: 'boom' },
  { id: 'lightning_storm', name: 'LIGHTNING STORM', desc: 'Electrify 15 enemies within one second.', target: 15, metric: R('lightningBurst'), credits: 150, icon: 'bolt' },
  { id: 'field_engineer', name: 'FIELD ENGINEER', desc: 'Score 100 gadget-assisted eliminations.', target: 100, metric: L('gadgetKills'), credits: 100, icon: 'eq_turret' },
  { id: 'perfect_wave', name: 'PERFECT WAVE', desc: 'Complete a wave without taking damage.', target: 1, metric: R('perfectWaves'), credits: 75, icon: 'evade' },
  { id: 'boss_hunter', name: 'BOSS HUNTER', desc: 'Defeat a boss.', target: 1, metric: L('bossKills'), credits: 75, icon: 'execute' },
  { id: 'boss_trilogy', name: 'CITY LIBERATOR', desc: 'Defeat the Juggernaut, the Commander and the Engineer.', target: 3, metric: ctx => (ctx.life.bossTypes || []).length, credits: 250, icon: 'execute' },
  { id: 'synergist', name: 'SYNERGIST', desc: 'Unlock 3 synergies in one run.', target: 3, metric: R('synergies'), credits: 100, icon: 'synergy' },
  { id: 'gear_up', name: 'GEAR UP', desc: 'Open an equipment crate.', target: 1, metric: L('crates'), credits: 50, icon: 'crate' },
  { id: 'legendary_gear', name: 'LEGENDARY', desc: 'Raise a piece of equipment to Legendary.', target: 1, metric: R('legendary'), credits: 150, icon: 'star' },
  { id: 'collector', name: 'COLLECTOR', desc: 'Unlock 12 pieces of equipment.', target: 12, metric: ctx => ctx.profile.unlocked.equipment.length, credits: 150, icon: 'eq_kevlar' },
  { id: 'medic', name: 'COMBAT MEDIC', desc: 'Restore 500 HP in one run.', target: 500, metric: R('healed'), credits: 75, icon: 'heal' },
  { id: 'daily_op', name: 'DAILY OPERATIVE', desc: 'Survive 5 minutes in a Daily Operation.', target: 1, metric: L('dailyDone'), credits: 100, icon: 'calendar' },
  { id: 'hardcore_hero', name: 'HARDCORE HERO', desc: 'Reach wave 10 in Hardcore.', target: 10, metric: ctx => (ctx.run && ctx.run.mode === 'hardcore' ? ctx.run.wave : 0), credits: 250, icon: 'skullfire' },
  { id: 'objective_ace', name: 'MISSION FOCUSED', desc: 'Complete 3 objectives in one run.', target: 3, metric: R('objectives'), credits: 100, icon: 'marked' },
  { id: 'untouchable', name: 'GHOST', desc: 'Dash through 100 enemy attacks.', target: 100, metric: L('avoided'), credits: 75, icon: 'ghost' },
  { id: 'maxed_out', name: 'FULLY LOADED', desc: 'Max out 10 upgrades in one run.', target: 10, metric: R('maxed'), credits: 150, icon: 'mag' },
  { id: 'fashion', name: 'STREET STYLE', desc: 'Customise your character.', target: 1, metric: L('lookChanged'), credits: 25, icon: 'boot' },
  { id: 'career10', name: 'MADE OPERATIVE', desc: 'Reach career level 10.', target: 10, metric: ctx => ctx.profile.career.level, credits: 100, icon: 'star' },
  { id: 'career25', name: 'SEASONED', desc: 'Reach career level 25.', target: 25, metric: ctx => ctx.profile.career.level, credits: 250, icon: 'star' },
];
export const ACH = Object.fromEntries(ACHIEVEMENTS.map(a => [a.id, a]));
