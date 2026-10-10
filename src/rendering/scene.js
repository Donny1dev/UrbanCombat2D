// Animated menu background (the real city at night with rain, neon and distant gunfire) and the intro sequence.
import { TAU, TILE, clamp, rand, randi } from "../core/util.js";
import { G } from "../core/registry.js";
import { ctx, V, GLOW, glow } from "../core/canvas.js";
import { Settings, Q } from "../core/settings.js";
import { Sound } from "../core/audio.js";
import { session } from "../core/storage.js";
import { M, MO, CELL, WORLD_W } from "../world/map.js";
import { ETYPES } from "../data/enemies.js";
import { SKIN } from "../data/cosmetics.js";
import { hash2 } from "../core/util.js";
import { ChunkCache, drawWorldStatic, drawDynamicTiles } from "./mapRender.js";
import { FX, Decals, P_SMOKE } from "./fx.js";
import { drawHuman, lookToOpts } from "./sprites.js";
import { getVignette } from "./hud.js";
import { enemyLook } from "../entities/enemies.js";

const timers = [];
const later = (t, fn) => timers.push({ t, fn });
function tickTimers(dt) { for (let i = timers.length - 1; i >= 0; i--) { timers[i].t -= dt; if (timers[i].t <= 0) { const f = timers[i].fn; timers.splice(i, 1); f(); } } }
export const Scene = {
  rain: [], neon: [], tracers: [],
  initRain() {
    this.rain = [];
    for (let i = 0; i < 160; i++) this.rain.push({ x: Math.random(), y: Math.random(), s: rand(0.6, 1.4) });
  },
  roadY() { return (MO + 2 * CELL + 2) * TILE; },
  // camera helpers: world drawn with the game's chunk renderer
  begin(cx, cy, z) {
    const vw = V.w / z, vh = V.h / z, camX = cx - vw / 2, camY = cy - vh / 2;
    ChunkCache.sync(clamp(Math.round(z * 4) / 4, 1, 2));
    ctx.setTransform(z, 0, 0, z, -camX * z, -camY * z);
    const v = { x0: camX - 60, y0: camY - 60, x1: camX + vw + 60, y1: camY + vh + 60, z, cx: camX, cy: camY };
    drawWorldStatic(camX, camY, vw, vh);
    Decals.draw(v);
    drawDynamicTiles(camX, camY, vw, vh, performance.now() / 1000);
    FX.drawGround(v);
    return { camX, camY, vw, vh, v };
  },
  neonAround(view, time) {
    ctx.globalCompositeOperation = 'lighter';
    for (const l of M.lights) {
      if (l.x < view.v.x0 || l.x > view.v.x1 || l.y < view.v.y0 || l.y > view.v.y1) continue;
      const h = hash2(Math.floor(l.x), Math.floor(l.y));
      if (h < 0.55) continue;
      const blink = Math.sin(time * (2 + h * 5) + h * 40) > -0.6 || Math.floor(time * 13 + h * 9) % 7 !== 0;
      glow(h > 0.8 ? GLOW.magenta : h > 0.68 ? GLOW.xp : GLOW.warm, l.x, l.y, 70 + h * 40, blink ? 0.35 : 0.08);
    }
    ctx.globalCompositeOperation = 'source-over';
  },
  drawTracers(dt) {
    ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i]; t.life -= dt;
      if (t.life <= 0) { this.tracers.splice(i, 1); continue; }
      ctx.globalAlpha = t.life / t.max; ctx.strokeStyle = t.col || '#ffd27a'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(t.x1, t.y1); ctx.lineTo(t.x2, t.y2); ctx.stroke();
      ctx.strokeStyle = '#fffbe8'; ctx.lineWidth = 1.5; ctx.stroke();
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  },
  overlayRain(dt, alpha = 1) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (!Q.menuAnim) { ctx.drawImage(getVignette(), 0, 0); return; }   // LOW quality / reduced motion: no rain
    ctx.strokeStyle = `rgba(170,200,255,${0.22 * alpha})`; ctx.lineWidth = 1.2 * V.px;
    ctx.beginPath();
    for (const r of this.rain) {
      r.y += dt * 0.9 * r.s; r.x += dt * 0.18 * r.s;
      if (r.y > 1) { r.y -= 1; r.x = Math.random(); } if (r.x > 1) r.x -= 1;
      const x = r.x * V.w, y = r.y * V.h;
      ctx.moveTo(x, y); ctx.lineTo(x - 5 * V.px * r.s, y - 18 * V.px * r.s);
    }
    ctx.stroke();
    ctx.drawImage(getVignette(), 0, 0);
  },
};

