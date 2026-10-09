// ===================== ENEMIES: spatial grid, types, AI, waves =====================
const GCELL = 64, GW = Math.ceil(WORLD_W / GCELL), GH = Math.ceil(WORLD_H / GCELL), MAXE = 700;
const Grid = {
  head: new Int32Array(GW * GH), next: new Int32Array(MAXE), list: [],
  build(list) {
    this.head.fill(-1); this.list = list;
    const n = Math.min(list.length, MAXE);
    for (let i = 0; i < n; i++) {
      const e = list[i];
      const c = clamp(Math.floor(e.y / GCELL), 0, GH - 1) * GW + clamp(Math.floor(e.x / GCELL), 0, GW - 1);
      this.next[i] = this.head[c]; this.head[c] = i;
    }
  },
  query(x, y, r, cb) {
    const x0 = clamp(Math.floor((x - r) / GCELL), 0, GW - 1), x1 = clamp(Math.floor((x + r) / GCELL), 0, GW - 1);
    const y0 = clamp(Math.floor((y - r) / GCELL), 0, GH - 1), y1 = clamp(Math.floor((y + r) / GCELL), 0, GH - 1);
    const L = this.list;
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++)
      for (let j = this.head[cy * GW + cx]; j !== -1; j = this.next[j]) cb(L[j]);
  },
};

const ETYPES = {
  thug: { name: 'Street Thug', hp: 30, spd: 150, r: 14, xp: 1, melee: 10, scale: 1, jacket: '#c8692c', style: 'bald', weapon: 'bat', col: '#c8692c' },
  rusher: { name: 'Rusher', hp: 16, spd: 290, r: 12, xp: 1, melee: 7, scale: 0.88, jacket: '#d63a3a', style: 'mohawk', hair: '#59a8ff', weapon: 'knife', col: '#d63a3a' },
  gunman: { name: 'Gunman', hp: 32, spd: 118, r: 14, xp: 2, ranged: { cd: 1.8, n: 1, spread: 0.12, spd: 320, dmg: 8, min: 220, max: 380 }, scale: 1, jacket: '#7a3fb5', style: 'cap', hair: '#22222a', weapon: 'pistol', col: '#7a3fb5' },
  shotgunner: { name: 'Shotgunner', hp: 55, spd: 128, r: 15, xp: 3, ranged: { cd: 2.3, n: 5, spread: 0.5, spd: 300, dmg: 6, min: 110, max: 210, life: 0.9 }, scale: 1.05, jacket: '#2f6e8f', style: 'bandana', hair: '#c42a2a', weapon: 'shotgun', col: '#2f6e8f' },
  heavy: { name: 'Heavy', hp: 170, spd: 82, r: 22, xp: 5, melee: 22, scale: 1.5, jacket: '#4b5a3a', vest: '#2b3324', style: 'helmet', hair: '#2c3326', weapon: 'fists', resist: 0.65, col: '#4b5a3a' },
  elite: { name: 'Elite', hp: 300, spd: 125, r: 20, xp: 14, melee: 16, ranged: { cd: 1.9, n: 1, burst: 3, spread: 0.08, spd: 360, dmg: 9, min: 200, max: 340 }, scale: 1.35, jacket: '#1d1d26', vest: '#ffc93c', style: 'hood', hair: '#121217', eyes: '#ff3b4e', weapon: 'rifle', resist: 0.5, glow: true, col: '#ffc93c' },
  boss: { name: 'Boss', hp: 1500, spd: 100, r: 34, xp: 70, melee: 28, scale: 2.35, jacket: '#ececf0', vest: '#b3202c', style: 'bald', weapon: 'heavy', resist: 0.85, glow: true, col: '#ff3b4e', skin: '#d9a074' },
};
const BOSS_NAMES = ['BIG SAL', 'THE BUTCHER', 'IRON MAMA', 'KINGPIN', 'DOC VOLT', 'MAD DOG'];
let enemies = [], corpses = [], nextEnemyId = 1;
const _fd = { x: 0, y: 0 };

