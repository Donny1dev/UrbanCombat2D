// Character customisation options (pure data).
export const SKIN = ['#f1c6a0', '#d9a074', '#a86b45', '#7a4a2c', '#ffd9b8', '#5a3620'];
export const LOOK_DEFAULT = {
  skin: 0, build: 'normal', top: 'jacket', topCol: '#1fa6b8', vest: 'none', vestCol: '#3b4a2f', gloves: 'none', glovesCol: '#1c1d22',
  style: 'cap', hairCol: '#ffd23f', mask: 'none', maskCol: '#b3202c', glasses: 'none',
  pants: '#2b2f3a', shorts: false, boots: '#18181d', backpack: 'none', backpackCol: '#4b5a3a', pads: false, accent: 'none',
};
export const LOOK_OPTS = {
  build: ['slim', 'normal', 'broad'], top: ['jacket', 'tshirt', 'hoodie', 'tank', 'vest'], vest: ['none', 'plate'],
  gloves: ['none', 'gloves'], style: ['short', 'long', 'afro', 'mohawk', 'bald', 'cap', 'beanie', 'helmet', 'bandana', 'hood'],
  mask: ['none', 'bandana', 'balaclava', 'skull', 'gas'], glasses: ['none', 'shades', 'visor'], backpack: ['none', 'pack'], accent: ['none', 'cyan', 'gold', 'magenta', 'red'],
};
export const ACCENTS = { cyan: '#2ef2ff', gold: '#ffc93c', magenta: '#ff4fd8', red: '#ff3b4e' };
export const PALETTE = ['#1fa6b8', '#e0422f', '#2f6e8f', '#ffd23f', '#52f08a', '#7a3fb5', '#ff4fd8', '#ececf0', '#1d1d26', '#4b5a3a', '#c8692c', '#3a7bd5', '#8c8f99', '#b3202c', '#2a1a10', '#ff9a1f'];
const COLOR_KEYS = ['topCol', 'vestCol', 'glovesCol', 'hairCol', 'maskCol', 'pants', 'boots', 'backpackCol'];
// Validate an untrusted look object (e.g. from an old or imported save).
export function sanitizeLook(l) {
  const o = { ...LOOK_DEFAULT };
  if (!l || typeof l !== 'object') return o;
  if (Number.isInteger(l.skin) && l.skin >= 0 && l.skin < SKIN.length) o.skin = l.skin;
  for (const k in LOOK_OPTS) if (LOOK_OPTS[k].includes(l[k])) o[k] = l[k];
  for (const k of COLOR_KEYS) if (typeof l[k] === 'string' && /^#[0-9a-f]{6}$/i.test(l[k])) o[k] = l[k];
  o.shorts = l.shorts === true; o.pads = l.pads === true;
  return o;
}