export const MenuScene = {
  x: 0, walkerX: 0, flashT: 1, t: 0, smokeT: 0, lastLook: null,
  enter() {
    FX.reset(); Decals.reset(); Scene.tracers.length = 0; Scene.initRain();
    this.x = (MO + CELL) * TILE; this.walkerX = this.x - 500; this.t = 0;
  },
  update(dt) {
    this.t += dt;
    this.x += dt * 26;
    if (this.x > WORLD_W - 1400) this.x = (MO + CELL) * TILE;
    this.walkerX += dt * 62;
    if (this.walkerX > this.x + 900) this.walkerX = this.x - 900;
    this.flashT -= dt;
    if (this.flashT <= 0) {   // distant gunfire somewhere in the street
      this.flashT = rand(1.4, 3.2);
      const fx = this.x + rand(-700, 700), fy = Scene.roadY() + rand(-420, 380), a = rand(TAU);
      for (let i = 0; i < randi(2, 5); i++) later(i * 0.09, () => {
        FX.light(fx, fy, 90, 0.08, GLOW.fire, 0.9); FX.muzzle(fx, fy, a, 1, null);
        Scene.tracers.push({ x1: fx, y1: fy, x2: fx + Math.cos(a + rand(-0.05, 0.05)) * 380, y2: fy + Math.sin(a + rand(-0.05, 0.05)) * 380, life: 0.09, max: 0.09 });
      });
    }
    this.smokeT -= Q.menuAnim ? dt : 0;
    if (this.smokeT <= 0) { this.smokeT = 0.25; FX.add(P_SMOKE, this.x + rand(-700, 700), Scene.roadY() + rand(-400, 400), rand(5, 20), rand(-10, 10), rand(3, 5), rand(20, 40), 'rgba(120,130,150,', { grow: 8, a: 0.12, drag: 0.2 }); }
    tickTimers(dt); FX.update(dt);
  },
  render(dt, time) {
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#0d0e12'; ctx.fillRect(0, 0, V.w, V.h);
    const z = V.zoom * 1.1, cy = Scene.roadY() + 40;
    const view = Scene.begin(this.x + V.w / z * 0.18, cy, z);
    Scene.neonAround(view, time);
    const wy = Scene.roadY() + 2.2 * TILE, look = lookToOpts(G.profileLook());
    drawHuman(ctx, this.walkerX, wy, Object.assign({}, look, { a: Math.sin(time * 0.6) * 0.25, phase: time * 6, moving: true, scale: 1.15, weapon: 'rifle' }));
    Scene.drawTracers(dt);
    FX.drawAir(view.v);
    Scene.overlayRain(dt);
  },
};