function spawnEnemy(type, x, y, wave) {
  const d = ETYPES[type];
  const hpMul = 1 + 0.13 * (wave - 1) + 0.004 * (wave - 1) ** 2;
  const e = {
    id: nextEnemyId++, type, d, x, y, r: d.r, kvx: 0, kvy: 0, vx: 0, vy: 0,
    hp: d.hp * hpMul, maxHp: d.hp * hpMul, a: rand(TAU), phase: rand(TAU), flash: 0, squash: 0,
    atkCd: rand(0.4, 1), windup: 0, swing: 0, fireT: rand(0.8, 2), burst: 0, burstT: 0, aimT: 0, dead: false, bladeCd: 0,
    spd: d.spd * (1 + Math.min(0.25, 0.015 * (wave - 1))) * rand(0.92, 1.08), dmgMul: 1 + 0.06 * (wave - 1),
    xp: d.xp * (1 + 0.08 * (wave - 1)), flank: rand(-1, 1), strafe: Math.random() < 0.5 ? 1 : -1, strafeT: rand(1, 3),
    losT: rand(0.2), los: false, stuckT: 0, lastX: x, lastY: y, jitT: 0, jx: 0, jy: 0, spawnT: 0.35, skin: d.skin || pick(SKIN),
  };
  if (type === 'boss') {
    e.hp = e.maxHp = 1500 + wave * 260; e.name = BOSS_NAMES[(Game.bossCount) % BOSS_NAMES.length];
    e.pattern = 0; e.patT = 2; e.charge = 0; e.chargeWind = 0;
  }
  enemies.push(e);
  return e;
}

