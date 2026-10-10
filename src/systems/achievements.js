// Achievement tracking. Lifetime counters are combined with the current run so unlocks happen mid-run.
import { G } from '../core/registry.js';
import { Sound } from '../core/audio.js';
import { ACHIEVEMENTS } from '../data/achievements.js';
import { EVOS } from '../data/evolutions.js';

const TIER1 = EVOS.filter(e => e.tier === 1).map(e => e.id), TIER2 = EVOS.filter(e => e.tier === 2).map(e => e.id);
const SUM = ['kills', 'explosiveKills', 'gadgetKills', 'crates', 'avoided'];
export function achievementCtx(profile, run) {
  const life = { ...profile.life };
  if (run) {
    for (const k of SUM) life[k] = (life[k] || 0) + (run[k] || 0);
    life.bossKills = (life.bossKills || 0) + (run.bosses || 0);
    life.bossTypes = [...new Set([...(life.bossTypes || []), ...(run.bossTypes || [])])];
    life.weaponTime = { ...(life.weaponTime || {}) }; for (const w in run.weaponTime || {}) life.weaponTime[w] = (life.weaponTime[w] || 0) + run.weaponTime[w];
    if (run.mode === 'daily' && run.time >= 300) life.dailyDone = (life.dailyDone || 0) + 1;
  }
  return { run, life, profile, tier1: TIER1, tier2: TIER2 };
}
export const Achievements = {
  queue: [],
  // Returns newly unlocked achievements; grants their credits immediately.
  check(profile, run) {
    if (!profile || (run && run.mode === 'training')) return [];
    const ctx = achievementCtx(profile, run), fresh = [];
    for (const a of ACHIEVEMENTS) {
      if (profile.achievements[a.id]) continue;
      let val = 0; try { val = a.metric(ctx); } catch (e) { continue; }
      if (val >= a.target) { profile.achievements[a.id] = Date.now(); profile.credits += a.credits; fresh.push(a); }
    }
    if (fresh.length) {
      for (const a of fresh) { this.queue.push(a); if (run) run.achievements.push(a.id); }
      Sound.achievement(); G.save && G.save.markDirty();
    }
    return fresh;
  },
  progress(profile, a) {
    let val = 0; try { val = a.metric(achievementCtx(profile, null)); } catch (e) { }
    return Math.min(1, val / a.target);
  },
};
