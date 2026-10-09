// ===================== UI: menus, level-up cards, loop =====================
const $ = id => document.getElementById(id);
const UI = {
  offers: [], openedAt: 0, choosing: false,
  show(id) { for (const s of ['title', 'levelup', 'pause', 'gameover']) $(s).hidden = s !== id; $('muteBtn').hidden = id === 'title'; canvas.style.cursor = id ? 'default' : 'none'; },
  start() {
    Sound.init(); Sound.ui();
    Game.reset(); Game.state = 'play';
    this.show(null); mouse.down = false;
  },
  openLevelUp() {
    Game.state = 'levelup'; mouse.down = false;
    Game.levelUpPush();
    this.offers = makeOffers(player);
    this.openedAt = performance.now(); this.choosing = false;
    $('luTitle').textContent = 'LEVEL ' + (player.level - Game.pending + 1);
    const box = $('cards'); box.innerHTML = '';
    this.offers.forEach((o, i) => {
      const c = document.createElement('button');
      c.type = 'button'; c.className = 'card' + (o.kind === 'evo' ? ' evo' : '');
      c.style.setProperty('--c', CAT_COL[o.cat]);
      const catLabel = { weapon: 'Weapon', move: 'Movement', survival: 'Survival', evo: 'Weapon Evolution', swap: 'New Weapon', misc: 'Supplies' }[o.cat];
      c.innerHTML = `<span class="num">${i + 1}</span><span class="cat">${catLabel}</span><canvas width="144" height="144"></canvas><h3></h3><p></p>`;
      c.querySelector('h3').textContent = o.name;
      c.querySelector('p').textContent = o.desc;
      if (o.kind === 'upg') {
        const pips = document.createElement('div'); pips.className = 'pips';
        for (let k = 0; k < o.max; k++) { const s = document.createElement('i'); if (k <= o.lvl) s.className = 'on'; pips.appendChild(s); }
        c.appendChild(pips);
      }
      drawIcon(c.querySelector('canvas').getContext('2d'), o.icon, CAT_COL[o.cat], 144);
      c.addEventListener('click', () => this.choose(i));
      c.addEventListener('mouseenter', () => Sound.ui());
      box.appendChild(c);
    });
    Sound.levelUp();
    this.show('levelup');
  },
  choose(i) {
    if (Game.state !== 'levelup' || this.choosing || performance.now() - this.openedAt < 380) return;
    const o = this.offers[i]; if (!o) return;
    this.choosing = true;
    const cards = $('cards').children;
    cards[i].classList.add('picked');
    for (let k = 0; k < cards.length; k++) if (k !== i) cards[k].style.opacity = '0.25';
    Sound.select(o.kind === 'evo');
    applyOffer(player, o);
    const col = CAT_COL[o.cat];
    player.glowT = o.kind === 'evo' ? 2.5 : 0.9; player.glowCol = col; player.squash = 1;
    FX.sparkle(player.x, player.y, col, o.kind === 'evo' ? 60 : 24, o.kind === 'evo' ? 520 : 300);
    if (o.kind === 'evo') { Game.banner(o.name + '!', '#ffc93c'); Game.shake(12); }
    setTimeout(() => {
      Game.pending--;
      if (Game.pending > 0) { this.openLevelUp(); return; }
      player.invuln = 0.8;
      Game.state = 'play'; this.show(null);
    }, 360);
  },
  pause() {
    if (Game.state !== 'play') return;
    Game.state = 'pause'; mouse.down = false;
    this.fillStats($('pauseStats'), $('pauseBuild'));
    $('muteBtn2').textContent = Sound.muted ? 'UNMUTE' : 'MUTE';
    this.show('pause');
  },
  resume() { if (Game.state !== 'pause') return; Game.state = 'play'; this.show(null); Sound.ui(); },
  fillStats(statsEl, buildEl) {
    const p = player;
    const rows = [['Time', fmtTime(Game.time)], ['Wave', Game.wave], ['Level', p.level], ['Kills', Game.kills], ['Best combo', 'x' + Game.bestCombo], ['Damage', Math.round(p.dmgDealt).toLocaleString()]];
    statsEl.innerHTML = rows.map(([k, v]) => `<div class="stat"><small>${k}</small><b>${v}</b></div>`).join('');
    const evo = p.evolved ? EVOS.find(e => e.id === p.evolved) : null;
    const parts = [`<span style="border-color:${evo ? '#ffc93c' : '#ff9a1f'}">${evo ? evo.name : WEAPONS[p.weapon].name}</span>`];
    for (const id in p.upg) parts.push(`<span>${UPG[id].name} <em>${p.upg[id]}</em></span>`);
    buildEl.innerHTML = parts.join('');
  },
  gameOver() {
    this.fillStats($('goStats'), $('goBuild'));
    const best = store.get('uc_best', null);
    const isBest = !best || Game.time > best.time;
    if (isBest) store.set('uc_best', { time: Game.time, wave: Game.wave, kills: Game.kills, level: player.level });
    $('newBest').hidden = !isBest;
    this.show('gameover');
    this.refreshBest();
  },
  refreshBest() {
    const b = store.get('uc_best', null);
    $('bestTitle').innerHTML = b ? `Best run: <b>${fmtTime(b.time)}</b> · wave <b>${b.wave}</b> · <b>${b.kills}</b> kills` : '';
  },
  toggleMute() {
    const m = Sound.toggle();
    $('muteBtn').textContent = 'Sound: ' + (m ? 'off' : 'on') + ' (M)';
    $('muteBtn2').textContent = m ? 'UNMUTE' : 'MUTE';
  },
};

