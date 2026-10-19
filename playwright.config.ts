import { defineConfig } from '@playwright/test';

// End-to-end tests run against demo mode, so they need no AWS account or backend. They use the
// Microsoft Edge that ships with Windows (or Chrome) instead of downloading a browser.
export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  fullyParallel: true,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:5180', channel: process.env.E2E_BROWSER ?? 'msedge', headless: true },
  webServer: { command: 'npx vite --port 5180 --strictPort', url: 'http://localhost:5180', reuseExistingServer: true, timeout: 60_000 },
});
