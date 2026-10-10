// First-launch profile creation (and the "welcome back" path for players migrating from v2).
import { G } from '../core/registry.js';
import { Sound, audioInit } from '../core/audio.js';
import { validateUsername } from '../systems/profiles.js';
import { $, UI } from './ui.js';

export const Welcome = {
  needed() { const p = G.save.profile(); return !p || p.needsName; },
  open(next) {
    this.next = next;
    G.game.state = 'welcome';
    const p = G.save.profile();
    if (p && p.needsName) {
      $('welcomeTitle').textContent = 'WELCOME BACK';
      $('welcomeLead').textContent = `We found your earlier progress (${p.life.kills.toLocaleString()} eliminations, best wave ${p.records.wave}). Choose a callsign to keep it.`;
    }
    UI.show('welcome');
    setTimeout(() => $('nameInput').focus(), 50);
  },
  create() {
    audioInit();
    const name = $('nameInput').value, p = G.save.profile();
    const r = p && p.needsName ? G.save.rename(name) : G.save.createProfile(name);
    if (!r.ok) { $('nameErr').textContent = r.error; Sound.error(); $('nameInput').focus(); return; }
    Sound.confirm(); UI.toast(`Welcome, ${G.save.profile().name}`, '#ffd23f');
    this.done();
  },
  guest() {
    audioInit();
    const p = G.save.profile();
    if (p && p.needsName) { p.needsName = false; p.guest = true; p.name = 'Guest'; G.save.flush(); }
    else G.save.useGuest();
    Sound.ui(); this.done();
  },
  done() { G.lookVer++; (this.next || (() => UI.toMenu()))(); },
};
$('createProfile').addEventListener('click', () => Welcome.create());
$('playGuest').addEventListener('click', () => Welcome.guest());
$('nameInput').addEventListener('input', () => {
  const v = $('nameInput').value;
  $('nameErr').textContent = v.length >= 3 ? (validateUsername(v, G.save.takenNames()).error || '') : '';
});
$('nameInput').addEventListener('keydown', e => { if (e.key === 'Enter') Welcome.create(); });
