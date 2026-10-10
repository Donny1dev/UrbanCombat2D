// Training Grounds control panel (DOM). Lets players test weapons, gear ranks/rarities and upgrades.
import { G } from '../core/registry.js';
import { W } from '../core/registry.js';
import { Sound } from '../core/audio.js';
import { esc } from '../core/util.js';
import { WEAPONS, WEAPON_IDS } from '../data/weapons.js';
import { EQUIPMENT, SLOTS, SLOT_NAMES, RARITIES } from '../data/equipment.js';
import { $, UI } from './ui.js';

export const TrainingUI = {
  render() {
    const T = G.training, p = W.player; if (!p) return;
    const opt = (v, n, sel) => `<option value="${v}" ${sel ? 'selected' : ''}>${esc(n)}</option>`;
    $('trainingPanel').innerHTML = `
      <h4>TRAINING GROUNDS</h4>
      <label>Weapon</label><select id="trWeapon" aria-label="Weapon">${WEAPON_IDS.map(w => opt(w, WEAPONS[w].name, p.weapon === w)).join('')}</select>
      ${SLOTS.map(s => `<label>${SLOT_NAMES[s]}</label><div class="trSlot"><select data-slot="${s}" aria-label="${SLOT_NAMES[s]}">${EQUIPMENT.filter(e => e.slot === s).map(e => opt(e.id, e.name, p.eq[s].id === e.id)).join('')}</select><select data-rank="${s}" aria-label="${SLOT_NAMES[s]} rank">${[1, 2, 3].map(r => opt(r, 'R' + r, p.eq[s].rank === r)).join('')}</select><select data-rar="${s}" aria-label="${SLOT_NAMES[s]} rarity">${RARITIES.map(r => opt(r, r[0].toUpperCase() + r.slice(1), p.eq[s].rarity === r)).join('')}</select></div>`).join('')}
      <div class="trBtns"><button class="btn small alt" type="button" id="trDummy">+ DUMMY</button><button class="btn small alt" type="button" id="trTargets">+ TARGETS</button><button class="btn small alt" type="button" id="trLevel">LEVEL UP</button>
        <button class="btn small alt" type="button" id="trClear">CLEAR</button><button class="btn small alt" type="button" id="trMeter">RESET DPS</button><button class="btn small ${T.godMode ? '' : 'alt'}" type="button" id="trGod" aria-pressed="${T.godMode}">GOD ${T.godMode ? 'ON' : 'OFF'}</button>
        <button class="btn small ${T.noCooldowns ? '' : 'alt'}" type="button" id="trCd" aria-pressed="${T.noCooldowns}">NO CD ${T.noCooldowns ? 'ON' : 'OFF'}</button><button class="btn small danger" type="button" id="trExit" style="grid-column:span 2">LEAVE TRAINING</button></div>
      <p class="fine" style="margin:0;font-size:12px">No rewards, records or achievements here.</p>`;
    $('trWeapon').onchange = e => { T.setWeapon(e.target.value); Sound.ui(); this.render(); };
    for (const s of SLOTS) {
      const upd = () => { T.setEquip(s, document.querySelector(`[data-slot="${s}"]`).value, +document.querySelector(`[data-rank="${s}"]`).value, document.querySelector(`[data-rar="${s}"]`).value); Sound.ui(); };
      for (const sel of document.querySelectorAll(`[data-slot="${s}"],[data-rank="${s}"],[data-rar="${s}"]`)) sel.onchange = upd;
    }
    $('trDummy').onclick = () => { T.addDummy(); Sound.deploy(); };
    $('trTargets').onclick = () => { T.addTargets(); Sound.deploy(); };
    $('trLevel').onclick = () => T.levelUp();
    $('trClear').onclick = () => { T.clear(); Sound.ui(); };
    $('trMeter').onclick = () => { T.resetMeter(); Sound.ui(); };
    $('trGod').onclick = () => { T.godMode = !T.godMode; this.render(); };
    $('trCd').onclick = () => { T.noCooldowns = !T.noCooldowns; this.render(); };
    $('trExit').onclick = () => { $('trainingPanel').hidden = true; UI.toMenu(); };
    // keep panel clicks from reaching the game canvas
    for (const el of $('trainingPanel').querySelectorAll('select,button')) el.addEventListener('pointerdown', e => e.stopPropagation());
  },
};
