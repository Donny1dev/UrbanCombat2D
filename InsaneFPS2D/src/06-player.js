// ===================== PLAYER, BULLETS, PICKUPS =====================
const DASH_TIME = 0.17, BASE_SPEED = 275, BASE_DASH = 175;
let player = null;
function newPlayer() {
  const p = {
    x: Map.startX, y: Map.startY, r: 14, vx: 0, vy: 0, a: 0, hp: 100, maxHp: 100,
    S: freshStats(), upg: {}, weapon: 'pistol', evolved: null, gun: null, ammo: 0, reloading: 0,
    fireCd: 0, recoil: 0, altRecoil: 0, altSide: 1, phase: 0, moving: false, lean: 0,
    dashT: 0, dashCdT: 0, dashX: 1, dashY: 0, dashTrailD: 0, invuln: 0, hurtT: 0, ghosts: [], ghostT: 0, footT: 0,
    level: 1, xp: 0, xpShown: 0, xpNeed: xpForLevel(1), xpPulse: 0, kills: 0, momentumT: 0, adrenT: 0,
    overclockT: 0, ocKills: 0, bladeAng: 0, drones: [], glowT: 0, glowCol: '#2ef2ff', squash: 0, dmgDealt: 0, pickStreak: 0, pickT: 0,
  };
  p.gun = buildGun(p); p.ammo = p.gun.mag;
  return p;
}
function xpForLevel(l) { return Math.floor(6 + (l - 1) * 5 + Math.pow(l - 1, 1.7) * 1.6); }

