// In-game HUD. Text comes from the sprite cache; the upgrade inventory is cached offscreen and only rebuilt
// when the build changes. Layout scales with the window and the HUD-scale accessibility setting.
import { TAU, clamp, lerp, fmtTime, dist2 } from '../core/util.js';
import { G, W } from '../core/registry.js';
import { ctx, V, R, makeCanvas, rr } from '../core/canvas.js';
import { Settings, PAL } from '../core/settings.js';
import { mouse, prettyKey } from '../core/input.js';
import { CATS, CAT_ORDER, UPG } from '../data/upgrades.js';
import { SYNERGIES } from '../data/evolutions.js';
import { WEAPONS } from '../data/weapons.js';
import { EQ, RARITY_COL, SLOTS, EQ_SYNERGIES } from '../data/equipment.js';
import { MODES } from '../data/modes.js';
import { evoTop } from '../systems/stats.js';
import { reqList, synergiesFor, evosFor } from '../systems/offers.js';
import { cooldownOf, maxCharges } from '../systems/equipmentRules.js';
import { iconCanvas } from './icons.js';
import { textSprite, DISPLAY, BODY } from './textcache.js';
import { buff, lastStandOn, harnessOn, fireRate, reloadTime, infiniteAmmo } from '../entities/player.js';
import { STREAKS } from '../game/game.js';
import { EVENTS } from '../systems/director.js';

// draw cached text; align: left | center | right (x is the anchor), y is the vertical centre
export function txt(s, x, y, size, color, font = BODY, weight = 800, align = 'left', stroke = true) {
  const sp = textSprite(String(s), size, color, font, weight, stroke);
  const dx = align === 'left' ? -sp.pad : align === 'right' ? -sp.w + sp.pad : -sp.w / 2;
  ctx.drawImage(sp.c, Math.round(x + dx), Math.round(y - sp.h / 2)); R.draws++;
  return sp.w - sp.pad * 2;
}
export function panel(x, y, w, h, r = 6, a = 0.78) { ctx.fillStyle = `rgba(13,14,18,${a})`; rr(ctx, x, y, w, h, r); ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1; ctx.stroke(); }
function wrapLines(s, maxW, size) {
  const probe = ctx; probe.font = `600 ${size}px ${BODY}`;
  const words = String(s).split(' '), out = []; let line = '';
  for (const w of words) { const t = line ? line + ' ' + w : w; if (probe.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t; }
  if (line) out.push(line);
  return out;
}
// pre-rendered full-screen vignettes (no per-frame gradients)
let vig = null, hurtVig = null, vigKey = '';
function vignettes() {
  const key = V.w + 'x' + V.h; if (vig && vigKey === key) return;
  vigKey = key;
  const mk = (rgba) => { const c = makeCanvas(V.w, V.h), g = c.getContext('2d'); const gr = g.createRadialGradient(V.w / 2, V.h / 2, Math.min(V.w, V.h) * 0.33, V.w / 2, V.h / 2, Math.hypot(V.w, V.h) * 0.58); gr.addColorStop(0, rgba.replace(/[\d.]+\)$/, '0)')); gr.addColorStop(1, rgba); g.fillStyle = gr; g.fillRect(0, 0, V.w, V.h); return c; };
  vig = mk('rgba(0,0,0,0.6)'); hurtVig = mk('rgba(255,0,30,0.55)');
}
export function getVignette() { vignettes(); return vig; }
function offscreenArrow(x, y, color, label, u, time) {
  if (!Settings.edgeIndicators) return;
  const game = G.game, sx = (x - game.cam.x) * V.zoom + V.w / 2, sy = (y - game.cam.y) * V.zoom + V.h / 2;
  if (sx > 0 && sx < V.w && sy > 0 && sy < V.h) return;
  const a = Math.atan2(sy - V.h / 2, sx - V.w / 2), ex = clamp(sx, 50 * u, V.w - 50 * u), ey = clamp(sy, 150 * u, V.h - 150 * u);
  ctx.save(); ctx.translate(ex, ey);
  ctx.fillStyle = 'rgba(13,14,18,0.8)'; ctx.beginPath(); ctx.arc(0, 0, 15 * u, 0, TAU); ctx.fill();
  ctx.strokeStyle = color; ctx.lineWidth = 2 * u; ctx.globalAlpha = 0.7 + Math.sin(time * 5) * 0.3; ctx.stroke(); ctx.globalAlpha = 1;
  if (label === '+') { ctx.fillStyle = color; ctx.fillRect(-2.5 * u, -8 * u, 5 * u, 16 * u); ctx.fillRect(-8 * u, -2.5 * u, 16 * u, 5 * u); }
  else txt(label, 0, 1, 12 * u, color, DISPLAY, 400, 'center', false);
  ctx.rotate(a); ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(24 * u, 0); ctx.lineTo(17 * u, -6 * u); ctx.lineTo(17 * u, 6 * u); ctx.closePath(); ctx.fill();
  ctx.restore();
}

