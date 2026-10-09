// ===================== UI: screen routing, level-up, build overview, pause, game over =====================
const $ = id => document.getElementById(id);
const SCREENS = ['intro', 'menu', 'character', 'codex', 'statsScreen', 'settings', 'levelup', 'build', 'pause', 'gameover'];
const CARD_COL = Object.assign({ evo: '#ffc93c', swap: '#f4f6fb', misc: '#52f08a' }, Object.fromEntries(CAT_ORDER.map(c => [c, CATS[c].col])));
const UI = {
  offers: [], openedAt: 0, choosing: false, lockIdx: -1, hoverIdx: -1, menuSel: 0,
  show(id) {
    for (const s of SCREENS) $(s).hidden = s !== id;
    $('muteBtn').hidden = !(id === 'pause' || id === 'gameover');
    canvas.style.cursor = id ? 'default' : 'none';
  },
  start() {
    Sound.init(); Sound.confirm();
    Game.reset(); Game.state = 'play';
    this.show(null); mouse.down = false;
  },
  toMenu() { Game.state = 'menu'; MenuScene.enter(); this.show('menu'); this.refreshBest(); this.setMenuSel(0); },
  setMenuSel(i) {
    const btns = [...$('menuList').children];
    this.menuSel = (i + btns.length) % btns.length;
    btns.forEach((b, k) => b.classList.toggle('sel', k === this.menuSel));
  },
  menuAct(act) {
    Sound.init(); Sound.confirm();
    if (act === 'deploy') this.start();
    else if (act === 'character') { Game.state = 'sub'; this.show('character'); Designer.open(); }
    else if (act === 'codex') { Game.state = 'sub'; Screens.codex(); this.show('codex'); }
    else if (act === 'stats') { Game.state = 'sub'; Screens.stats(); this.show('statsScreen'); }
    else if (act === 'settings') { Game.state = 'sub'; Screens.settings(); this.show('settings'); }
  },
  // ---------------- level up ----------------
  openLevelUp() {
    const p = player;
    Game.state = 'levelup'; mouse.down = false;
    Game.levelUpPush();
    const keep = p.savedCard ? [Object.assign({}, p.savedCard, { saved: true })] : [];
    p.savedCard = null;
    this.offers = makeOffers(p, keep);
    this.lockIdx = -1; this.hoverIdx = -1; this.openedAt = performance.now(); this.choosing = false;
    $('luTitle').textContent = 'LEVEL ' + (p.level - Game.pending + 1);
    this.renderCards();
    Sound.levelUp();
    if (this.offers.some(o => o.kind === 'evo')) Sound.evolve();
    this.show('levelup');
  },
  renderCards() {
    const p = player, box = $('cards'); box.innerHTML = '';
    $('lockCount').textContent = p.locks; $('rerollCount').textContent = p.rerolls;
    $('rerollBtn').disabled = p.rerolls <= 0;
    this.offers.forEach((o, i) => {
      const c = document.createElement('div');
      c.className = 'card' + (o.kind === 'evo' ? ' evo' : '') + (i === this.lockIdx ? ' locked' : '');
      c.tabIndex = 0; c.setAttribute('role', 'button');
      c.style.setProperty('--c', CARD_COL[o.cat]);
      const icon = document.createElement('canvas'); icon.width = icon.height = 128;
      let html = `<span class="num">${i + 1}</span>`;
      if (o.saved) html += '<span class="savedTag">SAVED CARD</span>';
      if (o.kind === 'evo') {
        html += `<span class="evoTag">${o.tier === 2 ? 'TIER II EVOLUTION' : 'WEAPON EVOLUTION'}</span><span class="cat">${o.tier === 2 ? 'Tier II' : 'Evolution'}</span>`;
      } else if (o.kind === 'upg') html += `<span class="cat">${CATS[o.cat].name}</span><span class="rar">${o.rarity}</span>`;
      else html += `<span class="cat">${o.kind === 'swap' ? 'New weapon' : 'Supplies'}</span>`;
      c.innerHTML = html;
      c.appendChild(icon);
      const h = document.createElement('h3'); h.textContent = o.name; c.appendChild(h);
      const add = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; e.textContent = text; c.appendChild(e); return e; };
      if (o.kind === 'evo') {
        const g = icon.getContext('2d'), gl = (GUN_SHAPES[p.weapon] || [14])[0], gs = Math.min(6.5, 104 / gl); g.clearRect(0, 0, 128, 128); g.save(); g.translate(64 - gl * gs / 2, 64); g.scale(gs, gs); drawGun(g, p.weapon, 0, 0, false, true); g.restore();
        const m = add('div', 'morph', ''); m.innerHTML = `${o.from} → <b></b>`; m.querySelector('b').textContent = o.name;
        add('p', '', o.desc);
        const ul = document.createElement('ul'); for (const b of o.benefits) { const li = document.createElement('li'); li.textContent = '+ ' + b.replace(/^\+/, ''); ul.appendChild(li); } c.appendChild(ul);
      } else if (o.kind === 'upg') {
        drawIcon(icon.getContext('2d'), o.icon, CARD_COL[o.cat], 128);
        add('div', 'rank', `RANK ${o.lvl} → ${o.lvl + 1} / ${o.max}`);
        const pips = document.createElement('div'); pips.className = 'pips';
        for (let k = 0; k < o.max; k++) { const s = document.createElement('i'); s.className = k < o.lvl ? 'on' : k === o.lvl ? 'new' : ''; pips.appendChild(s); }
        c.appendChild(pips);
        add('div', 'next', o.next);
        add('p', '', o.desc);
        const links = document.createElement('div'); links.className = 'links';
        for (const s of synergiesFor(o.id)) {
          if (p.synergies.has(s.id)) continue;
          const sim = Object.assign({}, p.upg, { [o.id]: o.lvl + 1 });
          const ok = Object.keys(s.req).every(k => (sim[k] || 0) >= s.req[k]);
          const sp = document.createElement('span'); sp.className = ok ? 'ok' : ''; sp.textContent = (ok ? 'UNLOCKS ' : '◇ ') + s.name; links.appendChild(sp);
        }
        for (const e of evosFor(p, o.id)) { const sp = document.createElement('span'); sp.className = 'evoL'; sp.textContent = '★ ' + e.name; links.appendChild(sp); }
        c.appendChild(links);
      } else {
        drawIcon(icon.getContext('2d'), o.icon, CARD_COL[o.cat], 128);
        add('p', '', o.desc);
      }
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
  toggleLock(i) {
    const o = this.offers[i]; if (!o || o.kind === 'misc' || o.saved || this.choosing) return;
    if (this.lockIdx === i) this.lockIdx = -1;
    else if (player.locks > 0) this.lockIdx = i;
    else { FX.text(player.x, player.y - 40, 'NO LOCKS', '#ff3b4e', 14); return; }
    Sound.lock(); this.renderCards();
  },
  reroll() {
    const p = player;
    if (Game.state !== 'levelup' || this.choosing || p.rerolls <= 0) return;
    p.rerolls--;
    const keep = this.offers.filter((o, i) => o.saved || i === this.lockIdx);
    const lockedKey = this.lockIdx >= 0 ? offerKey(this.offers[this.lockIdx]) : null;
    const avoid = this.offers.map(offerKey);
    this.offers = makeOffers(p, keep, avoid);
    this.lockIdx = lockedKey ? this.offers.findIndex(o => offerKey(o) === lockedKey) : -1;
    Sound.reroll(); this.renderCards();
  },
  choose(i) {
    if (Game.state !== 'levelup' || this.choosing || performance.now() - this.openedAt < 380) return;
    const o = this.offers[i]; if (!o) return;
    if (i === this.lockIdx) { this.toggleLock(i); return; }   // a locked card is saved, not taken
    const p = player;
    this.choosing = true;
    if (this.lockIdx >= 0) { const s = Object.assign({}, this.offers[this.lockIdx]); delete s.saved; p.savedCard = s; p.locks--; }
    const cards = $('cards').children;
    cards[i].classList.add('picked');
    for (let k = 0; k < cards.length; k++) if (k !== i) cards[k].style.opacity = k === this.lockIdx ? '0.7' : '0.25';
    const fresh = applyOffer(p, o);
    const col = CARD_COL[o.cat];
    p.glowT = o.kind === 'evo' ? 2.5 : 0.9; p.glowCol = col; p.squash = 1;
    FX.sparkle(p.x, p.y, col, o.kind === 'evo' ? 60 : 24, o.kind === 'evo' ? 520 : 300);
    if (o.kind === 'evo') {
      Sound.evolve(); p.transformT = 1.2; Game.banner(o.name, '#ffc93c', o.tier === 2 ? 'TIER II EVOLUTION' : WEAPONS[p.weapon].name.toUpperCase() + ' EVOLVED'); Game.shake(12); FX.distort(p.x, p.y, 220);
      if (!Game.runDisc.includes(o.id)) Game.runDisc.push(o.id);
    } else Sound.select(false);
    fresh.forEach((s, k) => setTimeoutGame(0.2 + k * 1.4, () => Game.onSynergy(s)));
    setTimeout(() => {
      Game.pending--;
      if (Game.pending > 0) { this.openLevelUp(); return; }
      p.invuln = 0.8;
      Game.state = 'play'; this.show(null);
    }, 360);
  },
  // ---------------- pause / build ----------------
  pause() {
    if (Game.state !== 'play') return;
    Game.state = 'pause'; mouse.down = false;
    this.fillStats($('pauseStats'), $('pauseBuild'));
    $('muteBtn2').textContent = Sound.muted ? 'UNMUTE' : 'MUTE';
    this.show('pause');
  },
  resume() { if (Game.state !== 'pause' && Game.state !== 'build') return; Game.state = 'play'; this.show(null); Sound.ui(); },
  openBuild() {
    if (Game.state !== 'play' && Game.state !== 'pause') return;
    this.buildFrom = Game.state; Game.state = 'build'; mouse.down = false;
    this.renderBuild(); this.show('build');
  },
  closeBuild() { if (this.buildFrom === 'pause') { Game.state = 'pause'; this.show('pause'); } else this.resume(); },
  renderBuild() {
    const p = player, g = p.gun, S = p.S, top = evoTop(p), arch = archetypeOf(p);
    const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    const kv = [['Damage', Math.round(g.dmg) + (g.pellets > 1 ? ' x' + g.pellets : '')], ['Fire rate', fireRate(p).toFixed(1) + '/s'], ['Magazine', g.mag], ['Reload', reloadTime(p).toFixed(2) + 's'],
      ['Pierce', g.pierce], ['Ricochet', g.ricochet], ['Crit', pct(g.critChance) + ' · x' + g.critMul.toFixed(1)], ['Move speed', Math.round(moveSpeed(p))],
      ['Dash cooldown', S.dashCd.toFixed(2) + 's'], ['Max HP', p.maxHp], ['Regen', S.regen.toFixed(1) + '/s'], ['Dodge', pct(S.evade)], ['Pickup radius', pct(S.magnet)]];
    const paths = openPaths(p).map(e => {
      const reqs = reqList(p, e.req).map(q => `<em class="${q.ok ? 'ok' : ''}">${esc(q.name)} ${q.have}/${q.need}</em>`).join(' · ');
      return `<div class="syn"><b style="color:var(--gold)">${esc(e.name)}</b><span>${esc(e.desc)}</span>${reqs} · <em class="${p.level >= e.minLevel ? 'ok' : ''}">Level ${e.minLevel}</em></div>`;
    }).join('') || '<div class="syn"><span>All evolutions for this weapon unlocked.</span></div>';
    let ups = '';
    for (const c of CAT_ORDER) {
      const ids = Object.keys(p.upg).filter(id => UPG[id].cat === c);
      if (!ids.length) continue;
      ups += `<h3 style="color:${CATS[c].col};margin-top:8px">${CATS[c].name}</h3><div class="upList">` + ids.map(id => `<div class="up" style="--c:${CATS[c].col}" title="${esc(UPG[id].fx(p.upg[id]))}"><canvas data-icon="${UPG[id].icon}" data-col="${CATS[c].col}" width="52" height="52"></canvas>${esc(UPG[id].name)}<small>${p.upg[id]}/${UPG[id].max}</small></div>`).join('') + '</div>';
    }
    const syns = SYNERGIES.map(s => `<div class="syn ${p.synergies.has(s.id) ? 'on' : ''}"><b>${esc(s.name)}</b><span>${esc(s.desc)}</span>${reqList(p, s.req).map(q => `<em class="${q.ok ? 'ok' : ''}">${esc(q.name)} ${q.have}/${q.need}</em>`).join(' · ')}</div>`).join('');
    $('buildBody').innerHTML = `
      <div class="panel"><h3>WEAPON</h3><div class="arch" style="color:${top ? 'var(--gold)' : 'var(--text)'}">${esc(top ? top.name : g.name.toUpperCase())}</div>
        <div class="hint" style="font-size:14px;margin-bottom:8px">${esc(WEAPONS[p.weapon].name)}${top ? ' · ' + (top.tier === 2 ? 'Tier II' : 'Tier I') + ' evolution' : ''}</div>
        <h3>ARCHETYPE</h3><div class="arch">${esc(arch.name)}</div><div class="hint" style="font-size:14px;margin-bottom:10px;text-transform:none;letter-spacing:.04em">${esc(arch.desc)}</div>
        <h3>EFFECTIVE STATS</h3><div class="kv">${kv.map(([k, v]) => `<span>${k}</span><span>${v}</span>`).join('')}</div>
        <h3 style="margin-top:12px">EVOLUTION PROGRESS</h3>${paths}</div>
      <div class="panel"><h3>UPGRADES · ${Object.keys(p.upg).length}</h3>${ups || '<p class="hint">No upgrades yet.</p>'}</div>
      <div class="panel"><h3>SYNERGIES · ${p.synergies.size}/${SYNERGIES.length}</h3>${syns}</div>`;
    for (const cv of $('buildBody').querySelectorAll('canvas[data-icon]')) drawIcon(cv.getContext('2d'), cv.dataset.icon, cv.dataset.col, 52);
  },
  fillStats(statsEl, buildEl) {
    const p = player;
    const rows = [['Time', fmtTime(Game.time)], ['Wave', Game.wave], ['Level', p.level], ['Kills', Game.kills], ['Best combo', 'x' + Game.bestCombo], ['Damage', Math.round(p.dmgDealt).toLocaleString()]];
    statsEl.innerHTML = rows.map(([k, v]) => `<div class="stat"><small>${k}</small><b>${v}</b></div>`).join('');
    const top = evoTop(p);
    const parts = [`<span style="border-color:${top ? '#ffc93c' : '#ff9a1f'}">${top ? top.name : WEAPONS[p.weapon].name}</span>`];
    for (const id of p.synergies) parts.push(`<span style="border-color:#ff4fd8">${SYN[id].name}</span>`);
    for (const id in p.upg) parts.push(`<span>${UPG[id].name} <em>${p.upg[id]}</em></span>`);
    buildEl.innerHTML = parts.join('');
  },
  gameOver() {
    const p = player;
    this.fillStats($('goStats'), $('goBuild'));
    $('goStats').insertAdjacentHTML('beforeend', `<div class="stat"><small>XP collected</small><b>${Math.round(p.xpTotal).toLocaleString()}</b></div><div class="stat"><small>Synergies</small><b>${p.synergies.size}</b></div><div class="stat"><small>Evolutions</small><b>${Game.runDisc.length}</b></div>`);
    const arch = archetypeOf(p);
    $('goArch').textContent = arch.name;
    const broken = Progress.recordRun({ time: Game.time, wave: Game.wave, level: p.level, kills: Game.kills, streak: Game.bestCombo, xp: p.xpTotal, damage: p.dmgDealt, weaponTime: p.weaponTime });
    const best = store.get('uc_best', null);
    if (!best || Game.time > best.time) store.set('uc_best', { time: Game.time, wave: Game.wave, kills: Game.kills, level: p.level });
    $('records').hidden = !broken.length;
    $('records').innerHTML = broken.map(b => `<span>NEW RECORD · ${b.toUpperCase()}</span>`).join('');
    this.show('gameover');
  },
  refreshBest() {
    const b = store.get('uc_best', null);
    $('bestTitle').innerHTML = b ? `Best run: <b>${fmtTime(b.time)}</b> · wave <b>${b.wave}</b> · <b>${b.kills}</b> kills` : '';
  },
  toggleMute() {
    const m = Sound.toggle();
    $('muteBtn').textContent = 'Sound: ' + (m ? 'off' : 'on') + ' (M)';
    $('muteBtn2').textContent = m ? 'UNMUTE' : 'MUTE';
    if (Game.state === 'sub' && !$('settings').hidden) Screens.settings();
  },
};

function onKeyPress(k, e) {
  const st = Game.state;
  if (st === 'intro') { Intro.skip(); return; }
  if (k === 'm' && st !== 'sub') { UI.toggleMute(); return; }
  if (st === 'menu') {
    if (k === 'arrowdown' || k === 's') { UI.setMenuSel(UI.menuSel + 1); Sound.init(); Sound.hover(); }
    else if (k === 'arrowup' || k === 'w') { UI.setMenuSel(UI.menuSel - 1); Sound.init(); Sound.hover(); }
    else if (k === 'enter' || k === ' ') UI.menuAct($('menuList').children[UI.menuSel].dataset.act);
    return;
  }
  if (st === 'sub') { if (k === 'escape') { Sound.ui(); UI.toMenu(); } return; }
  if (st === 'play') { if (k === 'escape' || k === 'p') UI.pause(); else if (k === 'tab') UI.openBuild(); return; }
  if (st === 'pause') { if (k === 'escape' || k === 'p') UI.resume(); else if (k === 'tab') UI.openBuild(); return; }
  if (st === 'build') { if (k === 'tab' || k === 'escape') UI.closeBuild(); return; }
  if (st === 'levelup') {
    if (['1', '2', '3'].includes(k)) UI.choose(+k - 1);
    else if (k === 'l' && UI.hoverIdx >= 0) UI.toggleLock(UI.hoverIdx);
    else if (k === 'r') UI.reroll();
    return;
  }
  if (st === 'dead' && (k === 'enter' || k === 'r')) UI.start();
}
function onBlur() { if (Game.state === 'play') UI.pause(); }

$('againBtn').addEventListener('click', () => UI.start());
$('goMenuBtn').addEventListener('click', () => { Sound.ui(); UI.toMenu(); });
$('resumeBtn').addEventListener('click', () => UI.resume());
$('buildBtn').addEventListener('click', () => UI.openBuild());
$('restartBtn').addEventListener('click', () => UI.start());
$('menuBtn').addEventListener('click', () => { Sound.ui(); UI.toMenu(); });
$('muteBtn2').addEventListener('click', () => UI.toggleMute());
$('muteBtn').addEventListener('click', e => { UI.toggleMute(); e.currentTarget.blur(); });
$('rerollBtn').addEventListener('click', () => UI.reroll());
$('muteBtn').textContent = 'Sound: ' + (Sound.muted ? 'off' : 'on') + ' (M)';
[...$('menuList').children].forEach((b, i) => {
  b.addEventListener('click', () => UI.menuAct(b.dataset.act));
  b.addEventListener('mouseenter', () => { UI.setMenuSel(i); Sound.hover(); });
});
for (const b of document.querySelectorAll('[data-back]')) b.addEventListener('click', () => { Sound.ui(); UI.toMenu(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) onBlur(); });
try { if (matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches) $('touchNote').hidden = false; } catch (e) { }
