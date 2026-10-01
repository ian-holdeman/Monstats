import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:3100',
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
    colorScheme: 'dark',
    channel: process.env.MONSTATS_BROWSER_CHANNEL,
  },
  webServer: {
    command: 'npm run start -- --port 3100',
    url: 'http://127.0.0.1:3100',
    reuseExistingServer: false,
    timeout: 60000,
    env: {
      MONSTATS_DATA_DIR: '.monstats/e2e',
      NEXT_TELEMETRY_DISABLED: '1',
      NODE_OPTIONS: '--import ./tests/no-upstream.mjs',
    },
  },
});
