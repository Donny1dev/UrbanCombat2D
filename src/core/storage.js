// Defensive wrapper around localStorage. Never throws; reports whether writes are possible.
const mem = new Map();   // fallback when storage is blocked (private mode, sandboxed iframes)
let available = null;
export function storageAvailable() {
  if (available !== null) return available;
  try { const k = '__uc_probe'; localStorage.setItem(k, '1'); localStorage.removeItem(k); available = true; }
  catch (e) { available = false; }
  return available;
}
export function readRaw(key) {
  try { if (storageAvailable()) return localStorage.getItem(key); } catch (e) { /* fall through */ }
  return mem.has(key) ? mem.get(key) : null;
}
export function writeRaw(key, value) {
  try { if (storageAvailable()) { localStorage.setItem(key, value); return true; } } catch (e) { available = false; }
  mem.set(key, value); return false;
}
export function readJSON(key, fallback) {
  const raw = readRaw(key);
  if (raw === null) return fallback;
  try { return JSON.parse(raw); } catch (e) { return fallback; }
}
export function removeKey(key) { try { if (storageAvailable()) localStorage.removeItem(key); } catch (e) { } mem.delete(key); }
export function session(key, value) {
  try { if (value === undefined) return sessionStorage.getItem(key); sessionStorage.setItem(key, value); } catch (e) { return null; }
  return value;
}
