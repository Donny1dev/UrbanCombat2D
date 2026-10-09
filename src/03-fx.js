// ===================== FX: particles, decals, text, lights, arcs =====================
const P_SPARK = 0, P_SMOKE = 1, P_DEBRIS = 2, P_SHARD = 3, P_EMBER = 4, P_CASING = 5, P_RING = 6, P_FLASH = 7, P_DOT = 8;
const MAX_PARTS = 1600;
const FX = {
  parts: [], free: [], texts: [], arcs: [], lights: [],
  reset() { this.free.push(...this.parts); this.parts.length = 0; this.texts.length = 0; this.arcs.length = 0; this.lights.length = 0; },
  add(type, x, y, vx, vy, life, size, color, o) {
    if (this.parts.length >= MAX_PARTS) {
      if (type === P_SMOKE || type === P_DOT || type === P_DEBRIS) return null;
      this.parts[0].life = 0;   // recycle the oldest for important effects
    }
    const p = this.free.pop() || {};
    p.type = type; p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.life = life; p.max = life; p.size = size; p.color = color;
    p.rot = rand(TAU); p.vr = rand(-12, 12); p.z = 0; p.vz = 0; p.drag = 4; p.grow = 0;
    if (o) Object.assign(p, o);
    this.parts.push(p);
    return p;
  },
  light(x, y, r, life, img = GLOW.fire, a = 0.6) { if (this.lights.length < 60) this.lights.push({ x, y, r, life, max: life, img, a }); },
  text(x, y, str, color, size = 18, o = {}) {
    if (this.texts.length > 110) this.texts.shift();
    this.texts.push(Object.assign({ x: x + rand(-6, 6), y, vy: -70, str, color, size, life: 0.75, max: 0.75, pop: 1 }, o));
  },
  arc(x1, y1, x2, y2, color = '#9fe8ff') {
    const pts = [[x1, y1]], n = Math.max(3, Math.floor(Math.hypot(x2 - x1, y2 - y1) / 22));
    const nx = -(y2 - y1), ny = x2 - x1, l = Math.hypot(nx, ny) || 1;
    for (let i = 1; i < n; i++) { const t = i / n, j = rand(-14, 14); pts.push([lerp(x1, x2, t) + nx / l * j, lerp(y1, y2, t) + ny / l * j]); }
    pts.push([x2, y2]);
    this.arcs.push({ pts, life: 0.18, max: 0.18, color });
    this.light((x1 + x2) / 2, (y1 + y2) / 2, 90, 0.15, GLOW.xp, 0.5);
  },

  // ---- composite helpers ----
  muzzle(x, y, a, scale, hue) {
    const img = hue === 'gold' ? GLOW.gold : hue === 'cyan' ? GLOW.xp : hue === 'red' ? GLOW.red : GLOW.fire;
    this.light(x, y, 70 * scale, 0.07, img, 0.75);
    for (let i = 0; i < 3; i++) { const s = rand(-0.5, 0.5) + a, v = rand(200, 520); this.add(P_SPARK, x, y, Math.cos(s) * v, Math.sin(s) * v, rand(0.05, 0.12), 2, '#ffd27a', { drag: 10 }); }
    this.add(P_SMOKE, x + Math.cos(a) * 6, y + Math.sin(a) * 6, Math.cos(a) * 40, Math.sin(a) * 40, 0.35, 5 * scale, 'rgba(200,200,210,', { grow: 30, drag: 3 });
  },
  casing(x, y, a, shell) {
    const s = a + Math.PI / 2 + rand(-0.3, 0.3), v = rand(90, 160);
    this.add(P_CASING, x, y, Math.cos(s) * v, Math.sin(s) * v, rand(2, 3), shell ? 5 : 3.5, shell ? '#d23a2a' : '#e8b54a', { vz: rand(120, 180), drag: 3.5, vr: rand(-25, 25) });
  },
  impact(x, y, a, kind) {     // kind: 'wall' | 'metal' | 'wood' | 'flesh'
    const back = a + Math.PI;
    const n = kind === 'metal' ? 7 : 4;
    for (let i = 0; i < n; i++) {
      const s = back + rand(-1, 1), v = rand(150, kind === 'metal' ? 520 : 340);
      this.add(P_SPARK, x, y, Math.cos(s) * v, Math.sin(s) * v, rand(0.08, 0.2), kind === 'metal' ? 2.2 : 1.6, kind === 'metal' ? '#bfe9ff' : '#ffcf6b', { drag: 7 });
    }
    if (kind === 'wall') for (let i = 0; i < 2; i++) this.add(P_SMOKE, x, y, Math.cos(back) * rand(20, 60) + rand(-20, 20), Math.sin(back) * rand(20, 60) + rand(-20, 20), rand(0.4, 0.7), rand(4, 7), 'rgba(170,165,155,', { grow: 22, drag: 3 });
    if (kind === 'wood') for (let i = 0; i < 3; i++) { const s = back + rand(-1, 1), v = rand(60, 200); this.add(P_DEBRIS, x, y, Math.cos(s) * v, Math.sin(s) * v, rand(1.5, 2.5), rand(2, 4), '#a8763c', { vz: rand(60, 150) }); }
    this.light(x, y, 26, 0.06, kind === 'metal' ? GLOW.white : GLOW.fire, 0.6);
  },
  hitBurst(x, y, a, color) {
    for (let i = 0; i < 5; i++) {
      const s = a + rand(-0.7, 0.7), v = rand(120, 380);
      this.add(P_DOT, x, y, Math.cos(s) * v, Math.sin(s) * v, rand(0.2, 0.4), rand(2.5, 4.5), i < 3 ? '#e8283c' : color, { drag: 6 });
    }
    this.add(P_FLASH, x, y, 0, 0, 0.08, 16, '#fff');
  },
  deathPop(x, y, color, big, a = 0) {
    const n = big ? 26 : 14;
    for (let i = 0; i < n; i++) {
      const s = rand(TAU), v = rand(100, big ? 520 : 380);
      this.add(P_DOT, x, y, Math.cos(s) * v + Math.cos(a) * 120, Math.sin(s) * v + Math.sin(a) * 120, rand(0.3, 0.65), rand(3, big ? 8 : 6), i % 3 ? '#d81f36' : color, { drag: 5 });
    }
    for (let i = 0; i < (big ? 8 : 4); i++) { const s = rand(TAU), v = rand(80, 260); this.add(P_DEBRIS, x, y, Math.cos(s) * v, Math.sin(s) * v, rand(1.2, 2), rand(3, 5), color, { vz: rand(80, 200) }); }
    this.add(P_RING, x, y, 0, 0, 0.3, big ? 70 : 42, '#ffffff');
    this.add(P_FLASH, x, y, 0, 0, 0.12, big ? 60 : 34, '#fff');
    this.light(x, y, big ? 140 : 80, 0.15, GLOW.white, 0.35);
  },
  glassBurst(x, y, a) {
    for (let i = 0; i < 16; i++) {
      const s = (a || rand(TAU)) + rand(-1.1, 1.1), v = rand(80, 380);
      this.add(P_SHARD, x + rand(-14, 14), y + rand(-14, 14), Math.cos(s) * v, Math.sin(s) * v, rand(1.4, 2.4), rand(3, 7), i % 2 ? '#c8f0ff' : '#ffffff', { vz: rand(60, 200), drag: 3 });
    }
    this.light(x, y, 70, 0.1, GLOW.xp, 0.4);
  },
  crateBurst(x, y) {
    for (let i = 0; i < 14; i++) {
      const s = rand(TAU), v = rand(80, 340);
      this.add(P_DEBRIS, x + rand(-10, 10), y + rand(-10, 10), Math.cos(s) * v, Math.sin(s) * v, rand(2, 3.2), rand(4, 9), i % 3 ? '#b07a3e' : '#6e4a22', { vz: rand(100, 260), drag: 3 });
    }
    for (let i = 0; i < 5; i++) this.add(P_SMOKE, x + rand(-12, 12), y + rand(-12, 12), rand(-40, 40), rand(-40, 40), rand(0.5, 0.9), rand(8, 13), 'rgba(190,170,140,', { grow: 30 });
    Game.shake(4);
  },
  explosion(x, y, r) {
    this.add(P_FLASH, x, y, 0, 0, 0.18, r * 1.3, '#fff2c0');
    this.add(P_RING, x, y, 0, 0, 0.35, r * 1.15, '#ffd27a', { lw: 8 });
    for (let i = 0; i < 22; i++) {
      const s = rand(TAU), v = rand(60, r * 4);
      this.add(P_EMBER, x, y, Math.cos(s) * v, Math.sin(s) * v, rand(0.25, 0.6), rand(6, 14), i % 3 ? '#ff8a1f' : '#ffd23f', { drag: 5 });
    }
    for (let i = 0; i < 12; i++) {
      const s = rand(TAU), v = rand(30, r * 1.6);
      this.add(P_SMOKE, x, y, Math.cos(s) * v, Math.sin(s) * v, rand(0.7, 1.3), rand(12, 22), 'rgba(60,55,55,', { grow: 40, drag: 3.5 });
    }
    for (let i = 0; i < 10; i++) { const s = rand(TAU), v = rand(120, 420); this.add(P_SPARK, x, y, Math.cos(s) * v, Math.sin(s) * v, rand(0.2, 0.45), 2.5, '#ffe7a0', { drag: 4 }); }
    this.light(x, y, r * 2.4, 0.3, GLOW.fire, 0.9);
  },
  dust(x, y, n = 1, col = 'rgba(160,160,170,') {
    for (let i = 0; i < n; i++) this.add(P_SMOKE, x + rand(-5, 5), y + rand(-5, 5), rand(-25, 25), rand(-25, 25), rand(0.3, 0.5), rand(3, 5), col, { grow: 14, a: 0.35 });
  },
  sparkle(x, y, color = '#7ff6ff', n = 6, spd = 160) {
    for (let i = 0; i < n; i++) { const s = rand(TAU), v = rand(40, spd); this.add(P_EMBER, x, y, Math.cos(s) * v, Math.sin(s) * v, rand(0.25, 0.5), rand(2, 4), color, { drag: 5 }); }
  },

  update(dt) {
    const ps = this.parts;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.life -= dt;
      if (p.life <= 0) { ps[i] = ps[ps.length - 1]; ps.pop(); this.free.push(p); continue; }
      const d = Math.exp(-p.drag * dt);
      if (p.type === P_DEBRIS || p.type === P_SHARD || p.type === P_CASING) {
        if (p.z > 0 || p.vz > 0) {
          p.vz -= 900 * dt; p.z += p.vz * dt; p.rot += p.vr * dt;
          if (p.z <= 0) { p.z = 0; if (Math.abs(p.vz) > 60) { p.vz = -p.vz * 0.4; p.vx *= 0.6; p.vy *= 0.6; p.vr *= 0.5; } else { p.vz = 0; } }
          p.vx *= Math.exp(-0.6 * dt); p.vy *= Math.exp(-0.6 * dt);
        } else { p.vx *= Math.exp(-9 * dt); p.vy *= Math.exp(-9 * dt); p.vr = 0; }
        const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt;
        if (solidAt(nx, p.y)) p.vx = -p.vx * 0.4; else p.x = nx;
        if (solidAt(p.x, ny)) p.vy = -p.vy * 0.4; else p.y = ny;
      } else {
        p.vx *= d; p.vy *= d; p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.grow) p.size += p.grow * dt;
      }
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i]; t.life -= dt; t.y += t.vy * dt; t.vy *= Math.exp(-3 * dt); t.pop = Math.max(0, t.pop - dt * 6);
      if (t.life <= 0) this.texts.splice(i, 1);
    }
    for (let i = this.arcs.length - 1; i >= 0; i--) { this.arcs[i].life -= dt; if (this.arcs[i].life <= 0) this.arcs.splice(i, 1); }
    for (let i = this.lights.length - 1; i >= 0; i--) { this.lights[i].life -= dt; if (this.lights[i].life <= 0) this.lights.splice(i, 1); }
  },
  // ground-level particles (debris, casings, shards) drawn beneath characters
  drawGround(v) {
    for (const p of this.parts) {
      if (p.type !== P_DEBRIS && p.type !== P_SHARD && p.type !== P_CASING) continue;
      if (p.x < v.x0 || p.x > v.x1 || p.y < v.y0 || p.y > v.y1) continue;
      const a = Math.min(1, p.life / 0.5), lift = p.z * 0.25;
      ctx.globalAlpha = a;
      ctx.save(); ctx.translate(p.x, p.y - lift); ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      if (p.type === P_SHARD) { ctx.beginPath(); ctx.moveTo(-p.size, -p.size * 0.4); ctx.lineTo(p.size, 0); ctx.lineTo(-p.size * 0.3, p.size * 0.6); ctx.closePath(); ctx.fill(); }
      else if (p.type === P_CASING) { ctx.fillRect(-p.size, -p.size * 0.45, p.size * 2, p.size * 0.9); ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(-p.size, -p.size * 0.45, p.size * 0.5, p.size * 0.9); }
      else { ctx.fillRect(-p.size, -p.size * 0.6, p.size * 2, p.size * 1.2); ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1; ctx.strokeRect(-p.size, -p.size * 0.6, p.size * 2, p.size * 1.2); }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  },
  drawAir(v) {
    // normal-blend smoke & dots
    for (const p of this.parts) {
      if (p.x < v.x0 || p.x > v.x1 || p.y < v.y0 || p.y > v.y1) continue;
      const t = p.life / p.max;
      if (p.type === P_SMOKE) { ctx.fillStyle = p.color + ((p.a || 0.5) * t).toFixed(3) + ')'; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.fill(); }
      else if (p.type === P_DOT) { ctx.globalAlpha = Math.min(1, t * 2); ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.5 + t * 0.5), 0, TAU); ctx.fill(); ctx.globalAlpha = 1; }
      else if (p.type === P_RING) { const k = 1 - t; ctx.strokeStyle = p.color; ctx.globalAlpha = t; ctx.lineWidth = (p.lw || 5) * t + 1; ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.2 + k * 0.8), 0, TAU); ctx.stroke(); ctx.globalAlpha = 1; }
    }
    // additive sparks, embers, flashes
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.parts) {
      if (p.x < v.x0 || p.x > v.x1 || p.y < v.y0 || p.y > v.y1) continue;
      const t = p.life / p.max;
      if (p.type === P_SPARK) {
        ctx.strokeStyle = p.color; ctx.globalAlpha = Math.min(1, t * 1.5); ctx.lineWidth = p.size;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03); ctx.stroke();
      } else if (p.type === P_EMBER) {
        ctx.globalAlpha = t; ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.size * t + 0.5, 0, TAU); ctx.fill();
      } else if (p.type === P_FLASH) {
        glow(GLOW.white, p.x, p.y, p.size * (1.4 - t * 0.4), t);
      }
    }
    for (const l of this.lights) glow(l.img, l.x, l.y, l.r, (l.life / l.max) * l.a);
    for (const a of this.arcs) {
      const t = a.life / a.max;
      ctx.globalAlpha = t; ctx.strokeStyle = a.color; ctx.lineWidth = 4 * t + 1;
      ctx.beginPath(); ctx.moveTo(a.pts[0][0], a.pts[0][1]); for (let i = 1; i < a.pts.length; i++) ctx.lineTo(a.pts[i][0], a.pts[i][1]); ctx.stroke();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  },
  drawTexts() {
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const t of this.texts) {
      const a = Math.min(1, t.life / 0.25), s = t.size * (1 + t.pop * 0.6);
      ctx.globalAlpha = a;
      ctx.font = `${t.crit ? 400 : 800} ${s}px ${t.crit ? 'Bungee, Impact, sans-serif' : '"Barlow Condensed", "Arial Narrow", sans-serif'}`;
      ctx.lineWidth = 4; ctx.strokeStyle = '#0a0a0d'; ctx.strokeText(t.str, t.x, t.y);
      ctx.fillStyle = t.color; ctx.fillText(t.str, t.x, t.y);
    }
    ctx.globalAlpha = 1;
  },
};

