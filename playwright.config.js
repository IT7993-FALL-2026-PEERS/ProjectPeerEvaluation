const { defineConfig, devices } = require('@playwright/test');

const isCI = !!process.env.CI;

// Milestone 2 (M4): end-to-end student workflow tests live in e2e/.
// For now only e2e/setup.spec.js runs (an install check). Real workflow tests
// (receive invitation -> open link -> complete evaluation -> submit -> verify)
// come in Milestone 2.
module.exports = defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: isCI, // fail CI if someone leaves test.only in
  retries: isCI ? 2 : 0,
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
    // Machine-readable results (pass/fail/duration) for automated test reporting.
    // Kept outside test-results/ because Playwright clears that folder on each run.
    ['junit', { outputFile: 'playwright-results/results.xml' }],
    ['json', { outputFile: 'playwright-results/results.json' }],
  ],
  use: {
    // Point BASE_URL at staging to reuse these tests as post-deploy smoke tests.
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  // Set E2E_START_SERVER=1 to start the app before the tests. Off by default: the
  // install check needs no server, and the real workflow tests also need a database.
  webServer: process.env.E2E_START_SERVER
    ? {
        command: 'npm run dev',
        url: 'http://localhost:3000',
        reuseExistingServer: !isCI,
        timeout: 120000,
      }
    : undefined,
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
