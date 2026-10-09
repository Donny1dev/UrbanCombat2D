// ===================== ENEMIES: spatial grid, types, AI, statuses, waves, events =====================
const GCELL = 64, GW = Math.ceil(WORLD_W / GCELL), GH = Math.ceil(WORLD_H / GCELL), MAXE = 700;
const Grid = {
  head: new Int32Array(GW * GH).fill(-1), next: new Int32Array(MAXE), list: [],
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
  thug: { name: 'Street Thug', hp: 30, spd: 150, r: 14, xp: 1, melee: 10, scale: 1, armor: 0, jacket: '#c8692c', style: 'bald', weapon: 'bat', col: '#c8692c', pants: '#3a3026' },
  rusher: { name: 'Rusher', hp: 16, spd: 290, r: 12, xp: 1, melee: 7, scale: 0.88, armor: 0, jacket: '#d63a3a', style: 'mohawk', hair: '#59a8ff', weapon: 'knife', col: '#d63a3a', top: 'tank', pants: '#22242c' },
  gunman: { name: 'Gunman', hp: 32, spd: 118, r: 14, xp: 2, armor: 0, ranged: { cd: 1.8, n: 1, spread: 0.12, spd: 320, dmg: 8, min: 220, max: 380 }, scale: 1, jacket: '#7a3fb5', style: 'cap', hair: '#22222a', weapon: 'pistol', col: '#7a3fb5', glasses: 'shades', pants: '#2b2f3a' },
  shotgunner: { name: 'Shotgunner', hp: 55, spd: 128, r: 15, xp: 3, armor: 0.1, ranged: { cd: 2.3, n: 5, spread: 0.5, spd: 300, dmg: 6, min: 110, max: 210, life: 0.9 }, scale: 1.05, jacket: '#2f6e8f', style: 'bandana', hair: '#c42a2a', weapon: 'shotgun', col: '#2f6e8f', mask: 'bandana', maskCol: '#c42a2a', pants: '#3a3026' },
  heavy: { name: 'Heavy', hp: 170, spd: 82, r: 22, xp: 5, melee: 22, scale: 1.5, armor: 0.35, jacket: '#4b5a3a', vest: '#2b3324', style: 'helmet', hair: '#2c3326', weapon: 'fists', resist: 0.65, col: '#4b5a3a', pads: '#2c3326', build: 'broad' },
  elite: { name: 'Elite', hp: 300, spd: 125, r: 20, xp: 14, melee: 16, armor: 0.3, ranged: { cd: 1.9, n: 1, burst: 3, spread: 0.08, spd: 360, dmg: 9, min: 200, max: 340 }, scale: 1.35, jacket: '#1d1d26', vest: '#ffc93c', style: 'hood', hair: '#121217', eyes: '#ff3b4e', weapon: 'rifle', resist: 0.5, glow: true, col: '#ffc93c', mask: 'balaclava', maskCol: '#121217' },
  boss: { name: 'Boss', hp: 1500, spd: 100, r: 34, xp: 70, melee: 28, armor: 0.4, scale: 2.35, jacket: '#ececf0', vest: '#b3202c', style: 'bald', weapon: 'heavy', resist: 0.85, glow: true, col: '#ff3b4e', skin: '#d9a074', glasses: 'shades', build: 'broad' },
};
const BOSS_NAMES = ['BIG SAL', 'THE BUTCHER', 'IRON MAMA', 'KINGPIN', 'DOC VOLT', 'MAD DOG'];
let enemies = [], corpses = [], nextEnemyId = 1;
const _fd = { x: 0, y: 0 };