function updatePlayer(p, dt) {
  const S = p.S, g = p.gun;
  // --- aim ---
  p.a = Math.atan2(mouse.y - p.y, mouse.x - p.x);
  // --- movement ---
  let ix = (keys.d || keys.arrowright ? 1 : 0) - (keys.a || keys.arrowleft ? 1 : 0);
  let iy = (keys.s || keys.arrowdown ? 1 : 0) - (keys.w || keys.arrowup ? 1 : 0);
  const il = Math.hypot(ix, iy); if (il) { ix /= il; iy /= il; }
  p.moving = il > 0;
  if (p.moving) p.momentumT = Math.min(2.5, p.momentumT + dt); else p.momentumT = Math.max(0, p.momentumT - dt * 3);
  const mom = S.momentum ? Math.min(1, p.momentumT / 2) * 0.12 * S.momentum : 0;
  const speed = BASE_SPEED * S.moveMul * (1 + mom + (p.adrenT > 0 ? 0.3 : 0));
  p.adrenT -= dt;
  p.dashCdT -= dt;
  if (p.dashT > 0) {
    p.dashT -= dt;
    const dsp = BASE_DASH * S.dashDist / DASH_TIME;
    p.vx = p.dashX * dsp; p.vy = p.dashY * dsp;
    p.ghostT -= dt;
    if (p.ghostT <= 0) { p.ghostT = 0.022; p.ghosts.push({ x: p.x, y: p.y, a: p.a, life: 0.28 }); }
    if (Math.random() < 0.8) FX.add(P_SPARK, p.x + rand(-8, 8), p.y + rand(-8, 8), -p.vx * 0.3, -p.vy * 0.3, 0.15, 2, '#9ff6ff', { drag: 6 });
    if (S.afterburn) {
      p.dashTrailD += Math.hypot(p.vx, p.vy) * dt;
      while (p.dashTrailD > 16) { p.dashTrailD -= 16; Hazards.fire(p.x, p.y, 30 + S.afterburn * 25); }
    }
    if (p.dashT <= 0) {
      p.vx *= 0.35; p.vy *= 0.35; p.invuln = 0.08;
      if (S.shock) Game.shockwave(p.x, p.y, 110 + S.shock * 28, 32 * S.shock * (0.6 + S.dmgMul * 0.4));
    }
  } else {
    const k = damp(p.moving ? 24 : 18, dt);
    p.vx += (ix * speed - p.vx) * k; p.vy += (iy * speed - p.vy) * k;
  }
  const wantDash = keys.shift || keys[' '];
  if (wantDash && p.dashCdT <= 0 && p.dashT <= 0) {
    if (p.moving) { p.dashX = ix; p.dashY = iy; } else { p.dashX = Math.cos(p.a); p.dashY = Math.sin(p.a); }
    p.dashT = DASH_TIME; p.dashCdT = S.dashCd; p.dashTrailD = 0;
    Sound.dash(); FX.dust(p.x, p.y, 5, 'rgba(180,230,255,');
    FX.add(P_RING, p.x, p.y, 0, 0, 0.25, 34, '#9ff6ff', { lw: 3 });
  }
  moveCircle(p, p.vx * dt, p.vy * dt);
  // walk cycle + footstep dust + lean
  const sp = Math.hypot(p.vx, p.vy);
  p.phase += sp * dt * 0.055;
  p.lean = lerp(p.lean, clamp(sp / 300, 0, 1), damp(10, dt));
  p.footT -= dt * (sp / 260);
  if (p.footT <= 0 && sp > 60) { p.footT = 0.3; FX.dust(p.x - p.vx * 0.04, p.y - p.vy * 0.04, 1); }
  for (let i = p.ghosts.length - 1; i >= 0; i--) { p.ghosts[i].life -= dt; if (p.ghosts[i].life <= 0) p.ghosts.splice(i, 1); }
  // timers
  p.invuln -= dt; p.hurtT -= dt; p.recoil = Math.max(0, p.recoil - dt * 60); p.altRecoil = Math.max(0, p.altRecoil - dt * 60);
  p.glowT -= dt; p.squash = Math.max(0, p.squash - dt * 5); p.pickT -= dt; if (p.pickT <= 0) p.pickStreak = 0;
  p.overclockT -= dt;
  if (S.regen && p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + S.regen * dt);
  // --- reload ---
  if (p.reloading > 0) {
    p.reloading -= dt;
    if (p.reloading <= 0) { p.ammo = g.mag; Sound.reloadDone(); }
  }
  if (keys.r && p.reloading <= 0 && p.ammo < g.mag) startReload(p);
  // --- shooting ---
  p.fireCd -= dt;
  const oc = p.overclockT > 0;
  if (mouse.down && p.reloading <= 0) {
    let shots = 0;
    while (p.fireCd <= 0 && shots < 4) {
      if (p.ammo <= 0 && !oc) { startReload(p); break; }
      fire(p);
      if (!oc) p.ammo--;
      p.fireCd += 1 / (g.rate * (oc ? 1.7 : 1));
      shots++;
    }
    if (p.ammo <= 0 && !oc && p.reloading <= 0) startReload(p);
  }
  if (p.fireCd < 0) p.fireCd = 0;
  // --- orbiting blades & drones ---
  p.bladeAng += dt * 3.4;
  if (S.blades) updateBlades(p, dt);
  while (p.drones.length < S.drones) p.drones.push({ x: p.x, y: p.y, cd: rand(0.3), a: 0, t: rand(TAU) });
  for (let i = 0; i < p.drones.length; i++) updateDrone(p, p.drones[i], i, dt);
}
function startReload(p) {
  if (p.reloading > 0) return;
  p.reloading = p.gun.reload; Sound.reload();
  FX.text(p.x, p.y - 30, 'RELOAD', '#ffd23f', 15);
}
function fire(p) {
  const g = p.gun, hue = p.evolved ? (EVOS.find(e => e.id === p.evolved) || {}).hue : null;
  let side = 0;
  if (p.weapon === 'dual') { p.altSide = -p.altSide; side = p.altSide * 8; }
  const ca = Math.cos(p.a), sa = Math.sin(p.a);
  const len = (GUN_SHAPES[p.weapon] || [14])[0] + (p.weapon === 'dual' || p.weapon === 'pistol' ? 14 : 9);
  const mx = p.x + ca * len - sa * side, my = p.y + sa * len + ca * side;
  // don't spawn bullets inside a wall when hugging it
  const sx = solidAt(mx, my) ? p.x : mx, sy = solidAt(mx, my) ? p.y : my;
  const n = g.pellets;
  for (let i = 0; i < n; i++) {
    let ang = p.a + (Math.random() - 0.5) * 2 * g.spread * (p.weapon === 'shotgun' ? 0.5 : 1);
    if (g.fan && n > 1) ang += (i - (n - 1) / 2) * g.fan;
    const spd = g.speed * (p.weapon === 'shotgun' ? rand(0.8, 1.15) : rand(0.97, 1.03));
    Bullets.spawn(sx, sy, ang, spd, g, false);
  }
  if (p.weapon === 'dual') { if (p.altSide > 0) p.altRecoil = g.recoil; else p.recoil = g.recoil; } else p.recoil = g.recoil;
  FX.muzzle(mx, my, p.a, p.weapon === 'shotgun' || p.weapon === 'heavy' ? 1.5 : 1, hue);
  Game.muzzle = { x: mx, y: my, a: p.a, t: 0.05, scale: p.weapon === 'shotgun' || p.weapon === 'heavy' ? 1.5 : 1, hue };
  FX.casing(p.x + ca * 6, p.y + sa * 6, p.a, g.shell);
  Sound.shoot(p.weapon, !!p.evolved);
  Game.shake(g.shake * 0.8, p.a);
  p.vx -= ca * g.recoil * 4; p.vy -= sa * g.recoil * 4;
}