// ---------- floor decals: bullet marks, scorch, splats ----------
const Decals = {
  list: [],
  reset() { this.list.length = 0; },
  add(type, x, y, rot, scale = 1, color) {
    const life = type === 'hole' ? 7 : type === 'glass' ? 30 : 22;
    if (this.list.length > 260) this.list.shift();
    this.list.push({ type, x, y, rot, scale, color, life, max: life });
  },
  update(dt) { for (let i = this.list.length - 1; i >= 0; i--) { const d = this.list[i]; d.life -= dt; if (d.life <= 0) this.list.splice(i, 1); } },
  draw(v) {
    for (const d of this.list) {
      if (d.x < v.x0 || d.x > v.x1 || d.y < v.y0 || d.y > v.y1) continue;
      ctx.globalAlpha = Math.min(1, d.life / 2) * (d.type === 'hole' ? 0.8 : 0.7);
      ctx.save(); ctx.translate(d.x, d.y); ctx.rotate(d.rot); ctx.scale(d.scale, d.scale);
      if (d.type === 'hole') { ctx.fillStyle = '#0b0b0d'; ctx.beginPath(); ctx.arc(0, 0, 2.5, 0, TAU); ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-5, 0); ctx.lineTo(5, 1); ctx.moveTo(0, -4); ctx.lineTo(1, 4); ctx.stroke(); }
      else if (d.type === 'scorch') { ctx.fillStyle = 'rgba(10,8,6,0.75)'; ctx.beginPath(); for (let k = 0; k < 10; k++) { const a = k / 10 * TAU, r = 30 + ((k * 7) % 5) * 5; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); } ctx.fill(); }
      else if (d.type === 'splat') {
        ctx.fillStyle = d.color || '#7a0f1c';
        ctx.beginPath(); ctx.ellipse(0, 0, 16, 11, 0, 0, TAU); ctx.fill();
        for (let k = 0; k < 5; k++) { ctx.beginPath(); ctx.arc(Math.cos(k * 1.3) * 18, Math.sin(k * 1.3) * 12, 3 + (k % 3) * 2, 0, TAU); ctx.fill(); }
      } else if (d.type === 'glass') { ctx.fillStyle = 'rgba(200,240,255,0.6)'; for (let k = 0; k < 8; k++) ctx.fillRect(Math.cos(k * 2.1) * 18, Math.sin(k * 1.7) * 18, 4, 2); }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  },
};
