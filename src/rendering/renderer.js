// Frame renderer: world layers with interpolation, blackout lighting, muzzle flash, then the HUD.
import { TAU, lerp, vrand } from '../core/util.js';
import { G, W } from '../core/registry.js';
import { ctx, V, R, GLOW, makeCanvas } from '../core/canvas.js';
import { Q, Settings } from '../core/settings.js';
import { M } from '../world/map.js';
import { HUE_COL } from '../data/weapons.js';
import { ChunkCache, drawWorldStatic, drawDynamicTiles } from './mapRender.js';
import { FX, Decals } from './fx.js';
import { Bullets } from '../entities/combat.js';
import { drawEnemies } from '../entities/enemies.js';
import { drawPlayer } from '../entities/player.js';

export const view = { x0: 0, y0: 0, x1: 0, y1: 0, z: 1, cx: 0, cy: 0 };
export const timing = { world: 0, actors: 0, fx: 0, hud: 0 };
let darkCv = null;

export function renderGame(alpha, time) {
  const game = G.game, p = W.player;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#0d0e12'; ctx.fillRect(0, 0, V.w, V.h);
  if (!p) return;
  R.draws = 0;
  const t0 = performance.now();
  const z = V.zoom, vw = V.w / z, vh = V.h / z;
  const s = game.shakeAmt * 0.6, sx = s ? vrand(-s, s) : 0, sy = s ? vrand(-s, s) : 0;
  const camX = lerp(game.cam.px, game.cam.x, alpha) + sx - vw / 2, camY = lerp(game.cam.py, game.cam.y, alpha) + sy - vh / 2;
  Object.assign(view, { x0: camX - 60, y0: camY - 60, x1: camX + vw + 60, y1: camY + vh + 60, z, cx: camX, cy: camY });
  ChunkCache.sync(Math.max(1, Math.min(2, Math.round(z * 4) / 4)));
  ctx.setTransform(z, 0, 0, z, -camX * z, -camY * z);
  drawWorldStatic(camX, camY, vw, vh);
  Decals.draw(view);
  G.hazards.draw(view, time);
  drawDynamicTiles(camX, camY, vw, vh, time);
  FX.drawGround(view);
  const t1 = performance.now();
  G.pickups.draw(view, time);
  G.decoys.draw(view, time);
  G.equip.draw(view, time, alpha);
  drawEnemies(view, time, alpha);
  if (game.state !== 'dead' && game.state !== 'dying') drawPlayer(p, time, view, alpha);
  const t2 = performance.now();
  Bullets.draw(view, alpha);
  drawMuzzle(game.muzzle);
  FX.drawAir(view);
  FX.drawTexts(view);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (game.blackout > 0.02) drawBlackout(game, camX, camY, time);
  const t3 = performance.now();
  G.hud.draw(time, alpha);
  const t4 = performance.now();
  timing.world = t1 - t0; timing.actors = t2 - t1; timing.fx = t3 - t2; timing.hud = t4 - t3;
}
function drawMuzzle(m) {
  if (!m) return;
  const s = m.scale * (0.7 + Math.random() * 0.5), t = (m.t / 0.05) * (Settings.reducedFlash ? 0.5 : 1);
  ctx.save(); ctx.translate(m.x, m.y); ctx.rotate(m.a);
  ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = HUE_COL[m.hue] || '#ffb347'; ctx.globalAlpha = t;
  ctx.beginPath(); ctx.moveTo(0, -7 * s); ctx.lineTo(26 * s, 0); ctx.lineTo(0, 7 * s); ctx.lineTo(8 * s, 0); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(2, 0); ctx.lineTo(10 * s, -13 * s); ctx.lineTo(14 * s, 0); ctx.lineTo(10 * s, 13 * s); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#fffbe0'; ctx.beginPath(); ctx.arc(4 * s, 0, 6 * s, 0, TAU); ctx.fill();
  ctx.restore(); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; R.draws += 3;
}
// Darkness with light cut-outs around the player, the aim cone, muzzle flashes and flickering emergency lights.
function drawBlackout(game, camX, camY, time) {
  if (!darkCv) darkCv = makeCanvas(V.w, V.h);
  if (darkCv.width !== V.w || darkCv.height !== V.h) { darkCv.width = V.w; darkCv.height = V.h; }
  const g = darkCv.getContext('2d'), z = V.zoom, S = (x, y) => [(x - camX) * z, (y - camY) * z], p = W.player;
  g.globalCompositeOperation = 'source-over'; g.clearRect(0, 0, V.w, V.h);
  g.fillStyle = `rgba(2,3,10,${0.9 * game.blackout})`; g.fillRect(0, 0, V.w, V.h);
  g.globalCompositeOperation = 'destination-out';
  const cut = (x, y, r, a) => { const [sx, sy] = S(x, y); g.globalAlpha = a; g.drawImage(GLOW.white, sx - r * z, sy - r * z, r * 2 * z, r * 2 * z); };
  cut(p.x, p.y, 240, 1); cut(p.x + Math.cos(p.a) * 160, p.y + Math.sin(p.a) * 160, 200, 0.8);
  for (const l of FX.lights) cut(l.x, l.y, l.r * 1.6, l.life / l.max);
  const em = [];
  for (const l of M.lights) { const [sx, sy] = S(l.x, l.y); if (sx > -100 && sx < V.w + 100 && sy > -100 && sy < V.h + 100 && Math.floor(l.x + l.y) % 3 === 0) em.push(l); }
  const flick = 0.5 + 0.5 * Math.sin(time * 9);
  for (const l of em) cut(l.x, l.y, 90, 0.5 * flick);
  g.globalAlpha = 1;
  ctx.drawImage(darkCv, 0, 0);
  if (Q.glow) {
    ctx.globalCompositeOperation = 'lighter';
    for (const l of em) { const [sx, sy] = S(l.x, l.y); ctx.globalAlpha = 0.35 * flick * game.blackout; ctx.drawImage(GLOW.red, sx - 70 * z, sy - 70 * z, 140 * z, 140 * z); }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }
}
