// In-run objectives: three at a time, replaced shortly after completion. Never require leaving the fight.
import { G, W } from '../core/registry.js';
import { pick } from '../core/util.js';
import { OBJECTIVES } from '../data/modes.js';
import { WEAPONS } from '../data/weapons.js';

export const Objectives = {
  active: [], pending: [],
  reset() {
    this.active = []; this.pending = [];
    if (G.game.mode === 'training') return;
    for (let i = 0; i < 3; i++) this.add();
  },
  add() {
    const used = new Set(this.active.map(o => o.id));
    const opts = OBJECTIVES.filter(o => !used.has(o.id));
    if (!opts.length) return;
    const def = pick(opts), o = { id: def.id, key: def.key, target: def.target, credits: def.credits, max: !!def.max, progress: 0, done: false, flash: 0 };
    if (def.id === 'weaponKills') { o.weapon = W.player ? W.player.weapon : 'pistol'; o.weaponName = WEAPONS[o.weapon].name; }
    o.text = def.text(o);
    this.active.push(o);
  },
  on(key, n = 1, ctx = {}) {
    for (const o of this.active) {
      if (o.done || o.key !== key) continue;
      if (key === 'weaponKills' && ctx.weapon !== o.weapon) continue;
      o.progress = o.max ? Math.max(o.progress, n) : o.progress + n;
      if (o.progress >= o.target) this.complete(o);
    }
  },
  complete(o) {
    o.done = true; o.progress = o.target; o.flash = 1;
    const run = G.game.run;
    run.objectives++; run.bonusCredits += o.credits;
    G.game.addXp(8 + G.game.wave * 2);
    G.game.toast('OBJECTIVE COMPLETE  +' + o.credits + ' CREDITS', '#ffd23f');
    this.pending.push({ o, t: 6 });
  },
  update(dt) {
    for (const o of this.active) o.flash = Math.max(0, o.flash - dt);
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const q = this.pending[i]; q.t -= dt;
      if (q.t <= 0) { this.active.splice(this.active.indexOf(q.o), 1); this.pending.splice(i, 1); this.add(); }
    }
  },
};