function spawnEnemy(type, x, y, wave, opts = {}) {
  const d = ETYPES[type];
  const hpMul = 1 + 0.13 * (wave - 1) + 0.004 * (wave - 1) ** 2;
  const e = {
    id: nextEnemyId++, type, d, x, y, r: d.r, kvx: 0, kvy: 0, vx: 0, vy: 0,
    hp: d.hp * hpMul, maxHp: d.hp * hpMul, a: rand(TAU), phase: rand(TAU), flash: 0, squash: 0, twist: 0,
    atkCd: rand(0.4, 1), windup: 0, swing: 0, fireT: rand(0.8, 2), burst: 0, burstT: 0, aimT: 0, dead: false, bladeCd: 0,
    spd: d.spd * (1 + Math.min(0.25, 0.015 * (wave - 1))) * rand(0.92, 1.08), dmgMul: 1 + 0.06 * (wave - 1),
    xp: d.xp * (1 + 0.08 * (wave - 1)), flank: rand(-1, 1), strafe: Math.random() < 0.5 ? 1 : -1, strafeT: rand(1, 3),
    losT: rand(0.2), los: false, stuckT: 0, lastX: x, lastY: y, jitT: 0, jx: 0, jy: 0, spawnT: 0.35, skin: d.skin || pick(SKIN),
    armor: d.armor, shred: 0, burnT: 0, burnDps: 0, burnTick: 0, chill: 0, chillT: 0, supSlow: 0, supT: 0, marks: 0, markT: 0,
    stunT: 0, shatterCd: 0, age: 0, summoned: !!opts.summoned, hunted: !!opts.hunted,
  };
  if (type === 'boss') {
    e.hp = e.maxHp = 1500 + wave * 260; e.name = BOSS_NAMES[Game.bossCount % BOSS_NAMES.length];
    e.pattern = 0; e.patT = 2; e.charge = 0; e.chargeWind = 0;
  }
  if (e.hunted) { e.hp = e.maxHp = e.maxHp * 2.2; e.xp *= 4; e.spd *= 1.1; }
  enemies.push(e);
  return e;
}
function enemyLook(e) {
  const d = e.d;
  return { jacket: d.jacket, skin: e.skin, hair: d.hair, style: d.style, vest: e.hunted ? '#ff4fd8' : d.vest, eyes: d.eyes, top: d.top, pants: d.pants, glasses: d.glasses, mask: d.mask, maskCol: d.maskCol, pads: d.pads, build: d.build };
}
function updateStatuses(e, dt) {
  e.age += dt; e.shatterCd -= dt; e.stunT -= dt;
  if (e.burnT > 0) {
    e.burnT -= dt; e.burnTick -= dt;
    if (e.burnTick <= 0) { e.burnTick = 0.25; Game.damageEnemy(e, e.burnDps * 0.25, 0, 0, false, 'burn'); }
    if (Math.random() < dt * 12) FX.add(P_EMBER, e.x + rand(-e.r, e.r), e.y + rand(-e.r, e.r), rand(-15, 15), rand(-70, -30), rand(0.25, 0.5), rand(3, 5), Math.random() < 0.5 ? '#ff8a1f' : '#ffd23f', { drag: 2 });
    if (e.burnT <= 0) e.burnDps = 0;
  }
  if (e.chillT > 0) e.chillT -= dt; else e.chill = Math.max(0, e.chill - 0.3 * dt);
  if (e.supT > 0) e.supT -= dt; else e.supSlow = Math.max(0, e.supSlow - 0.4 * dt);
  if (e.markT > 0) e.markT -= dt; else e.marks = 0;
  e.twist *= Math.exp(-10 * dt);
}

