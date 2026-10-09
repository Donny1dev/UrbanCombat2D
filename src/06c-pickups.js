// ===================== PICKUPS: XP, medkits, supply drops · HAZARDS · DECOYS =====================
const GEM_TIERS = [[25, 9, '#ff4fd8', GLOW.violet], [5, 7, '#7c8cff', GLOW.xp], [1, 5, '#2ef2ff', GLOW.xp]];
const MEDKIT_DROP = [0.018, 0.026, 0.035, 0.045];
const WORLD_MEDKIT_MUL = [1, 0.85, 0.7, 0.6];
const Pickups = {
  list: [], worldT: 0, dropCd: 0,
  reset() { this.list.length = 0; this.worldT = rand(75, 100); this.dropCd = 0; },
  gems(x, y, value) {
    let v = Math.max(1, Math.round(value));
    for (const [tv, size, col, gl] of GEM_TIERS) {
      while (v >= tv) {
        v -= tv;
        const a = rand(TAU), s = rand(80, 220);
        this.list.push({ kind: 'xp', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, z: 0, vz: rand(120, 220), value: tv, size, col, gl, t: rand(TAU), mag: false, age: 0 });
      }
    }
    if (this.list.length > 320) { let n = 0; for (const g of this.list) if (g.kind === 'xp' && !g.mag && n++ < 60) g.mag = true; }
  },
  // medkit: world ones have a beacon and longer life; every medkit expires
  health(x, y, amt = 25, world = false) {
    if (solidAt(x, y)) { const s = findReachableSpot(x, y, 0, 120, false); if (s) { x = s[0]; y = s[1]; } }
    this.list.push({ kind: 'hp', x, y, vx: world ? 0 : rand(-60, 60), vy: world ? 0 : rand(-60, 60), z: world ? 0 : 0, vz: world ? 0 : 180, value: amt, size: 10, t: 0, mag: false, age: 0, life: world ? 45 : 35, world });
  },
  supply(x, y, xp) { this.list.push({ kind: 'supply', x, y, vx: 0, vy: 0, z: 0, vz: 0, land: 3.2, xp, t: 0, age: 0, life: 40, mag: false }); },
  rollEnemyDrop(e, p) {
    if (e.summoned || e.age < 1.5 || this.dropCd > 0) return false;   // no farming boss minions or fresh spawns
    let c = MEDKIT_DROP[p.S.medic];
    if (p.S.emergency && p.hp < p.maxHp * 0.4) c *= 1.6 + 0.6 * p.S.emergency;
    if (Math.random() < c) { this.health(e.x, e.y, 25); this.dropCd = 6; return true; }
    return false;
  },
  updateWorld(dt, p) {
    this.dropCd -= dt;
    this.worldT -= dt * (p.S.emergency && p.hp < p.maxHp * 0.4 ? 2 : 1);
    if (this.worldT <= 0) {
      this.worldT = rand(75, 100) * WORLD_MEDKIT_MUL[p.S.medic];
      if (!this.list.some(g => g.kind === 'hp' && g.world)) {
        const s = findReachableSpot(p.x, p.y, 350, 850, true);
        if (s) { this.health(s[0], s[1], 30, true); FX.text(p.x, p.y - 40, 'MEDKIT NEARBY', '#52f08a', 16); }
      }
    }
  },
  update(dt, p) {
    const R = 95 * p.S.magnet;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const g = this.list[i];
      g.t += dt * 4; g.age += dt;
      if (g.life !== undefined) { g.life -= dt; if (g.life <= 0) { if (g.kind === 'hp') FX.dust(g.x, g.y, 4); this.list[i] = this.list[this.list.length - 1]; this.list.pop(); continue; } }
      if (g.kind === 'supply') {
        if (g.land > 0) { g.land -= dt; if (Math.random() < dt * 20) FX.add(P_SMOKE, g.x + rand(-6, 6), g.y + rand(-6, 6), rand(-10, 10), rand(-40, -15), 1.2, 6, 'rgba(255,80,90,', { grow: 14, a: 0.5 }); if (g.land <= 0) { FX.crateBurst(g.x, g.y); Sound.crate(); Game.shake(6); } }
        else if (dist2(g.x, g.y, p.x, p.y) < 40 * 40) {
          this.health(g.x + 20, g.y, 35); this.gems(g.x, g.y, g.xp);
          FX.sparkle(g.x, g.y, '#ffd23f', 24, 300); FX.text(g.x, g.y - 30, 'SUPPLIES', '#ffd23f', 20, { crit: true }); Sound.confirm();
          this.list[i] = this.list[this.list.length - 1]; this.list.pop();
        }
        continue;
      }
      if (g.z > 0 || g.vz > 0) { g.vz -= 800 * dt; g.z += g.vz * dt; if (g.z < 0) { g.z = 0; g.vz = Math.abs(g.vz) > 50 ? -g.vz * 0.45 : 0; } }
      const d2 = dist2(g.x, g.y, p.x, p.y);
      if (!g.mag && g.age > 0.25 && d2 < R * R && (g.kind === 'xp' || p.hp < p.maxHp)) g.mag = true;
      if (g.mag) {
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
    if (g.kind === 'hp') { Game.heal(g.value, 'medkit'); FX.sparkle(p.x, p.y, '#7dffa8', 12, 200); return; }
    p.pickStreak++; p.pickT = 0.6;
    Game.addXp(g.value);
    FX.sparkle(g.x, g.y, g.col, g.value >= 5 ? 8 : 4, 120);
    Sound.pickup(p.pickStreak);
  },
  draw(v, time) {
    for (const g of this.list) {
      if (g.x < v.x0 || g.x > v.x1 || g.y < v.y0 || g.y > v.y1) continue;
      const y = g.y - g.z * 0.3, pulse = 1 + Math.sin(g.t) * 0.12;
      if (g.kind === 'supply') { drawSupply(g, time); continue; }
      if (g.kind === 'hp') {
        if (g.life < 8 && Math.floor(time * 8) % 2) continue;   // blink before expiring
        ctx.globalCompositeOperation = 'lighter'; glow(GLOW.green, g.x, y, g.world ? 44 : 30, 0.5 + (g.world ? Math.sin(time * 4) * 0.2 : 0)); ctx.globalCompositeOperation = 'source-over';
        if (g.world) { ctx.strokeStyle = 'rgba(82,240,138,0.6)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(g.x, y, 22 + Math.sin(time * 4) * 4, 0, TAU); ctx.stroke(); }
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
function drawSupply(g, time) {
  if (g.land > 0) {   // falling: growing shadow + target ring
    const k = 1 - g.land / 3.2;
    ctx.strokeStyle = `rgba(255,210,63,${0.5 + Math.sin(time * 10) * 0.3})`; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(g.x, g.y, 34, 0, TAU); ctx.stroke();
    ctx.fillStyle = `rgba(0,0,0,${0.15 + k * 0.35})`; ctx.beginPath(); ctx.ellipse(g.x, g.y, 10 + k * 18, 6 + k * 12, 0, 0, TAU); ctx.fill();
    return;
  }
  ctx.globalCompositeOperation = 'lighter'; glow(GLOW.gold, g.x, g.y, 50, 0.4 + Math.sin(time * 5) * 0.15); ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#4b5a3a'; ctx.strokeStyle = OUTLINE; ctx.lineWidth = 3;
  rr(ctx, g.x - 18, g.y - 14, 36, 28, 4); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#ffd23f'; ctx.fillRect(g.x - 18, g.y - 3, 36, 6);
  ctx.fillStyle = '#f4f6fb'; ctx.fillRect(g.x - 3, g.y - 11, 6, 22);
}

// ---------- hazards: afterburner fire + omega energy trails ----------
const Hazards = {
  list: [],
  reset() { this.list.length = 0; },
  fire(x, y, dps, ignite) { if (this.list.length < 160) this.list.push({ kind: 'fire', x, y, r: 26, life: 1.6, max: 1.6, dps, ignite, t: 0 }); },
  energy(x, y, dps) { if (this.list.length < 160) this.list.push({ kind: 'energy', x, y, r: 18, life: 0.6, max: 0.6, dps, t: 0 }); },
  update(dt) {
    const S = player.S;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const h = this.list[i]; h.life -= dt; h.t -= dt;
      if (h.life <= 0) { this.list.splice(i, 1); continue; }
      if (h.kind === 'fire' && Math.random() < dt * 14) FX.add(P_EMBER, h.x + rand(-14, 14), h.y + rand(-14, 14), rand(-20, 20), rand(-60, -20), rand(0.3, 0.6), rand(3, 6), Math.random() < 0.5 ? '#ff8a1f' : '#ffd23f', { drag: 2 });
      if (h.t <= 0) {
        h.t = 0.2;
        Grid.query(h.x, h.y, h.r + 30, e => {
          if (e.dead || dist2(h.x, h.y, e.x, e.y) > (h.r + e.r) ** 2) return;
          Game.damageEnemy(e, h.dps * 0.2, 0, 0, false, h.kind === 'fire' ? 'fire' : 'chain');
          if (h.ignite) applyBurn(e, (10 + 5 * S.incendiary) * S.elemMul, 2.5 * S.elemDur);
        });
      }
    }
  },
  draw(v) {
    ctx.globalCompositeOperation = 'lighter';
    for (const h of this.list) { if (h.x < v.x0 || h.x > v.x1 || h.y < v.y0 || h.y > v.y1) continue; glow(h.kind === 'fire' ? GLOW.fire : GLOW.xp, h.x, h.y, h.r * 1.8, (h.life / h.max) * 0.7); }
    ctx.globalCompositeOperation = 'source-over';
  },
};

// ---------- Ghost Step decoys ----------
const Decoys = {
  list: [],
  reset() { this.list.length = 0; },
  add(x, y, life, lure, pulses) { if (this.list.length > 4) this.list.shift(); this.list.push({ x, y, life, max: life, lure, pulses, pulseT: 0.6 }); },
  target(e) {
    for (const d of this.list) if (dist2(d.x, d.y, e.x, e.y) < d.lure * d.lure) return d;
    return null;
  },
  pulse(d) {
    const dmg = 30 * Math.sqrt(player.S.dmgMul);
    FX.add(P_RING, d.x, d.y, 0, 0, 0.3, 110, '#c49bff', { lw: 5 });
    Grid.query(d.x, d.y, 140, e => { if (!e.dead && dist2(d.x, d.y, e.x, e.y) < 120 * 120) Game.damageEnemy(e, dmg, Math.atan2(e.y - d.y, e.x - d.x), 300, false, 'shock'); });
  },
  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const d = this.list[i]; d.life -= dt;
      if (d.pulses) { d.pulseT -= dt; if (d.pulseT <= 0) { d.pulseT = 0.6; this.pulse(d); } }
      if (d.life <= 0) { if (d.pulses) this.pulse(d); FX.sparkle(d.x, d.y, '#c49bff', 10, 160); this.list.splice(i, 1); }
    }
  },
  draw(time) {
    const look = lookToOpts(playerLook);
    for (const d of this.list) {
      ctx.globalAlpha = Math.min(1, d.life / 0.3) * (0.4 + Math.sin(time * 10) * 0.1);
      drawHuman(ctx, d.x, d.y, Object.assign({}, look, { a: player.a, jacket: '#9ff6ff', skin: '#d8fbff', hair: '#9ff6ff', pants: '#9ff6ff', weapon: player.weapon }));
      ctx.globalAlpha = 1;
      ctx.strokeStyle = 'rgba(196,155,255,0.25)'; ctx.lineWidth = 2; ctx.setLineDash([6, 8]);
      ctx.beginPath(); ctx.arc(d.x, d.y, d.lure * (1 - d.life / d.max * 0.15), 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    }
  },
};
