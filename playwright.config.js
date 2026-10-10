// End-to-end tests run against the production build (vite preview), like the deployed site.
// Locally you can use an installed browser instead of downloading one: PW_CHANNEL=msedge npm run test:e2e
import { defineConfig } from '@playwright/test';

const PORT = 4174;
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  workers: process.env.CI ? 1 : 3,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: `http://localhost:${PORT}/`,
    viewport: { width: 1280, height: 720 },
    channel: process.env.PW_CHANNEL || undefined,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: false,                 // always test a fresh production build
    timeout: 180_000,
  },
});