function updateEnemies(dt, p) {
  for (const e of enemies) {
    if (e.dead) continue;
    e.flash -= dt; e.squash = Math.max(0, e.squash - dt * 6); e.bladeCd -= dt; e.atkCd -= dt; e.spawnT -= dt;
    updateStatuses(e, dt);
    if (e.dead) continue;
    const decoy = Decoys.target(e);
    const tx = decoy ? decoy.x : p.x, ty = decoy ? decoy.y : p.y;
    const dx = tx - e.x, dy = ty - e.y, d = Math.hypot(dx, dy) || 1;
    e.losT -= dt;
    if (e.losT <= 0) { e.losT = 0.18 + rand(0.08); e.los = Math.hypot(p.x - e.x, p.y - e.y) < 760 && lineOfSight(e.x, e.y, p.x, p.y); }
    const slow = 1 - Math.max(e.chill, e.supSlow);
    if (e.type === 'boss') { updateBoss(e, dt * (0.6 + 0.4 * slow), p, p.x - e.x, p.y - e.y, Math.hypot(p.x - e.x, p.y - e.y) || 1); continue; }
    let mx = 0, my = 0;
    const R = e.d.ranged, seeTarget = decoy || e.los;
    if (e.jitT > 0) { e.jitT -= dt; mx = e.jx; my = e.jy; }
    else if (seeTarget) {
      const ux = dx / d, uy = dy / d;
      if (R && !decoy && (!e.d.melee || d > 90)) {
        e.strafeT -= dt; if (e.strafeT <= 0) { e.strafeT = rand(1.2, 3); e.strafe = -e.strafe; }
        const toward = d > R.max ? 1 : d < R.min ? -0.9 : 0.1;
        mx = ux * toward - uy * e.strafe * 0.8; my = uy * toward + ux * e.strafe * 0.8;
      } else {
        const f = d > 140 && !decoy ? e.flank * 0.6 : 0;
        mx = ux - uy * f; my = uy + ux * f;
      }
    } else if (flowDir(e.x, e.y, _fd)) { mx = _fd.x; my = _fd.y; }
    else { mx = dx / d; my = dy / d; }
    let sx = 0, sy = 0;
    Grid.query(e.x, e.y, e.r * 2.2, o => {
      if (o === e || o.dead) return;
      const ox = e.x - o.x, oy = e.y - o.y, rr2 = (e.r + o.r) * 1.05, q = ox * ox + oy * oy;
      if (q < rr2 * rr2 && q > 0.01) { const qd = Math.sqrt(q), f = (rr2 - qd) / rr2; sx += ox / qd * f; sy += oy / qd * f; }
    });
    const ml = Math.hypot(mx, my) || 1;
    let spd = e.spd * slow * (e.windup > 0 ? 0.25 : 1) * (e.aimT > 0 ? 0.3 : 1);
    if (e.spawnT > 0) spd *= 0.4;
    if (decoy && d < 30) spd = 0;
    e.vx += ((mx / ml) * spd + sx * 160 - e.vx) * damp(10, dt);
    e.vy += ((my / ml) * spd + sy * 160 - e.vy) * damp(10, dt);
    e.kvx *= Math.exp(-9 * dt); e.kvy *= Math.exp(-9 * dt);
    moveCircle(e, (e.vx + e.kvx) * dt, (e.vy + e.kvy) * dt);
    e.phase += Math.hypot(e.vx, e.vy) * dt * 0.06;
    e.stuckT += dt;
    if (e.stuckT > 0.8) {
      if (dist2(e.x, e.y, e.lastX, e.lastY) < 100 && d > 60 && !decoy) { const ja = rand(TAU); e.jx = Math.cos(ja); e.jy = Math.sin(ja); e.jitT = 0.4; }
      e.stuckT = 0; e.lastX = e.x; e.lastY = e.y;
    }
    const pdx = p.x - e.x, pdy = p.y - e.y, pd = Math.hypot(pdx, pdy) || 1;
    const want = decoy ? Math.atan2(dy, dx) : e.los ? Math.atan2(pdy, pdx) : Math.atan2(e.vy, e.vx);
    e.a += angDiff(e.a, want) * damp(e.los ? 12 : 7, dt);
    if (e.d.melee) {
      const reach = e.r + p.r + 8;
      if (e.windup > 0) {
        e.windup -= dt; e.swing = 1 - e.windup / 0.3;
        if (e.windup <= 0) {
          e.swing = 0.01; Sound.melee();
          if (pd < reach + 16 && !decoy) Game.hurtPlayer(e.d.melee * e.dmgMul, Math.atan2(pdy, pdx));
          e.atkCd = e.type === 'rusher' ? 0.7 : 1.0;
        }
      } else if (e.swing > 0) { e.swing += dt * 4; if (e.swing > 1) e.swing = 0; }
      else if (pd < reach && e.atkCd <= 0 && !decoy) { e.windup = e.type === 'heavy' ? 0.45 : 0.3; }
    }
    if (R) {
      e.fireT -= dt;
      if (e.stunT > 0) { e.aimT = 0; e.burst = 0; if (Math.random() < dt * 8) FX.add(P_SPARK, e.x + rand(-10, 10), e.y + rand(-10, 10), rand(-80, 80), rand(-80, 80), 0.15, 2, '#9fe8ff', { drag: 6 }); }
      else if (e.aimT > 0) {
        e.aimT -= dt;
        if (e.aimT <= 0) { enemyFire(e, p, R); if (R.burst) { e.burst = R.burst - 1; e.burstT = 0.12; } }
      } else if (e.burst > 0) {
        e.burstT -= dt; if (e.burstT <= 0) { e.burst--; e.burstT = 0.12; enemyFire(e, p, R); }
      } else if (e.fireT <= 0 && e.los && !decoy && pd < R.max + 160 && e.spawnT <= 0) {
        e.aimT = 0.35; e.fireT = R.cd * rand(0.85, 1.2);
      }
    }
  }
  for (let i = enemies.length - 1; i >= 0; i--) if (enemies[i].dead) { enemies[i] = enemies[enemies.length - 1]; enemies.pop(); }
  for (let i = corpses.length - 1; i >= 0; i--) {
    const c = corpses[i]; c.life -= dt;
    c.x += c.vx * dt; c.y += c.vy * dt; c.vx *= Math.exp(-6 * dt); c.vy *= Math.exp(-6 * dt); c.spin *= Math.exp(-5 * dt); c.a += c.spin * dt;
    if (solidAt(c.x, c.y)) { c.vx = -c.vx * 0.3; c.vy = -c.vy * 0.3; }
    if (c.life <= 0) corpses.splice(i, 1);
  }
}
function enemyFire(e, p, R) {
  const t = Math.hypot(p.x - e.x, p.y - e.y) / R.spd;
  const tx = p.x + p.vx * t * 0.3, ty = p.y + p.vy * t * 0.3;
  const base = Math.atan2(ty - e.y, tx - e.x) + rand(-R.spread, R.spread) * (R.n > 1 ? 0.2 : 1);
  const mx = e.x + Math.cos(e.a) * e.r * 1.6, my = e.y + Math.sin(e.a) * e.r * 1.6;
  for (let i = 0; i < R.n; i++) {
    const a = base + (R.n > 1 ? (i - (R.n - 1) / 2) * (R.spread / (R.n - 1)) * 2 : 0);
    Bullets.enemy(solidAt(mx, my) ? e.x : mx, solidAt(mx, my) ? e.y : my, a, R.spd * rand(0.95, 1.05), { dmg: R.dmg * e.dmgMul, r: 6, life: R.life || 2.4 });
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
    if (e.patT <= 0 && e.los && e.stunT <= 0) {
      e.pattern = (e.pattern + 1) % 4;
      const dm = 10 * e.dmgMul;
      if (e.pattern === 0) {
        const n = enraged ? 26 : 18, off = rand(TAU);
        for (let i = 0; i < n; i++) Bullets.enemy(e.x, e.y, off + i / n * TAU, 230, { dmg: dm, r: 8, color: '#b46bff', life: 3 });
        FX.add(P_RING, e.x, e.y, 0, 0, 0.4, 90, '#b46bff', { lw: 6 }); Sound.explode();
      } else if (e.pattern === 1) {
        for (let v = 0; v < (enraged ? 3 : 2); v++) setTimeoutGame(v * 0.28, () => {
          if (e.dead) return;
          const a0 = Math.atan2(player.y - e.y, player.x - e.x);
          for (let i = -3; i <= 3; i++) Bullets.enemy(e.x, e.y, a0 + i * 0.13, 340, { dmg: dm, r: 7, life: 2.5 });
          Sound.enemyShoot(); FX.light(e.x, e.y, 80, 0.08, GLOW.red, 0.8);
        });
      } else if (e.pattern === 2) { e.chargeWind = 0.7; FX.text(e.x, e.y - 60, '!', '#ff3b4e', 40, { crit: true }); }
      else {
        for (let i = 0; i < (enraged ? 5 : 3); i++) { const a = rand(TAU); const x = e.x + Math.cos(a) * 60, y = e.y + Math.sin(a) * 60; if (!solidAt(x, y)) spawnEnemy(pick(['thug', 'rusher', 'gunman']), x, y, Game.wave, { summoned: true }); }
        FX.text(e.x, e.y - 60, 'GET HIM!', '#ffd23f', 26, { crit: true });
      }
      e.patT = enraged ? 1.7 : 2.4;
    }
  }
  e.phase += Math.hypot(e.vx, e.vy) * dt * 0.05;
  if (d < e.r + p.r + 6 && e.atkCd <= 0) { e.atkCd = 1; Game.hurtPlayer(e.d.melee * e.dmgMul, Math.atan2(dy, dx)); }
}
const timers = [];
function setTimeoutGame(t, fn) { timers.push({ t, fn }); }
function updateTimers(dt) { for (let i = timers.length - 1; i >= 0; i--) { timers[i].t -= dt; if (timers[i].t <= 0) { const f = timers[i].fn; timers.splice(i, 1); f(); } } }

