// ===================== PERSISTENT PROGRESS: discoveries, lifetime stats, records =====================
const Progress = {
  disc: new Set(store.get('uc_disc', [])),
  stats: Object.assign({ kills: 0, deaths: 0, runs: 0, longest: 0, wave: 0, level: 0, streak: 0, xp: 0, damage: 0, weaponTime: {} }, store.get('uc_stats', {})),
  discover(id) { if (!this.disc.has(id)) { this.disc.add(id); store.set('uc_disc', [...this.disc]); return true; } return false; },
  mostUsed() {
    let best = null, bt = 0;
    for (const w in this.stats.weaponTime) if (this.stats.weaponTime[w] > bt) { bt = this.stats.weaponTime[w]; best = w; }
    return best ? WEAPONS[best].name : '—';
  },
  // fold a finished run into lifetime stats; returns the list of records broken
  recordRun(r) {
    const s = this.stats, broken = [];
    s.runs++; s.deaths++; s.kills += r.kills; s.xp += Math.round(r.xp); s.damage += Math.round(r.damage);
    for (const w in r.weaponTime) s.weaponTime[w] = (s.weaponTime[w] || 0) + r.weaponTime[w];
    const rec = (key, val, label) => { if (val > s[key]) { if (s.runs > 1) broken.push(label); s[key] = val; } };
    rec('longest', r.time, 'Longest survival'); rec('wave', r.wave, 'Highest wave'); rec('level', r.level, 'Highest level'); rec('streak', r.streak, 'Best kill streak');
    store.set('uc_stats', s);
    return broken;
  },
  reset() {
    this.disc = new Set(); this.stats = { kills: 0, deaths: 0, runs: 0, longest: 0, wave: 0, level: 0, streak: 0, xp: 0, damage: 0, weaponTime: {} };
    store.set('uc_disc', []); store.set('uc_stats', this.stats); store.set('uc_best', null);
  },
};
