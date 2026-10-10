// Layered procedural characters and weapons (shared by gameplay, menus and the character designer).
import { TAU, lerp } from "../core/util.js";
import { rr, makeCanvas, ctx, R } from "../core/canvas.js";
import { GUN_SHAPES } from "../data/weapons.js";
import { SKIN, ACCENTS } from "../data/cosmetics.js";
export const OUTLINE = '#0b0b0f';
export function drawGun(g, kind, x, y, flash, evolved) {
  const [len, th] = GUN_SHAPES[kind] || GUN_SHAPES.pistol;
  g.fillStyle = flash ? '#fff' : evolved ? '#2a2210' : '#1c1d22';
  g.strokeStyle = OUTLINE; g.lineWidth = 2.5;
  g.beginPath(); g.rect(x, y - th / 2, len, th); g.fill(); g.stroke();
  if (!flash) {
    g.fillStyle = evolved ? '#ffc93c' : '#4a4d58';
    g.fillRect(x + 2, y - th / 2 + 1, len - 4, 1.5);
    if (kind === 'smg' || kind === 'rifle') { g.fillStyle = '#1c1d22'; g.fillRect(x + len * 0.35, y + th / 2 - 1, 4, 6); }
    if (kind === 'heavy') { g.fillStyle = '#2b2e38'; g.fillRect(x + 8, y - th / 2 - 3, 10, 3); }
    if (kind === 'shotgun') { g.fillStyle = '#6b4a2e'; g.fillRect(x + len * 0.45, y - th / 2, 7, th); }
    if (evolved) { g.fillStyle = 'rgba(255,201,60,0.8)'; g.fillRect(x + len - 3, y - th / 2, 3, th); }
  }
}
const BUILDS = { slim: [8, 12.5], normal: [9, 14], broad: [10.5, 15.5] };

