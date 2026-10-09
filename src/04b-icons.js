// ===================== ICONS: procedural upgrade artwork + cache =====================
function drawIcon(g, icon, color, size = 72, bg = true) {
  g.clearRect(0, 0, size, size);
  g.save(); g.translate(size / 2, size / 2); g.scale(size / 72, size / 72);
  g.lineJoin = 'round'; g.lineCap = 'round';
  if (bg) { g.fillStyle = 'rgba(255,255,255,0.06)'; g.beginPath(); g.arc(0, 0, 32, 0, TAU); g.fill(); }
  g.strokeStyle = color; g.fillStyle = color; g.lineWidth = 4;
  const P = (pts, fill = true) => { g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); if (fill) { g.closePath(); g.fill(); } else g.stroke(); };
  const C = (x, y, r, fill = true) => { g.beginPath(); g.arc(x, y, r, 0, TAU); fill ? g.fill() : g.stroke(); };
  const L = (...a) => { g.beginPath(); for (let i = 0; i < a.length; i += 4) { g.moveTo(a[i], a[i + 1]); g.lineTo(a[i + 2], a[i + 3]); } g.stroke(); };
  const bullet = (x, y, a = 0, s = 1) => { g.save(); g.translate(x, y); g.rotate(a); g.scale(s, s); g.beginPath(); g.moveTo(-10, -5); g.lineTo(4, -5); g.quadraticCurveTo(12, 0, 4, 5); g.lineTo(-10, 5); g.closePath(); g.fill(); g.restore(); };
  const star = (x, y, r1, r2, n = 5) => { g.beginPath(); for (let i = 0; i < n * 2; i++) { const a = i / (n * 2) * TAU - Math.PI / 2, r = i % 2 ? r2 : r1; g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } g.closePath(); g.fill(); };
  const heart = (x, y, s) => { g.beginPath(); g.moveTo(x, y + 24 * s); g.bezierCurveTo(x - 30 * s, y + 2 * s, x - 18 * s, y - 26 * s, x, y - 10 * s); g.bezierCurveTo(x + 18 * s, y - 26 * s, x + 30 * s, y + 2 * s, x, y + 24 * s); g.fill(); };
  const shield = (x, y, s) => P([[x, y - 26 * s], [x + 22 * s, y - 16 * s], [x + 20 * s, y + 8 * s], [x, y + 28 * s], [x - 20 * s, y + 8 * s], [x - 22 * s, y - 16 * s]]);
  const bolt = (x, y, s) => P([[x + 6 * s, y - 28 * s], [x - 14 * s, y + 4 * s], [x, y + 4 * s], [x - 6 * s, y + 28 * s], [x + 14 * s, y - 6 * s], [x, y - 6 * s]]);
  const flame = (x, y, s) => { g.beginPath(); g.moveTo(x, y - 28 * s); g.quadraticCurveTo(x + 22 * s, y - 2 * s, x + 14 * s, y + 14 * s); g.quadraticCurveTo(x, y + 30 * s, x - 14 * s, y + 14 * s); g.quadraticCurveTo(x - 20 * s, y, x - 6 * s, y - 10 * s); g.quadraticCurveTo(x - 2 * s, y + 2 * s, x, y - 28 * s); g.fill(); };
  const drone = (x, y, s) => { g.fillRect(x - 8 * s, y - 8 * s, 16 * s, 16 * s); g.lineWidth = 3; for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) C(x + a * 15 * s, y + b * 15 * s, 6 * s, false); g.lineWidth = 4; };
  const medkit = (x, y, s) => { g.fillRect(x - 20 * s, y - 14 * s, 40 * s, 30 * s); g.fillRect(x - 7 * s, y - 20 * s, 14 * s, 8 * s); g.fillStyle = '#0d0e12'; g.fillRect(x - 3 * s, y - 9 * s, 6 * s, 20 * s); g.fillRect(x - 10 * s, y - 2 * s, 20 * s, 6 * s); g.fillStyle = color; };
  const ghost = (x, y, s) => { g.beginPath(); g.arc(x, y - 6 * s, 14 * s, Math.PI, 0); g.lineTo(x + 14 * s, y + 18 * s); for (let i = 0; i < 4; i++) g.lineTo(x + (10.5 - i * 7) * s, y + (i % 2 ? 18 : 12) * s); g.lineTo(x - 14 * s, y + 18 * s); g.closePath(); g.fill(); };
  const snow = (x, y, s) => { for (let i = 0; i < 3; i++) { const a = i * Math.PI / 3; L(x + Math.cos(a) * 24 * s, y + Math.sin(a) * 24 * s, x - Math.cos(a) * 24 * s, y - Math.sin(a) * 24 * s); } C(x, y, 5 * s); };
  const crossh = (x, y, r) => { C(x, y, r, false); L(x, y - r - 8, x, y - r + 6, x, y + r + 8, x, y + r - 6, x - r - 8, y, x - r + 6, y, x + r + 8, y, x + r - 6, y); };
  switch (icon) {
    // ---- existing ----
    case 'rapid': for (let i = 0; i < 3; i++) bullet(-10 + i * 10, -10 + i * 10, -0.5, 0.9); break;
    case 'heavy': bullet(0, 0, 0, 1.9); break;
    case 'multi': bullet(0, -14, -0.35); bullet(4, 0, 0); bullet(0, 14, 0.35); break;
    case 'pierce': bullet(8, 0, 0, 1.2); g.lineWidth = 3; L(-22, -14, -22, 14, -13, -14, -13, 14, -4, -14, -4, 14); break;
    case 'ricochet': P([[-24, -18], [0, 16], [24, -18]], false); g.fillRect(-26, 18, 52, 4); bullet(20, -14, -0.9, 0.7); break;
    case 'boom': star(0, 0, 27, 12, 8); break;
    case 'mag': g.beginPath(); g.rect(-9, -24, 18, 48); g.stroke(); for (let i = 0; i < 4; i++) g.fillRect(-5, -18 + i * 10, 10, 6); break;
    case 'reload': g.beginPath(); g.arc(0, 0, 18, 0.5, TAU - 0.3); g.stroke(); P([[18, -14], [22, 2], [8, -4]]); break;
    case 'crit': C(0, 0, 18, false); C(0, 0, 6); L(0, -28, 0, -12, 0, 28, 0, 12, -28, 0, -12, 0, 28, 0, 12, 0); break;
    case 'bolt': bolt(0, 0, 1); break;
    case 'storm': for (let i = 0; i < 6; i++) bullet(Math.cos(i) * 16, Math.sin(i * 2.2) * 16, i * 0.3 - 0.6, 0.7); break;
    case 'velocity': bullet(10, 0, 0, 1.2); g.lineWidth = 3; L(-28, -10, -8, -10, -28, 0, -8, 0, -28, 10, -8, 10); break;
    case 'boot': P([[-12, -22], [4, -22], [4, 4], [20, 10], [20, 20], [-12, 20]]); break;
    case 'dash': for (let i = 0; i < 3; i++) P([[-22 + i * 12, -16], [-6 + i * 12, 0], [-22 + i * 12, 16]], false); break;
    case 'longdash': L(-26, 0, 22, 0); P([[12, -12], [26, 0], [12, 12]], false); g.fillRect(-28, -14, 4, 28); break;
    case 'fire': flame(0, 0, 1); break;
    case 'adrenaline': P([[-28, 4], [-12, 4], [-6, -14], [2, 20], [8, -2], [28, -2]], false); break;
    case 'evade': g.globalAlpha = 0.4; C(-10, 0, 12); g.globalAlpha = 1; C(10, 0, 12); break;
    case 'magnet': g.lineWidth = 9; g.beginPath(); g.arc(0, -2, 16, Math.PI, 0); g.lineTo(16, 18); g.moveTo(-16, -2); g.lineTo(-16, 18); g.stroke(); g.fillStyle = '#fff'; g.fillRect(-21, 12, 10, 8); g.fillRect(11, 12, 10, 8); break;
    case 'momentum': for (let i = 0; i < 3; i++) { g.globalAlpha = 0.4 + i * 0.3; C(-14 + i * 12, 0, 8 + i * 3); } g.globalAlpha = 1; break;
    case 'armor': shield(0, 0, 1); break;
    case 'regen': g.fillRect(-6, -22, 12, 44); g.fillRect(-22, -6, 44, 12); break;
    case 'vamp': heart(0, 0, 1); g.fillStyle = '#111'; P([[-8, -6], [-4, 6], [0, -6]]); P([[0, -6], [4, 6], [8, -6]]); break;
    case 'shock': for (let i = 0; i < 3; i++) { g.globalAlpha = 1 - i * 0.28; C(0, 0, 8 + i * 9, false); } g.globalAlpha = 1; break;
    case 'blades': for (let i = 0; i < 3; i++) { g.save(); g.rotate(i * TAU / 3); P([[6, -4], [28, 0], [6, 4]]); g.restore(); } C(0, 0, 7, false); break;
    case 'drone': drone(0, 0, 1.2); break;
    case 'overclock': C(0, 0, 22, false); L(0, 0, 0, -16, 0, 0, 12, 6, -28, -24, -18, -16); break;
    case 'gun': g.fillRect(-26, -6, 40, 10); g.fillRect(-26, -6, 10, 22); g.fillRect(8, -10, 18, 4); break;
    case 'heal': heart(0, 0, 1); break;
    // ---- ballistics / firepower ----
    case 'hollow': bullet(0, 0, 0, 1.8); g.fillStyle = '#0d0e12'; C(12, 0, 4); break;
    case 'breaker': shield(0, 0, 1); g.strokeStyle = '#0d0e12'; g.lineWidth = 4; P([[-4, -24], [4, -6], [-6, 4], [4, 24]], false); break;
    case 'lastround': bullet(0, 0, -Math.PI / 2, 1.7); g.font = '900 20px sans-serif'; g.textAlign = 'center'; g.fillText('1', 18, 24); break;
    case 'firststrike': bullet(-4, 4, -0.6, 1.4); star(16, -14, 12, 5, 4); break;
    case 'precision': C(0, 0, 22, false); C(0, 0, 10, false); L(-30, 0, 30, 0, 0, -30, 0, 30); break;
    case 'recoil': P([[-26, 14], [-16, -12], [-6, 14], [4, -12], [14, 14], [24, -12]], false); break;
    case 'calibre': g.beginPath(); g.moveTo(-18, -12); g.lineTo(6, -12); g.quadraticCurveTo(26, 0, 6, 12); g.lineTo(-18, 12); g.closePath(); g.fill(); break;
    case 'frag': C(0, 0, 9); for (let i = 0; i < 6; i++) { const a = i * TAU / 6; P([[Math.cos(a) * 16, Math.sin(a) * 16], [Math.cos(a + 0.25) * 28, Math.sin(a + 0.25) * 28], [Math.cos(a - 0.2) * 26, Math.sin(a - 0.2) * 26]]); } break;
    case 'accel': bullet(14, 0, 0, 1); for (let i = 0; i < 3; i++) P([[-28 + i * 9, -8], [-22 + i * 9, 0], [-28 + i * 9, 8]], false); break;
    case 'cqc': C(0, 0, 8); g.globalAlpha = 0.6; C(0, 0, 18, false); g.globalAlpha = 0.3; C(0, 0, 28, false); g.globalAlpha = 1; break;
    case 'marked': crossh(0, 0, 14); g.fillStyle = color; P([[0, -8], [6, 0], [0, 8], [-6, 0]]); break;
    case 'suppress': for (let i = 0; i < 2; i++) P([[-18, -16 + i * 16], [0, -2 + i * 16], [18, -16 + i * 16]], false); g.fillRect(-20, 20, 40, 4); break;
    case 'execute': C(0, -4, 18); g.fillRect(-10, 8, 20, 12); g.fillStyle = '#0d0e12'; C(-7, -4, 5); C(7, -4, 5); g.fillRect(-6, 12, 3, 6); g.fillRect(3, 12, 3, 6); break;
    case 'discipline': crossh(0, 0, 16); g.lineWidth = 5; P([[-8, 0], [-2, 7], [10, -8]], false); break;
    case 'tactical': g.strokeRect(-14, -22, 18, 40); g.fillRect(-10, -4, 10, 18); P([[10, -6], [26, -6], [26, -14], [32, 0], [26, 14], [26, 6], [10, 6]]); break;
    // ---- mobility ----
    case 'slide': g.beginPath(); g.moveTo(-28, -16); g.quadraticCurveTo(-20, 16, 26, 14); g.stroke(); L(-24, 22, 24, 22); C(22, 6, 6); break;
    case 'ghost': ghost(0, 0, 1.1); g.fillStyle = '#0d0e12'; C(-5, -6, 3); C(5, -6, 3); break;
    case 'kinrec': for (let i = 0; i < 2; i++) P([[-24 + i * 12, -12], [-12 + i * 12, 0], [-24 + i * 12, 12]], false); C(14, 0, 13, false); L(14, 0, 14, -8, 14, 0, 20, 3); break;
    case 'fleet': g.beginPath(); g.moveTo(-24, 10); g.quadraticCurveTo(0, -30, 26, -16); g.quadraticCurveTo(6, -10, 10, 4); g.quadraticCurveTo(-4, 0, -24, 10); g.fill(); L(-26, 20, 20, 20); break;
    case 'rungun': P([[-24, -18], [-12, -18], [-12, 4], [0, 8], [0, 16], [-24, 16]]); bullet(16, -10, 0, 0.9); bullet(16, 6, 0, 0.9); break;
    case 'evreload': g.beginPath(); g.arc(-4, 0, 16, 0.6, TAU - 0.4); g.stroke(); P([[14, -12], [18, 2], [4, -4]]); P([[16, 14], [30, 14], [30, 8], [36, 18], [30, 28], [30, 22], [16, 22]]); break;
    case 'phase': g.setLineDash([6, 6]); C(0, 0, 20, false); g.setLineDash([]); g.globalAlpha = 0.5; C(-6, 0, 10); g.globalAlpha = 1; C(8, 0, 10); break;
    case 'kinimpact': star(10, 0, 22, 9, 6); P([[-30, -6], [-12, -6], [-12, -12], [-2, 0], [-12, 12], [-12, 6], [-30, 6]]); break;
    case 'secondwind': g.beginPath(); g.arc(0, 0, 20, 0, Math.PI * 1.5); g.stroke(); g.beginPath(); g.arc(0, 0, 10, Math.PI, Math.PI * 2.6); g.stroke(); L(-26, 16, 10, 16, -20, 26, 20, 26); break;
    // ---- survival / utility ----
    case 'medic': medkit(0, 2, 1); break;
    case 'firstaid': g.save(); g.rotate(-0.6); g.fillRect(-26, -9, 52, 18); g.fillStyle = '#0d0e12'; for (let i = -1; i <= 1; i++) C(i * 7, 0, 2); g.restore(); break;
    case 'scanner': C(0, 0, 24, false); C(0, 0, 13, false); g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, 24, -1.2, -0.3); g.closePath(); g.fill(); C(10, 10, 4); break;
    case 'emergency': g.beginPath(); g.arc(0, 4, 16, Math.PI, 0); g.lineTo(16, 18); g.lineTo(-16, 18); g.closePath(); g.fill(); g.fillRect(-22, 20, 44, 6); L(-26, -16, -18, -8, 26, -16, 18, -8, 0, -28, 0, -18); break;
    case 'trauma': shield(0, 0, 1); g.fillStyle = '#0d0e12'; g.fillRect(-4, -14, 8, 24); g.fillRect(-12, -6, 24, 8); break;
    case 'overheal': heart(-4, 4, 0.8); g.lineWidth = 3; g.beginPath(); g.arc(0, 0, 28, -2.4, -0.7); g.stroke(); g.beginPath(); g.arc(0, 0, 28, 0.7, 2.4); g.stroke(); break;
    case 'stimulant': g.save(); g.rotate(-0.8); g.fillRect(-6, -18, 12, 30); g.fillRect(-10, -22, 20, 5); g.fillRect(-2, 12, 4, 14); g.fillStyle = '#0d0e12'; g.fillRect(-3, -12, 6, 4); g.fillRect(-3, -4, 6, 4); g.restore(); break;
    case 'ironwill': heart(0, 2, 0.9); g.strokeStyle = '#0d0e12'; g.lineWidth = 3; P([[-2, -12], [4, 0], [-4, 6], [2, 20]], false); g.strokeStyle = color; g.lineWidth = 3; C(0, 0, 29, false); break;
    case 'fortified': for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) g.fillRect(-24 + c * 17 + (r % 2 ? 8 : 0) - (r % 2 && c === 2 ? 8 : 0), -20 + r * 14, 14, 11); break;
    case 'laststand': L(-14, 26, -14, -26); P([[-14, -24], [20, -16], [-14, -6]]); C(10, 18, 7, false); break;
    // ---- technology / elemental ----
    case 'incendiary': bullet(10, 6, 0, 1.1); flame(-10, -4, 0.6); break;
    case 'cryo': snow(0, 0, 1); break;
    case 'static': C(0, 0, 10); for (let i = 0; i < 5; i++) { const a = i * TAU / 5; P([[Math.cos(a) * 12, Math.sin(a) * 12], [Math.cos(a + 0.3) * 20, Math.sin(a + 0.3) * 20], [Math.cos(a - 0.1) * 22, Math.sin(a - 0.1) * 22], [Math.cos(a + 0.2) * 30, Math.sin(a + 0.2) * 30]], false); } break;
    case 'volatile': flame(0, 2, 1); g.fillStyle = '#0d0e12'; C(-5, 4, 3.5); C(5, 4, 3.5); g.fillRect(-4, 11, 8, 3); break;
    case 'overdrive': drone(-6, 4, 0.9); bolt(18, -12, 0.55); break;
    case 'autotarget': crossh(4, -2, 12); drone(-16, 16, 0.5); break;
    case 'orbital': C(0, 0, 6); g.beginPath(); g.arc(0, 0, 20, 0.3, 2.6); g.stroke(); g.beginPath(); g.arc(0, 0, 20, 3.4, 5.8); g.stroke(); P([[18, 14], [26, 4], [12, 6]]); P([[-18, -14], [-26, -4], [-12, -6]]); break;
    case 'emp': for (let i = 0; i < 2; i++) { g.globalAlpha = 1 - i * 0.4; C(0, 0, 18 + i * 10, false); } g.globalAlpha = 1; bolt(0, 0, 0.55); break;
    case 'capacitor': g.strokeRect(-14, -22, 28, 46); g.fillRect(-6, -28, 12, 6); g.fillRect(-9, 4, 18, 16); g.fillRect(-9, -10, 18, 10); break;
    case 'reactive': shield(0, 0, 0.8); g.lineWidth = 3; for (let i = 0; i < 4; i++) { const a = i * TAU / 4 + 0.78; L(Math.cos(a) * 24, Math.sin(a) * 24, Math.cos(a) * 32, Math.sin(a) * 32); } break;
    // ---- ui ----
    case 'lock': g.lineWidth = 6; g.beginPath(); g.arc(0, -8, 12, Math.PI, 0); g.stroke(); g.fillRect(-18, -8, 36, 30); break;
    case 'reroll': g.lineWidth = 5; g.beginPath(); g.arc(0, 0, 18, -0.4, Math.PI * 0.9); g.stroke(); g.beginPath(); g.arc(0, 0, 18, Math.PI - 0.4, Math.PI * 1.9); g.stroke(); P([[20, -2], [10, -14], [24, -16]]); P([[-20, 2], [-10, 14], [-24, 16]]); break;
    case 'synergy': g.beginPath(); for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; g.lineTo(Math.cos(a) * 26, Math.sin(a) * 26); } g.closePath(); g.stroke(); C(-6, 0, 8); C(8, 0, 8, false); break;
    case 'star': default: star(0, 0, 26, 11);
  }
  g.restore();
}
const iconCache = new globalThis.Map();
function iconCanvas(icon, color, size) {
  size = Math.max(8, Math.round(size));
  const key = icon + color + size;
  let c = iconCache.get(key);
  if (!c) { c = document.createElement('canvas'); c.width = c.height = size; drawIcon(c.getContext('2d'), icon, color, size, false); iconCache.set(key, c); }
  return c;
}
