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
function panel(x, y, w, h, r = 6) { ctx.fillStyle = 'rgba(13,14,18,0.78)'; rr(ctx, x, y, w, h, r); ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1; ctx.stroke(); }
function txt(s, x, y, size, color, font = BODY, weight = 800, align = 'left', stroke = true) {
  ctx.font = `${font === DISPLAY ? 400 : weight} ${size}px ${font}`; ctx.textAlign = align; ctx.textBaseline = 'middle';
  if (stroke) { ctx.lineWidth = Math.max(2, size * 0.18); ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.lineJoin = 'round'; ctx.strokeText(s, x, y); }
  ctx.fillStyle = color; ctx.fillText(s, x, y);
}

const HUD = {
  draw(time) {
    const p = player; if (!p) return;
    const u = DPR * clamp(Math.min(window.innerWidth / 1280, window.innerHeight / 760), 0.72, 1.25);
    const M = 16 * DPR;
    ctx.drawImage(getVignette(), 0, 0);
    if (Game.hurtFlash > 0) {   // red edge pulse, never a full-screen flash
      ctx.globalAlpha = Game.hurtFlash * 1.6; ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(VW / 2, VH / 2, Math.min(VW, VH) * 0.3, VW / 2, VH / 2, Math.hypot(VW, VH) * 0.55);
      g.addColorStop(0, 'rgba(255,0,30,0)'); g.addColorStop(1, 'rgba(255,0,30,0.55)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, VW, VH); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
    if (p.hp / p.maxHp < 0.3 && Game.state === 'play') { ctx.globalAlpha = 0.25 + Math.sin(time * 6) * 0.12; ctx.drawImage(getVignette(), 0, 0); ctx.fillStyle = 'rgba(120,0,15,0.12)'; ctx.fillRect(0, 0, VW, VH); ctx.globalAlpha = 1; }
    if (Game.state === 'title') return;

    // ---- XP bar (top) ----
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
      const shine = ((time * 0.6) % 1.4) - 0.2;   // travelling glint
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      const sx = bx + bw * f * shine;
      if (shine > 0 && shine < 1) ctx.fillRect(sx, by + 3 * u, 18 * u, bh - 6 * u);
      ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(bx + 4 * u, by + 4 * u, (bw - 8 * u) * f, 3 * u);
    }
    if (p.xpPulse > 0 || Game.xpFlash > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.max(p.xpPulse * 0.35, Game.xpFlash);
      ctx.strokeStyle = '#7ff6ff'; ctx.lineWidth = 3 * u; rr(ctx, bx, by, bw, bh, 5 * u); ctx.stroke();
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; for (let i = 1; i < 10; i++) ctx.fillRect(bx + bw * i / 10, by + 4 * u, 1.5 * u, bh - 8 * u);
    txt(Math.floor(p.xp) + ' / ' + p.xpNeed + ' XP', bx + bw - 10 * u, by + bh / 2 + 1, 14 * u, '#f4f6fb', BODY, 700, 'right');

    // ---- wave / time / kills row ----
    const ry = by + bh + 22 * u;
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

    // ---- boss bar ----
    const b = Game.boss;
    if (b && !b.dead) {
      const w = Math.min(560 * u, VW - 2 * M), x = VW / 2 - w / 2, y = ry + 34 * u;
      txt(b.name, VW / 2, y, 18 * u, '#ff3b4e', DISPLAY, 400, 'center');
      ctx.fillStyle = 'rgba(13,14,18,0.85)'; rr(ctx, x, y + 12 * u, w, 14 * u, 4 * u); ctx.fill();
      ctx.fillStyle = '#ff3b4e'; rr(ctx, x + 2 * u, y + 14 * u, Math.max(0, (w - 4 * u) * b.hp / b.maxHp), 10 * u, 3 * u); ctx.fill();
      // arrow when off screen
      const sx = (b.x - Game.cam.x) * ZOOM + VW / 2, sy = (b.y - Game.cam.y) * ZOOM + VH / 2;
      if (sx < 0 || sx > VW || sy < 0 || sy > VH) {
        const a = Math.atan2(sy - VH / 2, sx - VW / 2), ex = clamp(sx, 50 * u, VW - 50 * u), ey = clamp(sy, 130 * u, VH - 120 * u);
        ctx.save(); ctx.translate(ex, ey); ctx.rotate(a); ctx.fillStyle = '#ff3b4e'; ctx.strokeStyle = '#000'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(20 * u, 0); ctx.lineTo(-10 * u, -13 * u); ctx.lineTo(-4 * u, 0); ctx.lineTo(-10 * u, 13 * u); ctx.closePath(); ctx.stroke(); ctx.fill(); ctx.restore();
      }
    }

    // ---- health + dash (bottom left) ----
    const hy = VH - M - 66 * u, hw = 300 * u;
    panel(M, hy, hw + 24 * u, 66 * u, 8 * u);
    const hf = clamp(p.hp / p.maxHp, 0, 1);
    txt('HP', M + 12 * u, hy + 20 * u, 14 * u, '#9aa0b4', DISPLAY, 400, 'left', false);
    ctx.fillStyle = 'rgba(255,255,255,0.08)'; rr(ctx, M + 48 * u, hy + 10 * u, hw - 36 * u, 20 * u, 4 * u); ctx.fill();
    ctx.fillStyle = hf < 0.3 ? (Math.sin(time * 10) > 0 ? '#ff3b4e' : '#b3202c') : hf < 0.6 ? '#ffd23f' : '#52f08a';
    rr(ctx, M + 48 * u, hy + 10 * u, Math.max(4 * u, (hw - 36 * u) * hf), 20 * u, 4 * u); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(M + 52 * u, hy + 13 * u, (hw - 44 * u) * hf, 4 * u);
    txt(Math.ceil(p.hp) + ' / ' + p.maxHp, M + hw + 6 * u, hy + 20 * u, 16 * u, '#f4f6fb', BODY, 800, 'right');
    // dash meter
    const df = p.dashT > 0 ? 0 : clamp(1 - p.dashCdT / p.S.dashCd, 0, 1);
    txt('DASH', M + 12 * u, hy + 48 * u, 12 * u, df >= 1 ? '#2ef2ff' : '#9aa0b4', DISPLAY, 400, 'left', false);
    ctx.fillStyle = 'rgba(255,255,255,0.08)'; rr(ctx, M + 66 * u, hy + 42 * u, 130 * u, 12 * u, 3 * u); ctx.fill();
    ctx.fillStyle = df >= 1 ? '#2ef2ff' : '#3a8a99'; rr(ctx, M + 66 * u, hy + 42 * u, Math.max(3 * u, 130 * u * df), 12 * u, 3 * u); ctx.fill();
    if (df >= 1) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.25 + Math.sin(time * 5) * 0.15; ctx.fillStyle = '#2ef2ff'; rr(ctx, M + 66 * u, hy + 42 * u, 130 * u, 12 * u, 3 * u); ctx.fill(); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
    // status chips
    let cx = M + 208 * u;
    const chip = (label, col) => { ctx.font = `800 ${12 * u}px ${BODY}`; const w = ctx.measureText(label).width + 12 * u; ctx.fillStyle = col; rr(ctx, cx, hy + 41 * u, w, 15 * u, 3 * u); ctx.fill(); txt(label, cx + 6 * u, hy + 49 * u, 12 * u, '#0d0e12', BODY, 800, 'left', false); cx += w + 4 * u; };
    if (p.overclockT > 0) chip('OVERCLOCK ' + p.overclockT.toFixed(1), '#ff9a1f');
    if (p.adrenT > 0) chip('ADRENALINE', '#ff4fd8');

    // ---- weapon + ammo (bottom right) ----
    const g = p.gun, ww = 290 * u, wx = VW - M - ww, wy = VH - M - 76 * u;
    panel(wx, wy, ww, 76 * u, 8 * u);
    const evo = p.evolved ? EVOS.find(e => e.id === p.evolved) : null;
    txt(evo ? evo.name : g.name.toUpperCase(), wx + 14 * u, wy + 20 * u, 17 * u, evo ? '#ffc93c' : '#f4f6fb', DISPLAY, 400, 'left', false);
    const oc = p.overclockT > 0;
    if (p.reloading > 0) {
      const rf = 1 - p.reloading / g.reload;
      txt('RELOADING', wx + 14 * u, wy + 50 * u, 20 * u, '#ffd23f', DISPLAY, 400, 'left', false);
      ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.fillRect(wx + 14 * u, wy + 64 * u, ww - 28 * u, 5 * u);
      ctx.fillStyle = '#ffd23f'; ctx.fillRect(wx + 14 * u, wy + 64 * u, (ww - 28 * u) * rf, 5 * u);
    } else {
      txt(oc ? '∞' : String(p.ammo), wx + 14 * u, wy + 50 * u, 30 * u, oc ? '#ff9a1f' : p.ammo <= g.mag * 0.25 ? '#ff3b4e' : '#f4f6fb', DISPLAY, 400, 'left', false);
      ctx.font = `400 ${30 * u}px ${DISPLAY}`; const aw = ctx.measureText(oc ? '∞' : String(p.ammo)).width;
      txt('/ ' + g.mag, wx + 20 * u + aw, wy + 54 * u, 16 * u, '#9aa0b4', BODY, 700, 'left', false);
      // bullet pips
      const n = Math.min(g.mag, 40), pw = Math.min(6 * u, (ww - 150 * u) / n - 1.5 * u), px0 = wx + ww - 14 * u - n * (pw + 1.5 * u);
      for (let i = 0; i < n; i++) {
        const filled = oc || i < Math.ceil(p.ammo * n / g.mag);
        ctx.fillStyle = filled ? (evo ? '#ffc93c' : '#ff9a1f') : 'rgba(255,255,255,0.12)';
        ctx.fillRect(px0 + i * (pw + 1.5 * u), wy + 42 * u, pw, 16 * u);
      }
    }

    // ---- combo ----
    if (Game.combo >= 2) {
      const cxp = VW - M - 10 * u, cyp = VH * 0.42;
      const pop = 1 + Math.max(0, Game.comboT - 1.3) * 3;
      txt('x' + Game.combo, cxp, cyp, 40 * u * pop, Game.combo >= 12 ? '#2ef2ff' : Game.combo >= 5 ? '#ff4f5e' : '#ffd23f', DISPLAY, 400, 'right');
      txt('COMBO', cxp, cyp + 28 * u, 14 * u, '#f4f6fb', DISPLAY, 400, 'right');
      ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(cxp - 90 * u, cyp + 42 * u, 90 * u, 4 * u);
      ctx.fillStyle = '#ffd23f'; ctx.fillRect(cxp - 90 * u * clamp(Game.comboT / 1.5, 0, 1), cyp + 42 * u, 90 * u * clamp(Game.comboT / 1.5, 0, 1), 4 * u);
    }
    const cm = Game.comboMsg;
    if (cm) {
      const t = 1.3 - cm.t, sc = t < 0.12 ? 0.5 + t / 0.12 * 0.9 : t < 0.22 ? 1.4 - (t - 0.12) * 4 : 1;
      ctx.save(); ctx.translate(VW / 2, VH * 0.27); ctx.rotate(-0.06 + Math.sin(t * 20) * 0.01 * (cm.t > 1 ? 1 : 0)); ctx.scale(sc, sc);
      ctx.globalAlpha = Math.min(1, cm.t / 0.3);
      txt(cm.text, 0, 0, 44 * u, cm.color, DISPLAY, 400, 'center');
      ctx.restore(); ctx.globalAlpha = 1;
    }
    const bn = Game.bannerMsg;
    if (bn) {
      const t = 2.4 - bn.t, slide = t < 0.25 ? (1 - t / 0.25) : bn.t < 0.3 ? -(1 - bn.t / 0.3) : 0;
      const y = VH * 0.36;
      ctx.globalAlpha = Math.min(1, bn.t / 0.3, t / 0.15);
      ctx.fillStyle = 'rgba(8,9,12,0.7)'; ctx.fillRect(0, y - 34 * u, VW, 68 * u);
      ctx.fillStyle = bn.color; ctx.fillRect(0, y - 34 * u, VW, 3 * u); ctx.fillRect(0, y + 31 * u, VW, 3 * u);
      txt(bn.text, VW / 2 + slide * VW * 0.5, y + 2 * u, 40 * u, bn.color, DISPLAY, 400, 'center');
      ctx.globalAlpha = 1;
    }
    // ---- crosshair (screen space, exact cursor position) ----
    if (Game.state === 'play' || Game.state === 'dying') {
      const mx = mouse.sx, my = mouse.sy, sp = 8 * u + g.spread * 90 * u + p.recoil * 1.2 * u;
      ctx.strokeStyle = '#000'; ctx.lineWidth = 5 * DPR;
      const cross = () => { ctx.beginPath(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { ctx.moveTo(mx + dx * sp, my + dy * sp); ctx.lineTo(mx + dx * (sp + 9 * u), my + dy * (sp + 9 * u)); } ctx.stroke(); };
      cross(); ctx.strokeStyle = p.reloading > 0 ? '#ffd23f' : '#ffffff'; ctx.lineWidth = 2.2 * DPR; cross();
      ctx.fillStyle = '#ff3b4e'; ctx.beginPath(); ctx.arc(mx, my, 2.2 * DPR, 0, TAU); ctx.fill();
      if (p.reloading > 0) {
        ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 3 * DPR;
        ctx.beginPath(); ctx.arc(mx, my, sp + 14 * u, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - p.reloading / g.reload)); ctx.stroke();
      }
    }
  },
};
