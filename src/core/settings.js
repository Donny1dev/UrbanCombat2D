// Settings: defaults, validation, quality presets and colour palettes. No DOM access.
export const DEFAULT_KEYS = { up: 'w', down: 's', left: 'a', right: 'd', dash: 'shift', reload: 'r', gadget: 'q', support: 'e', build: 'tab', pause: 'escape' };
export const KEY_LABELS = { up: 'Move up', down: 'Move down', left: 'Move left', right: 'Move right', dash: 'Dash', reload: 'Reload', gadget: 'Tactical gadget', support: 'Support equipment', build: 'Build overview', pause: 'Pause' };

export const DEFAULT_SETTINGS = {
  quality: 'auto', autoLevel: 'high', resScale: 1, particles: 1, shake: 1, dmgNums: true, camSmooth: 0.6, flash: 1, comic: true,
  master: 0.8, gunfire: 0.8, uiVol: 0.8, music: 0.45, muted: false,
  crosshair: 'cross', crossColor: '#ffffff', autoReload: true, edgeIndicators: true, hints: true, pauseOnBlur: true, showName: true,
  reducedMotion: false, reducedFlash: false, palette: 'default', hudScale: 1,
  keys: { ...DEFAULT_KEYS },
};

export const QUALITY = {
  low: { label: 'LOW', particles: 0.4, glow: false, lighting: false, decals: 70, resCap: 1, debris: false, menuAnim: false, shadows: false },
  medium: { label: 'MEDIUM', particles: 0.7, glow: true, lighting: true, decals: 150, resCap: 1.25, debris: true, menuAnim: true, shadows: true },
  high: { label: 'HIGH', particles: 1, glow: true, lighting: true, decals: 260, resCap: 1.5, debris: true, menuAnim: true, shadows: true },
};

// Semantic colours swapped by the colour-blind palettes (danger vs. heal vs. XP must stay distinct).
export const PALETTES = {
  default: { label: 'Default', danger: '#ff3b4e', enemyShot: '#ff4f5e', xp: '#2ef2ff', heal: '#52f08a', warn: '#ffd23f', ally: '#2ef2ff' },
  deuteranopia: { label: 'Deuteranopia', danger: '#ff8c1a', enemyShot: '#ff7a00', xp: '#e6e6ff', heal: '#3d9bff', warn: '#ffe14d', ally: '#7fb8ff' },
  protanopia: { label: 'Protanopia', danger: '#ffa31a', enemyShot: '#ffb000', xp: '#e6e6ff', heal: '#3d9bff', warn: '#fff066', ally: '#7fb8ff' },
  tritanopia: { label: 'Tritanopia', danger: '#ff3b4e', enemyShot: '#ff4f8a', xp: '#ff8fd6', heal: '#2ee6a8', warn: '#ffffff', ally: '#ff8fd6' },
};

const num = (v, lo, hi, d) => (typeof v === 'number' && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
const one = (v, opts, d) => (opts.includes(v) ? v : d);
const bool = (v, d) => (typeof v === 'boolean' ? v : d);
// Validate an untrusted settings object, filling defaults for anything missing or malformed.
export function sanitizeSettings(s = {}) {
  const D = DEFAULT_SETTINGS, o = {};
  o.quality = one(s.quality, ['auto', 'low', 'medium', 'high'], D.quality);
  o.autoLevel = one(s.autoLevel, ['low', 'medium', 'high'], D.autoLevel);
  o.resScale = num(s.resScale, 0.5, 1, D.resScale);
  o.particles = num(s.particles, 0.25, 1.5, D.particles);
  o.shake = num(s.shake, 0, 1.5, D.shake);
  o.camSmooth = num(s.camSmooth, 0, 1, D.camSmooth);
  o.flash = num(s.flash, 0, 1, D.flash);
  for (const k of ['master', 'gunfire', 'uiVol', 'music']) o[k] = num(s[k], 0, 1, D[k]);
  for (const k of ['dmgNums', 'comic', 'muted', 'autoReload', 'edgeIndicators', 'hints', 'pauseOnBlur', 'showName', 'reducedMotion', 'reducedFlash']) o[k] = bool(s[k], D[k]);
  o.crosshair = one(s.crosshair, ['cross', 'dot', 'circle', 'tbar'], D.crosshair);
  o.crossColor = typeof s.crossColor === 'string' && /^#[0-9a-f]{6}$/i.test(s.crossColor) ? s.crossColor : D.crossColor;
  o.palette = one(s.palette, Object.keys(PALETTES), D.palette);
  o.hudScale = num(s.hudScale, 0.75, 1.4, D.hudScale);
  o.keys = { ...DEFAULT_KEYS };
  if (s.keys && typeof s.keys === 'object') for (const k in DEFAULT_KEYS) if (typeof s.keys[k] === 'string' && s.keys[k].length && s.keys[k].length < 16) o.keys[k] = s.keys[k].toLowerCase();
  return o;
}

// Live settings object shared by the whole game.
export const Settings = sanitizeSettings({});
export const PAL = { ...PALETTES.default };
export const Q = { ...QUALITY.high, level: 'high' };
const listeners = [];
export const onSettingsChange = fn => listeners.push(fn);
export function applySettings(next) {
  Object.assign(Settings, sanitizeSettings(next));
  const lvl = Settings.quality === 'auto' ? Settings.autoLevel : Settings.quality;
  Object.assign(Q, QUALITY[lvl], { level: lvl });
  Q.particles *= Settings.particles;
  if (Settings.reducedMotion) { Q.menuAnim = false; }
  Object.assign(PAL, PALETTES[Settings.palette]);
  for (const fn of listeners) fn(Settings);
}
// Returns the action bound to a key (keys are lower-cased KeyboardEvent.key values).
export function actionForKey(k) {
  for (const a in Settings.keys) if (Settings.keys[a] === k) return a;
  if (k === ' ') return 'dash';
  return null;
}