// ---------- cached upgrade inventory row ----------
const inv = { key: '', canvas: null, rects: [], h: 0, x: 0, y: 0 };
function invSignature(p, u, w) {
  let s = (evoTop(p) || {}).id + '|' + u.toFixed(3) + '|' + w;
  for (const id in p.upg) s += id + p.upg[id];
  for (const id of p.synergies) s += '#' + id;
  for (const id in p.S.eqSyn) s += '$' + id;
  return s;
}
function buildInventory(p, u, x0, y0, wAvail) {
  const items = [], top = evoTop(p);
  if (top) items.push({ kind: 'evo', evo: top });
  for (const c of CAT_ORDER) Object.keys(p.upg).filter(id => UPG[id] && UPG[id].cat === c).forEach((id, i) => items.push({ kind: 'upg', id, gap: i === 0 }));
  const syns = SYNERGIES.filter(s => p.synergies.has(s.id)).map(s => ({ kind: 'syn', syn: s })).concat(EQ_SYNERGIES.filter(s => p.S.eqSyn[s.id]).map(s => ({ kind: 'syn', syn: s, eq: true })));
  let size = 30 * u; const gap = 4 * u, groupGap = 8 * u, synW = syns.length * (24 * u + gap) + (syns.length ? 14 * u : 0);
  const need = s => items.reduce((t, it) => t + s + gap + (it.gap ? groupGap : 0), 0);
  let rows = 1; const perRowW = wAvail - synW;
  while (need(size) > perRowW && size > 20 * u) size -= u;
  if (need(size) > perRowW) { rows = 2; size = 30 * u; while (need(size) > perRowW * 2 && size > 18 * u) size -= u; }
  const cell = size + 10 * u, rects = [];
  let x = 0, y = 0;
  for (const it of items) {
    if (it.gap && x > 0) x += groupGap;
    if (x + size > perRowW && rows > 1 && y === 0) { x = 0; y += cell; }
    rects.push({ it, x, y, s: size }); x += size + gap;
  }
  let sx = wAvail - syns.length * (24 * u + gap);
  for (const it of syns) { rects.push({ it, x: sx, y: (size - 24 * u) / 2, s: 24 * u }); sx += 24 * u + gap; }
  const h = items.length || syns.length ? cell * (rows === 2 && y > 0 ? 2 : 1) : 0;
  const c = inv.canvas && inv.canvas.width === Math.ceil(wAvail) && inv.canvas.height >= Math.ceil(h + 4) ? inv.canvas : makeCanvas(Math.ceil(wAvail), Math.ceil(Math.max(h, 1) + 4));
  const g = c.getContext('2d'); g.clearRect(0, 0, c.width, c.height);
  for (const r of rects) drawInvItem(g, r, u);
  Object.assign(inv, { canvas: c, rects, h, x: x0, y: y0 });
}
function drawInvItem(g, r, u) {
  const { it, x, y, s } = r;
  if (it.kind === 'syn') {
    const col = it.eq ? '#b46bff' : '#ff4fd8';
    g.save(); g.translate(x + s / 2, y + s / 2);
    g.fillStyle = 'rgba(40,10,40,0.9)'; g.strokeStyle = col; g.lineWidth = 2 * u;
    g.beginPath(); for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + Math.PI / 6; g.lineTo(Math.cos(a) * s / 2, Math.sin(a) * s / 2); } g.closePath(); g.fill(); g.stroke();
    g.drawImage(iconCanvas('synergy', col, s * 0.7), -s * 0.35, -s * 0.35); g.restore(); return;
  }
  if (it.kind === 'evo') {
    g.fillStyle = 'rgba(40,30,6,0.92)'; rr(g, x, y, s, s + 8 * u, 5 * u); g.fill(); g.strokeStyle = '#ffc93c'; g.lineWidth = 2.5 * u; g.stroke();
    g.drawImage(iconCanvas('star', '#ffc93c', s * 0.8), x + s * 0.1, y + s * 0.1);
    const t = textSprite(it.evo.tier === 2 ? 'II' : 'I', 8 * u, '#ffc93c', DISPLAY, 400, false); g.drawImage(t.c, x + s / 2 - t.w / 2, y + s + 2 * u - t.h / 2); return;
  }
  const u2 = UPG[it.id], rank = W.player.upg[it.id], col = CATS[u2.cat].col, maxed = rank >= u2.max;
  g.fillStyle = 'rgba(13,14,18,0.88)'; rr(g, x, y, s, s + 8 * u, 5 * u); g.fill(); g.strokeStyle = col; g.lineWidth = (maxed ? 2.5 : 1.5) * u; g.stroke();
  g.drawImage(iconCanvas(u2.icon, col, s * 0.78), x + s * 0.11, y + s * 0.06);
  const nw = (s - 6 * u - (u2.max - 1) * 1.5 * u) / u2.max;
  for (let i = 0; i < u2.max; i++) { g.fillStyle = i < rank ? (maxed ? '#ffd23f' : col) : 'rgba(255,255,255,0.14)'; g.fillRect(x + 3 * u + i * (nw + 1.5 * u), y + s + 1.5 * u, nw, 4 * u); }
}
function tooltip(r, u) {
  const { it } = r, p = W.player, lines = [];
  let title, sub, col;
  if (it.kind === 'syn') {
    title = it.syn.name; col = it.eq ? '#b46bff' : '#ff4fd8'; sub = it.eq ? 'EQUIPMENT SYNERGY' : 'SYNERGY'; lines.push([it.syn.desc, '#f4f6fb']);
    if (it.eq) lines.push(['Needs: ' + EQ[it.syn.eq].name + ' + ' + UPG[it.syn.upg].name, '#9aa0b4']);
    else lines.push(['Needs: ' + reqList(p, it.syn.req).map(q => `${q.name} ${q.need}`).join(' + '), '#9aa0b4']);
  } else if (it.kind === 'evo') {
    title = it.evo.name; col = '#ffc93c'; sub = (it.evo.tier === 2 ? 'TIER II' : 'TIER I') + ' EVOLUTION · ' + WEAPONS[p.weapon].name.toUpperCase();
    lines.push([it.evo.desc, '#f4f6fb']); for (const b of it.evo.benefits) lines.push(['• ' + b, '#ffd23f']);
  } else {
    const u2 = UPG[it.id], rank = p.upg[it.id];
    title = u2.name; col = CATS[u2.cat].col; sub = `${CATS[u2.cat].name.toUpperCase()} · RANK ${rank}/${u2.max}`;
    lines.push([u2.desc, '#cfd3e0'], ['Now: ' + u2.fx(rank), '#f4f6fb']);
    lines.push(rank < u2.max ? ['Next: ' + u2.fx(rank + 1), '#52f08a'] : ['MAX RANK', '#ffd23f']);
    for (const s of synergiesFor(it.id)) lines.push([(p.synergies.has(s.id) ? '◆ ' : '◇ ') + s.name + (p.synergies.has(s.id) ? ' (active)' : ' — ' + reqList(p, s.req).filter(q => !q.ok).map(q => `${q.name} ${q.need}`).join(', ')), p.synergies.has(s.id) ? '#ff4fd8' : '#9aa0b4']);
    for (const e of evosFor(p, it.id)) lines.push(['★ Evolution: ' + e.name, '#ffc93c']);
  }
  const w = 280 * u, pad = 10 * u, fs = Math.round(14 * u);
  const wrapped = []; for (const [s, c] of lines) for (const l of wrapLines(s, w - pad * 2, fs)) wrapped.push([l, c]);
  const h = pad * 2 + 38 * u + wrapped.length * fs * 1.25;
  const x = clamp(inv.x + r.x, 8 * u, V.w - w - 8 * u), y = inv.y + r.y + r.s + 14 * u;
  panel(x, y, w, h, 6 * u, 0.95); ctx.fillStyle = col; ctx.fillRect(x, y, 3 * u, h);
  txt(title, x + pad, y + pad + 9 * u, 16 * u, col, DISPLAY, 400, 'left', false);
  txt(sub, x + pad, y + pad + 27 * u, 11 * u, '#9aa0b4', BODY, 800, 'left', false);
  wrapped.forEach(([l, c], i) => txt(l, x + pad, y + pad + 44 * u + i * fs * 1.25, fs, c, BODY, 600, 'left', false));
}

