// UI controller: screen routing (with a back stack), keyboard routing per state, run start/pause flows.
import { G } from '../core/registry.js';
import { Settings } from '../core/settings.js';
import { audioInit, Sound, Music, applyVolumes } from '../core/audio.js';
import { onPress, onBlurInput, mouse, releaseAll, prettyKey } from '../core/input.js';
import { canvas } from '../core/canvas.js';
import { esc } from '../core/util.js';
import { rankFor } from '../data/progression.js';
import { DEFAULT_LOADOUT } from '../data/equipment.js';

export const $ = id => document.getElementById(id);
const SCREENS = ['welcome', 'intro', 'menu', 'deploy', 'loadout', 'character', 'profile', 'arsenal', 'records', 'achievementsScreen', 'settings', 'levelup', 'build', 'pause', 'gameover'];
const SUBS = { loadout: 'loadout', character: 'character', profile: 'profile', arsenal: 'arsenal', records: 'records', achievements: 'achievementsScreen', settings: 'settings' };

export const UI = {
  current: null, stack: [], menuSel: 0, selectedMode: 'standard',
  show(id) {
    for (const s of SCREENS) $(s).hidden = s !== id;
    this.current = id; document.body.dataset.screen = id || 'game';
    canvas.style.cursor = id ? 'default' : 'none';
    $('trainingPanel').hidden = !(id === null && G.game.mode === 'training' && G.game.state === 'play');
    const first = id && $(id).querySelector('[data-autofocus], .btn:not(.alt), .mbtn');
    if (first && id !== 'menu' && id !== 'intro') try { first.focus({ preventScroll: true }); } catch (e) { }
  },
  toast(text, color = '#2ef2ff', secs = 3) {
    const t = document.createElement('div'); t.className = 'toast'; t.style.setProperty('--c', color); t.textContent = text;
    $('toasts').appendChild(t); setTimeout(() => t.remove(), secs * 1000);
  },
  // ---------------- menu ----------------
  toMenu() {
    G.game.state = 'menu'; this.stack.length = 0; G.training.godMode = true;
    G.scene.menu.enter(); Music.set('menu');
    this.refreshWho(); this.show('menu'); this.setMenuSel(0);
    $('controlsHint').textContent = `${prettyKey(Settings.keys.up)}${prettyKey(Settings.keys.left)}${prettyKey(Settings.keys.down)}${prettyKey(Settings.keys.right)} move · Mouse aim + fire · ${prettyKey(Settings.keys.dash)} dash · ${prettyKey(Settings.keys.gadget)} gadget · ${prettyKey(Settings.keys.support)} support · ${prettyKey(Settings.keys.build)} build`;
  },
  refreshWho() {
    const p = G.save.profile(); if (!p) return;
    const r = rankFor(p.career.level);
    $('whoName').textContent = p.name; $('whoRank').textContent = `${r.title.toUpperCase()} · LV ${p.career.level}`; $('whoRank').style.setProperty('--c', r.col);
    $('whoCredits').innerHTML = `${p.credits.toLocaleString()} <small>SUPPLY CREDITS</small>`;
  },
  setMenuSel(i) {
    const btns = [...$('menuList').children];
    this.menuSel = (i + btns.length) % btns.length;
    btns.forEach((b, k) => b.classList.toggle('sel', k === this.menuSel));
  },
  menuAct(act) {
    audioInit(); Sound.confirm();
    if (act === 'play') this.openSub('deploy');
    else this.openSub(SUBS[act]);
  },
  openSub(id, from) {
    if (from) this.stack.push(from);
    if (G.game.state !== 'pause') G.game.state = 'sub';
    G.screens.open(id);
    this.show(id);
  },
  back() {
    Sound.ui();
    const prev = this.stack.pop();
    if (prev === 'pause') { G.game.state = 'pause'; this.pause(true); return; }
    if (prev) { this.openSub(prev); return; }
    this.toMenu();
  },
  // ---------------- runs ----------------
  startRun({ mode, quick } = {}) {
    audioInit();
    const p = G.save.profile();
    const m = mode || this.selectedMode || 'standard';
    G.game.startRun({ mode: m, loadout: p ? p.loadout : DEFAULT_LOADOUT });
    releaseAll(); this.stack.length = 0;
    this.show(null);
    if (!quick) Sound.confirm();
  },
  pause(keepScreen) {
    if (G.game.state !== 'play' && !keepScreen) return;
    G.game.state = 'pause'; mouse.down = false;
    G.results.fillPause(); this.show('pause'); Music.set('menu');
  },
  resume() { if (G.game.state !== 'pause' && G.game.state !== 'build') return; G.game.state = 'play'; this.show(null); Music.set('combat'); Sound.ui(); },
  openBuild() { if (G.game.state !== 'play' && G.game.state !== 'pause') return; this.buildFrom = G.game.state; G.game.state = 'build'; mouse.down = false; G.results.renderBuild(); this.show('build'); },
  closeBuild() { if (this.buildFrom === 'pause') { G.game.state = 'pause'; this.show('pause'); } else this.resume(); },
  quitToMenu() { if (G.game.state === 'pause' || G.game.state === 'play') G.game.finalizeRun(); this.toMenu(); },
  openLevelUp() { G.levelup.openLevelUp(); },
  openCrate(offers) { G.levelup.openCrate(offers); },
  gameOver(result) { G.results.gameOver(result); },
  trainingPanel(on) { if (on) G.trainingUI.render(); $('trainingPanel').hidden = !on; },
};