function onKeyPress(k, e) {
  if (k === 'm') { UI.toggleMute(); return; }
  if (Game.state === 'title' && (k === 'enter' || k === ' ')) { UI.start(); return; }
  if (k === 'escape' || k === 'p') { if (Game.state === 'play') UI.pause(); else if (Game.state === 'pause') UI.resume(); return; }
  if (Game.state === 'levelup' && ['1', '2', '3'].includes(k)) { UI.choose(+k - 1); return; }
  if (Game.state === 'dead' && (k === 'enter' || k === 'r')) { UI.start(); return; }
}
function onBlur() { if (Game.state === 'play') UI.pause(); }

$('startBtn').addEventListener('click', () => UI.start());
$('againBtn').addEventListener('click', () => UI.start());
$('resumeBtn').addEventListener('click', () => UI.resume());
$('restartBtn').addEventListener('click', () => UI.start());
$('muteBtn2').addEventListener('click', () => UI.toggleMute());
$('muteBtn').addEventListener('click', e => { UI.toggleMute(); e.currentTarget.blur(); });
$('muteBtn').textContent = 'Sound: ' + (Sound.muted ? 'off' : 'on') + ' (M)';
document.addEventListener('visibilitychange', () => { if (document.hidden) onBlur(); });
try { if (matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches) $('touchNote').hidden = false; } catch (e) { }
UI.refreshBest();

// ---------- main loop ----------
let lastT = performance.now(), fpsAcc = 0;
function frame(now) {
  const raw = (now - lastT) / 1000; lastT = now;
  const dt = Math.min(1 / 30, Math.max(0, raw));
  const t = now / 1000;
  if (Game.state === 'play' || Game.state === 'dying' || Game.state === 'dead') Game.update(dt);
  else if (Game.state === 'title' && player) { Game.update(dt * 0.5); }
  Game.render(t);
  requestAnimationFrame(frame);
}
// a live city behind the title screen
generateMap(); player = newPlayer(); Game.cam.x = player.x; Game.cam.y = player.y;
if (document.fonts && document.fonts.load) { document.fonts.load('400 20px Bungee').catch(() => { }); document.fonts.load('800 20px "Barlow Condensed"').catch(() => { }); }
requestAnimationFrame(frame);
