// Reproducible stress benchmark. Drives the game's window.__UC bench API in headless Edge.
// Usage: node tests/bench/run-bench.mjs [url] [--throttle=4] [--seconds=10] [--only=dense,xp]
// Default url: the production build served by `vite preview` on port 4173.
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const opt = (k, d) => { const a = args.find(s => s.startsWith(`--${k}=`)); return a ? a.split('=')[1] : d; };
const url = args.find(a => !a.startsWith('--')) || 'http://localhost:4173/UrbanCombat2D/?bench';
const throttle = +opt('throttle', 1), seconds = +opt('seconds', 10);
const SCENARIOS = ['early', 'dense', 'projectiles', 'explosions', 'xp', 'drones', 'indoor'];
const only = opt('only', '') ? opt('only', '').split(',') : SCENARIOS;

const pct = (a, p) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
const avg = a => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
const cdp = await page.context().newCDPSession(page);
const rows = [];
for (const name of only) {
  await page.goto(url);
  await page.waitForFunction(() => window.__UC && window.__UC.ready, null, { timeout: 30000 });
  if (throttle > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
  await page.evaluate(n => window.__UC.startScenario(n), name);
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.__UC.resetStats());
  await page.waitForTimeout(seconds * 1000);
  const s = await page.evaluate(() => window.__UC.getStats());
  if (throttle > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const cpu = s.upd.map((u, i) => u + s.ren[i]);
  rows.push({
    scenario: name, frames: s.dt.length,
    'fps': +(1000 / avg(s.dt)).toFixed(1),
    'frame p95 ms': +pct(s.dt, 0.95).toFixed(1),
    'cpu avg ms': +avg(cpu).toFixed(2), 'cpu p95 ms': +pct(cpu, 0.95).toFixed(2),
    'update avg': +avg(s.upd).toFixed(2), 'render avg': +avg(s.ren).toFixed(2),
    enemies: s.counts.enemies, bullets: s.counts.bullets, particles: s.counts.particles, pickups: s.counts.pickups,
    heapMB: s.heapMB,
  });
}
await browser.close();
console.log(`\nURL ${url}  ·  CPU throttle x${throttle}  ·  ${seconds}s per scenario  ·  1920x1080 headless Edge`);
console.table(rows);
if (errors.length) { console.log('PAGE ERRORS:'); errors.slice(0, 10).forEach(e => console.log('  ' + e)); process.exitCode = 1; }
