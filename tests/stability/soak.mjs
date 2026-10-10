// Long-run stability test: accelerated 20/45-minute runs plus repeated death → redeploy cycles.
// Reports entity counts, simulation cost and JS heap (after forced GC) so leaks and unbounded growth show up.
//
//   npm run build && npx vite preview --port 4173      (in another terminal)
//   node tests/stability/soak.mjs [url] [--minutes=20] [--cycles=50] [--refill=0.3] [--channel=msedge] [--out=file.json]
import { chromium } from '@playwright/test';
import fs from 'fs';

const args = process.argv.slice(2);
const opt = (k, d) => { const a = args.find(x => x.startsWith(`--${k}=`)); return a ? a.split('=')[1] : d; };
const url = args.find(a => !a.startsWith('--')) || 'http://localhost:4173/?debug';
const REFILL = +opt('refill', 0.3), MINUTES = +opt('minutes', 20), CYCLES = +opt('cycles', 50), CHANNEL = opt('channel', process.env.PW_CHANNEL), OUT = opt('out', null);

const browser = await chromium.launch({ channel: CHANNEL || undefined, args: ['--js-flags=--expose-gc'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(e.stack || e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
const cdp = await page.context().newCDPSession(page);
await cdp.send('HeapProfiler.enable');
const heapMB = async () => { await cdp.send('HeapProfiler.collectGarbage'); const h = await cdp.send('Runtime.getHeapUsage'); return +(h.usedSize / 1048576).toFixed(2); };

await page.goto(url);
await page.waitForFunction(() => window.__UC && window.__UC.soak && window.__UC.G.game.state === 'menu');
const ev = (fn, a) => page.evaluate(fn, a);

// ---------- long run ----------
console.log(`Soak: ${MINUTES} game-minutes (bot refills HP below ${REFILL * 100}%), then ${CYCLES} death/redeploy cycles · ${url}`);
await ev(r => { window.__UC.soak.refillAt = r; window.__UC.soak.start('standard'); }, REFILL);
const rows = [];
const t0 = Date.now();
let restarts = 0;
for (let m = 1; m <= MINUTES; m++) {
  await ev(() => window.__UC.soak.resetTiming());
  for (let c = 0; c < 6; c++) {                       // 6 × 600 steps = 60 s of game time
    const st = await ev(() => window.__UC.soak.step(600));
    if (st === 'dead') { restarts++; await ev(() => window.__UC.soak.start('standard')); }
    await page.waitForTimeout(20);                    // let real frames render the current state
  }
  const s = await ev(() => window.__UC.soak.sample());
  s.minute = m; s.heapMB = await heapMB();
  rows.push(s);
  if (m === 1 || m % 5 === 0 || m === MINUTES) console.log(`  min ${String(m).padStart(2)} · wave ${s.wave} · lvl ${s.level} · kills ${s.kills} · enemies ${s.enemies} · bullets ${s.bullets} · particles ${s.particles} · ${s.msPerStep} ms/step · heap ${s.heapMB} MB`);
}
const soakSecs = (Date.now() - t0) / 1000;
const deathLog = await ev(() => window.__UC.soak.deathLog.slice());   // bot deaths in the long run only

// ---------- restart cycles ----------
const cyc = [];
const tc = Date.now();
for (let i = 1; i <= CYCLES; i++) {
  await ev(() => window.__UC.soak.start('standard'));
  await ev(() => window.__UC.soak.step(1800));         // 30 s of play
  const st = await ev(() => window.__UC.soak.die());
  const shown = await page.locator('#gameover').isVisible();
  if (st !== 'dead' || !shown) errors.push(`cycle ${i}: expected results screen, state=${st} visible=${shown}`);
  if ([1, 10, 25, 50, 100, 150, 200, 250, CYCLES].includes(i)) {
    await page.waitForTimeout(50);
    const s = await ev(() => window.__UC.soak.sample());
    cyc.push({ cycle: i, heapMB: await heapMB(), domNodes: s.domNodes, toastsDom: s.toastsDom, runs: await ev(() => window.__UC.G.save.profile().life.runs) });
  }
}
const cycSecs = (Date.now() - tc) / 1000;
const save = await ev(() => ({ bytes: (localStorage.getItem('uc3_save') || '').length, history: window.__UC.G.save.profile().runs.length }));
await browser.close();

// ---------- report ----------
const first = rows[0], last = rows[rows.length - 1];
const peak = k => Math.max(...rows.map(r => r[k]));
console.log('\nLong run (one row per 5 game-minutes):');
console.table(rows.filter(r => r.minute === 1 || r.minute % 5 === 0).map(r => ({ min: r.minute, wave: r.wave, lvl: r.level, kills: r.kills, enemies: r.enemies, bullets: r.bullets, particles: r.particles, decals: r.decals, pickups: r.pickups, hazards: r.hazards, timers: r.timers, 'ms/step': r.msPerStep, heapMB: r.heapMB, dom: r.domNodes })));
console.log(`peaks: enemies ${peak('enemies')} · bullets ${peak('bullets')} · particles ${peak('particles')} · pickups ${peak('pickups')} · timers ${peak('timers')} · ms/step ${peak('msPerStep')}`);
console.log(`bot: ${last.levelUps} level-ups · ${last.crates} crates · ${last.gearUses} gear uses · ${last.refills} HP refills · ${restarts} unexpected deaths (restarted)`);
console.log(`heap: ${first.heapMB} MB at min 1 → ${last.heapMB} MB at min ${last.minute} · wall time ${soakSecs.toFixed(0)} s`);
for (const d of deathLog) {
  const big = d.hits.reduce((m, h) => (h.lost > m.lost ? h : m), d.hits[0]);
  console.log(`  bot death at wave ${d.wave}: largest recent hit ${big.lost} HP from ${big.by} ${big.kind} (had ${big.hp} HP)`);
}
console.log('\nRestart cycles:');
console.table(cyc);
console.log(`cycles wall time ${cycSecs.toFixed(0)} s · save size ${save.bytes} bytes · history entries ${save.history}`);
console.log(errors.length ? `\nERRORS (${errors.length}):\n` + errors.slice(0, 20).join('\n') : '\nNo page errors.');
if (OUT) fs.writeFileSync(OUT, JSON.stringify({ url, minutes: MINUTES, cycles: CYCLES, rows, cyc, restarts, deathLog, save, errors, soakSecs, cycSecs }, null, 2));
process.exit(errors.length ? 1 : 0);