function killEnemy(e, ang, src) {
  if (e.dead) return;
  e.dead = true;
  const p = player, S = p.S;
  const big = e.type === 'heavy' || e.type === 'elite' || e.type === 'boss';
  corpses.push({ x: e.x, y: e.y, a: e.a, vx: Math.cos(ang) * (big ? 160 : 340), vy: Math.sin(ang) * (big ? 160 : 340), spin: rand(-8, 8), life: big ? 0.9 : 0.5, max: big ? 0.9 : 0.5, e });
  FX.deathPop(e.x, e.y, e.d.col, big, ang);
  Decals.add('splat', e.x + Math.cos(ang) * 14, e.y + Math.sin(ang) * 14, ang, e.d.scale * rand(0.8, 1.2));
  Sound.kill(big);
  Pickups.gems(e.x, e.y, e.xp * (Game.combo >= 5 ? 1.25 : 1));
  if (e.type === 'elite' || e.hunted) {   // enhanced elite death
    FX.sparkle(e.x, e.y, '#ffc93c', 30, 420); FX.distort(e.x, e.y, 150); Game.hitstop(0.06);
    if (Settings.comic) FX.comic(e.x, e.y - 30, pick(['KA-BLAM!', 'WHAM!', 'KRAKOOM!']), '#ffc93c');
  }
  if (e.type === 'boss') {
    Game.explosion(e.x, e.y, 200, 0, 'boss'); Game.shake(22); Pickups.health(e.x, e.y, 50);
    Game.banner(e.name + ' DOWN', '#ffc93c'); Game.hitstop(0.15);
  } else if ((e.type === 'elite' || e.hunted) && !e.summoned && Math.random() < 0.5) Pickups.health(e.x, e.y, 25);
  else Pickups.rollEnemyDrop(e, p);
  if (S.volatile && e.burnT > 0 && Math.random() < 0.25 + 0.15 * S.volatile) Game.explosion(e.x, e.y, 80, (25 + 15 * S.volatile) * S.elemMul, 'volatile');
  else if (p.gun.inferno && Math.random() < 0.35) Game.explosion(e.x, e.y, 75, p.gun.dmg * 0.6, 'fire');
  if (e.hunted && Director.event && Director.event.type === 'elite') Director.endEvent(true);
  Game.onKill(e, src);
}

