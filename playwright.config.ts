import { defineConfig } from '@playwright/test';

if (!process.env.TRIPTRACK_TEST_DATA) throw new Error('Run the suite with npm test to use an isolated ledger.');

const baseURL = 'http://127.0.0.1:3012';
export default defineConfig({
  testDir: './tests',
  workers: 1,
  timeout: 60_000,
  use: { baseURL, trace: 'retain-on-failure' },
  projects: [
    { name: 'integration', testMatch: '**/*.api.spec.ts' },
    {
      name: 'e2e',
      testMatch: '**/*.browser.spec.ts',
      use: { channel: process.env.TRIPTRACK_TEST_BROWSER || undefined },
    },
  ],
  webServer: {
    command: 'npm run dev -- --hostname 127.0.0.1 --port 3012',
    url: baseURL,
    reuseExistingServer: false,
    timeout: 90_000,
  },
});


