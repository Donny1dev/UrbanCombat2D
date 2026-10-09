// ===================== SUB-SCREENS: character designer, codex, statistics, settings =====================
const Designer = {
  mode: 'walk', weapon: 'rifle', rot: 0, drag: null, auto: true, t: 0, shootT: 0, flash: 0, mx: 0, my: 0,
  cv: $('lookCanvas'),
  groups: [
    ['Body', [['Skin', 'skin', 'skin'], ['Build', 'build', 'opts']]],
    ['Head', [['Hair', 'style', 'opts'], ['Hair / hat', 'hairCol', 'pal'], ['Mask', 'mask', 'opts'], ['Mask colour', 'maskCol', 'pal'], ['Eyewear', 'glasses', 'opts']]],
    ['Clothing', [['Top', 'top', 'opts'], ['Top colour', 'topCol', 'pal'], ['Vest', 'vest', 'opts'], ['Vest colour', 'vestCol', 'pal'], ['Gloves', 'gloves', 'opts'], ['Glove colour', 'glovesCol', 'pal']]],
    ['Legs', [['Pants', 'pants', 'pal'], ['Cut', 'shorts', 'bool', ['Trousers', 'Shorts']], ['Boots', 'boots', 'pal']]],
    ['Accessories', [['Backpack', 'backpack', 'opts'], ['Pack colour', 'backpackCol', 'pal'], ['Pads', 'pads', 'bool', ['Off', 'On']], ['Accent', 'accent', 'opts']]],
  ],
  open() {
    this.renderOpts();
    const wbox = $('lookWeapon'); wbox.innerHTML = '';
    for (const w of WEAPON_IDS) { const b = document.createElement('button'); b.type = 'button'; b.textContent = WEAPONS[w].name; b.className = w === this.weapon ? 'on' : ''; b.onclick = () => { this.weapon = w; Sound.hover(); this.open(); }; wbox.appendChild(b); }
  },
  set(key, val) { playerLook[key] = val; store.set('uc_look', playerLook); Sound.hover(); this.renderOpts(); },
  renderOpts() {
    const box = $('lookOpts'); box.innerHTML = '';
    for (const [gname, rows] of this.groups) {
      const g = document.createElement('div'); g.className = 'optGroup';
      const h = document.createElement('h3'); h.textContent = gname.toUpperCase(); g.appendChild(h);
      for (const [label, key, kind, names] of rows) {
        const row = document.createElement('div'); row.className = 'opt';
        const l = document.createElement('label'); l.textContent = label; row.appendChild(l);
        const cur = playerLook[key];
        const btn = (text, val, on, swatch) => {
          const b = document.createElement('button'); b.type = 'button';
          if (swatch) { b.className = 'sw' + (on ? ' on' : ''); b.style.background = swatch; b.title = swatch; b.setAttribute('aria-label', label + ' ' + swatch); }
          else { b.textContent = text; b.className = on ? 'on' : ''; }
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
    const L = playerLook;
    L.skin = randi(0, SKIN.length - 1);
    for (const k of ['build', 'top', 'vest', 'gloves', 'style', 'mask', 'glasses', 'backpack', 'accent']) L[k] = pick(LOOK_OPTS[k]);
    if (Math.random() < 0.55) L.mask = 'none'; if (Math.random() < 0.5) L.glasses = 'none';
    for (const k of ['topCol', 'vestCol', 'glovesCol', 'hairCol', 'maskCol', 'pants', 'boots', 'backpackCol']) L[k] = pick(PALETTE);
    L.shorts = Math.random() < 0.25; L.pads = Math.random() < 0.3;
    store.set('uc_look', L); Sound.reroll(); this.renderOpts();
  },
  reset() { playerLook = Object.assign({}, LOOK_DEFAULT); store.set('uc_look', playerLook); Sound.ui(); this.renderOpts(); },
  render(dt) {
    const c = this.cv, g = c.getContext('2d'), W = c.width, H = c.height;
    this.t += dt;
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, W, H);
    // concrete floor tiles for context
    g.strokeStyle = 'rgba(255,255,255,0.05)'; g.lineWidth = 1;
    for (let i = 0; i <= W; i += 56) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, H); g.moveTo(0, i); g.lineTo(W, i); g.stroke(); }
    let a = this.rot;
    if (this.auto && !this.drag && (this.mode === 'idle' || this.mode === 'walk')) this.rot += dt * 0.6;
    if (this.mode === 'aim' || this.mode === 'shoot') a = Math.atan2(this.my - H / 2, this.mx - W / 2);
    let recoil = 0;
    if (this.mode === 'shoot') {
      this.shootT -= dt;
      if (this.shootT <= 0) { this.shootT = 1 / Math.min(8, WEAPONS[this.weapon].rate); this.flash = 0.06; }
      this.flash -= dt; recoil = this.flash > 0 ? WEAPONS[this.weapon].recoil : 0;
    }
    const s = 5.2;
    g.save(); g.translate(W / 2, H / 2 + 10);
    g.strokeStyle = 'rgba(46,242,255,0.25)'; g.lineWidth = 3; g.beginPath(); g.arc(0, 0, 22 * s, 0, TAU); g.stroke();
    drawHuman(g, 0, 0, Object.assign({}, lookToOpts(playerLook), { a, phase: this.t * 7, moving: this.mode === 'walk', scale: s, weapon: this.weapon, recoil, altRecoil: recoil }));
    if (this.flash > 0) {
      g.rotate(a); g.globalCompositeOperation = 'lighter';
      const len = ((GUN_SHAPES[this.weapon] || [14])[0] + 18) * s;
      g.fillStyle = '#ffb347'; g.beginPath(); g.moveTo(len, -8 * s); g.lineTo(len + 26 * s, 0); g.lineTo(len, 8 * s); g.closePath(); g.fill();
      g.fillStyle = '#fffbe0'; g.beginPath(); g.arc(len + 4 * s, 0, 6 * s, 0, TAU); g.fill();
      g.globalCompositeOperation = 'source-over';
    }
    g.restore();
  },
};
(() => {
  const c = Designer.cv;
  const local = e => { const r = c.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * c.width, (e.clientY - r.top) / r.height * c.height]; };
  c.addEventListener('pointerdown', e => { Designer.drag = { x: e.clientX, rot: Designer.rot }; Designer.auto = false; c.setPointerCapture(e.pointerId); c.style.cursor = 'grabbing'; });
  c.addEventListener('pointermove', e => { [Designer.mx, Designer.my] = local(e); if (Designer.drag) Designer.rot = Designer.drag.rot + (e.clientX - Designer.drag.x) * 0.012; });
  c.addEventListener('pointerup', () => { Designer.drag = null; c.style.cursor = 'grab'; });
  for (const b of $('lookMode').children) b.addEventListener('click', () => { Designer.mode = b.dataset.m; for (const o of $('lookMode').children) o.classList.toggle('on', o === b); Sound.hover(); });
  $('lookRandom').addEventListener('click', () => Designer.randomize());
  $('lookReset').addEventListener('click', () => Designer.reset());
})();

