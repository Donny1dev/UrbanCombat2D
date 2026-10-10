// Rebuilds the v2 baseline page used for the v2-vs-v3 comparison in docs/PERFORMANCE.md.
// Takes v2 (commit b004439, the "UPDATE 1.01" release) straight from git, exposes its internals,
// and adds v2hook.js, which provides the same window.__UC bench API and scenarios v3 ships with.
//
//   node tests/bench/v2-baseline/make-v2-bench.mjs
//   npx vite preview --port 4173            (any static server works; it serves the repo root in dev)
//   node tests/bench/run-bench.mjs "file:///<abs path>/tests/bench/v2-baseline/v2bench.html" --channel=msedge
//
// v2 has no quality presets, so pass no --quality (the setting call is ignored on v2).
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const html = execSync('git show b004439:index.html', { encoding: 'utf8', maxBuffer: 1 << 26 }).replace(/\r/g, '');
const anchor = 'requestAnimationFrame(frame);\n';
const at = html.lastIndexOf(anchor);
if (at < 0) throw new Error('v2 main loop anchor not found');
const expose = fs.readFileSync(path.join(dir, 'expose.txt'), 'utf8').trim();
const hook = fs.readFileSync(path.join(dir, 'v2hook.js'), 'utf8');
const out = '<script>try{sessionStorage.setItem("uc_intro","1")}catch(e){}</script>\n'
  + html.slice(0, at + anchor.length) + expose + '\n' + html.slice(at + anchor.length)
  + `\n<script>${hook}</script>\n`;
fs.writeFileSync(path.join(dir, 'v2bench.html'), out);
console.log('wrote', path.join(dir, 'v2bench.html'));
