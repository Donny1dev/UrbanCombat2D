// ===================== COMBAT: bullets, hit resolution, drones, blades =====================
const PROC_SRC = new Set(['gun', 'phantom']);   // sources that trigger on-hit upgrade effects
const enemyArmor = e => Math.max(0, (e.armor || 0) - (e.shred || 0));
const Bullets = {
  list: [],
  reset() { this.list.length = 0; },
  player(x, y, ang, spd, tpl) {
    if (this.list.length > 1100) return null;
    const b = Object.assign({}, tpl);
    b.x = x; b.y = y; b.px = x; b.py = y; b.vx = Math.cos(ang) * spd; b.vy = Math.sin(ang) * spd;
    b.enemy = false; b.hit = []; b.dead = false; b.travel = 0; b.trailD = 0; b.bounced = 0;
    this.list.push(b); return b;
  },
  enemy(x, y, ang, spd, o) {
    if (this.list.length > 1300) return;
    this.list.push({ x, y, px: x, py: y, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, enemy: true, dmg: o.dmg, r: o.r || 6, color: o.color || '#ff4f5e', life: o.life || 2.4, dead: false });
  },
  update(dt) {
    const L = this.list;
    for (let i = L.length - 1; i >= 0; i--) {
      const b = L[i];
      b.life -= dt; b.px = b.x; b.py = b.y;
      if (b.life > 0 && !b.dead) {
        if (b.seek) this.steer(b, dt);
        const spd = Math.hypot(b.vx, b.vy), dist = spd * dt, steps = Math.max(1, Math.ceil(dist / 10));
        for (let s = 0; s < steps && !b.dead; s++) {
          const ox = b.x, oy = b.y;
          b.x += b.vx * dt / steps; b.y += b.vy * dt / steps;
          if (!b.enemy) {
            b.travel += dist / steps;
            if (b.omega) { b.trailD += dist / steps; if (b.trailD > 42) { b.trailD = 0; Hazards.energy(b.x, b.y, b.dmg * 0.5); } }
          }
          const tx = Math.floor(b.x / TILE), ty = Math.floor(b.y / TILE), o = objAt(tx, ty);
          if (o !== O_NONE) { this.hitTile(b, o, tx, ty, ox, oy); continue; }
          if (b.enemy) {
            if (dist2(b.x, b.y, player.x, player.y) < (b.r + player.r - 3) ** 2) { if (Game.hurtPlayer(b.dmg, Math.atan2(b.vy, b.vx))) { b.dead = true; FX.impact(b.x, b.y, Math.atan2(b.vy, b.vx), 'flesh'); } }
          } else this.hitEnemies(b);
        }
      }
      if (b.life <= 0 || b.dead) { L[i] = L[L.length - 1]; L.pop(); }
    }
  },
  steer(b, dt) {
    let best = null, bd = 320 * 320;
    Grid.query(b.x, b.y, 320, e => { if (e.dead || b.hit.includes(e.id)) return; const d = dist2(b.x, b.y, e.x, e.y); if (d < bd) { bd = d; best = e; } });
    if (!best) return;
    const a = Math.atan2(b.vy, b.vx), want = Math.atan2(best.y - b.y, best.x - b.x), sp = Math.hypot(b.vx, b.vy);
    const na = a + clamp(angDiff(a, want), -7 * dt, 7 * dt);
    b.vx = Math.cos(na) * sp; b.vy = Math.sin(na) * sp;
  },
  hitTile(b, o, tx, ty, ox, oy) {
    const ang = Math.atan2(b.vy, b.vx);
    if (o === O_GLASS) { damageTile(tx, ty, 1, b.x, b.y, ang); b.vx *= 0.85; b.vy *= 0.85; return; }
    if (o === O_CRATE || o === O_BARREL) {
      damageTile(tx, ty, b.enemy ? b.dmg * 0.5 : b.dmg, b.x, b.y, ang);
      FX.impact(ox, oy, ang, o === O_BARREL ? 'metal' : 'wood');
      if (!b.enemy && b.boom) this.impactBoom(b, ox, oy);
      b.dead = true; return;
    }
    const metal = o === O_METAL;
    if (!b.enemy && b.rico > 0) {
      b.rico--; b.bounced++;
      const hx = objAt(Math.floor(b.x / TILE), Math.floor(oy / TILE)) !== O_NONE;
      const hy = objAt(Math.floor(ox / TILE), Math.floor(b.y / TILE)) !== O_NONE;
      if (hx || !hy) b.vx = -b.vx;
      if (hy || !hx) b.vy = -b.vy;
      b.x = ox; b.y = oy; b.hit.length = 0; b.life = Math.max(b.life, 0.4); b.dmg *= 0.8;
      FX.impact(ox, oy, ang, 'metal'); Sound.wall(true);
      return;
    }
    b.dead = true;
    FX.impact(ox, oy, ang, metal ? 'metal' : o === O_FURN ? 'wood' : 'wall');
    if (!b.enemy) {
      if (PROC_SRC.has(b.src) && !b.hit.length) player.hitStreak = 0;   // a miss breaks Trigger Discipline
      Decals.add('hole', ox, oy, rand(TAU)); if (Math.random() < 0.3) Sound.wall(metal);
      if (b.boom) this.impactBoom(b, ox, oy);
    }
  },
  impactBoom(b, x, y) { const arm = b.src === 'gun' && player.gun.armageddon; Game.explosion(x, y, arm ? 136 : 80, b.dmg * (arm ? 0.8 : 0.5), 'impact'); },
  hitEnemies(b) {
    Grid.query(b.x, b.y, 50, e => {
      if (b.dead || e.dead || b.hit.includes(e.id)) return;
      if (dist2(b.x, b.y, e.x, e.y) > (e.r + b.r) ** 2) return;
      resolveHit(b, e);
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
      const sp = Math.hypot(b.vx, b.vy), tl = Math.min(b.rail || b.omega ? 0.045 : 0.03, b.life + 0.02) * sp;
      const tx = b.x - b.vx / sp * tl, ty = b.y - b.vy / sp * tl;
      ctx.strokeStyle = b.trail; ctx.globalAlpha = 0.55; ctx.lineWidth = b.width * 2.4;
      ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.strokeStyle = '#fffbe8'; ctx.globalAlpha = 1; ctx.lineWidth = b.width * 0.8;
      ctx.beginPath(); ctx.moveTo(lerp(tx, b.x, 0.4), lerp(ty, b.y, 0.4)); ctx.lineTo(b.x, b.y); ctx.stroke();
      if (b.charged) glow(GLOW.xp, b.x, b.y, 22, 0.7);
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  },
};

// The full damage pipeline for one player bullet striking one enemy.
function resolveHit(b, e) {
  const p = player, S = p.S, ang = Math.atan2(b.vy, b.vx), procs = PROC_SRC.has(b.src);
  let dmg = b.dmg;
  if (S.accel) dmg *= 1 + Math.min(0.3 * S.accel, b.travel / 100 * 0.06 * S.accel);
  if (S.cqc) dmg *= 1 + S.cqc * clamp(1 - Math.hypot(e.x - p.x, e.y - p.y) / 240, 0, 1);
  if (S.hollow && !e.armor) dmg *= 1 + S.hollow;
  if (S.execute && e.hp / e.maxHp < 0.25 + 0.05 * S.execute) dmg *= 1 + 0.25 * S.execute;
  if (S.marked) dmg *= 1 + S.marked * e.marks;
  const streak = Math.min(10, p.hitStreak);
  const crit = Math.random() < b.crit + (procs ? S.discipline * streak : 0);
  if (crit) dmg *= b.critMul + (S.syn.tactprec && procs ? Math.min(0.5, streak * 0.05) : 0);
  if (e.chill >= 0.4 && (S.syn.shatter || b.cryoC) && e.shatterCd <= 0) {
    dmg *= b.cryoC ? 1.8 : 1.4; e.shatterCd = 0.8;
    FX.glassBurst(e.x, e.y, ang); FX.text(e.x, e.y - e.r - 20, 'SHATTER', '#a8e8ff', 16, { crit: true }); Sound.freeze();
  }
  const armor = enemyArmor(e) * (1 - (b.armorPen || 0));
  Game.damageEnemy(e, dmg * rand(0.92, 1.08), ang, b.knock, crit, b.src, armor, b.width);
  if (crit && e.dead && b.warrant && !p.primed) { p.primed = true; FX.text(p.x, p.y - 40, 'PRIMED', '#ff4f5e', 16, { crit: true }); }
  if (procs) {
    p.hitStreak++;
    if (S.marked) { e.marks = Math.min(10, e.marks + 1); e.markT = 2; }
    if (S.breaker && e.armor) e.shred = Math.min(e.armor, (e.shred || 0) + S.breaker);
    if (S.suppress) { e.supSlow = Math.min(0.15 + 0.1 * S.suppress, e.supSlow + 0.05 * S.suppress); e.supT = 1.2; }
    if (S.incendiary || b.inferno) applyBurn(e, (6 + 5 * S.incendiary) * (b.inferno ? 2 : 1) * S.elemMul * Math.sqrt(S.dmgMul), 3 * S.elemDur);
    if (S.cryo || b.cryoC) applyChill(e, (0.1 + 0.04 * S.cryo) * S.elemMul * (b.cryoC ? 2 : 1), 1.2 * S.elemDur);
    if (S.static) {
      p.charge += p.gun.thunder ? 2 : 1;
      if (p.charge >= 14 - 2 * S.static) { p.charge = 0; Game.chainLightning(e, (18 + 14 * S.static) * Math.sqrt(S.dmgMul) * S.elemMul, 2 + S.static, true); }
    }
    if (S.chain && Math.random() < 0.06 + 0.04 * S.chain) Game.chainLightning(e, b.dmg * (0.4 + 0.1 * S.chain) * S.elemMul, 2 + S.chain);
    if (b.charged) Game.chainLightning(e, b.dmg * 0.8, 4);
    if (b.canFrag && S.frag && Math.random() < 0.12 * S.frag * (p.weapon === 'shotgun' ? 0.5 : 1)) spawnFragments(b, e, b.dmg * 0.25);
  }
  if (b.boom) Bullets.impactBoom(b, b.x, b.y);
  b.hit.push(e.id);
  if (e.dead && b.massacre && b.bounced && !b.chained) {   // Chain Massacre: one fresh controlled chain
    const t = nearestEnemy(b.x, b.y, 380, b.hit);
    if (t) { const n = Bullets.player(b.x, b.y, Math.atan2(t.y - b.y, t.x - b.x), Math.hypot(b.vx, b.vy), Object.assign({}, b, { chained: true, rico: 2, life: 0.6 })); if (n) n.hit = b.hit.slice(); }
  }
  if (b.pierce > 0) { b.pierce--; b.dmg *= 0.85; return; }
  if (b.rico > 0) {
    const t = nearestEnemy(b.x, b.y, 380, b.hit, true);
    if (t) {
      b.rico--; b.bounced++; b.dmg *= 0.8;
      const sp = Math.hypot(b.vx, b.vy), na = Math.atan2(t.y - b.y, t.x - b.x);
      b.vx = Math.cos(na) * sp; b.vy = Math.sin(na) * sp; b.life = Math.max(b.life, 0.5);
      FX.add(P_RING, b.x, b.y, 0, 0, 0.15, 14, '#bfe9ff', { lw: 2 });
      return;
    }
  }
  b.dead = true;
}
function nearestEnemy(x, y, r, exclude = [], los = false) {
  let best = null, bd = r * r;
  Grid.query(x, y, r, o => { if (o.dead || exclude.includes(o.id)) return; const d = dist2(x, y, o.x, o.y); if (d < bd && (!los || lineOfSight(x, y, o.x, o.y))) { bd = d; best = o; } });
  return best;
}
function spawnFragments(b, e, dmg) {
  for (let i = 0; i < 3; i++) {
    const n = Bullets.player(e.x, e.y, rand(TAU), 700, { dmg, life: 0.25, r: 3, pierce: 0, rico: 0, knock: 60, trail: '#ffc060', width: 2, crit: 0, critMul: 1, src: 'frag', canFrag: false });
    if (n) n.hit.push(e.id);
  }
  FX.sparkle(e.x, e.y, '#ffc060', 6, 200);
}
function applyBurn(e, dps, dur) {
  if (!e.burnT || e.burnT <= 0) Sound.burn();
  e.burnDps = Math.max(e.burnDps || 0, dps); e.burnT = Math.max(e.burnT || 0, dur);
}
function applyChill(e, amt, dur) {
  const was = e.chill;
  e.chill = Math.min(0.5, e.chill + amt); e.chillT = dur;
  if (was < 0.45 && e.chill >= 0.45) { FX.sparkle(e.x, e.y, '#d8f4ff', 8, 120); Sound.freeze(); }
}

// ---------------- blades & drones ----------------
function bladePos(p, i) {
  const n = p.S.blades, a = p.bladeAng + i * TAU / n, r = 70 + n * 3 + p.S.orbital * 6;
  return [p.x + Math.cos(a) * r, p.y + Math.sin(a) * r, a];
}
function updateBlades(p, dt) {
  const S = p.S, dmg = 16 * (0.6 + S.dmgMul * 0.4) * (1 + 0.2 * S.orbital);
  for (let i = 0; i < S.blades; i++) {
    const [bx, by, a] = bladePos(p, i);
    Grid.query(bx, by, 50, e => {
      if (e.dead || e.bladeCd > 0 || dist2(bx, by, e.x, e.y) > (e.r + 16) ** 2) return;
      e.bladeCd = 0.28;
      Game.damageEnemy(e, dmg, a + Math.PI / 2, 140, false, 'blade');
      FX.impact(bx, by, a, 'metal');
    });
  }
  if (S.syn.bladestorm) {
    p.bladeArcT -= dt;
    if (p.bladeArcT <= 0) {
      p.bladeArcT = 1.2;
      for (let i = 0; i < S.blades; i++) {
        const [bx, by] = bladePos(p, i), t = nearestEnemy(bx, by, 170);
        if (t) { FX.arc(bx, by, t.x, t.y, '#9ff6ff'); Game.damageEnemy(t, dmg * 1.6, Math.atan2(t.y - by, t.x - bx), 120, false, 'chain'); }
      }
      Sound.zap();
    }
  }
}
function droneThreat(e) { return (e.type === 'boss' ? 4 : e.type === 'elite' ? 3 : e.d.ranged ? 2 : 1) + (e.aimT > 0 ? 1 : 0); }
function updateDrone(p, d, i, dt, focus) {
  const S = p.S;
  d.t += dt;
  const n = p.drones.length, a = d.t * 1.3 + i * TAU / n;
  const tx = p.x + Math.cos(a) * 46, ty = p.y + Math.sin(a) * 46 - 8;
  d.x += (tx - d.x) * damp(8, dt); d.y += (ty - d.y) * damp(8, dt);
  d.cd -= dt;
  const range = 430 + 100 * S.autotarget;
  let best = null;
  if (S.syn.army && focus && !focus.dead && dist2(d.x, d.y, focus.x, focus.y) < range * range) best = focus;
  else {
    let bs = -1e9;
    Grid.query(d.x, d.y, range, e => {
      if (e.dead) return;
      const dd = Math.sqrt(dist2(d.x, d.y, e.x, e.y)); if (dd > range) return;
      const sc = (S.autotarget ? droneThreat(e) * 200 : 0) - dd;
      if (sc > bs) { bs = sc; best = e; }
    });
  }
  if (best) d.a = Math.atan2(best.y - d.y, best.x - d.x);
  if (best && d.cd <= 0 && lineOfSight(d.x, d.y, best.x, best.y)) {
    d.cd = 0.42 / (p.droneODT > 0 ? 3 : 1);
    const dmg = 13 * (0.5 + S.dmgMul * 0.5) * S.droneDmg * (S.syn.army ? 1.25 : 1);
    Bullets.player(d.x, d.y, d.a + rand(-0.04, 0.04), 1000, { dmg, life: 0.6, r: 4, pierce: 0, rico: 0, knock: 60, trail: p.droneODT > 0 ? '#c4b8ff' : '#5ff4ff', width: 2, crit: p.gun.critChance, critMul: p.gun.critMul, src: 'drone', canFrag: false });
    FX.light(d.x, d.y, 30, 0.05, GLOW.xp, 0.6);
    Sound.shoot('smg');
  }
  return focus || best;
}
function drawBladesDrones(p) {
  if (p.S.blades) {
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < p.S.blades; i++) { const [bx, by] = bladePos(p, i); glow(GLOW.xp, bx, by, 26 + p.S.orbital * 3, 0.45); }
    ctx.globalCompositeOperation = 'source-over';
    for (let i = 0; i < p.S.blades; i++) {
      const [bx, by, a] = bladePos(p, i);
      ctx.save(); ctx.translate(bx, by); ctx.rotate(a * 3);
      ctx.fillStyle = p.S.orbital ? '#bff7ff' : '#e8fbff'; ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2.5;
      ctx.beginPath(); for (let k = 0; k < 3; k++) { const q = k * TAU / 3; ctx.moveTo(Math.cos(q) * 4, Math.sin(q) * 4); ctx.lineTo(Math.cos(q + 0.25) * 17, Math.sin(q + 0.25) * 17); ctx.lineTo(Math.cos(q + 0.9) * 5, Math.sin(q + 0.9) * 5); }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
  }
  for (const d of p.drones) {
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(d.x + 10, d.y + 18, 10, 6, 0, 0, TAU); ctx.fill();
    if (p.droneODT > 0) { ctx.globalCompositeOperation = 'lighter'; glow(GLOW.violet, d.x, d.y, 30, 0.7); ctx.globalCompositeOperation = 'source-over'; }
    ctx.save(); ctx.translate(d.x, d.y); ctx.rotate(d.a);
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-9, -9); ctx.lineTo(9, 9); ctx.moveTo(9, -9); ctx.lineTo(-9, 9); ctx.stroke();
    for (const [qx, qy] of [[-9, -9], [9, -9], [-9, 9], [9, 9]]) { ctx.fillStyle = 'rgba(200,240,255,0.35)'; ctx.beginPath(); ctx.arc(qx, qy, 6, 0, TAU); ctx.fill(); }
    ctx.fillStyle = '#2b3a4a'; ctx.beginPath(); ctx.rect(-6, -6, 12, 12); ctx.fill(); ctx.stroke();
    ctx.fillStyle = p.S.autotarget ? '#ff4f5e' : '#5ff4ff'; ctx.fillRect(4, -2, 6, 4);
    ctx.restore();
  }
}