// 0-1s black · 1-2 street fades in, lamp flickers · 2-3 hero walks in, camera pushes · 3-4 enemy, gunfire · 4-5 freeze + title slam · 5-6 to menu
export const Intro = {
  t: 0, done: false, enemyDead: false, shots: 0,
  shouldPlay() { return !Settings.reducedMotion && !session('uc_intro'); },
  start() {
    G.game.state = 'intro'; this.t = 0; this.done = false; this.enemyDead = false; this.shots = 0;
    FX.reset(); Decals.reset(); Scene.tracers.length = 0; Scene.initRain();
    this.cx = (MO + 2 * CELL + 10) * TILE; this.cy = Scene.roadY();
    G.ui.show('intro'); document.getElementById('intro').classList.remove('slam');
    Sound.ambience();
  },
  skip() { if (G.game.state === 'intro' && !this.done) this.finish(); },
  finish() {
    this.done = true;
    session('uc_intro', '1');
    document.getElementById('intro').classList.remove('slam');
    G.afterIntro ? G.afterIntro() : G.ui.toMenu();
  },
  update(dt) {
    const prev = this.t;
    this.t += dt;
    const t = this.t, frozen = t > 4 && t < 4.9;
    if (!frozen) { tickTimers(dt); FX.update(dt); }
    const at = s => prev < s && t >= s;
    if (at(3.25) || at(3.42) || at(3.6)) this.fire();
    if (at(3.62)) { this.enemyDead = true; FX.deathPop(this.cx + 210, this.cy - 10, '#7a3fb5', true, 0); Decals.add('splat', this.cx + 220, this.cy - 10, 0, 1.2); Sound.kill(true); }
    if (at(4)) { document.getElementById('intro').classList.add('slam'); Sound.boss(); }
    if (t > 6) this.finish();
  },
  fire() {
    const hx = this.heroX() + 26, hy = this.cy + 2, ex = this.cx + 210, ey = this.cy - 10;
    const a = Math.atan2(ey - hy, ex - hx);
    FX.muzzle(hx, hy, a, 1.3, null); FX.light(hx, hy, 160, 0.12, GLOW.fire, 1); FX.casing(hx - 20, hy, a, false);
    Scene.tracers.push({ x1: hx, y1: hy, x2: ex, y2: ey, life: 0.12, max: 0.12 });
    FX.impact(ex, ey, a, 'flesh');
    Sound.shoot('rifle'); this.shots++;
  },
  heroX() { return this.cx - 420 + clamp((this.t - 2) / 1.1, 0, 1) * 300; },
  render(dt, time) {
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, V.w, V.h);
    const t = this.t;
    if (t < 1) { Scene.overlayRain(dt, t); return; }
    const z = V.zoom * (1 + clamp((t - 2) / 2, 0, 1) * 0.18);
    const view = Scene.begin(this.cx - 40, this.cy, z);
    // a single streetlight sputters on
    const lampOn = t > 1.4 && !(t > 1.55 && t < 1.65) && !(t > 1.75 && t < 1.8);
    ctx.globalCompositeOperation = 'lighter'; glow(GLOW.warm, this.cx - 80, this.cy - 120, 300, lampOn ? 0.55 : 0.05); ctx.globalCompositeOperation = 'source-over';
    const look = lookToOpts(G.profileLook());
    if (t > 2) drawHuman(ctx, this.heroX(), this.cy + 2, Object.assign({}, look, { a: t > 3 ? Math.atan2(-12, 230) : 0, phase: t * 7, moving: t < 3.1, scale: 1.2, weapon: 'rifle', recoil: Scene.tracers.length ? 6 : 0 }));
    if (t > 2.9 && !this.enemyDead) {
      ctx.globalAlpha = clamp((t - 2.9) / 0.3, 0, 1);
      drawHuman(ctx, this.cx + 210, this.cy - 10, Object.assign(enemyLook({ d: ETYPES.gunman, skin: SKIN[2] }), { a: Math.PI, scale: 1.2, weapon: 'pistol', flash: false }));
      ctx.globalAlpha = 1;
    }
    Scene.drawTracers(t > 4 && t < 4.9 ? 0 : dt);
    FX.drawAir(view.v);
    Scene.overlayRain(dt);
    const fade = t < 2 ? 1 - (t - 1) * 0.65 : t > 5.2 ? (t - 5.2) / 0.8 * 0.6 : 0.35 - clamp((t - 2) / 2, 0, 1) * 0.35;
    ctx.fillStyle = `rgba(0,0,0,${clamp(fade, 0, 1)})`; ctx.fillRect(0, 0, V.w, V.h);
    if (t > 4 && t < 4.15) { ctx.fillStyle = `rgba(255,255,255,${(4.15 - t) * 4})`; ctx.fillRect(0, 0, V.w, V.h); }
  },
};
document.getElementById('intro').addEventListener('click', () => Intro.skip());
