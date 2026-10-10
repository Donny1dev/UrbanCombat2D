// In-run behaviour checked through the debug hooks (?debug exposes the registry for tests).
import { test, expect } from '@playwright/test';
import { watchErrors, open, startRun } from './helpers.js';

let errors;
test.beforeEach(async ({ page }) => { errors = watchErrors(page); await open(page, { debug: true }); });
test.afterEach(async () => { expect(errors).toEqual([]); });

test('keyboard input moves the player and the fixed-step clock advances', async ({ page }) => {
  await startRun(page);
  const before = await page.evaluate(() => ({ x: window.__UC.W.player.x, t: window.__UC.G.game.time }));
  await page.keyboard.down('d'); await page.waitForTimeout(700); await page.keyboard.up('d');
  const after = await page.evaluate(() => ({ x: window.__UC.W.player.x, t: window.__UC.G.game.time }));
  expect(after.t - before.t).toBeGreaterThan(0.5);
  // Either the player moved right, or a wall blocked them; then left must work.
  if (after.x - before.x < 20) {
    await page.keyboard.down('a'); await page.waitForTimeout(700); await page.keyboard.up('a');
    const x2 = await page.evaluate(() => window.__UC.W.player.x);
    expect(Math.abs(x2 - after.x)).toBeGreaterThan(20);
  } else expect(after.x - before.x).toBeGreaterThan(20);
});

test('firing spends ammo and damages enemies', async ({ page }) => {
  await startRun(page);
  await page.evaluate(() => { const { W } = window.__UC, p = W.player; for (const e of W.enemies) { e.x = e.px = p.x + 140; e.y = e.py = p.y; } });
  const box = await page.locator('#game').boundingBox();
  await page.mouse.move(box.x + box.width / 2 + 200, box.y + box.height / 2);
  const ammo0 = await page.evaluate(() => window.__UC.W.player.ammo);
  await page.mouse.down(); await page.waitForTimeout(900); await page.mouse.up();
  const r = await page.evaluate(() => ({ ammo: window.__UC.W.player.ammo, reloading: window.__UC.W.player.reloading, dmg: window.__UC.W.player.dmgDealt }));
  expect(r.ammo < ammo0 || r.reloading > 0).toBe(true);
  expect(r.dmg).toBeGreaterThan(0);
});

test('gadget (Q) and support (E) consume charges and start cooldowns', async ({ page }) => {
  await startRun(page);
  await page.evaluate(() => { const p = window.__UC.W.player; p.hp = p.maxHp * 0.5; });
  const before = await page.evaluate(() => { const eq = window.__UC.W.player.eq; return { g: eq.gadget.charges, s: eq.support.charges, gid: eq.gadget.id, sid: eq.support.id }; });
  expect(before).toMatchObject({ gid: 'frag', sid: 'injector' });
  await page.keyboard.press('q');
  await page.keyboard.press('e');
  const after = await page.evaluate(() => { const p = window.__UC.W.player, eq = p.eq; return { g: eq.gadget.charges, gcd: eq.gadget.cd, s: eq.support.charges, scd: eq.support.cd, used: window.__UC.G.game.run.equipUsed, hpFrac: p.hp / p.maxHp }; });
  expect(after.g).toBe(before.g - 1);
  expect(after.gcd).toBeGreaterThan(0);
  expect(after.s).toBe(before.s - 1);
  expect(after.scd).toBeGreaterThan(0);
  expect(after.used).toMatchObject({ frag: 1, injector: 1 });
  expect(after.hpFrac).toBeGreaterThan(0.6);            // the injector healed (+20 HP at rank 1)
  // Let the grenade fuse run out and explode while it is being rendered.
  await page.waitForTimeout(2500);
  // Pressing again while recharging is refused rather than queued.
  await page.keyboard.press('q');
  expect(await page.evaluate(() => window.__UC.W.player.eq.gadget.charges)).toBe(0);
});

test('equipment crate: walking over it offers choices and applying one changes gear', async ({ page }) => {
  await startRun(page);
  await page.evaluate(() => { const { G, W } = window.__UC; G.pickups.equipCrate(W.player.x, W.player.y); });
  await expect(page.locator('#levelup')).toBeVisible();
  await expect(page.locator('#luTitle')).toHaveText('EQUIPMENT CRATE');
  expect(await page.locator('#cards .card').count()).toBeGreaterThanOrEqual(2);
  const before = await page.evaluate(() => JSON.stringify(window.__UC.W.player.eq, ['armour', 'gadget', 'support', 'id', 'rank', 'rarity']));
  await page.waitForTimeout(450);                       // accidental-click guard
  await page.keyboard.press('1');
  // Back to play, or straight into a level-up if the crate completed an XP objective (never lost under it).
  await page.waitForFunction(() => ['play', 'levelup'].includes(window.__UC.G.game.state));
  const after = await page.evaluate(() => ({ eq: JSON.stringify(window.__UC.W.player.eq, ['armour', 'gadget', 'support', 'id', 'rank', 'rarity']), crates: window.__UC.G.game.run.crates }));
  expect(after.crates).toBe(1);
  expect(after.eq).not.toBe(before);
});

