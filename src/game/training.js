// Training Grounds: target dummies, a rolling DPS meter, and live weapon/equipment/upgrade testing.
// Never grants career rewards, records or achievements.
import { G, W } from '../core/registry.js';
import { findReachableSpot } from '../world/map.js';
import { EQ, RARITIES } from '../data/equipment.js';
import { refreshStats } from '../systems/stats.js';
import { maxCharges } from '../systems/equipmentRules.js';
import { spawnEnemy } from '../entities/enemies.js';

export const Training = {
  godMode: true, noCooldowns: false, hits: [], total: 0, peak: 0, dps: 0, crits: 0, n: 0,
  start() {
    this.hits.length = 0; this.total = 0; this.peak = 0; this.dps = 0; this.crits = 0; this.n = 0;
    for (let i = 0; i < 3; i++) this.addDummy(i);
    G.ui && G.ui.trainingPanel(true);
  },
  addDummy(i = Math.random() * 5) {
    const p = W.player, x = p.x + 300 + (i % 3) * 90, y = p.y - 120 + Math.floor(i / 3) * 120 + (i % 3) * 60;
    const s = findReachableSpot(x, y, 0, 80, false) || [x, y];
    spawnEnemy('dummy', s[0], s[1], 1);
  },
  addTargets() { for (let i = 0; i < 4; i++) { const s = findReachableSpot(W.player.x, W.player.y, 250, 450, false); if (s) spawnEnemy(['thug', 'gunman', 'rusher', 'heavy'][i], s[0], s[1], 1); } },
  clear() { for (const e of W.enemies) e.dead = true; this.resetMeter(); },
  resetMeter() { this.hits.length = 0; this.total = 0; this.peak = 0; this.dps = 0; this.crits = 0; this.n = 0; },
  onDamage(dmg, crit) { const t = G.game.time; this.hits.push(t, dmg); this.total += dmg; this.n++; if (crit) this.crits++; },
  update(dt) {
    const t = G.game.time;
    while (this.hits.length && this.hits[0] < t - 5) this.hits.splice(0, 2);
    let s = 0; for (let i = 1; i < this.hits.length; i += 2) s += this.hits[i];
    this.dps = s / 5; this.peak = Math.max(this.peak, this.dps);
  },
  setWeapon(w) { const p = W.player; p.weapon = w; refreshStats(p); p.ammo = p.gun.mag; p.reloading = 0; this.resetMeter(); },
  setEquip(slot, id, rank, rarity) {
    const p = W.player; if (!EQ[id] || EQ[id].slot !== slot) return;
    p.eq[slot] = { id, rank: Math.max(1, Math.min(3, rank)), rarity: RARITIES.includes(rarity) ? rarity : 'common', cd: 0, charges: 1 };
    p.eq[slot].charges = maxCharges(p.eq[slot]);
    refreshStats(p); p.eShield = p.S.shieldCap;
  },
  levelUp() { G.game.pending++; },
};