function updateEnemies(dt, p) {
  for (const e of enemies) {
    if (e.dead) continue;
    e.flash -= dt; e.squash = Math.max(0, e.squash - dt * 6); e.bladeCd -= dt; e.atkCd -= dt; e.spawnT -= dt;
    const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1;
    e.losT -= dt;
    if (e.losT <= 0) { e.losT = 0.18 + rand(0.08); e.los = d < 760 && lineOfSight(e.x, e.y, p.x, p.y); }
    if (e.type === 'boss') { updateBoss(e, dt, p, dx, dy, d); continue; }
    let mx = 0, my = 0;
    const R = e.d.ranged;
    if (e.jitT > 0) { e.jitT -= dt; mx = e.jx; my = e.jy; }
    else if (e.los) {
      const ux = dx / d, uy = dy / d;
      if (R && (!e.d.melee || d > 90)) {
        e.strafeT -= dt; if (e.strafeT <= 0) { e.strafeT = rand(1.2, 3); e.strafe = -e.strafe; }
        const toward = d > R.max ? 1 : d < R.min ? -0.9 : 0.1;
        mx = ux * toward - uy * e.strafe * 0.8; my = uy * toward + ux * e.strafe * 0.8;
      } else {
        const f = d > 140 ? e.flank * 0.6 : 0;          // spread out to surround the player
        mx = ux - uy * f; my = uy + ux * f;
      }
    } else if (flowDir(e.x, e.y, _fd)) { mx = _fd.x; my = _fd.y; }
    else { mx = dx / d; my = dy / d; }
    // separation
    let sx = 0, sy = 0;
    Grid.query(e.x, e.y, e.r * 2.2, o => {
      if (o === e || o.dead) return;
      const ox = e.x - o.x, oy = e.y - o.y, rr2 = (e.r + o.r) * 1.05, q = ox * ox + oy * oy;
      if (q < rr2 * rr2 && q > 0.01) { const qd = Math.sqrt(q), f = (rr2 - qd) / rr2; sx += ox / qd * f; sy += oy / qd * f; }
    });
    const ml = Math.hypot(mx, my) || 1;
    let spd = e.spd * (e.windup > 0 ? 0.25 : 1) * (e.aimT > 0 ? 0.3 : 1);
    if (e.spawnT > 0) spd *= 0.4;
    e.vx += ((mx / ml) * spd + sx * 160 - e.vx) * damp(10, dt);
    e.vy += ((my / ml) * spd + sy * 160 - e.vy) * damp(10, dt);
    e.kvx *= Math.exp(-9 * dt); e.kvy *= Math.exp(-9 * dt);
    moveCircle(e, (e.vx + e.kvx) * dt, (e.vy + e.kvy) * dt);
    e.phase += Math.hypot(e.vx, e.vy) * dt * 0.06;
    // stuck detection: nudge in a random direction
    e.stuckT += dt;
    if (e.stuckT > 0.8) {
      if (dist2(e.x, e.y, e.lastX, e.lastY) < 10 * 10 && d > 60) { const ja = rand(TAU); e.jx = Math.cos(ja); e.jy = Math.sin(ja); e.jitT = 0.4; }
      e.stuckT = 0; e.lastX = e.x; e.lastY = e.y;
    }
    // facing
    const want = e.los ? Math.atan2(dy, dx) : Math.atan2(e.vy, e.vx);
    e.a += angDiff(e.a, want) * damp(e.los ? 12 : 7, dt);
    // melee
    if (e.d.melee) {
      const reach = e.r + p.r + 8;
      if (e.windup > 0) {
        e.windup -= dt; e.swing = 1 - e.windup / 0.3;
        if (e.windup <= 0) {
          e.swing = 0.01; Sound.melee();
          if (d < reach + 16) Game.hurtPlayer(e.d.melee * e.dmgMul, Math.atan2(dy, dx));
          e.atkCd = e.type === 'rusher' ? 0.7 : 1.0;
        }
      } else if (e.swing > 0) { e.swing += dt * 4; if (e.swing > 1) e.swing = 0; }
      else if (d < reach && e.atkCd <= 0) { e.windup = e.type === 'heavy' ? 0.45 : 0.3; }
    }
    // ranged
    if (R) {
      e.fireT -= dt;
      if (e.aimT > 0) {
        e.aimT -= dt;
        if (e.aimT <= 0) { enemyFire(e, p, R); if (R.burst) { e.burst = R.burst - 1; e.burstT = 0.12; } }
      } else if (e.burst > 0) {
        e.burstT -= dt; if (e.burstT <= 0) { e.burst--; e.burstT = 0.12; enemyFire(e, p, R); }
      } else if (e.fireT <= 0 && e.los && d < R.max + 160 && e.spawnT <= 0) {
        e.aimT = 0.35; e.fireT = R.cd * rand(0.85, 1.2);
      }
    }
  }
  // remove dead
  for (let i = enemies.length - 1; i >= 0; i--) if (enemies[i].dead) { enemies[i] = enemies[enemies.length - 1]; enemies.pop(); }
  for (let i = corpses.length - 1; i >= 0; i--) {
    const c = corpses[i]; c.life -= dt;
    c.x += c.vx * dt; c.y += c.vy * dt; c.vx *= Math.exp(-6 * dt); c.vy *= Math.exp(-6 * dt); c.spin *= Math.exp(-5 * dt); c.a += c.spin * dt;
    if (solidAt(c.x, c.y)) { c.vx = -c.vx * 0.3; c.vy = -c.vy * 0.3; }
    if (c.life <= 0) corpses.splice(i, 1);
  }
}
function enemyFire(e, p, R) {
  // light leading (30%) so strafing still dodges
  const t = Math.hypot(p.x - e.x, p.y - e.y) / R.spd;
  const tx = p.x + p.vx * t * 0.3, ty = p.y + p.vy * t * 0.3;
  const base = Math.atan2(ty - e.y, tx - e.x) + rand(-R.spread, R.spread) * (R.n > 1 ? 0.2 : 1);
  const mx = e.x + Math.cos(e.a) * e.r * 1.6, my = e.y + Math.sin(e.a) * e.r * 1.6;
  for (let i = 0; i < R.n; i++) {
    const a = base + (R.n > 1 ? (i - (R.n - 1) / 2) * (R.spread / (R.n - 1)) * 2 : 0);
    Bullets.spawn(solidAt(mx, my) ? e.x : mx, solidAt(mx, my) ? e.y : my, a, R.spd * rand(0.95, 1.05), null, true, { dmg: R.dmg * e.dmgMul, r: 6, life: R.life || 2.4 });
  }
  FX.light(mx, my, 50, 0.07, GLOW.red, 0.7);
  Sound.enemyShoot();
}
function updateBoss(e, dt, p, dx, dy, d) {
  const enraged = e.hp < e.maxHp * 0.5;
  e.patT -= dt;
  e.kvx *= Math.exp(-9 * dt); e.kvy *= Math.exp(-9 * dt);
  if (e.chargeWind > 0) {
    e.chargeWind -= dt; e.a = Math.atan2(dy, dx);
    if (e.chargeWind <= 0) { e.charge = 0.7; e.cx = Math.cos(e.a); e.cy = Math.sin(e.a); Sound.dash(); }
  } else if (e.charge > 0) {
    e.charge -= dt;
    const hit = moveCircle(e, e.cx * 640 * dt, e.cy * 640 * dt);
    if (Math.random() < 0.6) FX.dust(e.x, e.y, 1);
    if (d < e.r + p.r + 4) Game.hurtPlayer(26 * e.dmgMul, Math.atan2(dy, dx));
    if (hit) { e.charge = 0; Game.shake(10); damageTilesInRadius(e.x, e.y, 70, 200); FX.dust(e.x, e.y, 10); }
  } else {
    let mx, my;
    if (e.los || !flowDir(e.x, e.y, _fd)) { mx = dx / d; my = dy / d; if (d < 220) { mx = -dy / d; my = dx / d; } }
    else { mx = _fd.x; my = _fd.y; }
    e.vx += (mx * e.spd - e.vx) * damp(6, dt); e.vy += (my * e.spd - e.vy) * damp(6, dt);
    moveCircle(e, (e.vx + e.kvx) * dt, (e.vy + e.kvy) * dt);
    e.a += angDiff(e.a, Math.atan2(dy, dx)) * damp(8, dt);
    if (e.patT <= 0 && e.los) {
      e.pattern = (e.pattern + 1) % 4;
      const dm = 10 * e.dmgMul;
      if (e.pattern === 0) {   // radial ring
        const n = enraged ? 26 : 18, off = rand(TAU);
        for (let i = 0; i < n; i++) Bullets.spawn(e.x, e.y, off + i / n * TAU, 230, null, true, { dmg: dm, r: 8, color: '#b46bff', life: 3 });
        FX.add(P_RING, e.x, e.y, 0, 0, 0.4, 90, '#b46bff', { lw: 6 }); Sound.explode();
      } else if (e.pattern === 1) {   // aimed spread volleys
        for (let v = 0; v < (enraged ? 3 : 2); v++) setTimeoutGame(v * 0.28, () => {
          if (e.dead) return;
          const a0 = Math.atan2(player.y - e.y, player.x - e.x);
          for (let i = -3; i <= 3; i++) Bullets.spawn(e.x, e.y, a0 + i * 0.13, 340, null, true, { dmg: dm, r: 7, life: 2.5 });
          Sound.enemyShoot(); FX.light(e.x, e.y, 80, 0.08, GLOW.red, 0.8);
        });
      } else if (e.pattern === 2) { e.chargeWind = 0.7; FX.text(e.x, e.y - 60, '!', '#ff3b4e', 40, { crit: true }); }
      else {   // call in backup
        for (let i = 0; i < (enraged ? 5 : 3); i++) { const a = rand(TAU); const x = e.x + Math.cos(a) * 60, y = e.y + Math.sin(a) * 60; if (!solidAt(x, y)) spawnEnemy(pick(['thug', 'rusher', 'gunman']), x, y, Game.wave); }
        FX.text(e.x, e.y - 60, 'GET HIM!', '#ffd23f', 26, { crit: true });
      }
      e.patT = enraged ? 1.7 : 2.4;
    }
  }
  e.phase += Math.hypot(e.vx, e.vy) * dt * 0.05;
  if (d < e.r + p.r + 6 && e.atkCd <= 0) { e.atkCd = 1; Game.hurtPlayer(e.d.melee * e.dmgMul, Math.atan2(dy, dx)); }
}
// small scheduler that respects pause (game time)
const timers = [];
function setTimeoutGame(t, fn) { timers.push({ t, fn }); }
function updateTimers(dt) { for (let i = timers.length - 1; i >= 0; i--) { timers[i].t -= dt; if (timers[i].t <= 0) { const f = timers[i].fn; timers.splice(i, 1); f(); } } }

