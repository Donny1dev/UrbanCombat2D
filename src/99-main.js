// ===================== MAIN LOOP + BOOT =====================
let lastT = performance.now();
function frame(now) {
  const dt = Math.min(1 / 30, Math.max(0, (now - lastT) / 1000)); lastT = now;
  const t = now / 1000, st = Game.state;
  if (st === 'intro') { Intro.update(dt); Intro.render(dt, t); }
  else if (st === 'menu' || st === 'sub') {
    MenuScene.update(dt); MenuScene.render(dt, t);
    if (!$('character').hidden) Designer.render(dt);
  }
  else if (st === 'play' || st === 'dying' || st === 'dead') { Game.update(dt); Game.render(t); }
  else Game.render(t);   // levelup / pause / build: frozen frame behind the overlay
  requestAnimationFrame(frame);
}
generateMap(); player = newPlayer(); Game.cam.x = player.x; Game.cam.y = player.y;
if (document.fonts && document.fonts.load) { document.fonts.load('400 20px Bungee').catch(() => { }); document.fonts.load('800 20px "Barlow Condensed"').catch(() => { }); }
window.addEventListener('pointerdown', () => Sound.init(), { once: true });
if (Intro.shouldPlay()) Intro.start(); else UI.toMenu();
requestAnimationFrame(frame);
