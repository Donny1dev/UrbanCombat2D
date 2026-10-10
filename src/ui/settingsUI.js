// Settings screen: Graphics, Audio, Gameplay, Accessibility, Controls (rebinding) and Data (export/import/reset).
import { G } from '../core/registry.js';
import { Settings, QUALITY, PALETTES, DEFAULT_KEYS, KEY_LABELS } from '../core/settings.js';
import { Sound, audioInit, applyVolumes } from '../core/audio.js';
import { captureNextKey, prettyKey } from '../core/input.js';
import { resize } from '../core/canvas.js';
import { session } from '../core/storage.js';
import { esc } from '../core/util.js';
import { clearSpriteCache } from '../rendering/sprites.js';
import { clearTextCache } from '../rendering/textcache.js';
import { $, UI } from './ui.js';

const TABS = [['graphics', 'Graphics'], ['audio', 'Audio'], ['gameplay', 'Gameplay'], ['access', 'Accessibility'], ['controls', 'Controls'], ['data', 'Data']];
const range = (id, label, val, min, max, step, sub = '') => `<div class="setRow"><label for="${id}">${label}${sub ? `<small>${sub}</small>` : ''}</label><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${val}"></div>`;
const toggle = (id, label, on, sub = '') => `<div class="setRow"><label>${label}${sub ? `<small>${sub}</small>` : ''}</label><div class="seg"><button type="button" id="${id}" class="${on ? 'on' : ''}" aria-pressed="${on}">${on ? 'ON' : 'OFF'}</button></div></div>`;
const choice = (id, label, val, opts, sub = '') => `<div class="setRow"><label>${label}${sub ? `<small>${sub}</small>` : ''}</label><div class="seg" id="${id}">${opts.map(([v, n]) => `<button type="button" data-v="${v}" class="${val === v ? 'on' : ''}">${n}</button>`).join('')}</div></div>`;