// ---------- bullets ----------
const Bullets = {
  list: [], free: [],
  reset() { this.free.push(...this.list); this.list.length = 0; },
  spawn(x, y, ang, spd, g, enemy, o) {
    if (this.list.length > 900) return;
    const b = this.free.pop() || { hit: [] };
    b.x = x; b.y = y; b.px = x; b.py = y; b.vx = Math.cos(ang) * spd; b.vy = Math.sin(ang) * spd;
    b.enemy = enemy; b.hit.length = 0; b.dead = false;
    if (enemy) { b.dmg = o.dmg; b.life = o.life || 2.5; b.r = o.r || 6; b.color = o.color || '#ff4f5e'; b.pierce = 0; b.rico = 0; b.knock = 0; b.width = 0; b.trail = null; b.boom = false; }
    else {
      b.dmg = g.dmg; b.life = g.life; b.r = 4 + (g.width > 4 ? 2 : 0); b.pierce = g.pierce; b.rico = g.ricochet; b.knock = g.knock;
      b.trail = g.trail; b.width = g.width; b.crit = g.critChance; b.critMul = g.critMul; b.rail = g.rail; b.boom = g.impactBoom; b.src = (o && o.src) || 'gun';
    }
    this.list.push(b);
    return b;
  },
  update(dt) {
    const L = this.list;
    for (let i = L.length - 1; i >= 0; i--) {
      const b = L[i];
      b.life -= dt; b.px = b.x; b.py = b.y;
      if (b.life > 0 && !b.dead) {
        const dist = Math.hypot(b.vx, b.vy) * dt, steps = Math.max(1, Math.ceil(dist / 10));
        for (let s = 0; s < steps && !b.dead; s++) {
          const ox = b.x, oy = b.y;
          b.x += b.vx * dt / steps; b.y += b.vy * dt / steps;
          const tx = Math.floor(b.x / TILE), ty = Math.floor(b.y / TILE), o = objAt(tx, ty);
          if (o !== O_NONE) { this.hitTile(b, o, tx, ty, ox, oy); continue; }
          if (b.enemy) {
            if (dist2(b.x, b.y, player.x, player.y) < (b.r + player.r - 3) ** 2) { b.dead = true; Game.hurtPlayer(b.dmg, Math.atan2(b.vy, b.vx)); FX.impact(b.x, b.y, Math.atan2(b.vy, b.vx), 'flesh'); }
          } else this.hitEnemies(b);
        }
      }
      if (b.life <= 0 || b.dead) { L[i] = L[L.length - 1]; L.pop(); this.free.push(b); }
    }
  },
  hitTile(b, o, tx, ty, ox, oy) {
    const ang = Math.atan2(b.vy, b.vx);
    if (o === O_GLASS) { damageTile(tx, ty, 1, b.x, b.y, ang); b.vx *= 0.85; b.vy *= 0.85; return; }
    if (o === O_CRATE || o === O_BARREL) {
      damageTile(tx, ty, b.enemy ? b.dmg * 0.5 : b.dmg, b.x, b.y, ang);
      FX.impact(ox, oy, ang, o === O_BARREL ? 'metal' : 'wood');
      if (!b.enemy && b.boom) Game.explosion(ox, oy, 70, b.dmg * 0.6, 'round');
      b.dead = true; return;
    }
    const metal = o === O_METAL;
    if (!b.enemy && b.rico > 0) {
      b.rico--;
      const hx = objAt(Math.floor(b.x / TILE), Math.floor(oy / TILE)) !== O_NONE;
      const hy = objAt(Math.floor(ox / TILE), Math.floor(b.y / TILE)) !== O_NONE;
      if (hx || !hy) b.vx = -b.vx;
      if (hy || !hx) b.vy = -b.vy;
      b.x = ox; b.y = oy; b.hit.length = 0; b.life = Math.max(b.life, 0.4);
      FX.impact(ox, oy, ang, 'metal'); Sound.wall(true);
      return;
    }
    b.dead = true;
    FX.impact(ox, oy, ang, metal ? 'metal' : o === O_FURN ? 'wood' : 'wall');
    if (!b.enemy) { Decals.add('hole', ox, oy, rand(TAU)); if (Math.random() < 0.3) Sound.wall(metal); if (b.boom) Game.explosion(ox, oy, 70, b.dmg * 0.6, 'round'); }
  },
  hitEnemies(b) {
    Grid.query(b.x, b.y, 40, e => {
      if (b.dead || e.dead || b.hit.includes(e.id)) return;
      if (dist2(b.x, b.y, e.x, e.y) > (e.r + b.r) ** 2) return;
      const ang = Math.atan2(b.vy, b.vx);
      const crit = Math.random() < b.crit;
      const dmg = b.dmg * (crit ? b.critMul : 1) * rand(0.92, 1.08);
      Game.damageEnemy(e, dmg, ang, b.knock, crit, b.src);
      if (b.boom) Game.explosion(b.x, b.y, 80, b.dmg * 0.5, 'round');
      if (player.S.chain && b.src === 'gun' && Math.random() < 0.12 * player.S.chain) Game.chainLightning(e, b.dmg * 0.6, 2 + player.S.chain);
      b.hit.push(e.id);
      if (b.pierce > 0) { b.pierce--; b.dmg *= 0.9; return; }
      if (b.rico > 0) {
        b.rico--;
        let best = null, bd = 420 * 420;
        Grid.query(b.x, b.y, 420, o => { if (o === e || o.dead || b.hit.includes(o.id)) return; const d = dist2(b.x, b.y, o.x, o.y); if (d < bd && lineOfSight(b.x, b.y, o.x, o.y)) { bd = d; best = o; } });
        if (best) { const sp = Math.hypot(b.vx, b.vy), na = Math.atan2(best.y - b.y, best.x - b.x); b.vx = Math.cos(na) * sp; b.vy = Math.sin(na) * sp; b.life = Math.max(b.life, 0.5); FX.add(P_RING, b.x, b.y, 0, 0, 0.15, 14, '#bfe9ff', { lw: 2 }); return; }
      }
      b.dead = true;
    });
  },
  draw(v) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (const b of this.list) {
      if (b.x < v.x0 || b.x > v.x1 || b.y < v.y0 || b.y > v.y1) continue;
      if (b.enemy) {
        glow(b.color === '#ff4f5e' ? GLOW.red : GLOW.violet, b.x, b.y, b.r * 3.4, 0.9);
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 0.55, 0, TAU); ctx.fill();
        continue;
      }
      const sp = Math.hypot(b.vx, b.vy), tl = Math.min(b.rail ? 0.045 : 0.03, b.life + 0.02) * sp;
      const tx = b.x - b.vx / sp * tl, ty = b.y - b.vy / sp * tl;
      ctx.strokeStyle = b.trail; ctx.globalAlpha = 0.55; ctx.lineWidth = b.width * 2.4;
      ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.strokeStyle = '#fffbe8'; ctx.globalAlpha = 1; ctx.lineWidth = b.width * 0.8;
      ctx.beginPath(); ctx.moveTo(lerp(tx, b.x, 0.4), lerp(ty, b.y, 0.4)); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  },
};