function drawEnemies(v, time) {
  for (const c of corpses) {
    if (c.x < v.x0 || c.x > v.x1 || c.y < v.y0 || c.y > v.y1) continue;
    const t = c.life / c.max, e = c.e;
    ctx.globalAlpha = Math.min(1, t * 2);
    drawHuman(ctx, c.x, c.y, Object.assign(enemyLook(e), { a: c.a, scale: e.d.scale * (0.6 + t * 0.4), weapon: null, flash: t > 0.8, sx: 1 + (1 - t) * 0.5, sy: 1 - (1 - t) * 0.4 }));
    ctx.globalAlpha = 1;
  }
  for (const e of enemies) {
    if (e.x < v.x0 - 40 || e.x > v.x1 + 40 || e.y < v.y0 - 40 || e.y > v.y1 + 40) continue;
    if (e.d.glow || e.hunted) { ctx.globalCompositeOperation = 'lighter'; glow(e.type === 'boss' ? GLOW.red : e.hunted ? GLOW.magenta : GLOW.gold, e.x, e.y, e.r * 2.6, 0.35 + Math.sin(time * 6) * 0.1); ctx.globalCompositeOperation = 'source-over'; }
    if (e.burnT > 0) { ctx.globalCompositeOperation = 'lighter'; glow(GLOW.fire, e.x, e.y, e.r * 2, 0.35); ctx.globalCompositeOperation = 'source-over'; }
    if (e.aimT > 0) {
      ctx.strokeStyle = `rgba(255,60,80,${0.5 * (1 - e.aimT / 0.35)})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x + Math.cos(e.a) * 220, e.y + Math.sin(e.a) * 220); ctx.stroke();
    }
    if (e.chargeWind > 0) {
      ctx.fillStyle = `rgba(255,60,80,${0.25 + Math.sin(time * 40) * 0.1})`;
      ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(e.a); ctx.fillRect(0, -e.r, 450, e.r * 2); ctx.restore();
    }
    const sq = e.squash, sp = e.spawnT > 0 ? 1 - e.spawnT / 0.35 : 1;
    if (sp < 1) ctx.globalAlpha = sp;
    drawHuman(ctx, e.x, e.y, Object.assign(enemyLook(e), {
      a: e.a + e.twist, phase: e.phase, moving: true, scale: e.d.scale, weapon: e.d.weapon, flash: e.flash > 0,
      swing: e.swing || (e.windup > 0 ? 0.001 : 0), sx: 1 + sq * 0.28, sy: 1 - sq * 0.22,
    }));
    ctx.globalAlpha = 1;
    if (e.chill > 0.05) {   // frost overlay
      ctx.fillStyle = `rgba(170,230,255,${e.chill * 0.8})`; ctx.beginPath(); ctx.arc(e.x, e.y, e.r * e.d.scale * 0.75, 0, TAU); ctx.fill();
      if (e.chill >= 0.45) { ctx.strokeStyle = '#e8f8ff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 4, 0, TAU); ctx.stroke(); }
    }
    if (e.stunT > 0) { ctx.strokeStyle = '#9fe8ff'; ctx.lineWidth = 2; ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 6, time * 6, time * 6 + 4); ctx.stroke(); ctx.setLineDash([]); }
    if (e.marks > 2) { ctx.strokeStyle = `rgba(255,79,94,${0.3 + e.marks * 0.06})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 9, 0, TAU); ctx.stroke(); }
    if (e.windup > 0) { ctx.fillStyle = '#ff3b4e'; ctx.font = '400 18px Bungee, Impact, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('!', e.x, e.y - e.r - 14); }
    if (e.hunted) { ctx.fillStyle = '#ff4fd8'; ctx.font = '400 14px Bungee, Impact, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('HUNTED', e.x, e.y - e.r - 26); }
    if (e.type !== 'boss' && e.hp < e.maxHp && e.maxHp > 60) {
      const w = e.r * 2.2, f = clamp(e.hp / e.maxHp, 0, 1);
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(e.x - w / 2 - 1, e.y - e.r - 12, w + 2, 6);
      ctx.fillStyle = e.hunted ? '#ff4fd8' : e.type === 'elite' ? '#ffc93c' : '#ff3b4e'; ctx.fillRect(e.x - w / 2, e.y - e.r - 11, w * f, 4);
      if (e.armor) { ctx.fillStyle = '#9aa0b4'; ctx.fillRect(e.x - w / 2, e.y - e.r - 14, w * enemyArmor(e) / e.armor, 2); }
    }
  }
}

// ---------- wave director + dynamic events ----------
const EVENTS = {
  ambush: { name: 'AMBUSH', dur: 18, color: '#ff3b4e', desc: 'Enemies pouring out of nearby doors' },
  supply: { name: 'SUPPLY DROP', dur: 30, color: '#ffd23f', desc: 'Grab the marked crate' },
  elite: { name: 'ELITE HUNT', dur: 35, color: '#ff4fd8', desc: 'Take down the hunted elite' },
  blackout: { name: 'BLACKOUT', dur: 25, color: '#8c7bff', desc: 'The grid is down' },
  overrun: { name: 'OVERRUN', dur: 20, color: '#ff9a1f', desc: 'Enemy density surging' },
};
const Director = {
  t: 0, spawnT: 0, event: null, nextEvent: 95, lastEvent: null,
  reset() { this.t = 0; this.spawnT = 1.2; this.event = null; this.nextEvent = rand(85, 105); this.lastEvent = null; },
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
  findSpawn(p, near = false) {
    const halfDiag = Math.hypot(VW, VH) / ZOOM / 2;
    const minD = near ? 360 : halfDiag + 50, maxD = near ? 900 : halfDiag + 520;
    const camX = Game.cam.x - VW / ZOOM / 2, camY = Game.cam.y - VH / ZOOM / 2;
    const pts = near ? Map.doors : Map.spawnPts;
    for (let k = 0; k < 40; k++) {
      let tx, ty;
      if (k < 28 && pts.length) { [tx, ty] = pick(pts); }
      else { const a = rand(TAU), r = rand(minD, maxD); tx = Math.floor((p.x + Math.cos(a) * r) / TILE); ty = Math.floor((p.y + Math.sin(a) * r) / TILE); }
      if (!inMap(tx, ty) || Map.obj[idx(tx, ty)] !== 0 || Map.flow[idx(tx, ty)] === FLOW_INF) continue;
      const x = (tx + 0.5) * TILE, y = (ty + 0.5) * TILE, dd = Math.hypot(x - p.x, y - p.y);
      if (dd < minD || dd > maxD) continue;
      if (!near && x > camX - 40 && x < camX + VW / ZOOM + 40 && y > camY - 40 && y < camY + VH / ZOOM + 40) continue;
      return [x, y];
    }
    return null;
  },
  squad(p, n, near) {
    const q = this.findSpawn(p, near);
    if (q) for (let i = 0; i < n; i++) { const x = q[0] + rand(-40, 40), y = q[1] + rand(-40, 40); spawnEnemy(this.pickType(Game.wave), solidAt(x, y) ? q[0] : x, solidAt(x, y) ? q[1] : y, Game.wave); }
  },
  startEvent(p, forced) {
    const opts = Object.keys(EVENTS).filter(k => k !== this.lastEvent && (k !== 'elite' || Game.wave >= 3));
    const type = forced || pick(opts), def = EVENTS[type];
    this.event = { type, t: def.dur, dur: def.dur, pulse: 0 }; this.lastEvent = type;
    Game.banner(def.name, def.color, def.desc); Sound.event();
    if (type === 'supply') { const s = findReachableSpot(p.x, p.y, 300, 700, true); if (s) { Pickups.supply(s[0], s[1], 15 + Game.wave * 3); this.event.x = s[0]; this.event.y = s[1]; } else this.event.t = 0; }
    if (type === 'elite') { const s = this.findSpawn(p); if (s) { const e = spawnEnemy('elite', s[0], s[1], Game.wave + Math.floor(p.level / 6), { hunted: true }); this.event.target = e; } else this.event.t = 0; }
  },
  endEvent(success) {
    if (!this.event) return;
    const def = EVENTS[this.event.type];
    if (success) { Game.banner(def.name + ' CLEARED', def.color); Game.addXp(10 + Game.wave * 2); }
    this.event = null; this.nextEvent = rand(80, 120);
  },
  updateEvent(dt, p) {
    const ev = this.event;
    if (!ev) { this.nextEvent -= dt; if (this.nextEvent <= 0 && Game.wave >= 2) this.startEvent(p); return; }
    ev.t -= dt; ev.pulse -= dt;
    if (ev.type === 'ambush' && ev.pulse <= 0) { ev.pulse = 6; for (let i = 0; i < 3; i++) this.squad(p, 2 + Math.floor(Game.wave / 3 + p.level / 10), true); }
    if (ev.type === 'supply' && !Pickups.list.some(g => g.kind === 'supply')) { this.endEvent(true); return; }
    if (ev.type === 'elite' && ev.target && ev.target.dead) { this.endEvent(true); return; }
    if (ev.t <= 0) this.endEvent(ev.type === 'ambush' || ev.type === 'blackout' || ev.type === 'overrun');
  },
  update(dt, p) {
    this.t += dt;
    const w = Game.wave, dur = w === 1 ? 25 : 30;
    if (this.t >= dur) {
      this.t = 0; Game.wave++; p.secondWindUsed = false;
      const nw = Game.wave;
      if (nw % 5 === 0) {
        const pos = this.findSpawn(p);
        if (pos) { const b = spawnEnemy('boss', pos[0], pos[1], nw); Game.boss = b; Game.bossCount++; Game.banner('WAVE ' + nw + ' · ' + b.name, '#ff3b4e'); Sound.boss(); }
        for (let i = 0; i < 2 + Math.floor(nw / 10); i++) { const q = this.findSpawn(p); if (q) spawnEnemy('elite', q[0], q[1], nw); }
      } else { Game.banner('WAVE ' + nw, '#2ef2ff'); Sound.wave(); }
      this.squad(p, 4 + nw, false);
    }
    this.updateEvent(dt, p);
    const over = this.event && this.event.type === 'overrun';
    const maxAlive = Math.min(over ? 240 : 190, (9 + w * 7) * (over ? 1.4 : 1));
    const interval = Math.max(0.14, (w === 1 ? 0.95 : 1.05) * Math.pow(0.88, w - 1)) * (over ? 0.4 : 1);
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
    for (const e of enemies) if (e.type !== 'boss' && !e.hunted && dist2(e.x, e.y, p.x, p.y) > 2400 * 2400) { const pos = this.findSpawn(p); if (pos) { e.x = pos[0]; e.y = pos[1]; } }
  },
};
