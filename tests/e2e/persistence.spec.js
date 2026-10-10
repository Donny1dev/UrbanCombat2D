// Saves: v2 migration, corrupt-save recovery, persistence across reloads, purchases, rebinding, export/import.
import { test, expect } from '@playwright/test';
import { watchErrors, open, startRun } from './helpers.js';

const profile = page => page.evaluate(() => JSON.parse(JSON.stringify(window.__UC.G.save.profile())));

test('v2 progress is migrated and the player is asked for a callsign', async ({ page }) => {
  const errors = watchErrors(page);
  await open(page, {
    storage: {
      uc_stats: JSON.stringify({ kills: 1234, deaths: 9, runs: 10, xp: 5000, damage: 99999, longest: 600, wave: 14, level: 22, streak: 41, weaponTime: { smg: 300, bogus: 5 } }),
      uc_best: JSON.stringify({ time: 650, wave: 15, level: 20, kills: 300 }),
      uc_look: JSON.stringify({ skin: 2, hair: 'mohawk', shirt: '#ff3b4e' }),
      uc_disc: JSON.stringify(['not_an_evo']),
      uc_settings: JSON.stringify({ volume: 0.4, shake: 0.5, dmgNums: false }),
      uc_muted: 'false',
    },
  });
  await page.keyboard.press('Space');
  await expect(page.locator('#welcomeTitle')).toHaveText('WELCOME BACK');
  await expect(page.locator('#welcomeLead')).toContainText('1,234');
  await expect(page.locator('#welcomeLead')).toContainText('15');
  await page.fill('#nameInput', 'Veteran_01');
  await page.click('#createProfile');
  await expect(page.locator('#whoName')).toHaveText('Veteran_01');
  const save = await page.evaluate(() => JSON.parse(localStorage.getItem('uc3_save')));
  const p = save.profiles[save.activeId];
  expect(p.name).toBe('Veteran_01');
  expect(p.life.kills).toBe(1234);
  expect(p.records.wave).toBe(15);
  expect(p.records.longest).toBe(650);
  expect(p.life.weaponTime.bogus).toBeUndefined();
  expect(p.discoveries).toEqual([]);
  expect(save.settings.master).toBeCloseTo(0.4);
  expect(save.settings.dmgNums).toBe(false);
  expect(save.meta.migratedFromV2).toBe(true);
  expect(errors).toEqual([]);
});

test('a corrupt save is backed up, reported, and the game still starts', async ({ page }) => {
  const errors = watchErrors(page);
  await open(page, { storage: { uc3_save: '{"schema":3,"profiles":{' } });
  await expect(page.locator('#toasts')).toContainText(/backup/i);
  const keys = await page.evaluate(() => Object.keys(localStorage));
  expect(keys.some(k => k.startsWith('uc3_save_corrupt_'))).toBe(true);
  await page.keyboard.press('Space');
  await page.click('#playGuest');
  await expect(page.locator('#menu')).toBeVisible();
  expect(errors).toEqual([]);
});

test('character design persists after a reload', async ({ page }) => {
  const errors = watchErrors(page);
  await open(page, { debug: true });
  await page.click('[data-act="character"]');
  await expect(page.locator('#character')).toBeVisible();
  const before = (await profile(page)).look;
  // Click the first unselected, unlocked option in every row.
  const rows = page.locator('#lookOpts .opt');
  const n = await rows.count();
  for (let i = 0; i < n; i++) {
    const b = rows.nth(i).locator('button:not(.on):not([disabled])').first();
    if (await b.count()) await b.click();
  }
  const after = (await profile(page)).look;
  expect(after).not.toEqual(before);
  await page.waitForTimeout(600);                         // debounced save
  await page.reload();
  await page.waitForFunction(() => window.__UC && window.__UC.G.game.state === 'menu');
  expect((await profile(page)).look).toEqual(after);
  expect(errors).toEqual([]);
});

