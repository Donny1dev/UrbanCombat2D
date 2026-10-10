// CPU-profile one bench scenario via the Chrome DevTools Protocol and list the hottest functions (self time).
// Usage: node tests/bench/profile.mjs [scenario] [url] [--throttle=4]
import { chromium } from '@playwright/test';
const args = process.argv.slice(2), scen = args[0] || 'dense', url = args[1] && !args[1].startsWith('--') ? args[1] : 'http://localhost:5173/?bench';
const throttle = +((args.find(a => a.startsWith('--throttle=')) || '=1').split('=')[1]);
const b = await chromium.launch({ channel: 'msedge', headless: true });
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
await p.goto(url); await p.waitForFunction(() => window.__UC && window.__UC.ready, null, { timeout: 30000 });
const cdp = await p.context().newCDPSession(p);
if (throttle > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
await p.evaluate(n => window.__UC.startScenario(n), scen);
await p.waitForTimeout(2500);
await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 }); await cdp.send('Profiler.start');
await p.waitForTimeout(5000);
const { profile } = await cdp.send('Profiler.stop');
const self = new Map(); let total = 0;
const dt = profile.timeDeltas; const byId = new Map(profile.nodes.map(n => [n.id, n]));
for (let i = 0; i < profile.samples.length; i++) { const n = byId.get(profile.samples[i]); const k = `${n.callFrame.functionName || '(anon)'}  ${n.callFrame.url.split('/').slice(-2).join('/')}:${n.callFrame.lineNumber + 1}`; self.set(k, (self.get(k) || 0) + dt[i]); total += dt[i]; }
const rows = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 28);
console.log(`scenario ${scen} · throttle x${throttle} · self time share (top 28)`);
for (const [k, v] of rows) console.log((v / total * 100).toFixed(1).padStart(5) + '%  ' + k);
await b.close();