function eqSlot(x, y, s, slot, it, u, time) {
  const def = EQ[it.id], col = RARITY_COL[it.rarity], max = maxCharges(it), cd = cooldownOf(it);
  const flash = G.equip.flash[slot] || 0;
  ctx.fillStyle = 'rgba(13,14,18,0.88)'; rr(ctx, x, y, s, s, 6 * u); ctx.fill();
  ctx.strokeStyle = flash > 0 ? PAL.danger : col; ctx.lineWidth = (it.rarity === 'legendary' ? 3 : 2) * u; ctx.stroke();
  if (it.rarity === 'legendary') { ctx.globalAlpha = 0.35 + Math.sin(time * 4) * 0.2; ctx.strokeStyle = '#fff2b0'; ctx.lineWidth = 1 * u; rr(ctx, x + 2 * u, y + 2 * u, s - 4 * u, s - 4 * u, 5 * u); ctx.stroke(); ctx.globalAlpha = 1; }
  ctx.drawImage(iconCanvas(def.icon, '#f4f6fb', s * 0.64), x + s * 0.18, y + s * 0.12);
  // cooldown sweep
  if (def.active && it.charges < max && cd > 0) {
    const f = clamp(it.cd / cd, 0, 1);
    if (it.charges === 0) {
      ctx.fillStyle = 'rgba(5,6,10,0.72)'; ctx.beginPath(); ctx.moveTo(x + s / 2, y + s / 2); ctx.arc(x + s / 2, y + s / 2, s * 0.72, -Math.PI / 2, -Math.PI / 2 + TAU * f); ctx.closePath();
      ctx.save(); rr(ctx, x, y, s, s, 6 * u); ctx.clip(); ctx.fill(); ctx.restore();
      txt(Math.ceil(it.cd), x + s / 2, y + s / 2, 16 * u, '#f4f6fb', DISPLAY, 400, 'center');
    } else { ctx.strokeStyle = col; ctx.lineWidth = 2 * u; ctx.beginPath(); ctx.arc(x + s - 7 * u, y + 7 * u, 4 * u, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - f)); ctx.stroke(); }
  }
  if (max > 1) txt('x' + it.charges, x + s - 4 * u, y + s - 9 * u, 11 * u, '#ffd23f', BODY, 800, 'right');
  const key = slot === 'armour' || !def.active ? 'AUTO' : prettyKey(Settings.keys[slot]);
  ctx.fillStyle = 'rgba(0,0,0,0.8)'; const kw = txtWidth(key, 10 * u) + 8 * u; rr(ctx, x - 3 * u, y - 7 * u, kw, 14 * u, 3 * u); ctx.fill();
  txt(key, x + 1 * u, y, 10 * u, def.active && it.charges > 0 ? '#ffd23f' : '#9aa0b4', DISPLAY, 400, 'left', false);
  const nw = (s - 10 * u) / 3;
  for (let i = 0; i < 3; i++) { ctx.fillStyle = i < it.rank ? col : 'rgba(255,255,255,0.15)'; ctx.fillRect(x + 4 * u + i * (nw + 1 * u), y + s + 3 * u, nw, 4 * u); }
  if (flash > 0) { ctx.fillStyle = `rgba(255,59,78,${flash})`; rr(ctx, x, y, s, s, 6 * u); ctx.fill(); }
}
function txtWidth(s, size) { const sp = textSprite(String(s), size, '#fff', DISPLAY, 400, false); return sp.w - sp.pad * 2; }

