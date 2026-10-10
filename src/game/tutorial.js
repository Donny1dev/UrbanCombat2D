// Contextual first-run hints (movement, shooting, dash, XP, upgrades, equipment). Skippable, never repeated.
import { G } from '../core/registry.js';
import { Settings } from '../core/settings.js';
import { prettyKey } from '../core/input.js';

const STEPS = [
  { key: 'move', text: () => `Move with ${prettyKey(Settings.keys.up)}${prettyKey(Settings.keys.left)}${prettyKey(Settings.keys.down)}${prettyKey(Settings.keys.right)}` },
  { key: 'shoot', text: () => 'Aim with the mouse · hold LEFT CLICK to fire' },
  { key: 'dash', text: () => `Press ${prettyKey(Settings.keys.dash)} or SPACE to dash through danger` },
  { key: 'xp', text: () => 'Kills drop XP crystals · walk near them to collect' },
  { key: 'upgrade', text: () => 'Level up: pick a card with 1 · 2 · 3 or click' },
  { key: 'gadget', text: () => `${prettyKey(Settings.keys.gadget)}: tactical gadget · ${prettyKey(Settings.keys.support)}: support equipment` },
];
export const Tutorial = {
  active: false, i: 0, t: 0, doneSet: new Set(),
  start(profile) {
    this.active = !!(Settings.hints && profile && !profile.tutorialDone && G.game.mode !== 'training');
    this.i = 0; this.t = 0; this.doneSet = new Set();
  },
  done(key) {
    if (!this.active) return;
    this.doneSet.add(key);
    while (this.i < STEPS.length && this.doneSet.has(STEPS[this.i].key)) { this.i++; this.t = 0; }
    if (this.i >= STEPS.length) this.finish();
  },
  skip() { if (this.active) this.finish(); },
  finish() {
    this.active = false;
    const p = G.save && G.save.profile(); if (p) { p.tutorialDone = true; G.save.markDirty(); }
  },
  update(dt) {
    if (!this.active) return;
    this.t += dt;
    if (this.t > 12) { this.doneSet.add(STEPS[this.i].key); this.done(STEPS[this.i].key); }   // never block on a hint
  },
  current() { return this.active && this.i < STEPS.length ? { text: STEPS[this.i].text(), n: this.i + 1, of: STEPS.length, t: this.t } : null; },
};