// Options (all optional): a, phase, moving, scale, sx, sy, flash, recoil, altRecoil, evolved, swing, weapon,
// jacket, skin, hair, style, vest, eyes, build, top, pants, shorts, boots, gloves, mask, maskCol, glasses,
// backpack, pads, accent
export function drawHuman(g, x, y, o) {
  const s = o.scale || 1, fl = o.flash;
  const [trx, try_] = BUILDS[o.build] || BUILDS.normal;
  if (!o.noShadow) { g.fillStyle = 'rgba(0,0,0,0.33)'; g.beginPath(); g.ellipse(x + 4 * s, y + 6 * s, (trx + 6) * s, (try_ - 2) * s, 0, 0, TAU); g.fill(); }
  g.save();
  g.translate(x, y); g.rotate(o.a);
  g.scale(s * (o.sx || 1), s * (o.sy || 1));
  g.lineJoin = 'round'; g.lineCap = 'round';
  const W = c => fl ? '#ffffff' : c;
  const jacket = W(o.jacket), skin = W(o.skin || SKIN[0]);
  const hand = W(o.gloves || o.skin || SKIN[0]);
  const step = Math.sin(o.phase || 0) * 7 * (o.moving ? 1 : 0);
  // ---- 1-2. legs + feet ----
  if (o.pants) {
    g.lineWidth = 7.5; g.strokeStyle = OUTLINE;
    g.beginPath(); g.moveTo(-1, -5); g.lineTo(step, -6); g.moveTo(-1, 5); g.lineTo(-step, 6); g.stroke();
    g.lineWidth = 4.5; g.strokeStyle = W(o.pants);
    g.beginPath(); g.moveTo(-1, -5); g.lineTo(step * (o.shorts ? 0.5 : 1), -6); g.moveTo(-1, 5); g.lineTo(-step * (o.shorts ? 0.5 : 1), 6); g.stroke();
    if (o.shorts && o.moving) { g.strokeStyle = skin; g.beginPath(); g.moveTo(step * 0.5, -6); g.lineTo(step, -6); g.moveTo(-step * 0.5, 6); g.lineTo(-step, 6); g.stroke(); }
  }
  g.fillStyle = W(o.boots || '#18181d');
  g.beginPath(); g.ellipse(step, -6, 5, 3.6, 0, 0, TAU); g.fill();
  g.beginPath(); g.ellipse(-step, 6, 5, 3.6, 0, 0, TAU); g.fill();
  // ---- backpack (behind torso) ----
  if (o.backpack) {
    g.fillStyle = W(o.backpack); g.strokeStyle = OUTLINE; g.lineWidth = 2.5;
    rr(g, -trx - 7, -try_ * 0.6, 9, try_ * 1.2, 3); g.fill(); g.stroke();
    if (!fl) { g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(-trx - 6, -2, 7, 4); }
  }
  // ---- 3. arms + weapon ----
  const bareArms = o.top === 'tshirt' || o.top === 'tank';
  const sh = try_ - 4;
  const armTo = (ax, ay, hx, hy) => {
    g.strokeStyle = OUTLINE; g.lineWidth = 8.5; g.beginPath(); g.moveTo(ax, ay); g.lineTo(hx, hy); g.stroke();
    g.strokeStyle = bareArms ? skin : jacket; g.lineWidth = 5; g.beginPath(); g.moveTo(ax, ay); g.lineTo(hx, hy); g.stroke();
    if (o.top === 'tshirt') { g.strokeStyle = jacket; g.beginPath(); g.moveTo(ax, ay); g.lineTo(lerp(ax, hx, 0.35), lerp(ay, hy, 0.35)); g.stroke(); }
    g.fillStyle = hand; g.strokeStyle = OUTLINE; g.lineWidth = 2; g.beginPath(); g.arc(hx, hy, 3.4, 0, TAU); g.fill(); g.stroke();
  };
  const rec = o.recoil || 0, w = o.weapon;
  if (w === 'bat' || w === 'knife' || w === 'pipe') {
    const sw = o.swing || 0;
    const ang = sw > 0 ? lerp(-1.5, 1.3, Math.sin(sw * Math.PI * 0.5)) : -0.6;
    const hx = 12 + Math.cos(ang) * 4, hy = 4 + Math.sin(ang) * 10;
    armTo(-1, -sh, 10, -9);
    g.save(); g.translate(hx, hy); g.rotate(ang + 0.6);
    const L = w === 'knife' ? 12 : w === 'pipe' ? 26 : 28;
    g.fillStyle = fl ? '#fff' : w === 'knife' ? '#d8dde6' : w === 'pipe' ? '#8a8f9a' : '#a8743c';
    g.strokeStyle = OUTLINE; g.lineWidth = 2.5;
    g.beginPath();
    if (w === 'bat') { g.moveTo(0, -2); g.lineTo(L, -4.5); g.lineTo(L, 4.5); g.lineTo(0, 2); }
    else g.rect(0, -2, L, 4);
    g.closePath(); g.fill(); g.stroke();
    g.restore();
    armTo(-1, sh, hx, hy);
  } else if (w === 'fists') {
    const p = o.swing ? Math.sin(o.swing * Math.PI) * 10 : 0;
    armTo(-1, -sh - 1, 13 + p, -8); armTo(-1, sh + 1, 13, 8);
  } else if (w === 'dual') {
    const r2 = o.altRecoil || 0;
    drawGun(g, 'dual', 14 - rec, -8, fl, o.evolved); drawGun(g, 'dual', 14 - r2, 8, fl, o.evolved);
    armTo(-1, -sh, 15 - rec, -8); armTo(-1, sh, 15 - r2, 8);
  } else if (w) {
    const long = w === 'rifle' || w === 'heavy' || w === 'shotgun' || w === 'smg';
    const gx = (long ? 8 : 13) - rec;
    drawGun(g, w, gx, 1.5, fl, o.evolved);
    armTo(-1, -sh, gx + 2, 0);
    armTo(-1, sh, long ? gx + 11 : gx + 2, 3);
  }
  // ---- 4. torso ----
  if (o.top === 'hoodie' && !fl) { g.fillStyle = jacket; g.strokeStyle = OUTLINE; g.lineWidth = 3; g.beginPath(); g.ellipse(-5, 0, 6, 8, 0, 0, TAU); g.fill(); g.stroke(); }
  g.fillStyle = jacket; g.strokeStyle = o.accent && !fl ? o.accent : OUTLINE; g.lineWidth = 3;
  g.beginPath(); g.ellipse(-1, 0, trx, try_, 0, 0, TAU); g.fill(); g.stroke();
  if (!fl) {
    if (o.top === 'tank') { g.fillStyle = skin; g.beginPath(); g.ellipse(-1, -try_ + 3, 3, 2.5, 0, 0, TAU); g.ellipse(-1, try_ - 3, 3, 2.5, 0, 0, TAU); g.fill(); }
    g.fillStyle = 'rgba(255,255,255,0.16)'; g.beginPath(); g.ellipse(1, -4, trx * 0.55, try_ * 0.55, 0.3, 0, TAU); g.fill();
    if (o.top === 'jacket' || !o.top) { g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(trx - 2, -try_ * 0.6); g.lineTo(trx - 2, try_ * 0.6); g.stroke(); }
    if (o.accent) { g.fillStyle = o.accent; g.fillRect(-trx + 2, -try_ * 0.75, 2.5, try_ * 1.5); }
    // ---- 5. vest / pads ----
    if (o.vest) {
      g.fillStyle = o.vest; g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 1.5;
      g.beginPath(); g.ellipse(-1, 0, trx * 0.7, try_ * 0.72, 0, 0, TAU); g.fill(); g.stroke();
      if (o.top === 'vest') { g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(2, -try_ * 0.5, 3, 4); g.fillRect(2, try_ * 0.5 - 4, 3, 4); g.fillRect(2, -2, 3, 4); }
    }
    if (o.pads) { g.fillStyle = o.pads; g.strokeStyle = OUTLINE; g.lineWidth = 2; for (const sy of [-1, 1]) { g.beginPath(); g.ellipse(-1, sy * (try_ - 2), 5, 4, 0, 0, TAU); g.fill(); g.stroke(); } }
  }
  // ---- 6. head + headgear ----
  const st = o.style;
  if (!fl && st === 'afro') { g.fillStyle = o.hair; g.strokeStyle = OUTLINE; g.lineWidth = 3; g.beginPath(); g.arc(-1.5, 0, 10.5, 0, TAU); g.fill(); g.stroke(); }
  if (!fl && st === 'long') { g.fillStyle = o.hair; g.strokeStyle = OUTLINE; g.lineWidth = 3; g.beginPath(); g.ellipse(-5, 0, 8, 8.5, 0, 0, TAU); g.fill(); g.stroke(); }
  const balaclava = o.mask === 'balaclava' && !fl;
  g.fillStyle = balaclava ? (o.maskCol || '#1c1d22') : skin; g.strokeStyle = OUTLINE; g.lineWidth = 3;
  g.beginPath(); g.arc(1, 0, 7.5, 0, TAU); g.fill(); g.stroke();
  if (!fl) {
    const hc = o.hair || '#2a1a10';
    if (st === 'cap') { g.fillStyle = hc; g.beginPath(); g.arc(0, 0, 7.6, Math.PI * 0.5, Math.PI * 1.5); g.fill(); g.fillRect(-1, -7, 4, 14); g.fillRect(3, -5, 6, 10); }
    else if (st === 'helmet') { g.fillStyle = hc; g.beginPath(); g.arc(0, 0, 8.4, 0, TAU); g.fill(); g.strokeStyle = OUTLINE; g.lineWidth = 2; g.stroke(); g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(4, -5, 3.5, 10); }
    else if (st === 'bandana') { g.fillStyle = hc; g.beginPath(); g.arc(0, 0, 7.6, Math.PI * 0.45, Math.PI * 1.55); g.fill(); g.fillRect(-11, -2, 5, 2.5); g.fillRect(-11, 1, 4, 2.5); }
    else if (st === 'mohawk') { g.fillStyle = hc; g.fillRect(-7, -1.8, 12, 3.6); }
    else if (st === 'bald') { g.fillStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.arc(-1, -2, 2.5, 0, TAU); g.fill(); }
    else if (st === 'hood') { g.fillStyle = hc; g.beginPath(); g.arc(-0.5, 0, 8.6, Math.PI * 0.35, Math.PI * 1.65); g.fill(); g.strokeStyle = OUTLINE; g.lineWidth = 2; g.stroke(); }
    else if (st === 'beanie') { g.fillStyle = hc; g.beginPath(); g.arc(0.5, 0, 8, Math.PI * 0.38, Math.PI * 1.62); g.fill(); g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 2; g.beginPath(); g.arc(0.5, 0, 6.5, Math.PI * 0.42, Math.PI * 1.58); g.stroke(); g.fillStyle = hc; g.beginPath(); g.arc(-6, 0, 2.5, 0, TAU); g.fill(); }
    else if (st === 'afro') { g.fillStyle = hc; g.beginPath(); g.arc(-0.5, 0, 7.6, Math.PI * 0.6, Math.PI * 1.4); g.fill(); }
    else if (st === 'long') { g.fillStyle = hc; g.beginPath(); g.arc(-0.5, 0, 7.8, Math.PI * 0.5, Math.PI * 1.5); g.fill(); }
    else if (!balaclava) { g.fillStyle = hc; g.beginPath(); g.arc(-0.5, 0, 7.6, Math.PI * 0.55, Math.PI * 1.45); g.fill(); }
    // ---- 7. masks + glasses ----
    const m = o.mask;
    if (m === 'bandana') { g.fillStyle = o.maskCol || '#b3202c'; g.beginPath(); g.arc(1, 0, 7.6, -Math.PI * 0.42, Math.PI * 0.42); g.closePath(); g.fill(); g.fillRect(-8, -1, 3, 2); }
    else if (m === 'balaclava') { g.fillStyle = skin; g.fillRect(4, -4.5, 3, 9); }
    else if (m === 'skull') { g.fillStyle = '#ecebe4'; g.beginPath(); g.arc(1, 0, 7.4, -Math.PI * 0.45, Math.PI * 0.45); g.closePath(); g.fill(); g.fillStyle = '#111'; g.fillRect(4.5, -4, 2.2, 2.2); g.fillRect(4.5, 1.8, 2.2, 2.2); g.fillRect(7, -0.6, 1.2, 1.2); }
    else if (m === 'gas') { g.fillStyle = o.maskCol || '#3a3d44'; g.beginPath(); g.arc(1, 0, 7.6, -Math.PI * 0.45, Math.PI * 0.45); g.closePath(); g.fill(); g.strokeStyle = OUTLINE; g.lineWidth = 2; g.beginPath(); g.arc(9, 0, 3, 0, TAU); g.fillStyle = '#5b5e66'; g.fill(); g.stroke(); g.fillStyle = 'rgba(160,230,255,0.7)'; g.fillRect(4, -5, 2.5, 3.5); g.fillRect(4, 1.5, 2.5, 3.5); }
    if (o.glasses === 'shades') { g.fillStyle = '#0b0b0f'; g.fillRect(4.5, -5, 3, 4); g.fillRect(4.5, 1, 3, 4); g.fillRect(5.5, -1, 1.5, 2); g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(5, -4.5, 1, 1.2); }
    else if (o.glasses === 'visor') { g.fillStyle = 'rgba(46,242,255,0.75)'; g.fillRect(4.5, -5.5, 2.8, 11); }
    if (o.eyes) { g.fillStyle = o.eyes; g.fillRect(5, -3.5, 2.5, 2.2); g.fillRect(5, 1.3, 2.5, 2.2); }
  }
  g.restore();
}


