// Layout checks at common desktop sizes: nothing overflows horizontally and every screen's main
// actions are on-screen. Screenshots land in test-results/screens/ for manual visual review.
import { test, expect } from '@playwright/test';
import { watchErrors, open, startRun } from './helpers.js';

const SIZES = [[1280, 720], [1366, 768], [1920, 1080]];
const SUBS = { loadout: '#loadout', character: '#character', profile: '#profile', arsenal: '#arsenal', records: '#records', achievements: '#achievementsScreen', settings: '#settings' };

async function checkFits(page, sel) {
  const r = await page.evaluate(s => {
    const root = document.querySelector(s), out = [];
    const vw = window.innerWidth;
    if (document.documentElement.scrollWidth > vw + 1) out.push('page scrolls horizontally: ' + document.documentElement.scrollWidth);
    for (const el of root.querySelectorAll('button, .btn, h2')) {
      const b = el.getBoundingClientRect();
      if (!b.width || getComputedStyle(el).visibility === 'hidden') continue;
      if (b.left < -1 || b.right > vw + 1) out.push(`${el.id || el.className || el.tagName} '${(el.textContent || '').trim().slice(0, 20)}' x=${Math.round(b.left)}..${Math.round(b.right)}`);
    }
    return out;
  }, sel);
  expect(r, sel).toEqual([]);
}

for (const [w, h] of SIZES) {
  test.describe(`${w}x${h}`, () => {
    test.use({ viewport: { width: w, height: h } });

    test('menus fit and render', async ({ page }) => {
      const errors = watchErrors(page);
      await open(page, { debug: true });
      await page.waitForTimeout(300);
      await checkFits(page, '#menu');
      await page.screenshot({ path: `test-results/screens/${w}x${h}-menu.png` });
      for (const [act, sel] of Object.entries(SUBS)) {
        await page.click(`[data-act="${act}"]`);
        await expect(page.locator(sel)).toBeVisible();
        await page.waitForTimeout(150);
        await checkFits(page, sel);
        await page.screenshot({ path: `test-results/screens/${w}x${h}-${act}.png` });
        await page.keyboard.press('Escape');
      }
      await page.click('[data-act="play"]');
      await expect(page.locator('#deploy')).toBeVisible();
      await page.waitForTimeout(200);
      await checkFits(page, '#deploy');
      await expect(page.locator('#deployBtn')).toBeInViewport();
      await page.screenshot({ path: `test-results/screens/${w}x${h}-deploy.png` });
      expect(errors).toEqual([]);
    });

    test('in-run screens fit and render', async ({ page }) => {
      const errors = watchErrors(page);
      await open(page, { debug: true });
      await startRun(page);
      await page.evaluate(() => { window.__UC.W.player.invuln = 99; });
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `test-results/screens/${w}x${h}-hud.png` });
      await page.evaluate(() => { const { G, W } = window.__UC; G.game.addXp(W.player.xpNeed + 1); });
      await expect(page.locator('#levelup')).toBeVisible();
      await page.waitForTimeout(400);
      await checkFits(page, '#levelup');
      for (let i = 0; i < 3; i++) await expect(page.locator('#cards .card').nth(i)).toBeInViewport();
      await page.screenshot({ path: `test-results/screens/${w}x${h}-levelup.png` });
      await page.keyboard.press('1');
      await expect(page.locator('#levelup')).toBeHidden();
      await page.keyboard.press('Escape');
      await expect(page.locator('#pause')).toBeVisible();
      await checkFits(page, '#pause');
      await page.screenshot({ path: `test-results/screens/${w}x${h}-pause.png` });
      await page.click('#buildBtn');
      await expect(page.locator('#build')).toBeVisible();
      await checkFits(page, '#build');
      await page.screenshot({ path: `test-results/screens/${w}x${h}-build.png` });
      await page.keyboard.press('Escape');
      await page.click('#resumeBtn');
      await page.evaluate(() => { const { G, W } = window.__UC; G.pickups.equipCrate(W.player.x, W.player.y); });
      await expect(page.locator('#levelup')).toBeVisible();
      await page.waitForTimeout(400);
      await checkFits(page, '#levelup');
      await page.screenshot({ path: `test-results/screens/${w}x${h}-crate.png` });
      await page.keyboard.press('1');
      await expect(page.locator('#levelup')).toBeHidden();
      await page.evaluate(() => { const { G, W } = window.__UC; W.player.invuln = 0; G.game.hurtPlayer(1e6, 0); });
      await expect(page.locator('#gameover')).toBeVisible({ timeout: 15_000 });
      await page.waitForTimeout(600);
      await checkFits(page, '#gameover');
      await expect(page.locator('#redeploy')).toBeInViewport();
      await page.screenshot({ path: `test-results/screens/${w}x${h}-results.png` });
      expect(errors).toEqual([]);
    });
  });
}

test('training panel and welcome screen render', async ({ page }) => {
  const errors = watchErrors(page);
  await open(page);
  await page.keyboard.press('Space');
  await expect(page.locator('#welcome')).toBeVisible();
  await checkFits(page, '#welcome');
  await page.screenshot({ path: 'test-results/screens/welcome.png' });
  await page.click('#playGuest');
  await page.click('[data-act="play"]');
  await page.click('#modes [data-mode="training"]');
  await page.click('#deployBtn');
  await expect(page.locator('#trainingPanel')).toBeVisible();
  await page.waitForTimeout(800);
  await expect(page.locator('#trExit')).toBeInViewport();
  await page.screenshot({ path: 'test-results/screens/training.png' });
  expect(errors).toEqual([]);
});