test('level-up offers three cards and choosing one applies it', async ({ page }) => {
  await startRun(page);
  await page.evaluate(() => { const { G, W } = window.__UC; G.game.addXp(W.player.xpNeed + 1); });
  await expect(page.locator('#levelup')).toBeVisible();
  await expect(page.locator('#cards .card')).toHaveCount(3);
  await page.waitForTimeout(450);
  await page.keyboard.press('2');
  await expect(page.locator('#levelup')).toBeHidden();
  expect(await page.evaluate(() => window.__UC.W.player.level)).toBe(2);
});

for (const boss of ['juggernaut', 'commander', 'engineer']) {
  test(`boss ${boss}: spawns, runs its attacks, and its defeat is recorded`, async ({ page }) => {
    await startRun(page);
    await page.evaluate(b => {
      const { G, W } = window.__UC;
      G.game.bossCount = ['juggernaut', 'commander', 'engineer'].indexOf(b);
      G.director.spawnBoss(W.player, 5);
      W.player.invuln = 99;
    }, boss);
    expect(await page.evaluate(() => window.__UC.G.game.boss && window.__UC.G.game.boss.boss)).toBe(boss);
    await page.waitForTimeout(3000);                    // let it run its attack patterns
    await page.evaluate(() => { const { G } = window.__UC, b = G.game.boss; G.game.damageEnemy(b, b.hp + 1e6, 0, 0, false, 'test'); });
    await page.waitForFunction(() => window.__UC.G.game.run.bosses === 1);
    expect(await page.evaluate(() => window.__UC.G.game.run.bossTypes)).toEqual([boss]);
  });
}

test('weapon swap reloads into the new weapon', async ({ page }) => {
  await startRun(page);
  const r = await page.evaluate(() => { const { G, W } = window.__UC, p = W.player; G.training.setWeapon('shotgun'); return { weapon: p.weapon, mag: p.gun.mag, ammo: p.ammo }; });
  expect(r.weapon).toBe('shotgun');
  expect(r.ammo).toBe(r.mag);
});

test('death → OPERATION COMPLETE summary → REDEPLOY starts a fresh run', async ({ page }) => {
  await startRun(page);
  await page.waitForTimeout(500);
  await page.evaluate(() => { const { G, W } = window.__UC; W.player.invuln = 0; G.game.hurtPlayer(1e6, 0); });
  await expect(page.locator('#gameover')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('#gameover')).toContainText('OPERATION COMPLETE');
  await expect(page.locator('#goBody')).toContainText(/credits/i);
  expect(await page.evaluate(() => window.__UC.G.save.profile().life.runs)).toBe(1);
  await page.click('#redeploy');
  await page.waitForFunction(() => window.__UC.G.game.state === 'play');
  expect(await page.evaluate(() => ({ fresh: window.__UC.G.game.time < 1, alive: window.__UC.W.player.hp > 0 }))).toEqual({ fresh: true, alive: true });
});

test('training grounds: dummies, DPS meter and panel controls', async ({ page }) => {
  await startRun(page, 'training');
  await expect(page.locator('#trainingPanel')).toBeVisible();
  expect(await page.evaluate(() => window.__UC.W.enemies.filter(e => e.type === 'dummy').length)).toBe(3);
  await page.click('#trDummy');
  expect(await page.evaluate(() => window.__UC.W.enemies.filter(e => e.type === 'dummy').length)).toBe(4);
  await page.selectOption('#trWeapon', 'smg');
  expect(await page.evaluate(() => window.__UC.W.player.weapon)).toBe('smg');
  // Put a dummy straight to the right and shoot it.
  await page.evaluate(() => { const { W } = window.__UC, p = W.player, d = W.enemies.find(e => e.type === 'dummy'); d.x = d.px = p.x + 160; d.y = d.py = p.y; });
  const box = await page.locator('#game').boundingBox();
  await page.mouse.move(box.x + box.width / 2 + 160, box.y + box.height / 2);
  await page.mouse.down(); await page.waitForTimeout(1200); await page.mouse.up();
  const t = await page.evaluate(() => ({ total: window.__UC.G.training.total, dps: window.__UC.G.training.dps }));
  expect(t.total).toBeGreaterThan(0);
  expect(t.dps).toBeGreaterThan(0);
  // Training never pays out or counts as a run.
  await page.click('#trExit');
  await expect(page.locator('#menu')).toBeVisible();
  expect(await page.evaluate(() => window.__UC.G.save.profile().life.runs)).toBe(0);
});