function killEnemy(e, ang, src) {
  if (e.dead) return;
  e.dead = true;
  const big = e.type === 'heavy' || e.type === 'elite' || e.type === 'boss';
  corpses.push({ x: e.x, y: e.y, a: e.a, vx: Math.cos(ang) * (big ? 120 : 320), vy: Math.sin(ang) * (big ? 120 : 320), spin: rand(-8, 8), life: big ? 0.8 : 0.5, max: big ? 0.8 : 0.5, e });
  FX.deathPop(e.x, e.y, e.d.col, big, ang);
  Decals.add('splat', e.x + Math.cos(ang) * 14, e.y + Math.sin(ang) * 14, ang, e.d.scale * rand(0.8, 1.2));
  Sound.kill(big);
  Pickups.gems(e.x, e.y, e.xp * (Game.combo >= 5 ? 1.25 : 1));
  if (e.type === 'boss') {
    Game.explosion(e.x, e.y, 200, 0, 'boss'); Game.shake(22); Pickups.health(e.x, e.y, 50);
    Game.banner(e.name + ' DOWN', '#ffc93c'); Game.hitstop(0.15);
  } else if (e.type === 'elite' && Math.random() < 0.5) Pickups.health(e.x, e.y, 25);
  else if (Math.random() < 0.012) Pickups.health(e.x, e.y, 20);
  Game.onKill(e, src);
}

