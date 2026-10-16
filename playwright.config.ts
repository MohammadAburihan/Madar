import { defineConfig } from '@playwright/test';

// Happy paths end to end against the seeded ERPNext test site (scripts/dev-test-site.sh), never `frontend`. The suite
// starts its own dev server on :4321 pointed at the test site, and never reuses one: a server already running on
// :4200 may proxy to `frontend`.
// The flows share that site's stock and records, so they run one at a time, in file order.
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'e2e-report' }]],
  outputDir: 'e2e-results',
  use: {
    baseURL: 'http://localhost:4321',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'phone', use: { viewport: { width: 390, height: 900 } }, grep: /@phone/ },
    { name: 'desktop', use: { viewport: { width: 1440, height: 1000 } }, grep: /@desktop/ },
  ],
  webServer: {
    command: 'ERPNEXT_DEV_URL=http://localhost:8081 npx ng serve --port 4321',
    url: 'http://localhost:4321',
    reuseExistingServer: false,
    timeout: 240_000,
  },
});
