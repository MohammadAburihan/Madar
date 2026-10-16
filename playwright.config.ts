import { defineConfig } from '@playwright/test';

// Happy paths end to end against the seeded ERPNext test site (scripts/dev-test-site.sh), never `frontend`.
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
    baseURL: 'http://localhost:4200',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'phone', use: { viewport: { width: 390, height: 900 } }, grep: /@phone/ },
    { name: 'desktop', use: { viewport: { width: 1440, height: 1000 } }, grep: /@desktop/ },
  ],
  webServer: {
    command: 'ERPNEXT_DEV_URL=http://localhost:8081 npm start',
    url: 'http://localhost:4200',
    reuseExistingServer: true,
    timeout: 240_000,
  },
});
