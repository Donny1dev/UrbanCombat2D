// Level-up cards (upgrades, evolutions, swaps; locks + rerolls) and equipment-crate cards.
import { G, W } from '../core/registry.js';
import { Sound } from '../core/audio.js';
import { mouse } from '../core/input.js';
import { CATS, CAT_ORDER } from '../data/upgrades.js';
import { WEAPONS, GUN_SHAPES } from '../data/weapons.js';
import { EQ, RARITY_COL, SLOT_NAMES, rarityIdx } from '../data/equipment.js';
import { makeOffers, applyOffer, offerKey, synergiesFor, evosFor } from '../systems/offers.js';
import { drawIcon } from '../rendering/icons.js';
import { drawGun } from '../rendering/sprites.js';
import { FX } from '../rendering/fx.js';
import { $ } from './ui.js';

const CARD_COL = Object.assign({ evo: '#ffc93c', swap: '#f4f6fb', misc: '#52f08a' }, Object.fromEntries(CAT_ORDER.map(c => [c, CATS[c].col])));
const CAT_LABEL = { evo: 'Evolution', swap: 'New weapon', misc: 'Supplies' };

export const LevelUp = {
  offers: [], openedAt: 0, choosing: false, lockIdx: -1, hoverIdx: -1, crate: null,
  openLevelUp() {
    const p = W.player, game = G.game;
    game.state = 'levelup'; mouse.down = false;
    game.levelUpPush();
    const keep = p.savedCard ? [Object.assign({}, p.savedCard, { saved: true })] : [];
    p.savedCard = null;
    this.offers = makeOffers(p, keep);
    this.lockIdx = -1; this.hoverIdx = -1; this.openedAt = performance.now(); this.choosing = false; this.crate = null;
    $('luTitle').textContent = 'LEVEL ' + (p.level - game.pending + 1); $('luSub').hidden = true;
    $('luBar').hidden = false; $('luHint').textContent = '1 · 2 · 3 to pick · Hover a card + L (or the padlock) to save it for next level';
    this.render();
    Sound.levelUp();
    if (this.offers.some(o => o.kind === 'evo')) Sound.evolve();
    G.ui.show('levelup');
  },
  render() {
    const p = W.player, box = $('cards'); box.innerHTML = '';
    $('lockCount').textContent = p.locks; $('rerollCount').textContent = p.rerolls; $('rerollBtn').disabled = p.rerolls <= 0;
    this.offers.forEach((o, i) => {
      const c = document.createElement('div');
      c.className = 'card' + (o.kind === 'evo' ? ' evo' : '') + (i === this.lockIdx ? ' locked' : '');
      c.tabIndex = 0; c.setAttribute('role', 'button');
      c.style.setProperty('--c', CARD_COL[o.cat]);
      const icon = document.createElement('canvas'); icon.width = icon.height = 128;
      const add = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; e.textContent = text; c.appendChild(e); return e; };
      add('span', 'num', i + 1);
      if (o.saved) add('span', 'savedTag', 'SAVED CARD');
      if (o.kind === 'evo') add('span', 'evoTag', o.tier === 2 ? 'TIER II EVOLUTION' : 'WEAPON EVOLUTION');
      add('span', 'cat', o.kind === 'upg' ? CATS[o.cat].name : o.kind === 'evo' ? (o.tier === 2 ? 'Tier II' : 'Evolution') : CAT_LABEL[o.cat]);
      if (o.kind === 'upg') add('span', 'rar', o.rarity);
      c.appendChild(icon);
      add('h3', '', o.name);
      if (o.kind === 'evo') {
        const g = icon.getContext('2d'), gl = (GUN_SHAPES[p.weapon] || [14])[0], gs = Math.min(6.5, 104 / gl);
        g.save(); g.translate(64 - gl * gs / 2, 64); g.scale(gs, gs); drawGun(g, p.weapon, 0, 0, false, true); g.restore();
        const m = add('div', 'morph', o.from + ' → '); const b = document.createElement('b'); b.textContent = o.name; m.appendChild(b);
        add('p', '', o.desc);
        const ul = document.createElement('ul'); for (const bf of o.benefits) { const li = document.createElement('li'); li.textContent = '+ ' + bf.replace(/^\+/, ''); ul.appendChild(li); } c.appendChild(ul);
      } else if (o.kind === 'upg') {
        drawIcon(icon.getContext('2d'), o.icon, CARD_COL[o.cat], 128);
        add('div', 'rank', `RANK ${o.lvl} → ${o.lvl + 1} / ${o.max}`);
        const pips = document.createElement('div'); pips.className = 'pips';
        for (let k = 0; k < o.max; k++) { const s = document.createElement('i'); s.className = k < o.lvl ? 'on' : k === o.lvl ? 'new' : ''; pips.appendChild(s); }
        c.appendChild(pips);
        add('div', 'next', o.next); add('p', '', o.desc);
        const links = document.createElement('div'); links.className = 'links';
        for (const s of synergiesFor(o.id)) {
          if (p.synergies.has(s.id)) continue;
          const sim = Object.assign({}, p.upg, { [o.id]: o.lvl + 1 }), ok = Object.keys(s.req).every(k => (sim[k] || 0) >= s.req[k]);
          const sp = document.createElement('span'); sp.className = ok ? 'ok' : ''; sp.textContent = (ok ? 'UNLOCKS ' : '◇ ') + s.name; links.appendChild(sp);
        }
        for (const e of evosFor(p, o.id)) { const sp = document.createElement('span'); sp.className = 'evoL'; sp.textContent = '★ ' + e.name; links.appendChild(sp); }
        c.appendChild(links);
      } else { drawIcon(icon.getContext('2d'), o.icon, CARD_COL[o.cat], 128); add('p', '', o.desc); }
      if (o.kind !== 'misc' && !o.saved) {
        const lb = document.createElement('button'); lb.type = 'button'; lb.className = 'lockBtn' + (i === this.lockIdx ? ' on' : '');
        lb.title = 'Save this card for your next level-up'; lb.setAttribute('aria-label', 'Lock card ' + (i + 1));
        const lc = document.createElement('canvas'); lc.width = lc.height = 36; drawIcon(lc.getContext('2d'), 'lock', i === this.lockIdx ? '#1a1000' : (p.locks > 0 ? '#ffd23f' : '#4a4d58'), 36, false); lb.appendChild(lc);
        lb.addEventListener('click', ev => { ev.stopPropagation(); this.toggleLock(i); });
        c.appendChild(lb);
      }
      c.addEventListener('click', () => this.choose(i));
      c.addEventListener('keydown', ev => { if (ev.key === 'Enter') this.choose(i); });
      c.addEventListener('mouseenter', () => { this.hoverIdx = i; Sound.hover(); });
      box.appendChild(c);
    });
  },
  key(k) { if (['1', '2', '3'].includes(k)) this.choose(+k - 1); else if (k === 'l' && this.hoverIdx >= 0) this.toggleLock(this.hoverIdx); else if (k === 'r') this.reroll(); },
  toggleLock(i) {
    const o = this.offers[i]; if (!o || o.kind === 'misc' || o.saved || this.choosing) return;
    const p = W.player;
    if (this.lockIdx === i) this.lockIdx = -1;
    else if (p.locks > 0) this.lockIdx = i;
    else { G.ui.toast('No lock charges left — you earn one every 6 levels.', '#ff3b4e'); Sound.error(); return; }
    Sound.lock(); this.render();
  },
  reroll() {
    const p = W.player;
    if (G.game.state !== 'levelup' || this.choosing || p.rerolls <= 0) return;
    p.rerolls--;
    const keep = this.offers.filter((o, i) => o.saved || i === this.lockIdx);
    const lockedKey = this.lockIdx >= 0 ? offerKey(this.offers[this.lockIdx]) : null;
    this.offers = makeOffers(p, keep, this.offers.map(offerKey));
    this.lockIdx = lockedKey ? this.offers.findIndex(o => offerKey(o) === lockedKey) : -1;
    Sound.reroll(); this.render();
  },
  choose(i) {
    const game = G.game;
    if (game.state !== 'levelup' || this.choosing || performance.now() - this.openedAt < 380) return;
    const o = this.offers[i]; if (!o) return;
    if (i === this.lockIdx) { this.toggleLock(i); return; }
    const p = W.player;
    this.choosing = true;
    if (this.lockIdx >= 0) { const s = Object.assign({}, this.offers[this.lockIdx]); delete s.saved; p.savedCard = s; p.locks--; }
    const cards = $('cards').children;
    cards[i].classList.add('picked');
    for (let k = 0; k < cards.length; k++) if (k !== i) cards[k].style.opacity = k === this.lockIdx ? '0.7' : '0.25';
    const fresh = applyOffer(p, o);
    const col = CARD_COL[o.cat];
    p.glowT = o.kind === 'evo' ? 2.5 : 0.9; p.glowCol = col; p.squash = 1;
    FX.sparkle(p.x, p.y, col, o.kind === 'evo' ? 60 : 24, o.kind === 'evo' ? 520 : 300);
    if (o.kind === 'evo') { Sound.evolve(); p.transformT = 1.2; game.banner(o.name, '#ffc93c', o.tier === 2 ? 'TIER II EVOLUTION' : WEAPONS[p.weapon].name.toUpperCase() + ' EVOLVED'); game.shake(12); FX.distort(p.x, p.y, 220); }
    else Sound.select(false);
    fresh.forEach((s, k) => game.later(0.2 + k * 1.4, () => game.onSynergy(s)));
    setTimeout(() => {
      game.pending--;
      if (game.pending > 0) { this.openLevelUp(); return; }
      p.invuln = 0.8; game.state = 'play'; G.ui.show(null);
    }, 360);
  },
  // ---------------- equipment crate ----------------
  openCrate(offers) {
    this.crate = offers; this.openedAt = performance.now(); this.choosing = false; mouse.down = false;
    $('luTitle').textContent = 'EQUIPMENT CRATE'; $('luSub').hidden = false; $('luSub').textContent = 'Upgrade a rank, raise a rarity or swap gear (swaps keep your rank)';
    $('luBar').hidden = true; $('luHint').textContent = `Press 1–${offers.length} or click a card`;
    const p = W.player, box = $('cards'); box.innerHTML = '';
    offers.forEach((o, i) => {
      const c = document.createElement('div'); c.className = 'card gear'; c.tabIndex = 0; c.setAttribute('role', 'button');
      const add = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; e.textContent = text; c.appendChild(e); return e; };
      const icon = document.createElement('canvas'); icon.width = icon.height = 128;
      add('span', 'num', i + 1);
      if (o.kind === 'eqCache') {
        c.style.setProperty('--c', '#52f08a'); add('span', 'cat', 'Supply cache'); c.appendChild(icon); drawIcon(icon.getContext('2d'), 'crate', '#52f08a', 128);
        add('h3', '', 'FIELD SUPPLIES'); add('p', '', 'All your gear is maxed. Take XP and +25 HP instead.');
      } else {
        const it = p.eq[o.slot], def = EQ[o.kind === 'eqSwap' ? o.id : it.id];
        const rar = o.kind === 'eqRarity' ? o.to : o.kind === 'eqSwap' ? o.rarity : it.rarity, rank = o.kind === 'eqRank' ? o.to : o.kind === 'eqSwap' ? o.rank : it.rank;
        c.style.setProperty('--c', RARITY_COL[rar]);
        add('span', 'cat', o.kind === 'eqRank' ? 'Upgrade rank' : o.kind === 'eqRarity' ? 'Raise rarity' : 'Swap ' + SLOT_NAMES[o.slot].toLowerCase());
        add('span', 'rar', `${rar} · rank ${rank}`);
        c.appendChild(icon); drawIcon(icon.getContext('2d'), def.icon, RARITY_COL[rar], 128);
        add('h3', '', def.name);
        if (o.kind === 'eqRank') { add('div', 'next', `RANK ${o.from} → ${o.to}`); add('p', '', def.ranks[o.to - 1]); }
        else if (o.kind === 'eqRarity') { add('div', 'next', `${o.from.toUpperCase()} → ${o.to.toUpperCase()}`); add('p', '', def.perks[rarityIdx(o.to)]); }
        else { add('div', 'next', 'Replaces ' + EQ[o.from].name); add('p', '', def.desc + ' ' + def.ranks[o.rank - 1] + '.'); const perk = def.perks.slice(1, rarityIdx(o.rarity) + 1).filter(Boolean); if (perk.length) add('p', '', 'Perks: ' + perk.join(' · ')); }
      }
      c.addEventListener('click', () => this.chooseCrate(i));
      c.addEventListener('keydown', ev => { if (ev.key === 'Enter') this.chooseCrate(i); });
      c.addEventListener('mouseenter', () => Sound.hover());
      box.appendChild(c);
    });
    G.ui.show('levelup');
  },
  crateKey(k) { const n = +k; if (n >= 1 && n <= (this.crate || []).length) this.chooseCrate(n - 1); },
  chooseCrate(i) {
    if (G.game.state !== 'crate' || this.choosing || performance.now() - this.openedAt < 380) return;
    const o = this.crate[i]; if (!o) return;
    this.choosing = true;
    $('cards').children[i].classList.add('picked');
    G.game.applyCrate(o);
    if (o.kind !== 'eqCache') G.game.toast(o.kind === 'eqRank' ? 'GEAR RANK UP' : o.kind === 'eqRarity' ? 'RARITY UP · ' + o.to.toUpperCase() : 'GEAR SWAPPED', RARITY_COL[o.kind === 'eqRarity' ? o.to : 'rare']);
    setTimeout(() => { W.player.invuln = 0.8; G.game.state = 'play'; G.ui.show(null); }, 360);
  },
};
$('rerollBtn').addEventListener('click', () => LevelUp.reroll());