// ---------- blades & drones ----------
function bladePos(p, i) {
  const n = p.S.blades, a = p.bladeAng + i * TAU / n, r = 70 + n * 3;
  return [p.x + Math.cos(a) * r, p.y + Math.sin(a) * r, a];
}
function updateBlades(p, dt) {
  const dmg = 16 * (0.6 + p.S.dmgMul * 0.4);
  for (let i = 0; i < p.S.blades; i++) {
    const [bx, by, a] = bladePos(p, i);
    Grid.query(bx, by, 50, e => {
      if (e.dead || e.bladeCd > 0 || dist2(bx, by, e.x, e.y) > (e.r + 16) ** 2) return;
      e.bladeCd = 0.28;
      Game.damageEnemy(e, dmg, a + Math.PI / 2, 140, false, 'blade');
      FX.impact(bx, by, a, 'metal');
    });
  }
}
function updateDrone(p, d, i, dt) {
  d.t += dt;
  const n = p.drones.length, a = d.t * 1.3 + i * TAU / n;
  const tx = p.x + Math.cos(a) * 46, ty = p.y + Math.sin(a) * 46 - 8;
  d.x += (tx - d.x) * damp(8, dt); d.y += (ty - d.y) * damp(8, dt);
  d.cd -= dt;
  let best = null, bd = 430 * 430;
  Grid.query(d.x, d.y, 430, e => { if (e.dead) return; const q = dist2(d.x, d.y, e.x, e.y); if (q < bd) { bd = q; best = e; } });
  if (best) d.a = Math.atan2(best.y - d.y, best.x - d.x);
  if (best && d.cd <= 0 && lineOfSight(d.x, d.y, best.x, best.y)) {
    d.cd = 0.42;
    const g = { dmg: 13 * (0.5 + p.S.dmgMul * 0.5), life: 0.6, width: 2, pierce: 0, ricochet: 0, knock: 60, trail: '#5ff4ff', critChance: p.gun.critChance, critMul: p.gun.critMul };
    Bullets.spawn(d.x, d.y, d.a + rand(-0.04, 0.04), 1000, g, false, { src: 'drone' });
    FX.light(d.x, d.y, 30, 0.05, GLOW.xp, 0.6);
    Sound.shoot('smg');
  }
}
function drawBladesDrones(p) {
  if (p.S.blades) {
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < p.S.blades; i++) { const [bx, by] = bladePos(p, i); glow(GLOW.xp, bx, by, 26, 0.45); }
    ctx.globalCompositeOperation = 'source-over';
    for (let i = 0; i < p.S.blades; i++) {
      const [bx, by, a] = bladePos(p, i);
      ctx.save(); ctx.translate(bx, by); ctx.rotate(a * 3);
      ctx.fillStyle = '#e8fbff'; ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2.5;
      ctx.beginPath(); for (let k = 0; k < 3; k++) { const q = k * TAU / 3; ctx.moveTo(Math.cos(q) * 4, Math.sin(q) * 4); ctx.lineTo(Math.cos(q + 0.25) * 17, Math.sin(q + 0.25) * 17); ctx.lineTo(Math.cos(q + 0.9) * 5, Math.sin(q + 0.9) * 5); }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
  }
  for (const d of p.drones) {
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(d.x + 10, d.y + 18, 10, 6, 0, 0, TAU); ctx.fill();
    ctx.save(); ctx.translate(d.x, d.y); ctx.rotate(d.a);
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-9, -9); ctx.lineTo(9, 9); ctx.moveTo(9, -9); ctx.lineTo(-9, 9); ctx.stroke();
    for (const [qx, qy] of [[-9, -9], [9, -9], [-9, 9], [9, 9]]) { ctx.fillStyle = 'rgba(200,240,255,0.35)'; ctx.beginPath(); ctx.arc(qx, qy, 6, 0, TAU); ctx.fill(); }
    ctx.fillStyle = '#2b3a4a'; ctx.beginPath(); ctx.rect(-6, -6, 12, 12); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#5ff4ff'; ctx.fillRect(4, -2, 6, 4);
    ctx.restore();
  }
}

