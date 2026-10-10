// Keyboard + mouse input with rebindable actions.
import { canvas, V } from './canvas.js';
import { Settings, actionForKey } from './settings.js';

const keys = Object.create(null);
export const mouse = { sx: 0, sy: 0, x: 0, y: 0, down: false };
const ARROWS = { up: 'arrowup', down: 'arrowdown', left: 'arrowleft', right: 'arrowright' };
let pressHandler = () => { }, blurHandler = () => { }, captureFn = null;
export const onPress = fn => { pressHandler = fn; };
export const onBlurInput = fn => { blurHandler = fn; };
// rebinding: the next key pressed is handed to fn instead of the game
export const captureNextKey = fn => { captureFn = fn; };

// virtual keys let the benchmark bot drive movement without synthetic DOM events
export const virtualKeys = {};
export const held = action => !!(virtualKeys[action] || keys[Settings.keys[action]] || (ARROWS[action] && keys[ARROWS[action]]) || (action === 'dash' && keys[' ']));
export function releaseAll() { for (const k in keys) keys[k] = false; mouse.down = false; }

const typingInField = e => { const t = e.target; return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable); };
window.addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (captureFn) { e.preventDefault(); const f = captureFn; captureFn = null; f(k); return; }
  if (typingInField(e)) return;
  if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'tab', 'f3'].includes(k)) e.preventDefault();
  const first = !keys[k];
  keys[k] = true;
  if (first) pressHandler(k, actionForKey(k), e);
});
window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });
window.addEventListener('blur', () => { releaseAll(); blurHandler(); });
const setPos = e => { mouse.sx = e.clientX * V.px; mouse.sy = e.clientY * V.px; };
window.addEventListener('pointermove', setPos, { passive: true });
canvas.addEventListener('pointerdown', e => { setPos(e); if (e.button === 0) mouse.down = true; });
window.addEventListener('pointerup', e => { if (e.button === 0) mouse.down = false; });
canvas.addEventListener('contextmenu', e => e.preventDefault());
export const prettyKey = k => ({ ' ': 'SPACE', escape: 'ESC', arrowup: '↑', arrowdown: '↓', arrowleft: '←', arrowright: '→', shift: 'SHIFT', tab: 'TAB', control: 'CTRL', enter: 'ENTER' }[k] || (k || '').toUpperCase());
