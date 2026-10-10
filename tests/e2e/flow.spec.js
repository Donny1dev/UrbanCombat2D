// The full first-launch journey a new player takes, using only real input (no debug hooks).
import { test, expect } from '@playwright/test';
import { watchErrors, open } from './helpers.js';

test('first launch: intro → callsign → menu → deploy → play → pause → build → menu', async ({ page }) => {
  const errors = watchErrors(page);
  await open(page);

  // Intro plays on first visit and any key skips it.
  await expect(page.locator('#intro')).toBeVisible();
  await page.keyboard.press('Space');
  await expect(page.locator('#welcome')).toBeVisible();

  // Username validation is shown inline.
  await page.fill('#nameInput', 'ab');
  await page.click('#createProfile');
  await expect(page.locator('#nameErr')).not.toBeEmpty();
  await page.fill('#nameInput', 'admin');
  await expect(page.locator('#nameErr')).not.toBeEmpty();
  await page.fill('#nameInput', 'bad name!');
  await expect(page.locator('#nameErr')).not.toBeEmpty();

  await page.fill('#nameInput', 'Test_Pilot7');
  await page.click('#createProfile');
  await expect(page.locator('#menu')).toBeVisible();
  await expect(page.locator('#whoName')).toHaveText('Test_Pilot7');

  // PLAY opens the pre-deployment screen with modes and the kit summary.
  await page.click('[data-act="play"]');
  await expect(page.locator('#deploy')).toBeVisible();
  await expect(page.locator('#modes .mode')).toHaveCount(4);
  await expect(page.locator('#kit')).toContainText('Pistol');
  await page.click('#deployBtn');
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'game');

  // Escape pauses, Escape resumes; Tab opens the build overview.
  await page.waitForTimeout(400);
  await page.keyboard.press('Escape');
  await expect(page.locator('#pause')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#pause')).toBeHidden();
  await page.keyboard.press('Tab');
  await expect(page.locator('#build')).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.locator('#build')).toBeHidden();

  // Quitting from pause returns to the menu.
  await page.keyboard.press('Escape');
  await page.click('#menuBtn');
  await expect(page.locator('#menu')).toBeVisible();

  // The intro is skipped on reload within the same session, and the profile persists.
  await page.reload();
  await expect(page.locator('#menu')).toBeVisible();
  await expect(page.locator('#whoName')).toHaveText('Test_Pilot7');
  expect(errors).toEqual([]);
});

test('guest mode is always playable', async ({ page }) => {
  const errors = watchErrors(page);
  await open(page);
  await page.keyboard.press('Space');
  await page.click('#playGuest');
  await expect(page.locator('#menu')).toBeVisible();
  await expect(page.locator('#whoName')).toHaveText('Guest');
  await page.click('[data-act="play"]');
  await page.click('#deployBtn');
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'game');
  expect(errors).toEqual([]);
});

test('every menu screen opens and returns with Escape', async ({ page }) => {
  const errors = watchErrors(page);
  await open(page);
  await page.keyboard.press('Space');
  await page.click('#playGuest');
  const acts = { loadout: '#loadout', character: '#character', profile: '#profile', arsenal: '#arsenal', records: '#records', achievements: '#achievementsScreen', settings: '#settings' };
  for (const [act, sel] of Object.entries(acts)) {
    await page.click(`[data-act="${act}"]`);
    await expect(page.locator(sel)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#menu')).toBeVisible();
  }
  // No backend is configured, so the records screen must say it is local-only.
  await page.click('[data-act="records"]');
  await expect(page.locator('#records')).toContainText(/local/i);
  expect(errors).toEqual([]);
});
