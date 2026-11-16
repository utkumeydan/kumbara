import { defineConfig, devices } from '@playwright/test';

// API bellek içi veritabanıyla 3100'de, derlenmiş web uygulaması 8100'de çalışır
export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:8100',
    ...devices['Pixel 7'],
    locale: 'tr-TR',
    timezoneId: 'Europe/Istanbul',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'npx tsx src/index.ts',
      cwd: '../apps/api',
      port: 3100,
      env: { PORT: '3100', PGLITE_DIR: 'memory://', NODE_ENV: 'development' },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: 'npm run build:web && node serve.mjs',
      port: 8100,
      reuseExistingServer: false,
      timeout: 300_000,
    },
  ],
});
