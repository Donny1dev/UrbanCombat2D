// Local player profiles: username validation, creation and sanitising. Pure.
import { uid } from '../core/util.js';
import { LOOK_DEFAULT, sanitizeLook } from '../data/cosmetics.js';
import { EQ, STARTER, DEFAULT_LOADOUT, isValidLoadout } from '../data/equipment.js';
import { WEAPONS } from '../data/weapons.js';
import { EVO } from '../data/evolutions.js';
import { ACH } from '../data/achievements.js';
import { FRAMES } from '../data/progression.js';

const RESERVED = ['admin', 'administrator', 'moderator', 'mod', 'guest', 'system', 'null', 'undefined', 'root', 'support', 'staff', 'official', 'server', 'urbancombat', 'developer', 'dev', 'anonymous'];
// Small built-in filter for obvious slurs/obscenities (checked after normalising common letter swaps).
const BLOCKED = ['fuck', 'shit', 'cunt', 'nigg', 'fag', 'retard', 'whore', 'slut', 'nazi', 'hitler', 'rape', 'dick', 'cock', 'pussy', 'bitch', 'kkk', 'penis', 'vagina'];
const normalise = s => s.toLowerCase().replace(/0/g, 'o').replace(/1/g, 'i').replace(/3/g, 'e').replace(/4/g, 'a').replace(/5/g, 's').replace(/7/g, 't').replace(/_/g, '');
// Returns { ok, name, error }. Uniqueness is only checked against profiles on this device.
export function validateUsername(raw, takenNames = []) {
  const name = String(raw ?? '').trim();
  if (name.length < 3) return { ok: false, error: 'Callsigns need at least 3 characters.' };
  if (name.length > 18) return { ok: false, error: 'Callsigns can be at most 18 characters.' };
  if (!/^[A-Za-z0-9_]+$/.test(name)) return { ok: false, error: 'Use only letters, numbers and underscores.' };
  const low = name.toLowerCase();
  if (RESERVED.includes(low)) return { ok: false, error: 'That callsign is reserved. Pick another.' };
  const n = normalise(name);
  if (BLOCKED.some(b => n.includes(b))) return { ok: false, error: "That callsign isn't allowed. Pick another." };
  if (takenNames.some(t => String(t).toLowerCase() === low)) return { ok: false, error: 'Another profile on this device already uses that callsign.' };
  return { ok: true, name };
}

export function freshLife() {
  return { kills: 0, deaths: 0, runs: 0, xp: 0, damage: 0, weaponTime: {}, explosiveKills: 0, gadgetKills: 0, bossKills: 0, bossTypes: [], crates: 0, avoided: 0, dailyDone: 0, lookChanged: 0, healed: 0 };
}
export function newProfile(name, guest = false) {
  return {
    id: 'P' + uid(), name: guest ? 'Guest' : name, guest, createdAt: Date.now(),
    look: { ...LOOK_DEFAULT }, loadout: { ...DEFAULT_LOADOUT },
    unlocked: { equipment: [...STARTER], weapons: ['pistol', 'smg'] },
    discoveries: [], life: freshLife(),
    records: { longest: 0, wave: 0, level: 0, streak: 0, kills: 0, score: 0 },
    runs: [], achievements: {}, career: { level: 1, xp: 0 }, credits: 0, frame: 'none',
    tutorialDone: false, lastRewardedRun: null, needsName: false,
  };
}
const num = (v, d = 0) => (typeof v === 'number' && isFinite(v) && v >= 0 ? v : d);
const arr = v => (Array.isArray(v) ? v : []);
// Fill in defaults and drop anything invalid. Never throws; unknown ids are discarded rather than crashing.
export function sanitizeProfile(raw) {
  const base = newProfile('Guest', true);
  if (!raw || typeof raw !== 'object') return base;
  const p = base;
  p.id = typeof raw.id === 'string' && raw.id ? raw.id : base.id;
  p.guest = raw.guest === true;
  p.name = typeof raw.name === 'string' && raw.name ? raw.name.slice(0, 18) : (p.guest ? 'Guest' : 'Operator');
  p.needsName = raw.needsName === true;
  p.createdAt = num(raw.createdAt, Date.now());
  p.look = sanitizeLook(raw.look);
  p.loadout = isValidLoadout(raw.loadout) && WEAPONS[raw.loadout.weapon] ? { ...raw.loadout } : { ...DEFAULT_LOADOUT };
  const un = raw.unlocked || {};
  p.unlocked.equipment = [...new Set([...STARTER, ...arr(un.equipment).filter(id => EQ[id])])];
  p.unlocked.weapons = [...new Set(['pistol', 'smg', ...arr(un.weapons).filter(w => WEAPONS[w])])];
  if (!p.unlocked.weapons.includes(p.loadout.weapon)) p.loadout.weapon = 'pistol';
  for (const s of ['armour', 'gadget', 'support']) if (!p.unlocked.equipment.includes(p.loadout[s])) p.loadout[s] = DEFAULT_LOADOUT[s];
  p.discoveries = [...new Set(arr(raw.discoveries).filter(id => EVO[id]))];
  const L = raw.life || {};
  for (const k in p.life) {
    if (k === 'weaponTime') { const wt = {}; for (const w in (L.weaponTime || {})) if (WEAPONS[w]) wt[w] = num(L.weaponTime[w]); p.life.weaponTime = wt; }
    else if (k === 'bossTypes') p.life.bossTypes = arr(L.bossTypes).filter(x => typeof x === 'string');
    else p.life[k] = num(L[k]);
  }
  const Rr = raw.records || {};
  for (const k in p.records) p.records[k] = num(Rr[k]);
  p.runs = arr(raw.runs).filter(r => r && typeof r === 'object' && typeof r.score === 'number').slice(-150);
  p.achievements = {};
  for (const id in (raw.achievements || {})) if (ACH[id]) p.achievements[id] = num(raw.achievements[id], Date.now());
  p.career = { level: Math.max(1, Math.floor(num(raw.career && raw.career.level, 1))), xp: num(raw.career && raw.career.xp) };
  p.credits = Math.floor(num(raw.credits));
  p.frame = FRAMES.some(f => f.id === raw.frame) ? raw.frame : 'none';
  p.tutorialDone = raw.tutorialDone === true;
  p.lastRewardedRun = typeof raw.lastRewardedRun === 'string' ? raw.lastRewardedRun : null;
  return p;
}
// Spend Supply Credits on an unlock. Returns { ok, error }.
export function purchase(profile, kind, id, cost, minCareer = 1) {
  const list = kind === 'weapon' ? profile.unlocked.weapons : profile.unlocked.equipment;
  if (list.includes(id)) return { ok: false, error: 'Already unlocked.' };
  if (profile.career.level < minCareer) return { ok: false, error: `Requires career level ${minCareer}.` };
  if (profile.credits < cost) return { ok: false, error: `Needs ${cost - profile.credits} more Supply Credits.` };
  profile.credits -= cost; list.push(id);
  return { ok: true };
}
