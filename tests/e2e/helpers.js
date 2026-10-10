// Shared helpers for the e2e suite.
import { expect } from '@playwright/test';

// Collects uncaught page errors and console errors so every test can assert a clean run.
export function watchErrors(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + (e.stack || e.message)));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return errors;
}

// Opens the game. `storage` pre-seeds localStorage (e.g. a v2 save) before any game script runs.
export async function open(page, { debug = false, storage = null, path = '' } = {}) {
  if (storage) {
    await page.addInitScript(s => {
      if (sessionStorage.getItem('__seeded')) return;      // seed once, so reloads keep what the game wrote
      sessionStorage.setItem('__seeded', '1');
      localStorage.clear();
      for (const k in s) localStorage.setItem(k, s[k]);
    }, storage);
  }
  await page.goto(path + (debug ? '?debug' : ''));
  await expect(page.locator('#loader')).toBeHidden();
  if (debug) await page.waitForFunction(() => window.__UC && window.__UC.G && window.__UC.G.game.state === 'menu');
}

export const screen = page => page.locator('body').getAttribute('data-screen');
export const state = page => page.evaluate(() => window.__UC.G.game.state);

// Starts a run straight from the menu (debug builds only).
export async function startRun(page, mode = 'standard') {
  await page.evaluate(m => window.__UC.G.ui.startRun({ mode: m, quick: true }), mode);
  await page.waitForFunction(() => window.__UC.G.game.state === 'play');
  await page.evaluate(() => { const p = window.__UC.W.player; p.invuln = 0; });
}

export async function stepFor(page, ms) { await page.waitForTimeout(ms); }
