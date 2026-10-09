// ===================== SPRITES: programmatic characters, weapons, icons =====================
const OUTLINE = '#0b0b0f';
const GUN_SHAPES = {   // length, thickness, grip offset
  pistol: [13, 5], smg: [18, 6], rifle: [28, 5], shotgun: [25, 7], dual: [12, 5], heavy: [34, 7],
};
function drawGun(g, kind, x, y, flash, evolved) {
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
  }
}
const SKIN = ['#f1c6a0', '#d9a074', '#a86b45', '#7a4a2c', '#ffd9b8'];
// opts: a (facing), phase, scale, jacket, skin, hair, style, weapon, flash, recoil, sx, sy (squash), swing (0..1), glow
function drawHuman(g, x, y, o) {
  const s = o.scale || 1, fl = o.flash;
  // drop shadow
  g.fillStyle = 'rgba(0,0,0,0.33)';
  g.beginPath(); g.ellipse(x + 4 * s, y + 6 * s, 15 * s, 12 * s, 0, 0, TAU); g.fill();
  g.save();
  g.translate(x, y); g.rotate(o.a);
  g.scale(s * (o.sx || 1), s * (o.sy || 1));
  g.lineJoin = 'round'; g.lineCap = 'round';
  const step = Math.sin(o.phase || 0) * 7 * (o.moving ? 1 : 0);
  // feet
  g.fillStyle = fl ? '#fff' : '#18181d';
  g.beginPath(); g.ellipse(step, -6, 5, 3.6, 0, 0, TAU); g.fill();
  g.beginPath(); g.ellipse(-step, 6, 5, 3.6, 0, 0, TAU); g.fill();
  const jacket = fl ? '#ffffff' : o.jacket, skin = fl ? '#ffffff' : (o.skin || SKIN[0]);
  const rec = o.recoil || 0, w = o.weapon;
  // arms + weapon
  g.strokeStyle = OUTLINE; g.lineWidth = 8.5;
  const armTo = (ax, ay, hx, hy) => {
    g.strokeStyle = OUTLINE; g.lineWidth = 8.5; g.beginPath(); g.moveTo(ax, ay); g.lineTo(hx, hy); g.stroke();
    g.strokeStyle = jacket; g.lineWidth = 5; g.beginPath(); g.moveTo(ax, ay); g.lineTo(hx, hy); g.stroke();
    g.fillStyle = skin; g.strokeStyle = OUTLINE; g.lineWidth = 2; g.beginPath(); g.arc(hx, hy, 3.4, 0, TAU); g.fill(); g.stroke();
  };
  if (w === 'bat' || w === 'knife' || w === 'pipe') {
    const sw = o.swing || 0;                        // 0 idle, 0..1 swinging
    const ang = sw > 0 ? lerp(-1.5, 1.3, Math.sin(sw * Math.PI * 0.5)) : -0.6;
    const hx = 12 + Math.cos(ang) * 4, hy = 4 + Math.sin(ang) * 10;
    armTo(-1, -10, 10, -9);
    g.save(); g.translate(hx, hy); g.rotate(ang + 0.6);
    const L = w === 'knife' ? 12 : w === 'pipe' ? 26 : 28;
    g.fillStyle = fl ? '#fff' : w === 'knife' ? '#d8dde6' : w === 'pipe' ? '#8a8f9a' : '#a8743c';
    g.strokeStyle = OUTLINE; g.lineWidth = 2.5;
    g.beginPath();
    if (w === 'bat') { g.moveTo(0, -2); g.lineTo(L, -4.5); g.lineTo(L, 4.5); g.lineTo(0, 2); }
    else g.rect(0, -2, L, 4);
    g.closePath(); g.fill(); g.stroke();
    g.restore();
    armTo(-1, 10, hx, hy);
  } else if (w === 'fists') {
    const p = o.swing ? Math.sin(o.swing * Math.PI) * 10 : 0;
    armTo(-1, -11, 13 + p, -8); armTo(-1, 11, 13 + (o.swing ? 0 : 0), 8);
  } else if (w === 'dual') {
    const r2 = o.altRecoil || 0;
    drawGun(g, 'dual', 14 - rec, -8, fl, o.evolved); drawGun(g, 'dual', 14 - r2, 8, fl, o.evolved);
    armTo(-1, -10, 15 - rec, -8); armTo(-1, 10, 15 - r2, 8);
  } else if (w) {
    const long = w === 'rifle' || w === 'heavy' || w === 'shotgun' || w === 'smg';
    const gx = (long ? 8 : 13) - rec;
    drawGun(g, w, gx, 1.5, fl, o.evolved);
    armTo(-1, -10, gx + 2, 0);
    armTo(-1, 10, long ? gx + 11 : gx + 2, long ? 3 : 3);
  }
  // torso / shoulders
  g.fillStyle = jacket; g.strokeStyle = OUTLINE; g.lineWidth = 3;
  g.beginPath(); g.ellipse(-1, 0, 9, 14, 0, 0, TAU); g.fill(); g.stroke();
  if (!fl) {
    g.fillStyle = 'rgba(255,255,255,0.16)'; g.beginPath(); g.ellipse(1, -4, 5, 8, 0.3, 0, TAU); g.fill();
    if (o.vest) { g.fillStyle = o.vest; g.beginPath(); g.ellipse(-1, 0, 6, 10, 0, 0, TAU); g.fill(); }
  }
  // head
  g.fillStyle = skin; g.strokeStyle = OUTLINE; g.lineWidth = 3;
  g.beginPath(); g.arc(1, 0, 7.5, 0, TAU); g.fill(); g.stroke();
  if (!fl) {
    const st = o.style;
    if (st === 'cap') { g.fillStyle = o.hair; g.beginPath(); g.arc(0, 0, 7.6, Math.PI * 0.5, Math.PI * 1.5); g.fill(); g.fillRect(-1, -7, 4, 14); g.fillRect(3, -5, 6, 10); }
    else if (st === 'helmet') { g.fillStyle = o.hair; g.beginPath(); g.arc(0, 0, 8.4, 0, TAU); g.fill(); g.strokeStyle = OUTLINE; g.lineWidth = 2; g.stroke(); g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(4, -5, 3.5, 10); }
    else if (st === 'bandana') { g.fillStyle = o.hair; g.beginPath(); g.arc(0, 0, 7.6, Math.PI * 0.45, Math.PI * 1.55); g.fill(); g.fillRect(-11, -2, 5, 2.5); g.fillRect(-11, 1, 4, 2.5); }
    else if (st === 'mohawk') { g.fillStyle = o.hair; g.fillRect(-7, -1.8, 12, 3.6); }
    else if (st === 'bald') { g.fillStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.arc(-1, -2, 2.5, 0, TAU); g.fill(); }
    else if (st === 'hood') { g.fillStyle = o.hair; g.beginPath(); g.arc(-0.5, 0, 8.6, Math.PI * 0.35, Math.PI * 1.65); g.fill(); g.strokeStyle = OUTLINE; g.lineWidth = 2; g.stroke(); }
    else { g.fillStyle = o.hair || '#2a1a10'; g.beginPath(); g.arc(-0.5, 0, 7.6, Math.PI * 0.55, Math.PI * 1.45); g.fill(); }
    if (o.eyes) { g.fillStyle = o.eyes; g.fillRect(5, -3.5, 2.5, 2.2); g.fillRect(5, 1.3, 2.5, 2.2); }
  }
  g.restore();
}

