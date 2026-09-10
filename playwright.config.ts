import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  use: {
    baseURL: 'http://127.0.0.1:3001',
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npx tsx v1/backend/tests/browserApplicationFixture.ts',
    url: 'http://127.0.0.1:3001/api/health',
    reuseExistingServer: false,
    timeout: 30000,
  },
});
