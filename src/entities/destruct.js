// Destructible tiles (glass, crates, barrels) and timed barrier walls (player Emergency Barrier + Engineer boss).
import { TILE, TAU, vrand, dist2 } from '../core/util.js';
import { G, W } from '../core/registry.js';
import { Sound } from '../core/audio.js';
import { M, MW, idx, inMap, objAt, setT, O_NONE, O_GLASS, O_CRATE, O_BARREL, O_BARRIER } from '../world/map.js';
import { FX, Decals } from '../rendering/fx.js';

export const Destruct = {
  barriers: [],
  reset() { this.barriers.length = 0; },
  damageTile(tx, ty, dmg, angle = 0, fromEnemy = false) {
    if (!inMap(tx, ty)) return false;
    const i = idx(tx, ty), o = M.obj[i];
    const cx = (tx + 0.5) * TILE, cy = (ty + 0.5) * TILE;
    if (o === O_GLASS) {
      setT(tx, ty, null, O_NONE); M.dirty = true;
      FX.glassBurst(cx, cy, angle); Sound.glass(); Decals.add('glass', cx, cy, vrand(TAU), 1);
      return true;
    }
    if (o === O_CRATE || o === O_BARREL) {
      M.hp[i] -= dmg;
      if (M.hp[i] <= 0) {
        setT(tx, ty, null, O_NONE); M.dirty = true;
        if (o === O_CRATE) { FX.crateBurst(cx, cy); Sound.crate(); if (Math.random() < 0.12) G.pickups.health(cx, cy, 20); }
        else { G.game.explosion(cx, cy, 120, 80, 'barrel'); Decals.add('scorch', cx, cy, vrand(TAU), 1.6); }
        return true;
      }
    }
    if (o === O_BARRIER) {
      const enemyWall = M.wcol[i] === 9;
      if (fromEnemy === enemyWall) return false;          // your own cover is bulletproof to your shots
      M.hp[i] -= dmg;
      if (M.hp[i] <= 0) { this.removeTile(i); FX.crateBurst(cx, cy); Sound.crate(); return true; }
    }
    return false;
  },
  damageTilesInRadius(x, y, r, dmg) {
    const x0 = Math.floor((x - r) / TILE), x1 = Math.floor((x + r) / TILE), y0 = Math.floor((y - r) / TILE), y1 = Math.floor((y + r) / TILE);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
      const o = objAt(tx, ty);
      if ((o === O_CRATE || o === O_BARREL || o === O_GLASS) && dist2((tx + 0.5) * TILE, (ty + 0.5) * TILE, x, y) < r * r) this.damageTile(tx, ty, dmg, Math.atan2((ty + 0.5) * TILE - y, (tx + 0.5) * TILE - x));
    }
  },
  // Places a wall segment of `len` tiles centred `ahead` tiles in front of (x,y), perpendicular to angle a.
  // Tiles that are occupied, or where the player/enemies stand, are skipped so nobody is ever trapped inside.
  placeBarrier(x, y, a, len, hp, dur, owner, opts = {}) {
    const fx = x + Math.cos(a) * TILE * (opts.ahead || 1.6), fy = y + Math.sin(a) * TILE * (opts.ahead || 1.6);
    const px = -Math.sin(a), py = Math.cos(a), tiles = [];
    for (let k = 0; k < len; k++) {
      const off = (k - (len - 1) / 2) * TILE, tx = Math.floor((fx + px * off) / TILE), ty = Math.floor((fy + py * off) / TILE);
      if (!inMap(tx, ty) || objAt(tx, ty) !== O_NONE) continue;
      const cx = (tx + 0.5) * TILE, cy = (ty + 0.5) * TILE;
      if (W.player && dist2(cx, cy, W.player.x, W.player.y) < (TILE * 0.75) ** 2) continue;
      if (W.enemies.some(e => !e.dead && dist2(cx, cy, e.x, e.y) < (TILE * 0.7) ** 2)) continue;
      const i = idx(tx, ty);
      if (tiles.includes(i)) continue;
      M.obj[i] = O_BARRIER; M.hp[i] = hp; M.hpMax[i] = hp; M.wcol[i] = owner === 'enemy' ? 9 : 0;
      tiles.push(i);
    }
    if (!tiles.length) return null;
    M.dirty = true;
    const b = { tiles, t: dur, owner, ...opts };
    this.barriers.push(b);
    return b;
  },
  removeTile(i) {
    if (M.obj[i] !== O_BARRIER) return;
    M.obj[i] = O_NONE; M.hp[i] = 0; M.hpMax[i] = 0; M.wcol[i] = 0; M.dirty = true;
  },
  update(dt) {
    for (let k = this.barriers.length - 1; k >= 0; k--) {
      const b = this.barriers[k];
      b.t -= dt;
      const alive = b.tiles.filter(i => M.obj[i] === O_BARRIER);
      if (b.touchDps && alive.length) {   // Emergency Barrier (epic): enemies touching it take damage
        b.tick = (b.tick || 0) - dt;
        if (b.tick <= 0) {
          b.tick = 0.25;
          for (const i of alive) { const cx = (i % MW + 0.5) * TILE, cy = (Math.floor(i / MW) + 0.5) * TILE; G.grid.query(cx, cy, 60, e => { if (dist2(cx, cy, e.x, e.y) < (TILE * 0.5 + e.r + 6) ** 2) G.game.damageEnemy(e, b.touchDps * 0.25, Math.atan2(e.y - cy, e.x - cx), 120, false, 'gadget'); }); }
        }
      }
      if (b.t <= 0 || !alive.length) {
        for (const i of b.tiles) this.removeTile(i);
        if (b.onEnd) b.onEnd(b);
        this.barriers.splice(k, 1);
      }
    }
  },
  centre(b) { let x = 0, y = 0; for (const i of b.tiles) { x += (i % MW + 0.5) * TILE; y += (Math.floor(i / MW) + 0.5) * TILE; } return [x / b.tiles.length, y / b.tiles.length]; },
};