test('equipment: locked items cost credits, purchase unlocks and equips, and it persists', async ({ page }) => {
  const errors = watchErrors(page);
  await open(page, { debug: true });
  await page.click('[data-act="loadout"]');
  await page.click('#loTabs [data-t="gadget"]');
  // With 0 credits every locked item's UNLOCK button is disabled.
  await page.evaluate(() => { window.__UC.G.save.profile().credits = 0; window.__UC.G.screens.loadout(); });
  const locked = page.locator('#loItems .item.locked');
  expect(await locked.count()).toBeGreaterThan(0);
  await expect(locked.first().locator('button')).toBeDisabled();
  // Grant credits and career level (as if earned) and buy the first affordable item.
  // Settle career-level achievements first so their payouts don't blur the price check.
  await page.evaluate(() => { const { G } = window.__UC, p = G.save.profile(); p.career.level = 30; G.achievements.check(p, null); p.credits = 5000; G.screens.loadout(); });
  const item = page.locator('#loItems .item.locked').first();
  const name = await item.locator('h4').textContent();
  const cost = +(await item.locator('.credits').textContent()).replace(/[^0-9]/g, '');
  const achBefore = Object.keys((await profile(page)).achievements).length;
  await item.locator('button').click();
  await expect(page.locator('#loItems .item.on h4')).toHaveText(name);
  const p1 = await profile(page);
  expect(cost).toBeGreaterThan(0);
  if (Object.keys(p1.achievements).length === achBefore) expect(p1.credits).toBe(5000 - cost);
  else expect(p1.credits).toBeGreaterThan(5000 - cost);    // a purchase achievement paid out on top
  const boughtId = p1.loadout.gadget;
  expect(p1.unlocked.equipment).toContain(boughtId);
  await page.waitForTimeout(600);
  await page.reload();
  await page.waitForFunction(() => window.__UC && window.__UC.G.game.state === 'menu');
  const p2 = await profile(page);
  expect(p2.loadout.gadget).toBe(boughtId);
  expect(p2.credits).toBe(p1.credits);
  // The run starts with the chosen gadget.
  await startRun(page);
  expect(await page.evaluate(() => window.__UC.W.player.eq.gadget.id)).toBe(boughtId);
  expect(errors).toEqual([]);
});

test('key rebinding applies in game and persists', async ({ page }) => {
  const errors = watchErrors(page);
  await open(page, { debug: true });
  await page.click('[data-act="settings"]');
  await page.click('#setTabs [data-t="controls"]');
  await page.click('.keybtn[data-a="gadget"]');
  await page.keyboard.press('g');
  await expect(page.locator('.keybtn[data-a="gadget"]')).toHaveText(/G/i);
  await page.waitForTimeout(600);
  await page.reload();
  await page.waitForFunction(() => window.__UC && window.__UC.G.game.state === 'menu');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('uc3_save')).settings.keys.gadget)).toBe('g');
  await startRun(page);
  await page.keyboard.press('q');
  expect(await page.evaluate(() => window.__UC.W.player.eq.gadget.charges)).toBe(1);
  await page.keyboard.press('g');
  expect(await page.evaluate(() => window.__UC.W.player.eq.gadget.charges)).toBe(0);
  expect(errors).toEqual([]);
});

test('export → reset → import restores the save; bad imports are rejected', async ({ page }) => {
  const errors = watchErrors(page);
  await open(page, { debug: true });
  await page.evaluate(() => { const p = window.__UC.G.save.profile(); p.credits = 777; window.__UC.G.save.flush(); });
  const text = await page.evaluate(() => window.__UC.G.save.exportText());
  await page.click('[data-act="settings"]');
  await page.click('#setTabs [data-t="data"]');
  await page.fill('#impText', 'not json');
  await page.click('#impBtn');
  await expect(page.locator('#impErr')).not.toBeEmpty();
  // A damaged export fails the checksum.
  await page.fill('#impText', text.replace('777', '778'));
  await page.click('#impBtn');
  await expect(page.locator('#impErr')).not.toBeEmpty();
  await page.click('#resetAll');
  await page.click('#resetYes');
  await page.waitForFunction(() => window.__UC && window.__UC.G.game.state === 'menu');
  expect((await profile(page)).credits).toBe(0);
  await page.click('[data-act="settings"]');
  await page.click('#setTabs [data-t="data"]');
  await page.fill('#impText', text);
  await page.click('#impBtn');
  await expect(page.locator('#impErr')).toBeEmpty();
  expect((await profile(page)).credits).toBe(777);
  expect(errors).toEqual([]);
});
