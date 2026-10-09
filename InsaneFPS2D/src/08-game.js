// ===================== GAME: state, combat resolution, camera, render =====================
const COMBO_MSG = { 2: ['DOUBLE KILL', '#ffd23f'], 3: ['TRIPLE KILL', '#ff9a1f'], 5: ['RAMPAGE', '#ff4f5e'], 8: ['UNSTOPPABLE', '#ff4fd8'], 12: ['URBAN MAYHEM', '#2ef2ff'] };
const Game = {
  state: 'title', time: 0, wave: 1, kills: 0, combo: 0, comboT: 0, bestCombo: 0, comboMsg: null, bannerMsg: null,
  shakeAmt: 0, shakeX: 0, shakeY: 0, cam: { x: 0, y: 0 }, muzzle: null, hitstopT: 0, boss: null, bossCount: 0,
  pending: 0, xpFlash: 0, hurtFlash: 0, deathT: 0, levelFlash: 0, realTime: 0,

  reset() {
    generateMap();
    player = newPlayer();
    enemies = []; corpses = []; timers.length = 0; nextEnemyId = 1;
    FX.reset(); Decals.reset(); Bullets.reset(); Pickups.reset(); Hazards.reset(); Director.reset();
    Object.assign(this, { time: 0, wave: 1, kills: 0, combo: 0, comboT: 0, bestCombo: 0, comboMsg: null, bannerMsg: null, shakeAmt: 0, muzzle: null, hitstopT: 0, boss: null, bossCount: 0, pending: 0, xpFlash: 0, hurtFlash: 0, deathT: 0, levelFlash: 0 });
    this.cam.x = player.x; this.cam.y = player.y;
    updateFlow(player.x, player.y, 1);
    // a few thugs already on their way so the first fight starts within seconds
    for (let i = 0; i < 4; i++) { const pos = Director.findSpawn(player); if (pos) spawnEnemy('thug', pos[0], pos[1], 1); }
    this.banner('WAVE 1', '#2ef2ff');
  },
  shake(a, dir) { this.shakeAmt = Math.min(26, Math.max(this.shakeAmt, a)); },
  hitstop(t) { this.hitstopT = Math.max(this.hitstopT, t); },
  banner(text, color) { this.bannerMsg = { text, color, t: 2.4 }; },

  damageEnemy(e, dmg, ang, knock, crit, src) {
    if (e.dead) return;
    e.hp -= dmg; e.flash = 0.07; e.squash = 1;
    const k = knock * (1 - (e.d.resist || 0));
    e.kvx += Math.cos(ang) * k; e.kvy += Math.sin(ang) * k;
    player.dmgDealt += dmg;
    const n = Math.round(dmg);
    if (crit) { FX.text(e.x, e.y - e.r - 6, n + '!', '#ffd23f', 22, { crit: true }); Sound.crit(); FX.add(P_RING, e.x, e.y, 0, 0, 0.2, 30, '#ffd23f', { lw: 3 }); }
    else if (src !== 'fire' || Math.random() < 0.3) FX.text(e.x, e.y - e.r - 6, n, src === 'fire' ? '#ff9a1f' : src === 'chain' ? '#9fe8ff' : '#ffffff', clamp(13 + Math.sqrt(dmg) * 1.1, 14, 26));
    if (src === 'gun' || src === 'drone' || src === 'blade') { FX.hitBurst(e.x - Math.cos(ang) * e.r * 0.5, e.y - Math.sin(ang) * e.r * 0.5, ang, e.d.col); Sound.hit(); }
    if (e.hp <= 0) killEnemy(e, ang, src);
  },
  onKill(e, src) {
    const p = player, S = p.S;
    this.kills++;
    this.combo = this.comboT > 0 ? this.combo + 1 : 1;
    this.comboT = 1.5;
    if (this.combo > this.bestCombo) this.bestCombo = this.combo;
    const m = COMBO_MSG[this.combo] || (this.combo >= 20 && this.combo % 10 === 0 ? ['URBAN MAYHEM x' + this.combo / 10, '#2ef2ff'] : null);
    if (m) {
      this.comboMsg = { text: m[0], color: m[1], t: 1.3, n: this.combo };
      Sound.combo(this.combo);
      if (this.combo >= 3) { const bonus = Math.ceil(this.combo / 2); this.addXp(bonus); FX.text(p.x, p.y - 40, '+' + bonus + ' XP', '#2ef2ff', 16); }
    }
    if (S.vamp && p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + S.vamp);
    if (S.adren) { p.adrenT = 1 + S.adren * 0.5; }
    if (S.overclock) {
      p.ocKills++;
      if (p.ocKills >= 30 - S.overclock * 6 && p.overclockT <= 0) { p.ocKills = 0; p.overclockT = 5; p.glowT = 5; p.glowCol = '#ff9a1f'; FX.text(p.x, p.y - 44, 'OVERCLOCK', '#ff9a1f', 24, { crit: true }); Sound.select(false); }
    }
    if (S.explosive && src !== 'explosion' && Math.random() < 0.15 + S.explosive * 0.15)
      this.explosion(e.x, e.y, 85 + S.explosive * 14, (28 + S.explosive * 14) * S.dmgMul, 'round');
    if (e === this.boss) this.boss = null;
  },
  addXp(v) {
    const p = player;
    p.xp += v; p.xpPulse = 1;
    while (p.xp >= p.xpNeed) { p.xp -= p.xpNeed; p.level++; p.xpNeed = xpForLevel(p.level); this.pending++; this.xpFlash = 1; }
  },
  explosion(x, y, r, dmg, kind) {
    FX.explosion(x, y, r); Sound.explode(); this.shake(kind === 'round' ? 6 : 14);
    if (kind !== 'round') Decals.add('scorch', x, y, rand(TAU), r / 60);
    if (dmg > 0) Grid.query(x, y, r + 30, e => {
      if (e.dead) return;
      const d = Math.hypot(e.x - x, e.y - y);
      if (d < r + e.r) this.damageEnemy(e, dmg * (1 - 0.5 * d / (r + e.r)), Math.atan2(e.y - y, e.x - x), 420, false, 'explosion');
    });
    damageTilesInRadius(x, y, r * 0.8, 60);
    if (kind === 'barrel' && dist2(x, y, player.x, player.y) < r * r) this.hurtPlayer(14, Math.atan2(player.y - y, player.x - x));
  },
  chainLightning(e0, dmg, n) {
    const hit = [e0.id]; let cur = e0;
    for (let k = 0; k < n; k++) {
      let best = null, bd = 210 * 210;
      Grid.query(cur.x, cur.y, 210, o => { if (o.dead || hit.includes(o.id)) return; const d = dist2(cur.x, cur.y, o.x, o.y); if (d < bd) { bd = d; best = o; } });
      if (!best) break;
      FX.arc(cur.x, cur.y, best.x, best.y); hit.push(best.id);
      this.damageEnemy(best, dmg, Math.atan2(best.y - cur.y, best.x - cur.x), 60, false, 'chain');
      cur = best;
    }
    if (hit.length > 1) Sound.zap();
  },
  shockwave(x, y, r, dmg) {
    FX.add(P_RING, x, y, 0, 0, 0.35, r, '#9ff6ff', { lw: 10 });
    FX.light(x, y, r * 1.6, 0.25, GLOW.xp, 0.6); FX.sparkle(x, y, '#9ff6ff', 18, r * 3);
    Sound.explode(); this.shake(8);
    Grid.query(x, y, r + 30, e => { if (!e.dead && dist2(x, y, e.x, e.y) < (r + e.r) ** 2) this.damageEnemy(e, dmg, Math.atan2(e.y - y, e.x - x), 480, false, 'shock'); });
    for (const b of Bullets.list) if (b.enemy && dist2(b.x, b.y, x, y) < r * r) { b.dead = true; FX.sparkle(b.x, b.y, '#ff8090', 3, 80); }
  },
  hurtPlayer(dmg, ang) {
    const p = player;
    if (this.state !== 'play' || p.dashT > 0 || p.invuln > 0 || p.hurtT > 0) return;
    if (Math.random() < p.S.evade) { FX.text(p.x, p.y - 30, 'DODGE', '#2ef2ff', 20, { crit: true }); p.invuln = 0.3; return; }
    p.hp -= dmg; p.hurtT = 0.55; this.hurtFlash = 0.4;
    p.vx += Math.cos(ang) * 260; p.vy += Math.sin(ang) * 260;
    this.shake(9); Sound.hurt();
    FX.hitBurst(p.x, p.y, ang, '#1fa6b8');
    FX.text(p.x, p.y - 30, '-' + Math.round(dmg), '#ff3b4e', 20);
    if (p.hp <= 0) this.die();
  },
  die() {
    const p = player;
    p.hp = 0; this.state = 'dying'; this.deathT = 1.3;
    Sound.die(); this.shake(24);
    FX.deathPop(p.x, p.y, '#1fa6b8', true); FX.explosion(p.x, p.y, 80);
    Decals.add('splat', p.x, p.y, rand(TAU), 1.5);
  },
  levelUpPush() {   // level-up blast: shove nearby enemies back so resuming is fair
    const p = player;
    FX.add(P_RING, p.x, p.y, 0, 0, 0.5, 240, '#2ef2ff', { lw: 8 });
    FX.sparkle(p.x, p.y, '#7ff6ff', 30, 420);
    Grid.query(p.x, p.y, 260, e => { if (e.dead) return; const d = Math.hypot(e.x - p.x, e.y - p.y) || 1; if (d < 240) { const k = 500 * (1 - d / 240) * (1 - (e.d.resist || 0) * 0.6); e.kvx += (e.x - p.x) / d * k; e.kvy += (e.y - p.y) / d * k; } });
    for (const b of Bullets.list) if (b.enemy && dist2(b.x, b.y, p.x, p.y) < 240 * 240) b.dead = true;
  },

  update(dt) {
    if (this.hitstopT > 0) { this.hitstopT -= dt; dt *= 0.08; }
    const playing = this.state === 'play';
    const dying = this.state === 'dying';
    if (dying) { this.deathT -= dt; dt *= 0.3; if (this.deathT <= 0) { this.state = 'dead'; UI.gameOver(); } }
    if (playing) this.time += dt;
    const p = player;
    updateTimers(dt);
    updateFlow(p.x, p.y, dt);
    updateEnemies(dt, p);
    Grid.build(enemies);
    if (playing) { updatePlayer(p, dt); Director.update(dt, p); }
    else { p.vx *= 0.9; p.vy *= 0.9; }
    // mouse to world (camera without shake so aim stays exact)
    mouse.x = this.cam.x + (mouse.sx - VW / 2) / ZOOM; mouse.y = this.cam.y + (mouse.sy - VH / 2) / ZOOM;
    Bullets.update(dt);
    Hazards.update(dt);
    Pickups.update(dt, p);
    FX.update(dt); Decals.update(dt);
    // camera
    const look = 0.2, ox = clamp((mouse.x - p.x) * look, -200, 200), oy = clamp((mouse.y - p.y) * look, -140, 140);
    this.cam.x += (p.x + ox - this.cam.x) * damp(7, dt); this.cam.y += (p.y + oy - this.cam.y) * damp(7, dt);
    this.shakeAmt = Math.max(0, this.shakeAmt - dt * 60);
    const s = this.shakeAmt * 0.6; this.shakeX = rand(-s, s); this.shakeY = rand(-s, s);
    // timers for UI flourishes
    this.comboT -= dt; if (this.comboT <= 0) this.combo = 0;
    if (this.comboMsg) { this.comboMsg.t -= dt; if (this.comboMsg.t <= 0) this.comboMsg = null; }
    if (this.bannerMsg) { this.bannerMsg.t -= dt; if (this.bannerMsg.t <= 0) this.bannerMsg = null; }
    if (this.muzzle) { this.muzzle.t -= dt; if (this.muzzle.t <= 0) this.muzzle = null; }
    this.xpFlash = Math.max(0, this.xpFlash - dt * 2); this.hurtFlash = Math.max(0, this.hurtFlash - dt); this.levelFlash = Math.max(0, this.levelFlash - dt * 2.5);
    p.xpPulse = Math.max(0, p.xpPulse - dt * 4);
    p.xpShown += ((p.xp / p.xpNeed) - p.xpShown) * damp(10, dt);
    if (p.xpShown > p.xp / p.xpNeed + 0.02 && this.pending === 0) p.xpShown = p.xp / p.xpNeed;
    if (playing && this.pending > 0) { this.levelFlash = 1; UI.openLevelUp(); }
  },

  render(time) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0d0e12'; ctx.fillRect(0, 0, VW, VH);
    if (!player) return;
    const vw = VW / ZOOM, vh = VH / ZOOM;
    const camX = this.cam.x + this.shakeX - vw / 2, camY = this.cam.y + this.shakeY - vh / 2;
    ChunkCache.scale = clamp(Math.round(ZOOM * 4) / 4, 1, 2);
    if (ChunkCache.lastScale !== ChunkCache.scale) { ChunkCache.clear(); ChunkCache.lastScale = ChunkCache.scale; }
    ctx.setTransform(ZOOM, 0, 0, ZOOM, -camX * ZOOM, -camY * ZOOM);
    const v = { x0: camX - 60, y0: camY - 60, x1: camX + vw + 60, y1: camY + vh + 60 };
    drawWorldStatic(camX, camY, vw, vh);
    Decals.draw(v);
    Hazards.draw(v);
    drawDynamicTiles(camX, camY, vw, vh, time);
    FX.drawGround(v);
    Pickups.draw(v, time);
    drawEnemies(v, time);
    drawPlayer(player, time);
    Bullets.draw(v);
    this.drawMuzzle();
    FX.drawAir(v);
    FX.drawTexts();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    HUD.draw(time);
  },
  drawMuzzle() {
    const m = this.muzzle; if (!m) return;
    const s = m.scale * (0.7 + Math.random() * 0.5), t = m.t / 0.05;
    ctx.save(); ctx.translate(m.x, m.y); ctx.rotate(m.a);
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = m.hue === 'cyan' ? '#7ff6ff' : m.hue === 'red' ? '#ff7080' : m.hue === 'violet' ? '#ff8ae6' : '#ffb347';
    ctx.globalAlpha = t;
    ctx.beginPath(); ctx.moveTo(0, -7 * s); ctx.lineTo(26 * s, 0); ctx.lineTo(0, 7 * s); ctx.lineTo(8 * s, 0); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(2, 0); ctx.lineTo(10 * s, -13 * s); ctx.lineTo(14 * s, 0); ctx.lineTo(10 * s, 13 * s); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fffbe0'; ctx.beginPath(); ctx.arc(4 * s, 0, 6 * s, 0, TAU); ctx.fill();
    ctx.restore(); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  },
};