// ---------- player cosmetics -> drawHuman options ----------
export function lookToOpts(L) {
  return {
    skin: SKIN[L.skin] || SKIN[0], build: L.build, top: L.top, jacket: L.topCol,
    vest: L.vest === 'plate' || L.top === 'vest' ? L.vestCol : null, gloves: L.gloves === 'gloves' ? L.glovesCol : null,
    style: L.style, hair: L.hairCol, mask: L.mask === 'none' ? null : L.mask, maskCol: L.maskCol, glasses: L.glasses === 'none' ? null : L.glasses,
    pants: L.pants, shorts: L.shorts, boots: L.boots, backpack: L.backpack === 'pack' ? L.backpackCol : null,
    pads: L.pads ? '#3a3d44' : null, accent: ACCENTS[L.accent] || null,
  };
}
// Equipped armour is visible on the character (vest plates, helmet, pads, shield shimmer handled by renderer).
export function armourLook(opts, armourId) {
  const o = { ...opts };
  if (armourId === 'kevlar') o.vest = o.vest || '#3b4a2f';
  else if (armourId === 'carrier') o.vest = o.vest || '#5a5f6a';
  else if (armourId === 'ceramic') { o.vest = '#c8ccd8'; o.pads = o.pads || '#8c8f99'; }
  else if (armourId === 'reactiveA') { o.vest = '#ff9a1f'; }
  else if (armourId === 'helmet') { o.style = 'helmet'; o.hair = '#3a3d44'; }
  else if (armourId === 'harness') { o.vest = '#b3202c'; }
  else if (armourId === 'eshield') { o.vest = o.vest || '#2f4f6f'; o.accent = o.accent || '#2ef2ff'; }
  else if (armourId === 'juggernaut') { o.vest = '#4a4d58'; o.pads = '#2b2e35'; o.build = 'broad'; }
  return o;
}