function drawEnemies(v, time) {
  for (const c of corpses) {
    if (c.x < v.x0 || c.x > v.x1 || c.y < v.y0 || c.y > v.y1) continue;
    const t = c.life / c.max, e = c.e;
    ctx.globalAlpha = Math.min(1, t * 2);
    drawHuman(ctx, c.x, c.y, { a: c.a, scale: e.d.scale * (0.6 + t * 0.4), jacket: e.d.jacket, skin: e.skin, hair: e.d.hair, style: e.d.style, weapon: null, flash: t > 0.8, vest: e.d.vest, sx: 1 + (1 - t) * 0.5, sy: 1 - (1 - t) * 0.4 });
    ctx.globalAlpha = 1;
  }
  for (const e of enemies) {
    if (e.x < v.x0 - 40 || e.x > v.x1 + 40 || e.y < v.y0 - 40 || e.y > v.y1 + 40) continue;
    if (e.d.glow) { ctx.globalCompositeOperation = 'lighter'; glow(e.type === 'boss' ? GLOW.red : GLOW.gold, e.x, e.y, e.r * 2.6, 0.35 + Math.sin(time * 6) * 0.1); ctx.globalCompositeOperation = 'source-over'; }
    if (e.aimT > 0) {   // telegraph: brief red sight line
      ctx.strokeStyle = `rgba(255,60,80,${0.5 * (1 - e.aimT / 0.35)})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x + Math.cos(e.a) * 220, e.y + Math.sin(e.a) * 220); ctx.stroke();
    }
    if (e.chargeWind > 0) {
      ctx.fillStyle = `rgba(255,60,80,${0.25 + Math.sin(time * 40) * 0.1})`;
      ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(e.a); ctx.fillRect(0, -e.r, 450, e.r * 2); ctx.restore();
    }
    const sq = e.squash, sp = e.spawnT > 0 ? 1 - e.spawnT / 0.35 : 1;
    if (sp < 1) ctx.globalAlpha = sp;
    drawHuman(ctx, e.x, e.y, {
      a: e.a, phase: e.phase, moving: true, scale: e.d.scale, jacket: e.d.jacket, skin: e.skin, hair: e.d.hair, style: e.d.style,
      weapon: e.d.weapon, flash: e.flash > 0, vest: e.d.vest, eyes: e.d.eyes, swing: e.swing || (e.windup > 0 ? 0.001 : 0),
      sx: 1 + sq * 0.28, sy: 1 - sq * 0.22, recoil: e.aimT > 0 ? 0 : 0,
    });
    ctx.globalAlpha = 1;
    if (e.windup > 0) { ctx.fillStyle = '#ff3b4e'; ctx.font = '400 18px Bungee, Impact, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('!', e.x, e.y - e.r - 14); }
    if (e.type !== 'boss' && e.hp < e.maxHp && (e.maxHp > 60)) {
      const w = e.r * 2.2, f = clamp(e.hp / e.maxHp, 0, 1);
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(e.x - w / 2 - 1, e.y - e.r - 12, w + 2, 6);
      ctx.fillStyle = e.type === 'elite' ? '#ffc93c' : '#ff3b4e'; ctx.fillRect(e.x - w / 2, e.y - e.r - 11, w * f, 4);
    }
  }
}

// ---------- wave director ----------
const Director = {
  t: 0, spawnT: 0,
  reset() { this.t = 0; this.spawnT = 1.2; },
  weights(w) {
    return {
      thug: 10, rusher: w >= 2 ? 3 + w * 0.6 : 0, gunman: w >= 2 ? 3 + w : 1.2,
      shotgunner: w >= 4 ? 2 + w * 0.6 : 0, heavy: w >= 3 ? 1 + w * 0.45 : 0, elite: w >= 6 ? 0.4 + w * 0.15 : 0,
    };
  },
  pickType(w) {
    const ws = this.weights(w); let tot = 0; for (const k in ws) tot += ws[k];
    let r = Math.random() * tot; for (const k in ws) { r -= ws[k]; if (r <= 0) return k; }
    return 'thug';
  },
  findSpawn(p) {
    const halfDiag = Math.hypot(VW, VH) / ZOOM / 2;
    const minD = halfDiag + 50, maxD = halfDiag + 520;
    const camX = Game.cam.x - VW / ZOOM / 2, camY = Game.cam.y - VH / ZOOM / 2;
    for (let k = 0; k < 40; k++) {
      let tx, ty;
      if (k < 28) { [tx, ty] = pick(Map.spawnPts); }
      else { const a = rand(TAU), r = rand(minD, maxD); tx = Math.floor((p.x + Math.cos(a) * r) / TILE); ty = Math.floor((p.y + Math.sin(a) * r) / TILE); }
      if (!inMap(tx, ty) || Map.obj[idx(tx, ty)] !== 0 || Map.flow[idx(tx, ty)] === FLOW_INF) continue;
      const x = (tx + 0.5) * TILE, y = (ty + 0.5) * TILE, dd = Math.hypot(x - p.x, y - p.y);
      if (dd < minD || dd > maxD) continue;
      if (x > camX - 40 && x < camX + VW / ZOOM + 40 && y > camY - 40 && y < camY + VH / ZOOM + 40) continue;
      return [x, y];
    }
    return null;
  },
  update(dt, p) {
    this.t += dt;
    const w = Game.wave, dur = w === 1 ? 25 : 30;
    if (this.t >= dur) {
      this.t = 0; Game.wave++;
      const nw = Game.wave;
      if (nw % 5 === 0) {
        const pos = this.findSpawn(p);
        if (pos) { const b = spawnEnemy('boss', pos[0], pos[1], nw); Game.boss = b; Game.bossCount++; Game.banner('WAVE ' + nw + ' · ' + b.name, '#ff3b4e'); Sound.boss(); }
        for (let i = 0; i < 2 + Math.floor(nw / 10); i++) { const q = this.findSpawn(p); if (q) spawnEnemy('elite', q[0], q[1], nw); }
      } else { Game.banner('WAVE ' + nw, '#2ef2ff'); Sound.wave(); }
      // ambush squad from one direction
      const q = this.findSpawn(p);
      if (q) for (let i = 0; i < 4 + nw; i++) { const x = q[0] + rand(-40, 40), y = q[1] + rand(-40, 40); if (!solidAt(x, y)) spawnEnemy(this.pickType(nw), x, y, nw); }
    }
    const maxAlive = Math.min(190, 9 + w * 7);
    const interval = Math.max(0.14, (w === 1 ? 0.95 : 1.05) * Math.pow(0.88, w - 1));
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnT = interval * rand(0.7, 1.3);
      if (enemies.length < maxAlive) {
        const pos = this.findSpawn(p);
        if (pos) {
          const n = 1 + Math.floor(Math.random() * (1 + w / 3));
          for (let i = 0; i < n && enemies.length < maxAlive; i++) {
            const x = pos[0] + rand(-30, 30), y = pos[1] + rand(-30, 30);
            spawnEnemy(this.pickType(w), solidAt(x, y) ? pos[0] : x, solidAt(x, y) ? pos[1] : y, w);
          }
        }
      }
    }
    // recycle enemies that drifted very far away
    for (const e of enemies) if (e.type !== 'boss' && dist2(e.x, e.y, p.x, p.y) > 2400 * 2400) { const pos = this.findSpawn(p); if (pos) { e.x = pos[0]; e.y = pos[1]; } }
  },
};