const Screens = {
  codex() {
    const esc = s => String(s).replace(/[&<>]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch]));
    const box = $('codexBody'); box.innerHTML = '';
    $('codexCount').textContent = `Discovered ${EVOS.filter(e => Progress.disc.has(e.id)).length} / ${EVOS.length}`;
    const maxRange = Math.max(...WEAPON_IDS.map(w => WEAPONS[w].speed * WEAPONS[w].life));
    for (const w of WEAPON_IDS) {
      const W = WEAPONS[w], card = document.createElement('article'); card.className = 'wcard';
      const bars = [['Damage', W.dmg * W.pellets / 100], ['Fire rate', W.rate / 15], ['Magazine', W.mag / 40], ['Reload', 1 - (W.reload - 0.8) / 0.7], ['Accuracy', 1 - W.spread / 0.45], ['Range', W.speed * W.life / maxRange]];
      card.innerHTML = `<header><canvas width="240" height="96"></canvas><div><h3>${esc(W.name)}</h3><p class="blurb">${esc(W.blurb)}</p></div></header>
        <div class="bars">${bars.map(([k, v]) => `<span>${k}</span><i style="--v:${Math.round(clamp(v, 0.05, 1) * 100)}%"></i>`).join('')}</div>`;
      const g = card.querySelector('canvas').getContext('2d'), gl = GUN_SHAPES[w][0], gs = Math.min(8, 200 / gl); g.translate(120 - gl * gs / 2, 48); g.scale(gs, gs); drawGun(g, w, 0, 0, false, false);
      for (const e of evoPaths(w)) {
        const found = Progress.disc.has(e.id), el = document.createElement('div'); el.className = 'evo' + (found ? '' : ' locked');
        const req = (e.tier === 2 ? `From ${EVO[e.from].name} + ` : '') + Object.keys(e.req).map(id => `${UPG[id].name} ${e.req[id]}`).join(' + ') + ` · Level ${e.minLevel}`;
        const shared = e.tier === 1 && e.weapons.length > 1 ? ` · also ${e.weapons.filter(x => x !== w).map(x => WEAPONS[x].name).join(', ')}` : '';
        el.innerHTML = `<h4>${esc(e.name)} <span><span class="tag2 ${found ? '' : 'dim'}">${found ? 'DISCOVERED' : 'UNDISCOVERED'}</span> <span class="tag2 dim">${e.tier === 2 ? 'TIER II' : 'TIER I'}</span></span></h4>
          <div class="req">${esc(req + shared)}</div><p>${esc(e.desc)}</p><p style="color:${found ? '#ffe9a8' : 'var(--muted)'};font-weight:700">${esc(e.benefits.join(' · '))}</p>`;
        card.appendChild(el);
      }
      box.appendChild(card);
    }
  },
  stats() {
    const s = Progress.stats;
    const rows = [['Total kills', s.kills.toLocaleString()], ['Total deaths', s.deaths], ['Runs', s.runs], ['Longest survival', fmtTime(s.longest)], ['Highest wave', s.wave], ['Highest level', s.level],
      ['Most used weapon', Progress.mostUsed()], ['Evolutions discovered', `${EVOS.filter(e => Progress.disc.has(e.id)).length} / ${EVOS.length}`], ['Best kill streak', 'x' + s.streak],
      ['Total XP collected', Math.round(s.xp).toLocaleString()], ['Total damage dealt', Math.round(s.damage).toLocaleString()]];
    $('statsBody').innerHTML = rows.map(([k, v]) => `<div class="stat"><small>${k}</small><b>${v}</b></div>`).join('');
  },
  settings() {
    const onoff = (el, v) => { el.textContent = v ? 'ON' : 'OFF'; el.className = v ? 'on' : ''; };
    $('setVol').value = Math.round(Settings.volume * 100); $('setShake').value = Math.round(Settings.shake * 100);
    onoff($('setNums'), Settings.dmgNums); onoff($('setComic'), Settings.comic); onoff($('setMute'), !Sound.muted);
    $('setResetYes').hidden = true;
  },
};
$('setVol').addEventListener('input', e => { Sound.init(); Sound.setVolume(e.target.value / 100); });
$('setVol').addEventListener('change', () => Sound.ui());
$('setShake').addEventListener('input', e => { Settings.shake = e.target.value / 100; Settings.save(); });
$('setNums').addEventListener('click', () => { Settings.dmgNums = !Settings.dmgNums; Settings.save(); Sound.ui(); Screens.settings(); });
$('setComic').addEventListener('click', () => { Settings.comic = !Settings.comic; Settings.save(); Sound.ui(); Screens.settings(); });
$('setMute').addEventListener('click', () => { Sound.init(); UI.toggleMute(); Screens.settings(); });
$('setIntro').addEventListener('click', () => { try { sessionStorage.removeItem('uc_intro'); } catch (e) { } if (reducedMotion) { UI.toMenu(); return; } Intro.start(); });
$('setReset').addEventListener('click', () => { $('setResetYes').hidden = false; Sound.ui(); });
$('setResetYes').addEventListener('click', () => { Progress.reset(); $('setResetYes').hidden = true; Sound.confirm(); UI.refreshBest(); });