// ---------- cached character sprites (enemies, corpses, ghosts) ----------
// A pose is rendered once per (key, walk frame, flash, resolution) and then drawn with one transformed
// drawImage. Animated poses (melee swings, aiming recoil) still use the live drawHuman path.
const spriteCache = new Map();
const BOX = { x0: -28, x1: 50, y0: -28, y1: 28 };
export function clearSpriteCache() { spriteCache.clear(); }
function cachedPose(key, opts, frame, flash, k, shadowBaked) {
  const ck = key + '|' + frame + '|' + (flash ? 1 : 0) + '|' + k + (shadowBaked ? 's' : '');
  let s = spriteCache.get(ck);
  if (s) return s;
  const sc = (opts.scale || 1) * k;
  const w = Math.ceil((BOX.x1 - BOX.x0) * sc), h = Math.ceil((BOX.y1 - BOX.y0) * sc);
  const c = makeCanvas(w, h), g = c.getContext('2d');
  const ox = -BOX.x0 * sc, oy = -BOX.y0 * sc;
  g.translate(ox, oy); g.scale(k, k);
  if (shadowBaked) { g.fillStyle = 'rgba(0,0,0,0.33)'; g.beginPath(); g.ellipse(4, 6, 15, 12, 0, 0, TAU); g.fill(); }
  drawHuman(g, 0, 0, { ...opts, a: 0, phase: frame === 0 ? 0 : (frame / 4) * Math.PI * 2, moving: frame !== 0, flash, noShadow: true });
  s = { c, ox, oy, k };
  if (spriteCache.size > 400) spriteCache.delete(spriteCache.keys().next().value);
  spriteCache.set(ck, s);
  return s;
}
// v: render view { z, cx, cy }. phase -> one of 4 walk frames (0 = standing)
export function drawHumanCached(v, x, y, a, opts, key, phase, moving, flash, sx = 1, sy = 1, shadow = true) {
  const z = v.z, k = Math.max(0.5, Math.round(z * 2) / 2);
  const frame = moving ? 1 + (((Math.floor(phase / (Math.PI / 2)) % 4) + 4) % 4) : 0;   // 4 walk frames
  const s = cachedPose(key, opts, frame, flash, k, shadow);
  const m = z / k, c = Math.cos(a) * m, sn = Math.sin(a) * m;
  ctx.setTransform(c * sx, sn * sx, -sn * sy, c * sy, (x - v.cx) * z, (y - v.cy) * z);
  ctx.drawImage(s.c, -s.ox, -s.oy); R.draws++;
  ctx.setTransform(z, 0, 0, z, -v.cx * z, -v.cy * z);
}
