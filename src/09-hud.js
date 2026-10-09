// ===================== HUD (canvas) =====================
const DISPLAY = 'Bungee, Impact, "Arial Black", sans-serif';
const BODY = '"Barlow Condensed", "Arial Narrow", sans-serif';
let vignette = null, vignetteKey = '';
function getVignette() {
  const key = VW + 'x' + VH;
  if (vignette && vignetteKey === key) return vignette;
  vignette = document.createElement('canvas'); vignette.width = VW; vignette.height = VH; vignetteKey = key;
  const g = vignette.getContext('2d');
  const gr = g.createRadialGradient(VW / 2, VH / 2, Math.min(VW, VH) * 0.35, VW / 2, VH / 2, Math.hypot(VW, VH) * 0.6);
  gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.6)');
  g.fillStyle = gr; g.fillRect(0, 0, VW, VH);
  return vignette;
}
const fmtTime = t => { const m = Math.floor(t / 60), s = Math.floor(t % 60); return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0'); };
function panel(x, y, w, h, r = 6, a = 0.78) { ctx.fillStyle = `rgba(13,14,18,${a})`; rr(ctx, x, y, w, h, r); ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1; ctx.stroke(); }
function txt(s, x, y, size, color, font = BODY, weight = 800, align = 'left', stroke = true) {
  ctx.font = `${font === DISPLAY ? 400 : weight} ${size}px ${font}`; ctx.textAlign = align; ctx.textBaseline = 'middle';
  if (stroke) { ctx.lineWidth = Math.max(2, size * 0.18); ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.lineJoin = 'round'; ctx.strokeText(s, x, y); }
  ctx.fillStyle = color; ctx.fillText(s, x, y);
}
function wrapLines(s, maxW, size, weight = 600) {
  ctx.font = `${weight} ${size}px ${BODY}`;
  const words = String(s).split(' '), out = []; let line = '';
  for (const w of words) { const t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t; }
  if (line) out.push(line);
  return out;
}
function offscreenArrow(x, y, color, label, u, time) {
  const sx = (x - Game.cam.x) * ZOOM + VW / 2, sy = (y - Game.cam.y) * ZOOM + VH / 2;
  if (sx > 0 && sx < VW && sy > 0 && sy < VH) return;
  const a = Math.atan2(sy - VH / 2, sx - VW / 2), ex = clamp(sx, 50 * u, VW - 50 * u), ey = clamp(sy, 150 * u, VH - 130 * u);
  ctx.save(); ctx.translate(ex, ey);
  ctx.fillStyle = 'rgba(13,14,18,0.8)'; ctx.beginPath(); ctx.arc(0, 0, 15 * u, 0, TAU); ctx.fill();
  ctx.strokeStyle = color; ctx.lineWidth = 2 * u; ctx.globalAlpha = 0.7 + Math.sin(time * 5) * 0.3; ctx.stroke(); ctx.globalAlpha = 1;
  if (label === '+') { ctx.fillStyle = color; ctx.fillRect(-2.5 * u, -8 * u, 5 * u, 16 * u); ctx.fillRect(-8 * u, -2.5 * u, 16 * u, 5 * u); }
  else txt(label, 0, 1, 12 * u, color, DISPLAY, 400, 'center', false);
  ctx.rotate(a); ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(24 * u, 0); ctx.lineTo(17 * u, -6 * u); ctx.lineTo(17 * u, 6 * u); ctx.closePath(); ctx.fill();
  ctx.restore();
}

const HUD = {
  hover: null,
  // lay out the upgrade inventory: grouped by category, wraps to a second row when crowded
  inventory(p, u, x0, y0, wAvail) {
    const items = [];
    const top = evoTop(p);
    if (top) items.push({ kind: 'evo', evo: top });
    for (const c of CAT_ORDER) {
      const ids = Object.keys(p.upg).filter(id => UPG[id].cat === c);
      ids.forEach((id, i) => items.push({ kind: 'upg', id, gap: i === 0 }));
    }
    const syns = SYNERGIES.filter(s => p.synergies.has(s.id));
    let size = 30 * u; const gap = 4 * u, groupGap = 8 * u, synW = syns.length * (24 * u + gap) + (syns.length ? 14 * u : 0);
    const need = s => items.reduce((t, it) => t + s + gap + (it.gap ? groupGap : 0), 0);
    let rows = 1, perRowW = wAvail - synW;
    while (need(size) > perRowW * rows && size > 20 * u) size -= 1 * u;
    if (need(size) > perRowW) { rows = 2; size = 30 * u; while (need(size) > perRowW * 2 && size > 18 * u) size -= 1 * u; }
    const cell = size + 10 * u, rects = [];
    let x = x0, y = y0;
    for (const it of items) {
      if (it.gap && x > x0) x += groupGap;
      if (x + size > x0 + perRowW && rows > 1 && y === y0) { x = x0; y += cell; }
      rects.push({ it, x, y, s: size }); x += size + gap;
    }
    let sx = x0 + wAvail - syns.length * (24 * u + gap);
    for (const s of syns) { rects.push({ it: { kind: 'syn', syn: s }, x: sx, y: y0 + (size - 24 * u) / 2, s: 24 * u }); sx += 24 * u + gap; }
    return { rects, h: items.length || syns.length ? cell * (rows === 2 && y > y0 ? 2 : 1) : 0 };
  },
  drawInvItem(r, u, time) {
    const { it, x, y, s } = r;
    if (it.kind === 'syn') {
      ctx.save(); ctx.translate(x + s / 2, y + s / 2);
      ctx.fillStyle = 'rgba(40,10,40,0.9)'; ctx.strokeStyle = '#ff4fd8'; ctx.lineWidth = 2 * u;
      ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + Math.PI / 6; ctx.lineTo(Math.cos(a) * s / 2, Math.sin(a) * s / 2); } ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.drawImage(iconCanvas('synergy', '#ff4fd8', s * 0.7), -s * 0.35, -s * 0.35);
      ctx.restore(); return;
    }
    if (it.kind === 'evo') {
      ctx.fillStyle = 'rgba(40,30,6,0.92)'; rr(ctx, x, y, s, s + 8 * u, 5 * u); ctx.fill();
      ctx.strokeStyle = '#ffc93c'; ctx.lineWidth = 2.5 * u; ctx.globalAlpha = 0.75 + Math.sin(time * 4) * 0.25; ctx.stroke(); ctx.globalAlpha = 1;
      ctx.drawImage(iconCanvas('star', '#ffc93c', s * 0.8), x + s * 0.1, y + s * 0.1);
      txt(it.evo.tier === 2 ? 'II' : 'I', x + s / 2, y + s + 2 * u, 8 * u, '#ffc93c', DISPLAY, 400, 'center', false);
      return;
    }
    const u2 = UPG[it.id], rank = player.upg[it.id], col = CATS[u2.cat].col, maxed = rank >= u2.max;
    ctx.fillStyle = 'rgba(13,14,18,0.88)'; rr(ctx, x, y, s, s + 8 * u, 5 * u); ctx.fill();
    ctx.strokeStyle = col; ctx.lineWidth = (maxed ? 2.5 : 1.5) * u; ctx.stroke();
    if (maxed) {   // max-rank shimmer
      ctx.save(); rr(ctx, x, y, s, s + 8 * u, 5 * u); ctx.clip();
      const sh = ((time * 0.8 + x * 0.003) % 1.6 - 0.3) * (s * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.beginPath(); ctx.moveTo(x + sh, y); ctx.lineTo(x + sh + 8 * u, y); ctx.lineTo(x + sh - s * 0.5 + 8 * u, y + s + 8 * u); ctx.lineTo(x + sh - s * 0.5, y + s + 8 * u); ctx.fill();
      ctx.restore();
    }
    ctx.drawImage(iconCanvas(u2.icon, col, s * 0.78), x + s * 0.11, y + s * 0.06);
    const nw = (s - 6 * u - (u2.max - 1) * 1.5 * u) / u2.max;
    for (let i = 0; i < u2.max; i++) { ctx.fillStyle = i < rank ? (maxed ? '#ffd23f' : col) : 'rgba(255,255,255,0.14)'; ctx.fillRect(x + 3 * u + i * (nw + 1.5 * u), y + s + 1.5 * u, nw, 4 * u); }
  },
  tooltip(r, u) {
    const { it } = r, p = player;
    const lines = [];
    let title, sub, col;
    if (it.kind === 'syn') {
      title = it.syn.name; sub = 'SYNERGY'; col = '#ff4fd8'; lines.push([it.syn.desc, '#f4f6fb']);
      lines.push(['Needs: ' + reqList(p, it.syn.req).map(q => `${q.name} ${q.need}`).join(' + '), '#9aa0b4']);
    } else if (it.kind === 'evo') {
      title = it.evo.name; sub = (it.evo.tier === 2 ? 'TIER II' : 'TIER I') + ' EVOLUTION · ' + WEAPONS[p.weapon].name.toUpperCase(); col = '#ffc93c';
      lines.push([it.evo.desc, '#f4f6fb']); for (const b of it.evo.benefits) lines.push(['• ' + b, '#ffd23f']);
    } else {
      const u2 = UPG[it.id], rank = p.upg[it.id];
      title = u2.name; sub = `${CATS[u2.cat].name.toUpperCase()} · RANK ${rank}/${u2.max}`; col = CATS[u2.cat].col;
      lines.push([u2.desc, '#cfd3e0']);
      lines.push(['Now: ' + u2.fx(rank), '#f4f6fb']);
      if (rank < u2.max) lines.push(['Next: ' + u2.fx(rank + 1), '#52f08a']); else lines.push(['MAX RANK', '#ffd23f']);
      for (const s of synergiesFor(it.id)) lines.push([(p.synergies.has(s.id) ? '◆ ' : '◇ ') + s.name + (p.synergies.has(s.id) ? ' (active)' : ' — ' + reqList(p, s.req).filter(q => !q.ok).map(q => `${q.name} ${q.need}`).join(', ')), p.synergies.has(s.id) ? '#ff4fd8' : '#9aa0b4']);
      for (const e of evosFor(p, it.id)) lines.push(['★ Evolution: ' + e.name, '#ffc93c']);
    }
    const w = 270 * u, pad = 10 * u, fs = 14 * u;
    const wrapped = []; for (const [s, c] of lines) for (const l of wrapLines(s, w - pad * 2, fs)) wrapped.push([l, c]);
    const h = pad * 2 + 38 * u + wrapped.length * fs * 1.25;
    let x = clamp(r.x, 8 * u, VW - w - 8 * u), y = r.y + r.s + 14 * u;
    panel(x, y, w, h, 6 * u, 0.95); ctx.fillStyle = col; ctx.fillRect(x, y, 3 * u, h);
    txt(title, x + pad, y + pad + 9 * u, 16 * u, col, DISPLAY, 400, 'left', false);
    txt(sub, x + pad, y + pad + 27 * u, 11 * u, '#9aa0b4', BODY, 800, 'left', false);
    wrapped.forEach(([l, c], i) => txt(l, x + pad, y + pad + 44 * u + i * fs * 1.25, fs, c, BODY, 600, 'left', false));
  },
  draw(time) {
    const p = player; if (!p) return;
    const u = DPR * clamp(Math.min(window.innerWidth / 1280, window.innerHeight / 760), 0.72, 1.25);
    const M = 16 * DPR;
    ctx.drawImage(getVignette(), 0, 0);
    if (Game.hurtFlash > 0) {
      ctx.globalAlpha = Game.hurtFlash * 1.6; ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(VW / 2, VH / 2, Math.min(VW, VH) * 0.3, VW / 2, VH / 2, Math.hypot(VW, VH) * 0.55);
      g.addColorStop(0, 'rgba(255,0,30,0)'); g.addColorStop(1, 'rgba(255,0,30,0.55)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, VW, VH); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
    if (buff(p, 'mayhem')) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.18 + Math.sin(time * 10) * 0.06; ctx.drawImage(getVignette(), 0, 0); ctx.fillStyle = 'rgba(255,40,200,0.08)'; ctx.fillRect(0, 0, VW, VH); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
    if (p.hp / p.maxHp < 0.3 && Game.state === 'play') { ctx.globalAlpha = 0.25 + Math.sin(time * 6) * 0.12; ctx.drawImage(getVignette(), 0, 0); ctx.fillStyle = 'rgba(120,0,15,0.12)'; ctx.fillRect(0, 0, VW, VH); ctx.globalAlpha = 1; }
    if (Game.state !== 'play' && Game.state !== 'levelup' && Game.state !== 'pause' && Game.state !== 'build' && Game.state !== 'dying' && Game.state !== 'dead') return;

    // ---- XP bar ----
    const bx = M + 74 * u, by = M, bw = VW - bx - M, bh = 22 * u;
    panel(M, by - 4 * u, 66 * u, bh + 8 * u, 5 * u);
    txt('LV', M + 8 * u, by + bh / 2, 12 * u, '#9aa0b4', DISPLAY, 400, 'left', false);
    txt(String(p.level), M + 58 * u, by + bh / 2 + 1 * u, 22 * u, '#2ef2ff', DISPLAY, 400, 'right');
    ctx.fillStyle = 'rgba(13,14,18,0.85)'; rr(ctx, bx, by, bw, bh, 5 * u); ctx.fill();
    const f = clamp(p.xpShown, 0, 1);
    if (f > 0.002) {
      const g = ctx.createLinearGradient(bx, 0, bx + bw * f, 0);
      g.addColorStop(0, '#0fa3c4'); g.addColorStop(1, Game.xpFlash > 0 ? '#ffffff' : '#2ef2ff');
      ctx.fillStyle = g; rr(ctx, bx + 2 * u, by + 2 * u, Math.max(6 * u, (bw - 4 * u) * f), bh - 4 * u, 4 * u); ctx.fill();
      const shine = ((time * 0.6) % 1.4) - 0.2;
      if (shine > 0 && shine < 1) { ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(bx + bw * f * shine, by + 3 * u, 18 * u, bh - 6 * u); }
      ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(bx + 4 * u, by + 4 * u, (bw - 8 * u) * f, 3 * u);
    }
    if (p.xpPulse > 0 || Game.xpFlash > 0) {
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.max(p.xpPulse * 0.35, Game.xpFlash);
      ctx.strokeStyle = '#7ff6ff'; ctx.lineWidth = 3 * u; rr(ctx, bx, by, bw, bh, 5 * u); ctx.stroke();
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; for (let i = 1; i < 10; i++) ctx.fillRect(bx + bw * i / 10, by + 4 * u, 1.5 * u, bh - 8 * u);
    txt(Math.floor(p.xp) + ' / ' + p.xpNeed + ' XP', bx + bw - 10 * u, by + bh / 2 + 1, 14 * u, '#f4f6fb', BODY, 700, 'right');

    // ---- upgrade inventory ----
    const inv = this.inventory(p, u, M, by + bh + 8 * u, VW - 2 * M);
    this.hover = null;
    for (const r of inv.rects) {
      this.drawInvItem(r, u, time);
      if (mouse.sx >= r.x && mouse.sx <= r.x + r.s && mouse.sy >= r.y && mouse.sy <= r.y + r.s + 8 * u) this.hover = r;
    }

    // ---- wave / time / kills ----
    const ry = by + bh + 8 * u + inv.h + 22 * u;
    const dur = Game.wave === 1 ? 25 : 30, wf = clamp(Director.t / dur, 0, 1);
    panel(VW / 2 - 90 * u, ry - 16 * u, 180 * u, 38 * u);
    txt('WAVE ' + Game.wave, VW / 2, ry - 1 * u, 20 * u, Game.wave % 5 === 4 ? '#ff3b4e' : '#f4f6fb', DISPLAY, 400, 'center');
    ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.fillRect(VW / 2 - 76 * u, ry + 14 * u, 152 * u, 3 * u);
    ctx.fillStyle = Game.wave % 5 === 4 ? '#ff3b4e' : '#ff9a1f'; ctx.fillRect(VW / 2 - 76 * u, ry + 14 * u, 152 * u * wf, 3 * u);
    panel(M, ry - 14 * u, 104 * u, 32 * u);
    txt(fmtTime(Game.time), M + 52 * u, ry + 2 * u, 20 * u, '#f4f6fb', DISPLAY, 400, 'center', false);
    panel(VW - M - 128 * u, ry - 14 * u, 128 * u, 32 * u);
    txt('KILLS', VW - M - 118 * u, ry + 2 * u, 14 * u, '#9aa0b4', BODY, 800, 'left', false);
    txt(String(Game.kills), VW - M - 10 * u, ry + 2 * u, 20 * u, '#ff9a1f', DISPLAY, 400, 'right', false);
    let nextY = ry + 34 * u;
    // ---- event ----
    const ev = Director.event;
    if (ev) {
      const def = EVENTS[ev.type], w = 220 * u;
      panel(VW / 2 - w / 2, nextY - 12 * u, w, 30 * u, 5 * u);
      txt(def.name, VW / 2, nextY - 1 * u, 14 * u, def.color, DISPLAY, 400, 'center', false);
      ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.fillRect(VW / 2 - w / 2 + 10 * u, nextY + 11 * u, w - 20 * u, 3 * u);
      ctx.fillStyle = def.color; ctx.fillRect(VW / 2 - w / 2 + 10 * u, nextY + 11 * u, (w - 20 * u) * clamp(ev.t / ev.dur, 0, 1), 3 * u);
      nextY += 36 * u;
      if (ev.type === 'supply' && ev.x) offscreenArrow(ev.x, ev.y, '#ffd23f', 'S', u, time);
      if (ev.type === 'elite' && ev.target && !ev.target.dead) offscreenArrow(ev.target.x, ev.target.y, '#ff4fd8', '!', u, time);
    }
    // ---- boss bar ----
    const b = Game.boss;
    if (b && !b.dead) {
      const w = Math.min(560 * u, VW - 2 * M), x = VW / 2 - w / 2, y = nextY + 4 * u;
      txt(b.name, VW / 2, y, 18 * u, '#ff3b4e', DISPLAY, 400, 'center');
      ctx.fillStyle = 'rgba(13,14,18,0.85)'; rr(ctx, x, y + 12 * u, w, 14 * u, 4 * u); ctx.fill();
      ctx.fillStyle = '#ff3b4e'; rr(ctx, x + 2 * u, y + 14 * u, Math.max(0, (w - 4 * u) * b.hp / b.maxHp), 10 * u, 3 * u); ctx.fill();
      offscreenArrow(b.x, b.y, '#ff3b4e', 'B', u, time);
    }
    // ---- medkit indicators ----
    const range = p.S.scanner ? 1e9 : 1300;
    for (const g of Pickups.list) if (g.kind === 'hp' && (g.world || p.S.scanner) && dist2(g.x, g.y, p.x, p.y) < range * range) offscreenArrow(g.x, g.y, '#52f08a', '+', u, time);

    // ---- health / shield / dash (bottom left) ----
    const hy = VH - M - 66 * u, hw = 300 * u;
    panel(M, hy, hw + 24 * u, 66 * u, 8 * u);
    const hf = clamp(p.hp / p.maxHp, 0, 1);
    txt('HP', M + 12 * u, hy + 20 * u, 14 * u, '#9aa0b4', DISPLAY, 400, 'left', false);
    ctx.fillStyle = 'rgba(255,255,255,0.08)'; rr(ctx, M + 48 * u, hy + 10 * u, hw - 36 * u, 20 * u, 4 * u); ctx.fill();
    ctx.fillStyle = hf < 0.3 ? (Math.sin(time * 10) > 0 ? '#ff3b4e' : '#b3202c') : hf < 0.6 ? '#ffd23f' : '#52f08a';
    rr(ctx, M + 48 * u, hy + 10 * u, Math.max(4 * u, (hw - 36 * u) * hf), 20 * u, 4 * u); ctx.fill();
    if (p.shield > 0) { ctx.fillStyle = 'rgba(120,200,255,0.75)'; rr(ctx, M + 48 * u, hy + 10 * u, Math.min(hw - 36 * u, (hw - 36 * u) * p.shield / p.maxHp), 6 * u, 3 * u); ctx.fill(); }
    ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(M + 52 * u, hy + 13 * u, (hw - 44 * u) * hf, 4 * u);
    txt(Math.ceil(p.hp) + ' / ' + p.maxHp + (p.shield >= 1 ? ` +${Math.round(p.shield)}` : ''), M + hw + 6 * u, hy + 20 * u, 16 * u, '#f4f6fb', BODY, 800, 'right');
    const df = p.dashT > 0 ? 0 : clamp(1 - p.dashCdT / p.S.dashCd, 0, 1);
    txt('DASH', M + 12 * u, hy + 48 * u, 12 * u, df >= 1 ? '#2ef2ff' : '#9aa0b4', DISPLAY, 400, 'left', false);
    ctx.fillStyle = 'rgba(255,255,255,0.08)'; rr(ctx, M + 66 * u, hy + 42 * u, 110 * u, 12 * u, 3 * u); ctx.fill();
    ctx.fillStyle = df >= 1 ? '#2ef2ff' : '#3a8a99'; rr(ctx, M + 66 * u, hy + 42 * u, Math.max(3 * u, 110 * u * df), 12 * u, 3 * u); ctx.fill();
    let cx = M + 186 * u;
    const chip = (label, col) => { ctx.font = `800 ${12 * u}px ${BODY}`; const w = ctx.measureText(label).width + 12 * u; if (cx + w > M + hw + 20 * u) return; ctx.fillStyle = col; rr(ctx, cx, hy + 41 * u, w, 15 * u, 3 * u); ctx.fill(); txt(label, cx + 6 * u, hy + 49 * u, 12 * u, '#0d0e12', BODY, 800, 'left', false); cx += w + 4 * u; };
    if (p.overclockT > 0) chip('OC ' + p.overclockT.toFixed(1), '#ff9a1f');
    if (buff(p, 'mayhem')) chip('MAYHEM', '#ff4fd8');
    if (buff(p, 'secondwind')) chip('2ND WIND', '#2ef2ff');
    if (buff(p, 'trauma') || buff(p, 'surgeon')) chip('ARMOURED', '#52f08a');
    if (lastStandOn(p)) chip('LAST STAND', '#ff3b4e');
    if (buff(p, 'adren') || buff(p, 'fleet')) chip('FAST', '#ff4fd8');
    if (p.primed) chip('PRIMED', '#ff4f5e');
    // lock / reroll charges
    panel(M, hy - 26 * u, 150 * u, 20 * u, 4 * u, 0.7);
    ctx.drawImage(iconCanvas('lock', '#ffd23f', 14 * u), M + 6 * u, hy - 23 * u);
    txt('x' + p.locks, M + 24 * u, hy - 16 * u, 13 * u, '#ffd23f', BODY, 800, 'left', false);
    ctx.drawImage(iconCanvas('reroll', '#2ef2ff', 14 * u), M + 54 * u, hy - 23 * u);
    txt('x' + p.rerolls, M + 72 * u, hy - 16 * u, 13 * u, '#2ef2ff', BODY, 800, 'left', false);
    txt('TAB: BUILD', M + 144 * u, hy - 16 * u, 11 * u, '#9aa0b4', BODY, 800, 'right', false);

    // ---- weapon + ammo (bottom right) ----
    const g = p.gun, ww = 290 * u, wx = VW - M - ww, wy = VH - M - 76 * u;
    panel(wx, wy, ww, 76 * u, 8 * u);
    const evo = evoTop(p);
    if (evo) { ctx.strokeStyle = '#ffc93c'; ctx.lineWidth = 2 * u; ctx.globalAlpha = 0.6 + Math.sin(time * 3) * 0.3; rr(ctx, wx, wy, ww, 76 * u, 8 * u); ctx.stroke(); ctx.globalAlpha = 1; }
    txt(evo ? evo.name : g.name.toUpperCase(), wx + 14 * u, wy + 20 * u, 17 * u, evo ? '#ffc93c' : '#f4f6fb', DISPLAY, 400, 'left', false);
    if (evo) txt(WEAPONS[p.weapon].name.toUpperCase() + (evo.tier === 2 ? ' · TIER II' : ''), wx + ww - 12 * u, wy + 20 * u, 11 * u, '#9aa0b4', BODY, 800, 'right', false);
    const oc = p.overclockT > 0;
    if (p.reloading > 0) {
      const rf = clamp(1 - p.reloading / reloadTime(p), 0, 1);
      txt('RELOADING', wx + 14 * u, wy + 50 * u, 20 * u, '#ffd23f', DISPLAY, 400, 'left', false);
      ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.fillRect(wx + 14 * u, wy + 64 * u, ww - 28 * u, 5 * u);
      ctx.fillStyle = '#ffd23f'; ctx.fillRect(wx + 14 * u, wy + 64 * u, (ww - 28 * u) * rf, 5 * u);
    } else {
      const ammoTxt = oc ? '∞' : String(p.ammo);
      txt(ammoTxt, wx + 14 * u, wy + 50 * u, 30 * u, oc ? '#ff9a1f' : p.ammo <= g.mag * 0.25 ? '#ff3b4e' : '#f4f6fb', DISPLAY, 400, 'left', false);
      ctx.font = `400 ${30 * u}px ${DISPLAY}`; const aw = ctx.measureText(ammoTxt).width;
      txt('/ ' + g.mag, wx + 20 * u + aw, wy + 54 * u, 16 * u, '#9aa0b4', BODY, 700, 'left', false);
      const n = Math.min(g.mag, 40), pw = Math.min(6 * u, (ww - 150 * u) / n - 1.5 * u), px0 = wx + ww - 14 * u - n * (pw + 1.5 * u);
      for (let i = 0; i < n; i++) {
        const filled = oc || i < Math.ceil(p.ammo * n / g.mag);
        ctx.fillStyle = filled ? (evo ? '#ffc93c' : '#ff9a1f') : 'rgba(255,255,255,0.12)';
        ctx.fillRect(px0 + i * (pw + 1.5 * u), wy + 42 * u, pw, 16 * u);
      }
    }
    if (p.S.static) { const need = 14 - 2 * p.S.static; ctx.fillStyle = 'rgba(159,212,255,0.25)'; ctx.fillRect(wx + 14 * u, wy + 70 * u, ww - 28 * u, 3 * u); ctx.fillStyle = '#9fd4ff'; ctx.fillRect(wx + 14 * u, wy + 70 * u, (ww - 28 * u) * p.charge / need, 3 * u); }

    // ---- combo + streak ----
    if (Game.combo >= 2) {
      const cxp = VW - M - 10 * u, cyp = VH * 0.42, ct = clamp(Game.comboT / 1.5, 0, 1);
      const pop = 1 + Math.max(0, Game.comboT - 1.3) * 3, wob = Math.sin(time * 18) * 0.04 * Math.min(1, Game.combo / 20);
      ctx.save(); ctx.translate(cxp, cyp); ctx.rotate(-0.05 + wob);
      txt('x' + Game.combo, 0, 0, 40 * u * pop, Game.combo >= 35 ? `hsl(${(time * 300) % 360},100%,65%)` : Game.combo >= 12 ? '#2ef2ff' : Game.combo >= 5 ? '#ff4f5e' : '#ffd23f', DISPLAY, 400, 'right');
      ctx.restore();
      txt('COMBO', cxp, cyp + 28 * u, 14 * u, '#f4f6fb', DISPLAY, 400, 'right');
      ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(cxp - 90 * u, cyp + 42 * u, 90 * u, 5 * u);
      ctx.fillStyle = ct < 0.3 ? '#ff3b4e' : '#ffd23f'; ctx.fillRect(cxp - 90 * u * ct, cyp + 42 * u, 90 * u * ct, 5 * u);
      const nextS = STREAKS.find(s => s.n > Game.combo);
      if (nextS) txt(`${nextS.n - Game.combo} TO ${nextS.label.split(' ·')[0]}`, cxp, cyp + 58 * u, 11 * u, '#9aa0b4', BODY, 800, 'right', false);
    }
    const cm = Game.comboMsg;
    if (cm) {
      const t = 1.3 - cm.t, sc = t < 0.12 ? 0.5 + t / 0.12 * 0.9 : t < 0.22 ? 1.4 - (t - 0.12) * 4 : 1;
      ctx.save(); ctx.translate(VW / 2, VH * 0.27); ctx.rotate(-0.06 + Math.sin(t * 30) * 0.03 * Math.max(0, 1 - t * 3)); ctx.scale(sc, sc);
      ctx.globalAlpha = Math.min(1, cm.t / 0.3);
      txt(cm.text, 3 * u, 3 * u, 44 * u, 'rgba(0,0,0,0.5)', DISPLAY, 400, 'center', false);
      txt(cm.text, 0, 0, 44 * u, cm.color, DISPLAY, 400, 'center');
      ctx.restore(); ctx.globalAlpha = 1;
    }
    const sm = Game.streakMsg;
    if (sm) { ctx.globalAlpha = Math.min(1, sm.t / 0.3); txt(sm.text, VW / 2, VH * 0.27 + 40 * u, 20 * u, sm.color, DISPLAY, 400, 'center'); ctx.globalAlpha = 1; }
    const syn = Game.synMsg;
    if (syn) {
      const t = 2.8 - syn.t, w = Math.min(560 * u, VW - 2 * M), x = VW / 2 - w / 2, y = VH * 0.58, sc = t < 0.15 ? 0.6 + t / 0.15 * 0.4 : 1;
      ctx.save(); ctx.translate(VW / 2, y); ctx.scale(sc, sc); ctx.translate(-VW / 2, -y);
      ctx.globalAlpha = Math.min(1, syn.t / 0.4);
      panel(x, y - 30 * u, w, 64 * u, 8 * u, 0.9);
      ctx.strokeStyle = '#ff4fd8'; ctx.lineWidth = 2 * u; rr(ctx, x, y - 30 * u, w, 64 * u, 8 * u); ctx.stroke();
      txt('SYNERGY UNLOCKED — ' + syn.text, VW / 2, y - 10 * u, 20 * u, '#ff4fd8', DISPLAY, 400, 'center', false);
      txt(syn.desc, VW / 2, y + 16 * u, 15 * u, '#f4f6fb', BODY, 600, 'center', false);
      ctx.restore(); ctx.globalAlpha = 1;
    }
    const bn = Game.bannerMsg;
    if (bn) {
      const t = 2.4 - bn.t, slide = t < 0.25 ? (1 - t / 0.25) : bn.t < 0.3 ? -(1 - bn.t / 0.3) : 0;
      const y = VH * 0.36, hh = bn.sub ? 84 * u : 68 * u;
      ctx.globalAlpha = Math.min(1, bn.t / 0.3, t / 0.15);
      ctx.fillStyle = 'rgba(8,9,12,0.7)'; ctx.fillRect(0, y - 34 * u, VW, hh);
      ctx.fillStyle = bn.color; ctx.fillRect(0, y - 34 * u, VW, 3 * u); ctx.fillRect(0, y - 34 * u + hh - 3 * u, VW, 3 * u);
      txt(bn.text, VW / 2 + slide * VW * 0.5, y + 2 * u, 40 * u, bn.color, DISPLAY, 400, 'center');
      if (bn.sub) txt(bn.sub, VW / 2 + slide * VW * 0.5, y + 34 * u, 16 * u, '#f4f6fb', BODY, 700, 'center');
      ctx.globalAlpha = 1;
    }
    if (this.hover && Game.state === 'play') this.tooltip(this.hover, u);
    // ---- crosshair ----
    if (Game.state === 'play' || Game.state === 'dying') {
      const mx = mouse.sx, my = mouse.sy, sp = 8 * u + g.spread * 90 * u + p.recoil * 1.2 * u;
      ctx.strokeStyle = '#000'; ctx.lineWidth = 5 * DPR;
      const cross = () => { ctx.beginPath(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { ctx.moveTo(mx + dx * sp, my + dy * sp); ctx.lineTo(mx + dx * (sp + 9 * u), my + dy * (sp + 9 * u)); } ctx.stroke(); };
      cross(); ctx.strokeStyle = p.reloading > 0 ? '#ffd23f' : p.primed ? '#ff4f5e' : '#ffffff'; ctx.lineWidth = 2.2 * DPR; cross();
      ctx.fillStyle = '#ff3b4e'; ctx.beginPath(); ctx.arc(mx, my, 2.2 * DPR, 0, TAU); ctx.fill();
      if (p.reloading > 0) {
        ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 3 * DPR;
        ctx.beginPath(); ctx.arc(mx, my, sp + 14 * u, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(1 - p.reloading / reloadTime(p), 0, 1)); ctx.stroke();
      }
    }
  },
};
