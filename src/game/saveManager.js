// Runtime save manager: owns the loaded save, writes it (debounced, failure-tolerant) and exposes profile ops.
import { G } from '../core/registry.js';
import { readRaw, writeRaw, removeKey, storageAvailable } from '../core/storage.js';
import { Settings, applySettings, sanitizeSettings } from '../core/settings.js';
import { loadSave, emptySave, exportSave, importSave, SAVE_KEY } from '../systems/persistence.js';
import { newProfile, validateUsername, purchase } from '../systems/profiles.js';
import { applyRunRewards } from '../systems/career.js';
import { Achievements } from '../systems/achievements.js';
import { EQ } from '../data/equipment.js';
import { WEAPON_COST } from '../data/weapons.js';

export const Save = {
  data: null, issues: [], source: 'empty', dirty: false, timer: null, warned: false,
  load() {
    const r = loadSave(readRaw, writeRaw);
    this.data = r.save; this.issues = r.issues; this.source = r.source;
    applySettings(this.data.settings);
    if (r.source === 'v2') this.flush();          // persist the migrated save straight away
    return r;
  },
  profile() { return this.data && this.data.profiles[this.data.activeId] || null; },
  profiles() { return Object.values(this.data.profiles); },
  markDirty() { this.dirty = true; if (!this.timer) this.timer = setTimeout(() => { this.timer = null; this.flush(); }, 400); },
  flush() {
    if (!this.data) return;
    clearTimeout(this.timer); this.timer = null; this.dirty = false;
    let ok = false;
    try { ok = writeRaw(SAVE_KEY, JSON.stringify(this.data)); } catch (e) { ok = false; }
    if (!ok && !this.warned) { this.warned = true; G.ui && G.ui.toast("Progress can't be saved in this browser mode (storage is blocked).", '#ff3b4e', 6); }
    return ok;
  },
  setSettings(next) { applySettings({ ...Settings, ...next }); this.data.settings = sanitizeSettings(Settings); this.markDirty(); },
  takenNames(exceptId) { return this.profiles().filter(p => p.id !== exceptId && !p.guest).map(p => p.name); },
  createProfile(name) {
    const v = validateUsername(name, this.takenNames());
    if (!v.ok) return v;
    const p = newProfile(v.name);
    this.data.profiles[p.id] = p; this.data.activeId = p.id; this.flush();
    return { ok: true, profile: p };
  },
  // Guest play keeps progress on a local guest profile (one per device) until it is given a callsign.
  useGuest() {
    let g = this.profiles().find(p => p.guest);
    if (!g) { g = newProfile('Guest', true); this.data.profiles[g.id] = g; }
    this.data.activeId = g.id; this.flush();
    return g;
  },
  rename(name) {
    const p = this.profile(); if (!p) return { ok: false, error: 'No active profile.' };
    const v = validateUsername(name, this.takenNames(p.id));
    if (!v.ok) return v;
    p.name = v.name; p.guest = false; p.needsName = false; this.flush();
    return { ok: true };
  },
  switchTo(id) { if (this.data.profiles[id]) { this.data.activeId = id; this.flush(); return true; } return false; },
  deleteProfile(id) {
    if (!this.data.profiles[id]) return false;
    delete this.data.profiles[id];
    if (this.data.activeId === id) this.data.activeId = Object.keys(this.data.profiles)[0] || null;
    this.flush(); return true;
  },
  // Rewards are applied once per run id (career.applyRunRewards is idempotent), then saved immediately.
  finishRun(run) {
    const p = this.profile(); if (!p) return null;
    const res = applyRunRewards(p, run);
    const ach = Achievements.check(p, run);
    this.flush();
    return { ...res, achievements: ach };
  },
  buy(kind, id) {
    const p = this.profile();
    const cost = kind === 'weapon' ? WEAPON_COST[id] : EQ[id].cost, minCareer = kind === 'weapon' ? 1 : EQ[id].minCareer;
    const r = purchase(p, kind, id, cost, minCareer);
    if (r.ok) { Achievements.check(p, null); this.flush(); }
    return r;
  },
  exportText() { return exportSave(this.data); },
  importText(text) {
    const r = importSave(text);
    if (!r.ok) return r;
    this.data = r.save; applySettings(this.data.settings); this.flush();
    return r;
  },
  resetAll() { removeKey(SAVE_KEY); this.data = emptySave(); applySettings(this.data.settings); this.flush(); },
  storageOk: () => storageAvailable(),
};
window.addEventListener('pagehide', () => { if (Save.dirty) Save.flush(); });
