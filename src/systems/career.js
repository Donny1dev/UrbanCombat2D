// Applies a finished run to a profile: career XP, Supply Credits, lifetime stats, records and the local
// run history. Idempotent per run id so a crash/double-submit can never grant rewards twice. Pure.
import { addCareerXp, runRewards, runScore } from '../data/progression.js';

export function applyRunRewards(profile, run) {
  if (!run || !run.id) return { applied: false, reason: 'invalid' };
  if (profile.lastRewardedRun === run.id) return { applied: false, reason: 'duplicate' };
  const training = run.mode === 'training';
  const score = training ? 0 : runScore(run);
  const { careerXp, credits } = training ? { careerXp: 0, credits: 0 } : runRewards(run);
  const before = { ...profile.career };
  const after = addCareerXp(profile.career, careerXp);
  profile.career = { level: after.level, xp: after.xp };
  profile.credits += credits;
  profile.lastRewardedRun = run.id;
  const broken = [];
  if (!training) {
    const L = profile.life;
    L.runs++; L.deaths++; L.kills += run.kills; L.xp += Math.round(run.xp); L.damage += Math.round(run.damage);
    L.explosiveKills += run.explosiveKills || 0; L.gadgetKills += run.gadgetKills || 0; L.crates += run.crates || 0;
    L.avoided += run.avoided || 0; L.healed += Math.round(run.healed || 0); L.bossKills += run.bosses || 0;
    for (const b of run.bossTypes || []) if (!L.bossTypes.includes(b)) L.bossTypes.push(b);
    for (const w in run.weaponTime || {}) L.weaponTime[w] = (L.weaponTime[w] || 0) + run.weaponTime[w];
    if (run.mode === 'daily' && run.time >= 300) L.dailyDone++;
    const R = profile.records, first = L.runs === 1;
    const rec = (key, val, label) => { if (val > R[key]) { if (!first) broken.push(label); R[key] = val; } };
    rec('longest', run.time, 'Longest survival'); rec('wave', run.wave, 'Highest wave'); rec('level', run.level, 'Highest level');
    rec('streak', run.streak, 'Best kill streak'); rec('kills', run.kills, 'Most kills'); rec('score', score, 'Highest score');
    profile.runs.push({ id: run.id, date: run.date || Date.now(), mode: run.mode, score, wave: run.wave, time: Math.round(run.time), kills: run.kills, level: run.level, weapon: run.weapon, evo: run.evo || null, name: profile.name, daily: run.daily || null });
    if (profile.runs.length > 150) profile.runs.splice(0, profile.runs.length - 150);
  }
  return { applied: true, score, careerXp, credits, before, after: profile.career, levelsGained: after.levelsGained, broken };
}

// Local leaderboard query over the run history of every local profile.
export function localLeaderboard(profiles, category, range, now = Date.now(), dailyKey = null) {
  const span = { daily: 864e5, weekly: 7 * 864e5, all: Infinity }[range] ?? Infinity;
  const field = { wave: 'wave', survival: 'time', kills: 'kills', score: 'score', daily: 'score' }[category] || 'score';
  const rows = [];
  for (const p of profiles) for (const r of p.runs) {
    if (r.mode === 'training') continue;
    if (category === 'daily' ? r.mode !== 'daily' || (dailyKey && r.daily !== dailyKey) : now - r.date > span) continue;
    rows.push({ ...r, name: p.name, profileId: p.id, value: r[field] });
  }
  rows.sort((a, b) => b.value - a.value || b.score - a.score);
  return rows.slice(0, 50);
}