function onKey(k, action, e) {
  const game = G.game, st = game.state;
  if (k === 'f3') { G.perf.toggle(); return; }
  if (st === 'intro') { G.scene.intro.skip(); return; }
  if (k === 'm' && st !== 'welcome' && st !== 'sub') { Settings.muted = !Settings.muted; G.save.setSettings({ muted: Settings.muted }); applyVolumes(); UI.toast(Settings.muted ? 'Sound off' : 'Sound on'); return; }
  if (st === 'welcome') { if (k === 'enter') $('createProfile').click(); return; }
  if (st === 'menu') {
    if (k === 'arrowdown' || k === 's') { UI.setMenuSel(UI.menuSel + 1); audioInit(); Sound.hover(); }
    else if (k === 'arrowup' || k === 'w') { UI.setMenuSel(UI.menuSel - 1); audioInit(); Sound.hover(); }
    else if (k === 'enter' || k === ' ') UI.menuAct($('menuList').children[UI.menuSel].dataset.act);
    else if (k === 'q') UI.startRun({ mode: UI.selectedMode });
    return;
  }
  if (st === 'sub') { if (k === 'escape') UI.back(); return; }
  if (st === 'play') {
    if (action === 'pause' || k === 'p') UI.pause();
    else if (action === 'build') UI.openBuild();
    else if (action === 'gadget') G.equip.activate('gadget');
    else if (action === 'support') G.equip.activate('support');
    else if (k === 'f1') G.tutorial.skip();
    return;
  }
  if (st === 'pause') { if (action === 'pause' || k === 'p') UI.resume(); else if (action === 'build') UI.openBuild(); return; }
  if (st === 'build') { if (action === 'build' || k === 'escape') UI.closeBuild(); return; }
  if (st === 'levelup') { G.levelup.key(k); return; }
  if (st === 'crate') { G.levelup.crateKey(k); return; }
  if (st === 'dead' && (k === 'enter' || k === 'r')) UI.startRun({ mode: game.mode });
}
onPress(onKey);
onBlurInput(() => { if (G.game && G.game.state === 'play' && Settings.pauseOnBlur) UI.pause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && G.game && G.game.state === 'play' && Settings.pauseOnBlur) UI.pause(); });

// static wiring
[...$('menuList').children].forEach((b, i) => {
  b.addEventListener('click', () => UI.menuAct(b.dataset.act));
  b.addEventListener('mouseenter', () => { UI.setMenuSel(i); audioInit(); Sound.hover(); });
});
for (const b of document.querySelectorAll('[data-back]')) b.addEventListener('click', () => UI.back());
$('resumeBtn').addEventListener('click', () => UI.resume());
$('buildBtn').addEventListener('click', () => UI.openBuild());
$('pauseSettings').addEventListener('click', () => UI.openSub('settings', 'pause'));
$('restartBtn').addEventListener('click', () => { G.game.finalizeRun(); UI.startRun({ mode: G.game.mode }); });
$('menuBtn').addEventListener('click', () => UI.quitToMenu());
$('redeploy').addEventListener('click', () => UI.startRun({ mode: G.game.mode }));
$('changeLoadout').addEventListener('click', () => { UI.toMenu(); UI.openSub('loadout', 'deploy'); });
$('goMenu').addEventListener('click', () => UI.toMenu());
$('deployBtn').addEventListener('click', () => UI.startRun({ mode: UI.selectedMode }));
$('toLoadout').addEventListener('click', () => { Sound.ui(); UI.openSub('loadout', 'deploy'); });
$('loDeploy').addEventListener('click', () => { Sound.ui(); UI.stack.length = 0; UI.openSub('deploy'); });
$('intro').addEventListener('click', () => G.scene.intro.skip());
try { if (matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches) $('touchNote').hidden = false; } catch (e) { }
export { esc };
