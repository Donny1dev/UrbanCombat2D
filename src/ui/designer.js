// Character designer: layered cosmetics with career-level locks and a live preview using the gameplay renderer.
import { G } from '../core/registry.js';
import { Sound } from '../core/audio.js';
import { randi, pick } from '../core/util.js';
import { SKIN, LOOK_DEFAULT, LOOK_OPTS, PALETTE } from '../data/cosmetics.js';
import { lookLock } from '../data/progression.js';
import { WEAPONS, WEAPON_IDS } from '../data/weapons.js';
import { drawHuman, lookToOpts, armourLook, clearSpriteCache } from '../rendering/sprites.js';
import { GUN_SHAPES } from '../data/weapons.js';
import { $ } from './ui.js';

export const Designer = {
  mode: 'walk', weapon: 'rifle', rot: 0, drag: null, auto: true, t: 0, shootT: 0, flash: 0, mx: 0, my: 0,
  groups: [
    ['Body', [['Skin', 'skin', 'skin'], ['Build', 'build', 'opts']]],
    ['Head', [['Hair', 'style', 'opts'], ['Hair / hat', 'hairCol', 'pal'], ['Mask', 'mask', 'opts'], ['Mask colour', 'maskCol', 'pal'], ['Eyewear', 'glasses', 'opts']]],
    ['Clothing', [['Top', 'top', 'opts'], ['Top colour', 'topCol', 'pal'], ['Vest', 'vest', 'opts'], ['Vest colour', 'vestCol', 'pal'], ['Gloves', 'gloves', 'opts'], ['Glove colour', 'glovesCol', 'pal']]],
    ['Legs', [['Pants', 'pants', 'pal'], ['Cut', 'shorts', 'bool', ['Trousers', 'Shorts']], ['Boots', 'boots', 'pal']]],
    ['Accessories', [['Backpack', 'backpack', 'opts'], ['Pack colour', 'backpackCol', 'pal'], ['Pads', 'pads', 'bool', ['Off', 'On']], ['Accent', 'accent', 'opts']]],
  ],
  look() { return G.save.profile().look; },
  open() {
    this.renderOpts();
    const wbox = $('lookWeapon'); wbox.innerHTML = '';
    for (const w of WEAPON_IDS) { const b = document.createElement('button'); b.type = 'button'; b.textContent = WEAPONS[w].name; b.className = w === this.weapon ? 'on' : ''; b.onclick = () => { this.weapon = w; Sound.hover(); this.open(); }; wbox.appendChild(b); }
  },
  changed() {
    const p = G.save.profile(); p.life.lookChanged = 1; G.lookVer++; clearSpriteCache(); G.save.markDirty();
    G.achievements.check(p, null);
  },
  set(key, val) { this.look()[key] = val; this.changed(); Sound.hover(); this.renderOpts(); },
  renderOpts() {
    const L = this.look(), level = G.save.profile().career.level, box = $('lookOpts'); box.innerHTML = '';
    for (const [gname, rows] of this.groups) {
      const g = document.createElement('div'); g.className = 'optGroup';
      const h = document.createElement('h3'); h.textContent = gname.toUpperCase(); g.appendChild(h);
      for (const [label, key, kind, names] of rows) {
        const row = document.createElement('div'); row.className = 'opt';
        const l = document.createElement('label'); l.textContent = label; row.appendChild(l);
        const cur = L[key];
        const btn = (text, val, on, swatch) => {
          const need = lookLock(key, val), locked = level < need;
          const b = document.createElement('button'); b.type = 'button';
          if (swatch) { b.className = 'sw' + (on ? ' on' : ''); b.style.background = swatch; b.title = swatch; b.setAttribute('aria-label', label + ' ' + swatch); }
          else { b.textContent = text + (locked ? ` · LV${need}` : ''); b.className = on ? 'on' : ''; }
          if (locked) { b.disabled = true; b.title = `Unlocks at career level ${need}`; }
          b.onclick = () => this.set(key, val); row.appendChild(b);
        };
        if (kind === 'skin') SKIN.forEach((c, i) => btn('', i, cur === i, c));
        else if (kind === 'pal') PALETTE.forEach(c => btn('', c, cur === c, c));
        else if (kind === 'bool') [false, true].forEach((v, i) => btn(names[i], v, !!cur === v));
        else LOOK_OPTS[key].forEach(v => btn(v, v, cur === v));
        g.appendChild(row);
      }
      box.appendChild(g);
    }
  },
  randomize() {
    const L = this.look(), level = G.save.profile().career.level, ok = (k, v) => level >= lookLock(k, v);
    L.skin = randi(0, SKIN.length - 1);
    for (const k of ['build', 'top', 'vest', 'gloves', 'style', 'mask', 'glasses', 'backpack', 'accent']) { const opts = LOOK_OPTS[k].filter(v => ok(k, v)); L[k] = pick(opts); }
    if (Math.random() < 0.55) L.mask = 'none'; if (Math.random() < 0.5) L.glasses = 'none';
    for (const k of ['topCol', 'vestCol', 'glovesCol', 'hairCol', 'maskCol', 'pants', 'boots', 'backpackCol']) L[k] = pick(PALETTE);
    L.shorts = Math.random() < 0.25; L.pads = ok('pads', true) && Math.random() < 0.3;
    this.changed(); Sound.reroll(); this.renderOpts();
  },
  reset() { G.save.profile().look = { ...LOOK_DEFAULT }; this.changed(); Sound.ui(); this.renderOpts(); },
  render(dt) {
    const c = $('lookCanvas'), g = c.getContext('2d'), W2 = c.width, H = c.height, p = G.save.profile(); if (!p) return;
    this.t += dt;
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, W2, H);
    g.strokeStyle = 'rgba(255,255,255,0.05)'; g.lineWidth = 1;
    for (let i = 0; i <= W2; i += 56) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, H); g.moveTo(0, i); g.lineTo(W2, i); g.stroke(); }
    let a = this.rot;
    if (this.auto && !this.drag && (this.mode === 'idle' || this.mode === 'walk')) this.rot += dt * 0.6;
    if (this.mode === 'aim' || this.mode === 'shoot') a = Math.atan2(this.my - H / 2, this.mx - W2 / 2);
    let recoil = 0;
    if (this.mode === 'shoot') { this.shootT -= dt; if (this.shootT <= 0) { this.shootT = 1 / Math.min(8, WEAPONS[this.weapon].rate); this.flash = 0.06; } this.flash -= dt; recoil = this.flash > 0 ? WEAPONS[this.weapon].recoil : 0; }
    const s = 5.2;
    g.save(); g.translate(W2 / 2, H / 2 + 10);
    g.strokeStyle = 'rgba(46,242,255,0.25)'; g.lineWidth = 3; g.beginPath(); g.arc(0, 0, 22 * s, 0, Math.PI * 2); g.stroke();
    drawHuman(g, 0, 0, Object.assign(armourLook(lookToOpts(p.look), p.loadout.armour), { a, phase: this.t * 7, moving: this.mode === 'walk', scale: s, weapon: this.weapon, recoil, altRecoil: recoil }));
    if (this.flash > 0) {
      g.rotate(a); g.globalCompositeOperation = 'lighter';
      const len = ((GUN_SHAPES[this.weapon] || [14])[0] + 18) * s;
      g.fillStyle = '#ffb347'; g.beginPath(); g.moveTo(len, -8 * s); g.lineTo(len + 26 * s, 0); g.lineTo(len, 8 * s); g.closePath(); g.fill();
      g.fillStyle = '#fffbe0'; g.beginPath(); g.arc(len + 4 * s, 0, 6 * s, 0, Math.PI * 2); g.fill();
      g.globalCompositeOperation = 'source-over';
    }
    g.restore();
  },
};
(() => {
  const c = $('lookCanvas');
  const local = e => { const r = c.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * c.width, (e.clientY - r.top) / r.height * c.height]; };
  c.addEventListener('pointerdown', e => { Designer.drag = { x: e.clientX, rot: Designer.rot }; Designer.auto = false; c.setPointerCapture(e.pointerId); c.style.cursor = 'grabbing'; });
  c.addEventListener('pointermove', e => { [Designer.mx, Designer.my] = local(e); if (Designer.drag) Designer.rot = Designer.drag.rot + (e.clientX - Designer.drag.x) * 0.012; });
  c.addEventListener('pointerup', () => { Designer.drag = null; c.style.cursor = 'grab'; });
  for (const b of $('lookMode').children) b.addEventListener('click', () => { Designer.mode = b.dataset.m; for (const o of $('lookMode').children) o.classList.toggle('on', o === b); Sound.hover(); });
  $('lookRandom').addEventListener('click', () => Designer.randomize());
  $('lookReset').addEventListener('click', () => Designer.reset());
})();