export const HUD = {
  hover: null, achCard: null,
  draw(time, alpha) {
    const game = G.game, p = W.player; if (!p) return;
    const u = V.px * clamp(Math.min(V.cssW / 1280, V.cssH / 760), 0.72, 1.25) * Settings.hudScale, M = 16 * V.px;
    vignettes();
    ctx.drawImage(vig, 0, 0);
    if (game.hurtFlash > 0) { ctx.globalAlpha = Math.min(1, game.hurtFlash * 1.6) * (Settings.reducedFlash ? 0.4 : 1) * (0.3 + 0.7 * Settings.flash); ctx.drawImage(hurtVig, 0, 0); ctx.globalAlpha = 1; }
    if (buff(p, 'mayhem') && !Settings.reducedFlash) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.16 + Math.sin(time * 10) * 0.05; ctx.fillStyle = 'rgba(255,40,200,0.25)'; ctx.fillRect(0, 0, V.w, V.h); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
    if (p.hp / p.maxHp < 0.3 && game.state === 'play') { ctx.globalAlpha = 0.18 + Math.sin(time * 6) * 0.1; ctx.drawImage(hurtVig, 0, 0); ctx.globalAlpha = 1; }
    const training = game.mode === 'training';
    // ---- XP bar ----
    const bx = M + 74 * u, by = M, bw = V.w - bx - M, bh = 22 * u;
    panel(M, by - 4 * u, 66 * u, bh + 8 * u, 5 * u);
    txt('LV', M + 8 * u, by + bh / 2, 12 * u, '#9aa0b4', DISPLAY, 400, 'left', false);
    txt(p.level, M + 58 * u, by + bh / 2 + u, 22 * u, PAL.xp, DISPLAY, 400, 'right');
    ctx.fillStyle = 'rgba(13,14,18,0.85)'; rr(ctx, bx, by, bw, bh, 5 * u); ctx.fill();
    const f = clamp(p.xpShown, 0, 1);
    if (f > 0.002) {
      ctx.fillStyle = game.xpFlash > 0 ? '#ffffff' : PAL.xp; rr(ctx, bx + 2 * u, by + 2 * u, Math.max(6 * u, (bw - 4 * u) * f), bh - 4 * u, 4 * u); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(bx + 2 * u, by + bh / 2, (bw - 4 * u) * f, bh / 2 - 2 * u);
      const shine = ((time * 0.6) % 1.4) - 0.2; if (shine > 0 && shine < 1) { ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(bx + bw * f * shine, by + 3 * u, 18 * u, bh - 6 * u); }
    }
    if (p.xpPulse > 0 || game.xpFlash > 0) { ctx.globalAlpha = Math.max(p.xpPulse * 0.35, game.xpFlash); ctx.strokeStyle = '#7ff6ff'; ctx.lineWidth = 3 * u; rr(ctx, bx, by, bw, bh, 5 * u); ctx.stroke(); ctx.globalAlpha = 1; }
    txt(Math.floor(p.xp) + ' / ' + p.xpNeed + ' XP', bx + bw - 10 * u, by + bh / 2 + 1, 14 * u, '#f4f6fb', BODY, 700, 'right');
    // ---- upgrade inventory (cached) ----
    const ix = M, iy = by + bh + 8 * u, iw = V.w - 2 * M, sig = invSignature(p, u, Math.round(iw));
    if (sig !== inv.key) { inv.key = sig; buildInventory(p, u, ix, iy, iw); }
    if (inv.h) { ctx.drawImage(inv.canvas, ix, iy); R.draws++; }
    this.hover = null;
    for (const r of inv.rects) {
      const rx = ix + r.x, ry = iy + r.y;
      if (r.it.kind === 'upg' && W.player.upg[r.it.id] >= UPG[r.it.id].max) {   // max-rank shimmer
        const sh = ((time * 0.8 + r.x * 0.003) % 1.6 - 0.3) * (r.s * 2);
        ctx.save(); rr(ctx, rx, ry, r.s, r.s + 8 * u, 5 * u); ctx.clip(); ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.beginPath(); ctx.moveTo(rx + sh, ry); ctx.lineTo(rx + sh + 8 * u, ry); ctx.lineTo(rx + sh - r.s * 0.5 + 8 * u, ry + r.s + 8 * u); ctx.lineTo(rx + sh - r.s * 0.5, ry + r.s + 8 * u); ctx.fill(); ctx.restore();
      }
      if (mouse.sx >= rx && mouse.sx <= rx + r.s && mouse.sy >= ry && mouse.sy <= ry + r.s + 8 * u) this.hover = r;
    }
    // ---- wave / time / kills ----
    const ry = iy + inv.h + 22 * u;
    const dur = game.wave === 1 ? 25 : 30, wf = clamp(G.director.t / dur, 0, 1);
    panel(V.w / 2 - 90 * u, ry - 16 * u, 180 * u, 38 * u);
    txt(training ? 'TRAINING' : 'WAVE ' + game.wave, V.w / 2, ry - u, 20 * u, game.wave % 5 === 4 ? PAL.danger : '#f4f6fb', DISPLAY, 400, 'center');
    if (!training) { ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.fillRect(V.w / 2 - 76 * u, ry + 14 * u, 152 * u, 3 * u); ctx.fillStyle = game.wave % 5 === 4 ? PAL.danger : '#ff9a1f'; ctx.fillRect(V.w / 2 - 76 * u, ry + 14 * u, 152 * u * wf, 3 * u); }
    if (game.mode !== 'standard') txt(MODES[game.mode].short.toUpperCase() + (game.daily ? ' · ' + game.daily.mods.map(m => m.name).join(' · ') : ''), V.w / 2, ry + 30 * u, 11 * u, game.mode === 'hardcore' ? PAL.danger : '#ffd23f', BODY, 800, 'center');
    panel(M, ry - 14 * u, 104 * u, 32 * u);
    txt(fmtTime(game.time), M + 52 * u, ry + 2 * u, 20 * u, '#f4f6fb', DISPLAY, 400, 'center', false);
    if (!training) {
      panel(V.w - M - 128 * u, ry - 14 * u, 128 * u, 32 * u);
      txt('KILLS', V.w - M - 118 * u, ry + 2 * u, 14 * u, '#9aa0b4', BODY, 800, 'left', false);
      txt(game.run.kills, V.w - M - 10 * u, ry + 2 * u, 20 * u, '#ff9a1f', DISPLAY, 400, 'right', false);
    }
    let nextY = ry + (game.mode !== 'standard' ? 44 : 34) * u;
    const ev = G.director.event;
    if (ev && !training) {
      const def = EVENTS[ev.type], w = 220 * u;
      panel(V.w / 2 - w / 2, nextY - 12 * u, w, 30 * u, 5 * u);
      txt(def.name, V.w / 2, nextY - u, 14 * u, def.color, DISPLAY, 400, 'center', false);
      ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.fillRect(V.w / 2 - w / 2 + 10 * u, nextY + 11 * u, w - 20 * u, 3 * u);
      ctx.fillStyle = def.color; ctx.fillRect(V.w / 2 - w / 2 + 10 * u, nextY + 11 * u, (w - 20 * u) * clamp(ev.t / ev.dur, 0, 1), 3 * u);
      nextY += 36 * u;
      if (ev.type === 'supply' && ev.x) offscreenArrow(ev.x, ev.y, '#ffd23f', 'S', u, time);
      if (ev.type === 'elite' && ev.target && !ev.target.dead) offscreenArrow(ev.target.x, ev.target.y, '#ff4fd8', '!', u, time);
    }
    const b = game.boss;
    if (b && !b.dead) {
      const w = Math.min(640 * u, V.w - 2 * M), x = V.w / 2 - w / 2, y = nextY + 6 * u;
      txt(b.d.name, V.w / 2, y, 20 * u, PAL.danger, DISPLAY, 400, 'center');
      ctx.fillStyle = 'rgba(13,14,18,0.88)'; rr(ctx, x, y + 14 * u, w, 18 * u, 4 * u); ctx.fill();
      ctx.fillStyle = PAL.danger; rr(ctx, x + 2 * u, y + 16 * u, Math.max(0, (w - 4 * u) * b.hp / b.maxHp), 14 * u, 3 * u); ctx.fill();
      if (b.state === 'stunned' || b.cast > 0) txt(b.state === 'stunned' ? 'VULNERABLE' : 'CASTING — INTERRUPT IT', V.w / 2, y + 23 * u, 11 * u, '#ffd23f', DISPLAY, 400, 'center');
      offscreenArrow(b.x, b.y, PAL.danger, 'B', u, time);
      nextY += 44 * u;
    }
    // pickups the player should know about (world medkits; everything when scanning/revealed)
    const sup = p.eq.support, wide = sup.id === 'scanner' || p.S.scanner || G.equip.revealT > 0, range = wide ? 1e9 : 1300;
    for (const g of G.pickups.list) {
      if (g.kind === 'hp' && (g.world || wide) && dist2(g.x, g.y, p.x, p.y) < range * range) offscreenArrow(g.x, g.y, PAL.heal, '+', u, time);
      else if (g.kind === 'crate') offscreenArrow(g.x, g.y, '#b46bff', 'G', u, time);
      else if (g.kind === 'supply' && wide) offscreenArrow(g.x, g.y, '#ffd23f', 'S', u, time);
    }
    // ---- objectives / training meter (top right) ----
    const ox = V.w - M - 270 * u; let oy = ry + 26 * u;
    if (training) this.trainingPanel(ox, oy, u);
    else if (G.objectives.active.length) {
      panel(ox, oy, 270 * u, 18 * u + G.objectives.active.length * 30 * u, 6 * u, 0.7);
      txt('OBJECTIVES', ox + 10 * u, oy + 10 * u, 11 * u, '#9aa0b4', DISPLAY, 400, 'left', false);
      G.objectives.active.forEach((o, i) => {
        const y = oy + 26 * u + i * 30 * u, col = o.done ? PAL.heal : '#f4f6fb';
        if (o.flash > 0) { ctx.fillStyle = `rgba(82,240,138,${o.flash * 0.3})`; ctx.fillRect(ox + 2 * u, y - 10 * u, 266 * u, 28 * u); }
        txt((o.done ? '✓ ' : '') + o.text, ox + 10 * u, y, 13 * u, col, BODY, 700, 'left', false);
        ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.fillRect(ox + 10 * u, y + 10 * u, 200 * u, 3 * u);
        ctx.fillStyle = o.done ? PAL.heal : '#ffd23f'; ctx.fillRect(ox + 10 * u, y + 10 * u, 200 * u * clamp(o.progress / o.target, 0, 1), 3 * u);
        txt(`${Math.min(o.progress, o.target)}/${o.target}`, ox + 260 * u, y + 6 * u, 11 * u, '#9aa0b4', BODY, 800, 'right', false);
      });
    }
    // ---- equipment slots + health (bottom left) ----
    const hy = V.h - M - 66 * u, hw = 300 * u, s = 46 * u, ey = hy - s - 30 * u;
    SLOTS.forEach((slot, i) => eqSlot(M + 4 * u + i * (s + 12 * u), ey, s, slot, p.eq[slot], u, time));
    if (Settings.showName) { const prof = G.save.profile(); if (prof) txt(prof.name, M + 4 * u + 3 * (s + 12 * u), ey + 10 * u, 14 * u, '#f4f6fb', DISPLAY, 400, 'left'); }
    txt(`LOCK x${p.locks} · REROLL x${p.rerolls} · ${prettyKey(Settings.keys.build)}: BUILD`, M + 4 * u + 3 * (s + 12 * u), ey + 30 * u, 11 * u, '#9aa0b4', BODY, 800, 'left', false);
    panel(M, hy, hw + 24 * u, 66 * u, 8 * u);
    const hf = clamp(p.hp / p.maxHp, 0, 1);
    txt('HP', M + 12 * u, hy + 20 * u, 14 * u, '#9aa0b4', DISPLAY, 400, 'left', false);
    ctx.fillStyle = 'rgba(255,255,255,0.08)'; rr(ctx, M + 48 * u, hy + 10 * u, hw - 36 * u, 20 * u, 4 * u); ctx.fill();
    ctx.fillStyle = hf < 0.3 ? (Math.sin(time * 10) > 0 ? PAL.danger : '#b3202c') : hf < 0.6 ? PAL.warn : PAL.heal;
    rr(ctx, M + 48 * u, hy + 10 * u, Math.max(4 * u, (hw - 36 * u) * hf), 20 * u, 4 * u); ctx.fill();
    const shieldTot = p.shield + p.eShield;
    if (shieldTot > 0.5) { ctx.fillStyle = 'rgba(120,200,255,0.8)'; rr(ctx, M + 48 * u, hy + 10 * u, Math.min(hw - 36 * u, (hw - 36 * u) * shieldTot / p.maxHp), 6 * u, 3 * u); ctx.fill(); }
    txt(Math.ceil(p.hp) + ' / ' + p.maxHp + (shieldTot >= 1 ? ` +${Math.round(shieldTot)}` : ''), M + hw + 6 * u, hy + 20 * u, 16 * u, '#f4f6fb', BODY, 800, 'right');
    const df = p.dashT > 0 ? 0 : clamp(1 - p.dashCdT / p.S.dashCd, 0, 1);
    txt('DASH', M + 12 * u, hy + 48 * u, 12 * u, df >= 1 ? PAL.xp : '#9aa0b4', DISPLAY, 400, 'left', false);
    ctx.fillStyle = 'rgba(255,255,255,0.08)'; rr(ctx, M + 66 * u, hy + 42 * u, 110 * u, 12 * u, 3 * u); ctx.fill();
    ctx.fillStyle = df >= 1 ? PAL.xp : '#3a8a99'; rr(ctx, M + 66 * u, hy + 42 * u, Math.max(3 * u, 110 * u * df), 12 * u, 3 * u); ctx.fill();
    let cx = M + 186 * u;
    const chip = (label, col) => { const w = txtWidth(label, 12 * u) + 12 * u; if (cx + w > M + hw + 20 * u) return; ctx.fillStyle = col; rr(ctx, cx, hy + 41 * u, w, 15 * u, 3 * u); ctx.fill(); txt(label, cx + 6 * u, hy + 49 * u, 12 * u, '#0d0e12', DISPLAY, 400, 'left', false); cx += w + 4 * u; };
    if (p.overclockT > 0 || buff(p, 'infAmmo')) chip('∞ AMMO', '#ff9a1f');
    if (buff(p, 'eqStim')) chip('STIM', '#ff9a1f');
    if (buff(p, 'booster')) chip('BOOST', '#ffd23f');
    if (buff(p, 'mayhem')) chip('MAYHEM', '#ff4fd8');
    if (buff(p, 'secondwind')) chip('2ND WIND', PAL.xp);
    if (buff(p, 'trauma') || buff(p, 'surgeon') || buff(p, 'injectorDR') || G.equip.insideBubble(p)) chip('ARMOURED', PAL.heal);
    if (lastStandOn(p) || harnessOn(p)) chip('LOW HP BOOST', PAL.danger);
    if (p.primed) chip('PRIMED', '#ff4f5e');
    // ---- weapon + ammo (bottom right) ----
    const g = p.gun, ww = 290 * u, wx = V.w - M - ww, wy = V.h - M - 76 * u;
    panel(wx, wy, ww, 76 * u, 8 * u);
    const evo = evoTop(p);
    if (evo) { ctx.strokeStyle = '#ffc93c'; ctx.lineWidth = 2 * u; ctx.globalAlpha = 0.6 + Math.sin(time * 3) * 0.3; rr(ctx, wx, wy, ww, 76 * u, 8 * u); ctx.stroke(); ctx.globalAlpha = 1; }
    txt(evo ? evo.name : g.name.toUpperCase(), wx + 14 * u, wy + 20 * u, 17 * u, evo ? '#ffc93c' : '#f4f6fb', DISPLAY, 400, 'left', false);
    if (evo) txt(WEAPONS[p.weapon].name.toUpperCase() + (evo.tier === 2 ? ' · TIER II' : ''), wx + ww - 12 * u, wy + 20 * u, 11 * u, '#9aa0b4', BODY, 800, 'right', false);
    const inf = infiniteAmmo(p);
    if (p.reloading > 0) {
      txt('RELOADING', wx + 14 * u, wy + 50 * u, 20 * u, '#ffd23f', DISPLAY, 400, 'left', false);
      ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.fillRect(wx + 14 * u, wy + 64 * u, ww - 28 * u, 5 * u);
      ctx.fillStyle = '#ffd23f'; ctx.fillRect(wx + 14 * u, wy + 64 * u, (ww - 28 * u) * clamp(1 - p.reloading / reloadTime(p), 0, 1), 5 * u);
    } else {
      const aw = txt(inf ? '∞' : p.ammo, wx + 14 * u, wy + 50 * u, 30 * u, inf ? '#ff9a1f' : p.ammo <= g.mag * 0.25 ? PAL.danger : '#f4f6fb', DISPLAY, 400, 'left', false);
      txt('/ ' + g.mag, wx + 20 * u + aw, wy + 54 * u, 16 * u, '#9aa0b4', BODY, 700, 'left', false);
      const n = Math.min(g.mag, 40), pw = Math.min(6 * u, (ww - 150 * u) / n - 1.5 * u), px0 = wx + ww - 14 * u - n * (pw + 1.5 * u), filledN = inf ? n : Math.ceil(p.ammo * n / g.mag);
      ctx.fillStyle = evo ? '#ffc93c' : '#ff9a1f'; for (let i = 0; i < filledN; i++) ctx.fillRect(px0 + i * (pw + 1.5 * u), wy + 42 * u, pw, 16 * u);
      ctx.fillStyle = 'rgba(255,255,255,0.12)'; for (let i = filledN; i < n; i++) ctx.fillRect(px0 + i * (pw + 1.5 * u), wy + 42 * u, pw, 16 * u);
      if (!Settings.autoReload && p.ammo === 0) txt('PRESS ' + prettyKey(Settings.keys.reload), wx + ww - 14 * u, wy + 66 * u, 11 * u, PAL.danger, DISPLAY, 400, 'right', false);
    }
    if (p.S.static) { const need = 14 - 2 * p.S.static; ctx.fillStyle = 'rgba(159,212,255,0.25)'; ctx.fillRect(wx + 14 * u, wy + 70 * u, ww - 28 * u, 3 * u); ctx.fillStyle = '#9fd4ff'; ctx.fillRect(wx + 14 * u, wy + 70 * u, (ww - 28 * u) * p.charge / need, 3 * u); }
    // ---- combo + streak ----
    if (game.combo >= 2) {
      const cxp = V.w - M - 10 * u, cyp = V.h * 0.5, ct = clamp(game.comboT / 1.5, 0, 1);
      const pop = 1 + Math.max(0, game.comboT - 1.3) * 3;
      txt('x' + game.combo, cxp, cyp, 40 * u * pop, game.combo >= 35 ? '#ff4fd8' : game.combo >= 12 ? PAL.xp : game.combo >= 5 ? '#ff4f5e' : '#ffd23f', DISPLAY, 400, 'right');
      txt('COMBO', cxp, cyp + 28 * u, 14 * u, '#f4f6fb', DISPLAY, 400, 'right');
      ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(cxp - 90 * u, cyp + 42 * u, 90 * u, 5 * u);
      ctx.fillStyle = ct < 0.3 ? PAL.danger : '#ffd23f'; ctx.fillRect(cxp - 90 * u * ct, cyp + 42 * u, 90 * u * ct, 5 * u);
      const ns = STREAKS.find(q => q.n > game.combo);
      if (ns) txt(`${ns.n - game.combo} TO ${ns.label.split(' ·')[0]}`, cxp, cyp + 58 * u, 11 * u, '#9aa0b4', BODY, 800, 'right', false);
    }
    this.center(game, u, time, M);
    if (this.hover && game.state === 'play') tooltip(this.hover, u);
    this.toasts(game, u, M);
    this.achievementCard(u, M, time);
    const tip = G.tutorial.current();
    if (tip && game.state === 'play') {
      const w = Math.max(320 * u, txtWidth(tip.text, 16 * u) + 60 * u), x = V.w / 2 - w / 2, y = V.h - M - 150 * u;
      panel(x, y, w, 40 * u, 8 * u, 0.9); ctx.strokeStyle = PAL.xp; ctx.lineWidth = 2 * u; rr(ctx, x, y, w, 40 * u, 8 * u); ctx.stroke();
      txt(tip.text, V.w / 2, y + 16 * u, 16 * u, '#f4f6fb', BODY, 800, 'center', false);
      txt(`TIP ${tip.n}/${tip.of} · F1 TO SKIP TIPS`, V.w / 2, y + 32 * u, 10 * u, '#9aa0b4', BODY, 800, 'center', false);
    }
    if (game.state === 'play' || game.state === 'dying') this.crosshair(p, u);
    if (G.perf && G.perf.visible) G.perf.draw(u);
  },
  center(game, u, time, M) {
    const cm = game.comboMsg;
    if (cm) {
      const t = 1.3 - cm.t, sc = t < 0.12 ? 0.5 + t / 0.12 * 0.9 : t < 0.22 ? 1.4 - (t - 0.12) * 4 : 1;
      ctx.save(); ctx.translate(V.w / 2, V.h * 0.27); ctx.rotate(Settings.reducedMotion ? 0 : -0.06 + Math.sin(t * 30) * 0.03 * Math.max(0, 1 - t * 3)); ctx.scale(sc, sc);
      ctx.globalAlpha = Math.min(1, cm.t / 0.3); txt(cm.text, 0, 0, 44 * u, cm.color, DISPLAY, 400, 'center'); ctx.restore(); ctx.globalAlpha = 1;
    }
    const sm = game.streakMsg;
    if (sm) { ctx.globalAlpha = Math.min(1, sm.t / 0.3); txt(sm.text, V.w / 2, V.h * 0.27 + 40 * u, 20 * u, sm.color, DISPLAY, 400, 'center'); ctx.globalAlpha = 1; }
    const syn = game.synMsg;
    if (syn) {
      const t = 2.8 - syn.t, w = Math.min(600 * u, V.w - 2 * M), x = V.w / 2 - w / 2, y = V.h * 0.6, col = syn.eq ? '#b46bff' : '#ff4fd8';
      ctx.globalAlpha = Math.min(1, syn.t / 0.4, t / 0.15);
      panel(x, y - 30 * u, w, 64 * u, 8 * u, 0.9); ctx.strokeStyle = col; ctx.lineWidth = 2 * u; rr(ctx, x, y - 30 * u, w, 64 * u, 8 * u); ctx.stroke();
      txt((syn.eq ? 'EQUIPMENT SYNERGY — ' : 'SYNERGY UNLOCKED — ') + syn.text, V.w / 2, y - 10 * u, 20 * u, col, DISPLAY, 400, 'center', false);
      txt(syn.desc, V.w / 2, y + 16 * u, 15 * u, '#f4f6fb', BODY, 600, 'center', false);
      ctx.globalAlpha = 1;
    }
    const bn = game.bannerMsg;
    if (bn) {
      const t = 2.4 - bn.t, slide = Settings.reducedMotion ? 0 : t < 0.25 ? (1 - t / 0.25) : bn.t < 0.3 ? -(1 - bn.t / 0.3) : 0;
      const y = V.h * 0.36, hh = bn.sub ? 84 * u : 68 * u;
      ctx.globalAlpha = Math.min(1, bn.t / 0.3, t / 0.15);
      ctx.fillStyle = 'rgba(8,9,12,0.7)'; ctx.fillRect(0, y - 34 * u, V.w, hh);
      ctx.fillStyle = bn.color; ctx.fillRect(0, y - 34 * u, V.w, 3 * u); ctx.fillRect(0, y - 34 * u + hh - 3 * u, V.w, 3 * u);
      txt(bn.text, V.w / 2 + slide * V.w * 0.5, y + 2 * u, 40 * u, bn.color, DISPLAY, 400, 'center');
      if (bn.sub) txt(bn.sub, V.w / 2 + slide * V.w * 0.5, y + 34 * u, 16 * u, '#f4f6fb', BODY, 700, 'center');
      ctx.globalAlpha = 1;
    }
  },
  toasts(game, u, M) {
    let y = V.h * 0.72;
    for (const t of game.toasts) {
      ctx.globalAlpha = Math.min(1, t.t / 0.4, (t.max - t.t) / 0.15);
      const w = txtWidth(t.text, 15 * u) + 30 * u;
      panel(V.w / 2 - w / 2, y - 14 * u, w, 28 * u, 6 * u, 0.85);
      txt(t.text, V.w / 2, y, 15 * u, t.color, DISPLAY, 400, 'center', false);
      y -= 34 * u;
    }
    ctx.globalAlpha = 1;
  },
  achievementCard(u, M, time) {
    const q = G.achievements.queue;
    if (!this.achCard && q.length) this.achCard = { a: q.shift(), t: 4 };
    const c = this.achCard; if (!c) return;
    c.t -= 1 / 60;
    if (c.t <= 0) { this.achCard = null; return; }
    const k = Math.min(1, (4 - c.t) / 0.3, c.t / 0.4), w = 330 * u, h = 64 * u, x = V.w - M - w * k, y = V.h * 0.32;
    panel(x, y, w, h, 8 * u, 0.94); ctx.strokeStyle = '#ffc93c'; ctx.lineWidth = 2 * u; rr(ctx, x, y, w, h, 8 * u); ctx.stroke();
    ctx.drawImage(iconCanvas(c.a.icon || 'star', '#ffc93c', 40 * u), x + 12 * u, y + 12 * u);
    txt('ACHIEVEMENT UNLOCKED', x + 62 * u, y + 16 * u, 11 * u, '#9aa0b4', DISPLAY, 400, 'left', false);
    txt(c.a.name, x + 62 * u, y + 34 * u, 17 * u, '#ffc93c', DISPLAY, 400, 'left', false);
    txt('+' + c.a.credits + ' SUPPLY CREDITS', x + 62 * u, y + 52 * u, 12 * u, '#f4f6fb', BODY, 800, 'left', false);
  },
  trainingPanel(x, y, u) {
    const T = G.training;
    panel(x, y, 270 * u, 92 * u, 6 * u, 0.8);
    txt('DPS (5s)', x + 10 * u, y + 14 * u, 11 * u, '#9aa0b4', DISPLAY, 400, 'left', false);
    txt(Math.round(T.dps), x + 10 * u, y + 40 * u, 30 * u, '#ffd23f', DISPLAY, 400, 'left', false);
    txt('PEAK ' + Math.round(T.peak), x + 150 * u, y + 30 * u, 13 * u, '#f4f6fb', BODY, 800, 'left', false);
    txt('TOTAL ' + Math.round(T.total), x + 150 * u, y + 48 * u, 13 * u, '#f4f6fb', BODY, 800, 'left', false);
    txt(`HITS ${T.n} · CRIT ${T.n ? Math.round(T.crits / T.n * 100) : 0}%`, x + 10 * u, y + 74 * u, 12 * u, '#9aa0b4', BODY, 800, 'left', false);
  },
  crosshair(p, u) {
    const mx = mouse.sx, my = mouse.sy, g = p.gun, sp = 8 * u + g.spread * 90 * u + p.recoil * 1.2 * u, col = p.reloading > 0 ? '#ffd23f' : p.primed ? '#ff4f5e' : Settings.crossColor, st = Settings.crosshair;
    const draw = (lw, c) => {
      ctx.strokeStyle = c; ctx.lineWidth = lw; ctx.beginPath();
      if (st === 'circle') ctx.arc(mx, my, sp + 4 * u, 0, TAU);
      else if (st !== 'dot') for (const [dx, dy] of st === 'tbar' ? [[1, 0], [-1, 0], [0, 1]] : [[1, 0], [-1, 0], [0, 1], [0, -1]]) { ctx.moveTo(mx + dx * sp, my + dy * sp); ctx.lineTo(mx + dx * (sp + 9 * u), my + dy * (sp + 9 * u)); }
      ctx.stroke();
    };
    draw(5 * V.px, '#000'); draw(2.2 * V.px, col);
    ctx.fillStyle = st === 'dot' ? col : PAL.danger; ctx.beginPath(); ctx.arc(mx, my, (st === 'dot' ? 3.5 : 2.2) * V.px, 0, TAU); ctx.fill();
    if (p.reloading > 0) { ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 3 * V.px; ctx.beginPath(); ctx.arc(mx, my, sp + 14 * u, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(1 - p.reloading / reloadTime(p), 0, 1)); ctx.stroke(); }
  },
};
