// Injected into a scratch copy of v2 to provide the same window.__UC bench API v3 ships with.
(() => {
  const T = globalThis.__T;
  const st = { upd: [], ren: [], dt: [], last: 0 };
  let scen = null, t = 0;
  const G = T.Game;
  const ou = G.update.bind(G), orr = G.render.bind(G);
  G.update = dt => { const a = performance.now(); if (scen) scen(T.player); ou(dt); st.upd.push(performance.now() - a); };
  G.render = time => { const a = performance.now(); orr(time); st.ren.push(performance.now() - a); if (st.last) st.dt.push(a - st.last); st.last = a; };
  const ring = (p, r0, r1) => { const s = T.findReachableSpot(p.x, p.y, r0, r1, false); return s; };
  const nearest = p => { let b = null, bd = 1e12; for (const e of T.enemies) { const d = (e.x - p.x) ** 2 + (e.y - p.y) ** 2; if (d < bd) { bd = d; b = e; } } return b; };
  const give = (p, list) => { for (const [id, n] of list) for (let i = 0; i < n; i++) T.applyOffer(p, { kind: 'upg', id }); T.checkSynergies(p); };
  const topUp = (p, n, types) => { let k = 0; while (T.enemies.length < n && k++ < 12) { const s = ring(p, 250, 700); if (s) T.spawnEnemy(types[(Math.random() * types.length) | 0], s[0], s[1], 8); } };
  const bot = (p, dt) => {
    t += dt; p.hp = p.maxHp; p.invuln = 0.2; T.Game.pending = 0;
    const e = nearest(p); T.mouse.down = true;
    if (e) { T.mouse.x = e.x; T.mouse.y = e.y; T.mouse.sx = (e.x - G.cam.x) * T.ZOOM() + innerWidth / 2; T.mouse.sy = (e.y - G.cam.y) * T.ZOOM() + innerHeight / 2; }
    const ph = Math.floor(t / 1.5) % 4; T.keys.w = ph === 0; T.keys.d = ph === 1; T.keys.s = ph === 2; T.keys.a = ph === 3;
  };
  const MIX = ['thug', 'rusher', 'gunman', 'shotgunner', 'heavy', 'thug', 'gunman'];
  const SC = {
    early: () => p => bot(p, 1 / 60),
    dense: p0 => { give(p0, [['multi', 3], ['rapid', 5], ['pierce', 2], ['heavy', 3]]); return p => { bot(p, 1 / 60); topUp(p, 150, MIX); }; },
    projectiles: p0 => { give(p0, [['multi', 3], ['storm', 3], ['rapid', 5]]); return p => { bot(p, 1 / 60); topUp(p, 60, MIX); let n = 0; for (const b of T.Bullets.list) if (b.enemy) n++; for (let i = n; i < 520; i += 1) { const a = Math.random() * Math.PI * 2, r = 380; T.Bullets.enemy(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r, a + Math.PI + (Math.random() - 0.5) * 0.6, 140, { dmg: 1, r: 6, life: 5 }); } }; },
    explosions: p0 => { give(p0, [['explosive', 4], ['frag', 3], ['ricochet', 1], ['rapid', 3], ['multi', 2]]); let bt = 0; return p => { bot(p, 1 / 60); topUp(p, 90, MIX); bt -= 1 / 60; if (bt <= 0) { bt = 0.1; const e = T.enemies[(Math.random() * T.enemies.length) | 0]; if (e) T.Game.explosion(e.x, e.y, 110, 60, 'barrel'); } }; },
    xp: p0 => { const p = p0; p.S.magnet = 0.2; for (let i = 0; i < 1500; i++) { const a = Math.random() * 6.28, r = 150 + Math.random() * 900; T.Pickups.gems(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r, 1); } return q => { bot(q, 1 / 60); topUp(q, 40, MIX); }; },
    drones: p0 => { give(p0, [['drone', 3], ['overdrive', 3], ['autotarget', 2], ['blades', 5], ['orbital', 3]]); return p => { bot(p, 1 / 60); topUp(p, 120, MIX); }; },
    indoor: p0 => { const M = T.Map; let best = null; for (let ty = 2; ty < 100 && !best; ty++) for (let tx = 2; tx < 100; tx++) { const i = ty * 106 + tx; if (M.floor[i] === 4 && M.obj[i] === 0 && M.floor[i + 107] === 4) { best = [tx, ty]; break; } } if (best) { p0.x = (best[0] + 0.5) * 48; p0.y = (best[1] + 0.5) * 48; G.cam.x = p0.x; G.cam.y = p0.y; } return p => { bot(p, 1 / 60); topUp(p, 100, MIX); }; },
  };
  window.__UC = {
    ready: true,
    startScenario(name) { T.UI.openLevelUp = () => {}; T.UI.start(); T.Game.addXp = () => {}; T.Game.pending = 0; t = 0; scen = SC[name](T.player) || null; },
    resetStats() { st.upd.length = st.ren.length = st.dt.length = 0; st.last = 0; },
    getStats() {
      return { upd: st.upd.slice(), ren: st.ren.slice(), dt: st.dt.slice(),
        counts: { enemies: T.enemies.length, bullets: T.Bullets.list.length, particles: T.FX.parts.length, pickups: T.Pickups.list.length },
        heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null };
    },
  };
})();