// ---------- card icons ----------
function drawIcon(g, icon, color, size = 72) {
  g.clearRect(0, 0, size, size);
  g.save(); g.translate(size / 2, size / 2); g.scale(size / 72, size / 72);
  g.lineJoin = 'round'; g.lineCap = 'round';
  g.fillStyle = 'rgba(255,255,255,0.06)'; g.beginPath(); g.arc(0, 0, 32, 0, TAU); g.fill();
  g.strokeStyle = color; g.fillStyle = color; g.lineWidth = 4;
  const bullet = (x, y, a = 0, s = 1) => { g.save(); g.translate(x, y); g.rotate(a); g.scale(s, s); g.beginPath(); g.moveTo(-10, -5); g.lineTo(4, -5); g.quadraticCurveTo(12, 0, 4, 5); g.lineTo(-10, 5); g.closePath(); g.fill(); g.restore(); };
  switch (icon) {
    case 'rapid': for (let i = 0; i < 3; i++) bullet(-10 + i * 10, -10 + i * 10, -0.5, 0.9); break;
    case 'heavy': bullet(0, 0, 0, 1.9); break;
    case 'multi': bullet(0, -14, -0.35); bullet(4, 0, 0); bullet(0, 14, 0.35); break;
    case 'pierce': bullet(8, 0, 0, 1.2); g.lineWidth = 3; for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(-22 + i * 9, -14); g.lineTo(-22 + i * 9, 14); g.stroke(); } break;
    case 'ricochet': g.beginPath(); g.moveTo(-24, -18); g.lineTo(0, 16); g.lineTo(24, -18); g.stroke(); g.fillRect(-26, 18, 52, 4); bullet(20, -14, -0.9, 0.7); break;
    case 'boom': g.beginPath(); for (let i = 0; i < 16; i++) { const a = i / 16 * TAU, r = i % 2 ? 12 : 26; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); g.fill(); break;
    case 'mag': g.beginPath(); g.rect(-9, -24, 18, 48); g.stroke(); for (let i = 0; i < 4; i++) g.fillRect(-5, -18 + i * 10, 10, 6); break;
    case 'reload': g.beginPath(); g.arc(0, 0, 18, 0.5, TAU - 0.3); g.stroke(); g.beginPath(); g.moveTo(18, -14); g.lineTo(22, 2); g.lineTo(8, -4); g.closePath(); g.fill(); break;
    case 'crit': g.beginPath(); g.arc(0, 0, 18, 0, TAU); g.stroke(); g.beginPath(); g.arc(0, 0, 6, 0, TAU); g.fill(); g.beginPath(); g.moveTo(0, -28); g.lineTo(0, -12); g.moveTo(0, 28); g.lineTo(0, 12); g.moveTo(-28, 0); g.lineTo(-12, 0); g.moveTo(28, 0); g.lineTo(12, 0); g.stroke(); break;
    case 'bolt': g.beginPath(); g.moveTo(6, -28); g.lineTo(-14, 4); g.lineTo(0, 4); g.lineTo(-6, 28); g.lineTo(14, -6); g.lineTo(0, -6); g.closePath(); g.fill(); break;
    case 'storm': for (let i = 0; i < 6; i++) bullet(Math.cos(i) * 16, Math.sin(i * 2.2) * 16, i * 0.3 - 0.6, 0.7); break;
    case 'velocity': bullet(10, 0, 0, 1.2); g.lineWidth = 3; for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(-28, -10 + i * 10); g.lineTo(-8, -10 + i * 10); g.stroke(); } break;
    case 'boot': g.beginPath(); g.moveTo(-12, -22); g.lineTo(4, -22); g.lineTo(4, 4); g.lineTo(20, 10); g.lineTo(20, 20); g.lineTo(-12, 20); g.closePath(); g.fill(); break;
    case 'dash': for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(-22 + i * 12, -16); g.lineTo(-6 + i * 12, 0); g.lineTo(-22 + i * 12, 16); g.stroke(); } break;
    case 'longdash': g.beginPath(); g.moveTo(-26, 0); g.lineTo(22, 0); g.stroke(); g.beginPath(); g.moveTo(12, -12); g.lineTo(26, 0); g.lineTo(12, 12); g.stroke(); g.fillRect(-28, -14, 4, 28); break;
    case 'fire': g.beginPath(); g.moveTo(0, -28); g.quadraticCurveTo(22, -2, 14, 14); g.quadraticCurveTo(0, 30, -14, 14); g.quadraticCurveTo(-20, 0, -6, -10); g.quadraticCurveTo(-2, 2, 0, -28); g.fill(); break;
    case 'adrenaline': g.beginPath(); g.moveTo(-28, 4); g.lineTo(-12, 4); g.lineTo(-6, -14); g.lineTo(2, 20); g.lineTo(8, -2); g.lineTo(28, -2); g.stroke(); break;
    case 'evade': g.globalAlpha = 0.4; g.beginPath(); g.arc(-10, 0, 12, 0, TAU); g.fill(); g.globalAlpha = 1; g.beginPath(); g.arc(10, 0, 12, 0, TAU); g.fill(); break;
    case 'magnet': g.lineWidth = 9; g.beginPath(); g.arc(0, -2, 16, Math.PI, 0); g.lineTo(16, 18); g.moveTo(-16, -2); g.lineTo(-16, 18); g.stroke(); g.fillStyle = '#fff'; g.fillRect(-21, 12, 10, 8); g.fillRect(11, 12, 10, 8); break;
    case 'momentum': for (let i = 0; i < 3; i++) { g.globalAlpha = 0.4 + i * 0.3; g.beginPath(); g.arc(-14 + i * 12, 0, 8 + i * 3, 0, TAU); g.fill(); } g.globalAlpha = 1; break;
    case 'armor': g.beginPath(); g.moveTo(0, -26); g.lineTo(22, -16); g.quadraticCurveTo(22, 14, 0, 28); g.quadraticCurveTo(-22, 14, -22, -16); g.closePath(); g.fill(); break;
    case 'regen': g.fillRect(-6, -22, 12, 44); g.fillRect(-22, -6, 44, 12); break;
    case 'vamp': g.beginPath(); g.moveTo(0, 24); g.bezierCurveTo(-30, 2, -18, -26, 0, -10); g.bezierCurveTo(18, -26, 30, 2, 0, 24); g.fill(); g.fillStyle = '#111'; g.beginPath(); g.moveTo(-8, -6); g.lineTo(-4, 6); g.lineTo(0, -6); g.moveTo(0, -6); g.lineTo(4, 6); g.lineTo(8, -6); g.fill(); break;
    case 'shock': for (let i = 0; i < 3; i++) { g.globalAlpha = 1 - i * 0.28; g.beginPath(); g.arc(0, 0, 8 + i * 9, 0, TAU); g.stroke(); } g.globalAlpha = 1; break;
    case 'blades': for (let i = 0; i < 3; i++) { g.save(); g.rotate(i * TAU / 3); g.beginPath(); g.moveTo(6, -4); g.lineTo(28, 0); g.lineTo(6, 4); g.closePath(); g.fill(); g.restore(); } g.beginPath(); g.arc(0, 0, 7, 0, TAU); g.stroke(); break;
    case 'drone': g.beginPath(); g.rect(-10, -10, 20, 20); g.fill(); g.lineWidth = 3; for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { g.beginPath(); g.arc(a * 18, b * 18, 7, 0, TAU); g.stroke(); } break;
    case 'overclock': g.beginPath(); g.arc(0, 0, 22, 0, TAU); g.stroke(); g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -16); g.moveTo(0, 0); g.lineTo(12, 6); g.stroke(); g.beginPath(); g.moveTo(-28, -24); g.lineTo(-18, -16); g.stroke(); break;
    case 'gun': g.fillRect(-26, -6, 40, 10); g.fillRect(-26, -6, 10, 22); g.fillRect(8, -10, 18, 4); break;
    case 'heal': g.beginPath(); g.moveTo(0, 24); g.bezierCurveTo(-30, 2, -18, -26, 0, -10); g.bezierCurveTo(18, -26, 30, 2, 0, 24); g.fill(); break;
    case 'star': default: g.beginPath(); for (let i = 0; i < 10; i++) { const a = i / 10 * TAU - Math.PI / 2, r = i % 2 ? 11 : 26; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); g.fill();
  }
  g.restore();
}