export const SettingsUI = {
  tab: 'graphics',
  open() {
    $('setTabs').innerHTML = TABS.map(([id, n]) => `<button type="button" role="tab" class="${this.tab === id ? 'on' : ''}" data-t="${id}">${n}</button>`).join('');
    for (const b of $('setTabs').children) b.onclick = () => { this.tab = b.dataset.t; Sound.hover(); this.open(); };
    const S = Settings, body = $('setBody');
    if (this.tab === 'graphics') body.innerHTML =
      choice('q', 'Quality preset', S.quality, [['auto', 'Auto'], ['low', 'Low'], ['medium', 'Medium'], ['high', 'High']], S.quality === 'auto' ? `Auto picked ${QUALITY[S.autoLevel].label} for this device` : 'Particles, lighting, glow and resolution cap') +
      range('res', 'Resolution scale', Math.round(S.resScale * 100), 50, 100, 5, 'Lower renders fewer pixels for more speed') +
      range('parts', 'Particle density', Math.round(S.particles * 100), 25, 150, 5) +
      range('shake', 'Screen shake', Math.round(S.shake * 100), 0, 150, 5) +
      range('cam', 'Camera smoothing', Math.round(S.camSmooth * 100), 0, 100, 5) +
      range('flash', 'Flash intensity', Math.round(S.flash * 100), 0, 100, 5) +
      toggle('nums', 'Damage numbers', S.dmgNums) + toggle('comic', 'Comic impact words', S.comic) +
      '<p class="fine">V-sync is controlled by your browser; the game renders once per display refresh and simulates at a fixed 60 Hz.</p>';
    else if (this.tab === 'audio') body.innerHTML =
      range('master', 'Master volume', Math.round(S.master * 100), 0, 100, 1) + range('gun', 'Gunfire & combat', Math.round(S.gunfire * 100), 0, 100, 1) +
      range('uiv', 'Interface effects', Math.round(S.uiVol * 100), 0, 100, 1) + range('music', 'Music', Math.round(S.music * 100), 0, 100, 1) + toggle('mute', 'Mute all (M)', S.muted);
    else if (this.tab === 'gameplay') body.innerHTML =
      choice('xh', 'Crosshair', S.crosshair, [['cross', 'Cross'], ['dot', 'Dot'], ['circle', 'Circle'], ['tbar', 'T-bar']]) +
      `<div class="setRow"><label for="xc">Crosshair colour</label><input type="color" id="xc" value="${S.crossColor}"></div>` +
      toggle('ar', 'Auto-reload', S.autoReload, 'Off: press reload yourself when empty') + toggle('edge', 'Screen-edge indicators', S.edgeIndicators, 'Arrows to bosses, medkits, crates and events') +
      toggle('hints', 'Tutorial hints', S.hints, 'Contextual tips during your first run') + toggle('blur', 'Pause on focus loss', S.pauseOnBlur) + toggle('name', 'Show callsign on HUD', S.showName) +
      '<div class="setRow"><label>Tutorial<small>Show the first-run tips again next run</small></label><button class="btn small alt" type="button" id="tutAgain">RESET TIPS</button></div>';
    else if (this.tab === 'access') body.innerHTML =
      toggle('rm', 'Reduced motion', S.reducedMotion, 'Calmer menus, no intro, less camera motion') + toggle('rf', 'Reduced flashing', S.reducedFlash, 'Dims muzzle flashes, hit flashes and lights') +
      choice('pal', 'Colour palette', S.palette, Object.entries(PALETTES).map(([k, v]) => [k, v.label]), 'Re-colours danger, healing and XP for colour-blind players') +
      range('hud', 'HUD scale', Math.round(S.hudScale * 100), 75, 140, 5) +
      '<div class="setRow"><label>Intro<small>Replay the opening sequence</small></label><button class="btn small alt" type="button" id="introAgain">REPLAY INTRO</button></div>';
    else if (this.tab === 'controls') body.innerHTML = Object.keys(DEFAULT_KEYS).map(a => `<div class="setRow"><label>${KEY_LABELS[a]}</label><button type="button" class="keybtn" data-a="${a}">${prettyKey(S.keys[a])}</button></div>`).join('') +
      '<p class="fine">Arrow keys always move and SPACE always dashes. Mouse: aim and hold left button to fire. F3 shows the performance overlay.</p><button class="btn small alt" type="button" id="keysReset">RESET TO DEFAULTS</button>';
    else body.innerHTML = this.dataTab();
    this.wire();
  },
  dataTab() {
    const p = G.save.profile();
    return `<p class="fine">Your profiles, progress and settings are stored only in this browser (localStorage key <b>uc3_save</b>). Nothing is uploaded and there are no accounts or analytics.</p>
      <div class="setRow"><label>Export save<small>Download a backup file, or copy the text</small></label><div class="row"><button class="btn small" type="button" id="expFile">DOWNLOAD</button><button class="btn small alt" type="button" id="expCopy">COPY TEXT</button></div></div>
      <div class="setRow" style="flex-direction:column;align-items:stretch"><label>Import save<small>Replaces all local data with the backup (checked for damage first)</small></label>
        <textarea class="save" id="impText" placeholder="Paste an exported save here, or choose a file"></textarea>
        <div class="row" style="justify-content:flex-start"><input type="file" id="impFile" accept=".json,application/json"><button class="btn small" type="button" id="impBtn">IMPORT</button></div><div class="err" id="impErr"></div></div>
      <div class="setRow"><label>Reset all data<small>Deletes every profile, unlock, record and setting on this device</small></label><div class="row"><button class="btn small alt" type="button" id="resetAll">RESET…</button><button class="btn small danger" type="button" id="resetYes" hidden>CONFIRM — DELETE EVERYTHING</button></div></div>
      <p class="fine">Active profile: ${esc(p ? p.name : '—')} · Save format v3 · Build ${esc(G.build || '')}</p>`;
  },
  set(next) { G.save.setSettings(next); if ('resScale' in next || 'quality' in next) resize(); if ('master' in next || 'gunfire' in next || 'uiVol' in next || 'music' in next || 'muted' in next) applyVolumes(); if ('palette' in next || 'hudScale' in next) { clearTextCache(); } document.body.classList.toggle('reduced', Settings.reducedMotion); },
  wire() {
    const on = (id, ev, fn) => { const el = $(id); if (el) el.addEventListener(ev, fn); };
    const rng = (id, key, div = 100) => on(id, 'input', e => this.set({ [key]: e.target.value / div }));
    const tog = (id, key) => on(id, 'click', () => { this.set({ [key]: !Settings[key] }); Sound.ui(); this.open(); });
    const ch = (id, key) => { const el = $(id); if (el) for (const b of el.children) b.onclick = () => { this.set({ [key]: b.dataset.v }); Sound.ui(); this.open(); }; };
    ch('q', 'quality'); rng('res', 'resScale'); rng('parts', 'particles'); rng('shake', 'shake'); rng('cam', 'camSmooth'); rng('flash', 'flash'); tog('nums', 'dmgNums'); tog('comic', 'comic');
    on('master', 'input', e => { audioInit(); this.set({ master: e.target.value / 100 }); }); rng('gun', 'gunfire'); rng('uiv', 'uiVol'); rng('music', 'music'); tog('mute', 'muted');
    on('master', 'change', () => Sound.ui()); on('gun', 'change', () => Sound.shoot('pistol')); on('uiv', 'change', () => Sound.confirm());
    ch('xh', 'crosshair'); on('xc', 'input', e => this.set({ crossColor: e.target.value })); tog('ar', 'autoReload'); tog('edge', 'edgeIndicators'); tog('hints', 'hints'); tog('blur', 'pauseOnBlur'); tog('name', 'showName');
    on('tutAgain', 'click', () => { const p = G.save.profile(); p.tutorialDone = false; G.save.markDirty(); UI.toast('Tips will show on your next run'); });
    tog('rm', 'reducedMotion'); tog('rf', 'reducedFlash'); ch('pal', 'palette'); rng('hud', 'hudScale');
    on('introAgain', 'click', () => { session('uc_intro', ''); G.scene.intro.start(); });
    for (const b of document.querySelectorAll('.keybtn')) b.onclick = () => {
      b.classList.add('wait'); b.textContent = 'PRESS A KEY…';
      captureNextKey(k => {
        if (k === 'escape' && b.dataset.a !== 'pause') { this.open(); return; }
        const keys = { ...Settings.keys };
        for (const a in keys) if (keys[a] === k) keys[a] = Settings.keys[b.dataset.a];   // swap on conflict
        keys[b.dataset.a] = k; this.set({ keys }); Sound.confirm(); this.open();
      });
    };
    on('keysReset', 'click', () => { this.set({ keys: { ...DEFAULT_KEYS } }); Sound.ui(); this.open(); });
    on('expFile', 'click', () => {
      const blob = new Blob([G.save.exportText()], { type: 'application/json' }), a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = `urban-combat-save-${new Date().toISOString().slice(0, 10)}.json`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      UI.toast('Save file downloaded');
    });
    on('expCopy', 'click', async () => { const text = G.save.exportText(); try { await navigator.clipboard.writeText(text); UI.toast('Save copied to clipboard'); } catch (e) { $('impText').value = text; $('impText').select(); UI.toast('Copy the selected text manually'); } });
    on('impFile', 'change', e => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { $('impText').value = String(r.result); }; r.readAsText(f); });
    on('impBtn', 'click', () => {
      const res = G.save.importText($('impText').value.trim());
      if (!res.ok) { $('impErr').textContent = res.error; Sound.error(); return; }
      Sound.confirm(); UI.toast('Save imported'); G.lookVer++; clearSpriteCache(); resize(); UI.refreshWho(); this.open();
    });
    on('resetAll', 'click', () => { $('resetYes').hidden = false; });
    on('resetYes', 'click', () => { G.save.resetAll(); location.reload(); });
  },
};
