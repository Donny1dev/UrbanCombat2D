// Stitches src/ into a single self-contained index.html
const fs = require('fs'), path = require('path');
const src = path.join(__dirname, 'src');
const js = fs.readdirSync(src).filter(f => f.endsWith('.js')).sort().map(f => fs.readFileSync(path.join(src, f), 'utf8')).join('\n');
const head = fs.readFileSync(path.join(src, 'head.html'), 'utf8');
fs.writeFileSync(path.join(__dirname, 'index.html'), `${head}\n<script>\n(() => {\n'use strict';\n${js}\n})();\n</script>\n`);
console.log('index.html written', (fs.statSync(path.join(__dirname, 'index.html')).size / 1024).toFixed(1) + ' KB');
