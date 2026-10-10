import { defineConfig } from 'vite';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url)));
const BUILD = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);

export default defineConfig({
  // Relative base works on GitHub Pages (/UrbanCombat2D/) and any other static host.
  base: './',
  define: {
    __VERSION__: JSON.stringify(pkg.version),
    __BUILD__: JSON.stringify(BUILD),
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    target: 'es2020',
    chunkSizeWarningLimit: 900,
  },
  test: {
    include: ['tests/unit/**/*.test.js'],
    environment: 'node',
  },
  plugins: [{
    name: 'emit-version-json',
    closeBundle() {
      mkdirSync('dist', { recursive: true });
      writeFileSync('dist/version.json', JSON.stringify({ version: pkg.version, build: BUILD }));
    },
  }],
});