// ---------- pickups: XP gems + health ----------
const GEM_TIERS = [[25, 9, '#ff4fd8', GLOW.violet], [5, 7, '#7c8cff', GLOW.xp], [1, 5, '#2ef2ff', GLOW.xp]];
const Pickups = {
  list: [],
  reset() { this.list.length = 0; },
  gems(x, y, value) {
    let v = Math.max(1, Math.round(value));
    for (const [tv, size, col, gl] of GEM_TIERS) {
      while (v >= tv) {
        v -= tv;
        const a = rand(TAU), s = rand(80, 220);
        this.list.push({ kind: 'xp', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, z: 0, vz: rand(120, 220), value: tv, size, col, gl, t: rand(TAU), mag: false, age: 0 });
      }
    }
    if (this.list.length > 320) for (let i = 0; i < 60; i++) if (this.list[i].kind === 'xp') this.list[i].mag = true;   // vacuum old gems toward the player
  },
  health(x, y, amt = 25) { this.list.push({ kind: 'hp', x, y, vx: rand(-60, 60), vy: rand(-60, 60), z: 0, vz: 180, value: amt, size: 10, t: 0, mag: false, age: 0 }); },
  update(dt, p) {
    const R = 95 * p.S.magnet;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const g = this.list[i];
      g.t += dt * 4; g.age += dt;
      if (g.z > 0 || g.vz > 0) { g.vz -= 800 * dt; g.z += g.vz * dt; if (g.z < 0) { g.z = 0; g.vz = Math.abs(g.vz) > 50 ? -g.vz * 0.45 : 0; } }
      const d2 = dist2(g.x, g.y, p.x, p.y);
      if (!g.mag && g.age > 0.25 && d2 < R * R && (g.kind === 'xp' || p.hp < p.maxHp)) g.mag = true;
      if (g.mag) {
        // direct homing that speeds up over time; swept pickup so fast gems can't orbit the player
        const d = Math.sqrt(d2) || 1;
        g.spd = Math.min(1600, (g.spd || 260) + 2200 * dt);
        if (d < p.r + 10 + g.spd * dt) { this.collect(g, p); this.list[i] = this.list[this.list.length - 1]; this.list.pop(); continue; }
        g.vx = (p.x - g.x) / d * g.spd; g.vy = (p.y - g.y) / d * g.spd;
        g.x += g.vx * dt; g.y += g.vy * dt;
      } else {
        g.vx *= Math.exp(-4 * dt); g.vy *= Math.exp(-4 * dt);
        const nx = g.x + g.vx * dt, ny = g.y + g.vy * dt;
        if (!solidAt(nx, g.y)) g.x = nx; else g.vx = -g.vx;
        if (!solidAt(g.x, ny)) g.y = ny; else g.vy = -g.vy;
      }
    }
  },
  collect(g, p) {
    if (g.kind === 'hp') {
      p.hp = Math.min(p.maxHp, p.hp + g.value); FX.text(p.x, p.y - 26, '+' + g.value + ' HP', '#52f08a', 18);
      FX.sparkle(p.x, p.y, '#7dffa8', 12, 200); Sound.levelUp(); return;
    }
    p.pickStreak++; p.pickT = 0.6;
    Game.addXp(g.value);
    FX.sparkle(g.x, g.y, g.col, g.value >= 5 ? 8 : 4, 120);
    Sound.pickup(p.pickStreak);
  },
  draw(v, time) {
    for (const g of this.list) {
      if (g.x < v.x0 || g.x > v.x1 || g.y < v.y0 || g.y > v.y1) continue;
      const y = g.y - g.z * 0.3, pulse = 1 + Math.sin(g.t) * 0.12;
      if (g.kind === 'hp') {
        ctx.globalCompositeOperation = 'lighter'; glow(GLOW.green, g.x, y, 30, 0.5); ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = '#f4f6fb'; ctx.strokeStyle = OUTLINE; ctx.lineWidth = 3;
        rr(ctx, g.x - 11, y - 11, 22, 22, 4); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#e8283c'; ctx.fillRect(g.x - 3, y - 8, 6, 16); ctx.fillRect(g.x - 8, y - 3, 16, 6);
        continue;
      }
      ctx.globalCompositeOperation = 'lighter'; glow(g.gl, g.x, y, g.size * 3.2 * pulse, 0.55); ctx.globalCompositeOperation = 'source-over';
      const s = g.size * pulse;
      ctx.save(); ctx.translate(g.x, y); ctx.rotate(Math.sin(g.t * 0.5) * 0.4);
      ctx.fillStyle = g.col; ctx.strokeStyle = '#06262b'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, -s * 1.3); ctx.lineTo(s, 0); ctx.lineTo(0, s * 1.3); ctx.lineTo(-s, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.beginPath(); ctx.moveTo(0, -s * 1.1); ctx.lineTo(s * 0.45, -s * 0.1); ctx.lineTo(0, 0); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  },
};
function spawnHealth(x, y, amt) { Pickups.health(x, y, amt); }

