import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  webServer: {
    command: 'pnpm exec tsx ./e2e/fixtures-server.ts',
    url: 'http://localhost:5174/',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
  projects: [
    {
      name: 'happy-path',
      testMatch: /happy-path\.spec\.ts/,
      use: { baseURL: 'http://localhost:5173', headless: true },
    },
    {
      name: 'fixtures',
      testMatch: /smoke-fixtures\.spec\.ts/,
      use: { baseURL: 'http://localhost:5174', headless: true },
    },
  ],
});
