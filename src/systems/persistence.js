// Versioned save format, v2 -> v3 migration, validation, export/import. Storage access is injected
// (read/write functions) so this module is testable without a browser.
import { sanitizeSettings } from '../core/settings.js';
import { sanitizeLook } from '../data/cosmetics.js';
import { newProfile, sanitizeProfile } from './profiles.js';
import { WEAPONS } from '../data/weapons.js';
import { EVO } from '../data/evolutions.js';

export const SAVE_KEY = 'uc3_save';
export const SCHEMA = 3;
export const V2_KEYS = ['uc_settings', 'uc_muted', 'uc_look', 'uc_disc', 'uc_stats', 'uc_best'];

export function emptySave() {
  return { schema: SCHEMA, created: Date.now(), activeId: null, profiles: {}, settings: sanitizeSettings({}), meta: { migratedFromV2: false } };
}
const parse = raw => { if (raw === null || raw === undefined) return undefined; try { return JSON.parse(raw); } catch (e) { return undefined; } };

// Build a v3 save from v2's scattered localStorage keys. Returns null when there is no v2 data.
export function migrateV2(read) {
  const vals = {}; let any = false;
  for (const k of V2_KEYS) { vals[k] = parse(read(k)); if (vals[k] !== undefined && vals[k] !== null) any = true; }
  if (!any) return null;
  const save = emptySave();
  const s2 = vals.uc_settings || {};
  save.settings = sanitizeSettings({ master: s2.volume, shake: s2.shake, dmgNums: s2.dmgNums, comic: s2.comic, muted: vals.uc_muted === true });
  const p = newProfile('Operator');
  p.needsName = true;                                   // ask the returning player for a callsign
  p.look = sanitizeLook(vals.uc_look);
  p.discoveries = Array.isArray(vals.uc_disc) ? vals.uc_disc.filter(id => EVO[id]) : [];
  const st = vals.uc_stats || {};
  const n = (x) => (typeof x === 'number' && isFinite(x) && x >= 0 ? x : 0);
  Object.assign(p.life, { kills: n(st.kills), deaths: n(st.deaths), runs: n(st.runs), xp: n(st.xp), damage: n(st.damage) });
  if (st.weaponTime && typeof st.weaponTime === 'object') for (const w in st.weaponTime) if (WEAPONS[w]) p.life.weaponTime[w] = n(st.weaponTime[w]);
  const best = vals.uc_best || {};
  p.records = { longest: Math.max(n(st.longest), n(best.time)), wave: Math.max(n(st.wave), n(best.wave)), level: Math.max(n(st.level), n(best.level)), streak: n(st.streak), kills: n(best.kills), score: 0 };
  save.profiles[p.id] = p; save.activeId = p.id; save.meta.migratedFromV2 = true;
  return save;
}

// Validate an untrusted save object. Returns { save, issues }; never throws.
export function sanitizeSave(raw) {
  const issues = [];
  if (!raw || typeof raw !== 'object') return { save: emptySave(), issues: ['Save data was unreadable and has been reset.'] };
  const save = emptySave();
  save.created = typeof raw.created === 'number' ? raw.created : Date.now();
  save.settings = sanitizeSettings(raw.settings || {});
  if (typeof raw.schema === 'number' && raw.schema > SCHEMA) issues.push('This save comes from a newer version; unknown data was ignored.');
  for (const id in (raw.profiles || {})) {
    const p = sanitizeProfile(raw.profiles[id]);
    save.profiles[p.id] = p;
  }
  save.activeId = save.profiles[raw.activeId] ? raw.activeId : (Object.keys(save.profiles)[0] || null);
  save.meta = { migratedFromV2: !!(raw.meta && raw.meta.migratedFromV2) };
  return { save, issues };
}

// Load order: v3 save -> (corrupt? keep a backup copy) -> v2 migration -> empty.
export function loadSave(read, write) {
  const raw = read(SAVE_KEY);
  if (raw !== null && raw !== undefined) {
    const obj = parse(raw);
    if (obj && typeof obj === 'object') return { ...sanitizeSave(obj), source: 'v3' };
    write(SAVE_KEY + '_corrupt_' + Date.now(), raw);   // never silently destroy a player's data
    const m = migrateV2(read);
    return { save: m || emptySave(), issues: ['Your save could not be read. A backup copy was kept and progress was restored where possible.'], source: m ? 'v2' : 'empty' };
  }
  const m = migrateV2(read);
  if (m) return { save: m, issues: [], source: 'v2' };
  return { save: emptySave(), issues: [], source: 'empty' };
}

const fnv = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16); };
export function exportSave(save) {
  const body = JSON.stringify(save);
  return JSON.stringify({ format: 'urban-combat-save', schema: SCHEMA, exportedAt: new Date().toISOString(), checksum: fnv(body), save });
}
// Returns { ok, save, error }. The checksum catches accidental damage (it is not tamper-proof).
export function importSave(text) {
  let obj;
  try { obj = JSON.parse(text); } catch (e) { return { ok: false, error: 'That file is not a valid Urban Combat save (not JSON).' }; }
  if (!obj || obj.format !== 'urban-combat-save' || !obj.save) return { ok: false, error: 'That file is not an Urban Combat save export.' };
  if (obj.checksum && fnv(JSON.stringify(obj.save)) !== obj.checksum) return { ok: false, error: 'The save file is damaged (checksum mismatch).' };
  const { save, issues } = sanitizeSave(obj.save);
  if (!Object.keys(save.profiles).length) return { ok: false, error: 'The save file contains no profiles.' };
  return { ok: true, save, issues };
}