// ---------- hazards: afterburner fire ----------
const Hazards = {
  list: [],
  reset() { this.list.length = 0; },
  fire(x, y, dps) { if (this.list.length < 140) this.list.push({ x, y, r: 26, life: 1.6, max: 1.6, dps, t: 0 }); },
  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const h = this.list[i]; h.life -= dt; h.t -= dt;
      if (h.life <= 0) { this.list.splice(i, 1); continue; }
      if (Math.random() < dt * 14) FX.add(P_EMBER, h.x + rand(-14, 14), h.y + rand(-14, 14), rand(-20, 20), rand(-60, -20), rand(0.3, 0.6), rand(3, 6), Math.random() < 0.5 ? '#ff8a1f' : '#ffd23f', { drag: 2 });
      if (h.t <= 0) {
        h.t = 0.2;
        Grid.query(h.x, h.y, h.r + 30, e => { if (!e.dead && dist2(h.x, h.y, e.x, e.y) < (h.r + e.r) ** 2) Game.damageEnemy(e, h.dps * 0.2, 0, 0, false, 'fire'); });
      }
    }
  },
  draw(v) {
    ctx.globalCompositeOperation = 'lighter';
    for (const h of this.list) { if (h.x < v.x0 || h.x > v.x1 || h.y < v.y0 || h.y > v.y1) continue; glow(GLOW.fire, h.x, h.y, h.r * 1.8, (h.life / h.max) * 0.7); }
    ctx.globalCompositeOperation = 'source-over';
  },
};
