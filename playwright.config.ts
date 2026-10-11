import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  timeout: 45_000,
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:5175', browserName: 'chromium', headless: true },
  webServer: {
    command: 'npm run dev:benchmark',
    url: 'http://127.0.0.1:5175/benchmark.html',
    reuseExistingServer: !process.env.CI,
  },
});