function drawPlayer(p, time) {
  if (Game.state === 'dead' || Game.state === 'dying') return;
  for (const g of p.ghosts) {
    ctx.globalAlpha = (g.life / 0.28) * 0.45;
    drawHuman(ctx, g.x, g.y, { a: g.a, scale: 1, jacket: '#5ff4ff', skin: '#bff9ff', hair: '#5ff4ff', style: 'cap', weapon: p.weapon, flash: false });
  }
  ctx.globalAlpha = 1;
  // readability ring + glow
  ctx.globalCompositeOperation = 'lighter';
  if (p.glowT > 0 || Game.levelFlash > 0) glow(p.overclockT > 0 ? GLOW.fire : GLOW.xp, p.x, p.y, 60 + Game.levelFlash * 60, 0.45 + Game.levelFlash * 0.4);
  if (p.dashT > 0) glow(GLOW.xp, p.x, p.y, 50, 0.6);
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = 'rgba(46,242,255,0.35)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(p.x, p.y, 22, 0, TAU); ctx.stroke();
  const blink = p.hurtT > 0 && Math.floor(time * 30) % 2 === 0;
  const lx = Math.cos(Math.atan2(p.vy, p.vx)) * p.lean * 2, ly = Math.sin(Math.atan2(p.vy, p.vx)) * p.lean * 2;
  drawHuman(ctx, p.x + lx, p.y + ly, {
    a: p.a, phase: p.phase, moving: Math.hypot(p.vx, p.vy) > 40, scale: 1.05, jacket: '#1fa6b8', skin: SKIN[0], hair: '#ffd23f', style: 'cap',
    weapon: p.weapon, flash: blink, recoil: p.recoil, altRecoil: p.altRecoil, evolved: !!p.evolved,
    sx: 1 + p.squash * 0.15, sy: 1 - p.squash * 0.1,
  });
  drawBladesDrones(p);
}
