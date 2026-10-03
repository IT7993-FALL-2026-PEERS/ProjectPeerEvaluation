const { defineConfig, devices } = require('@playwright/test');

const isCI = !!process.env.CI;

// End-to-end tests (CICD-26) live in e2e/.
//
// Set E2E_START_SERVER=1 to run them against the real app on a throwaway database:
//   npm run build                        (the frontend build is served as static files)
//   E2E_START_SERVER=1 npm run test:e2e
// Playwright then starts two servers (see e2e/server/): the real backend on a seeded in-memory
// MongoDB, with email captured instead of sent, and the frontend build on port 3000. The first run
// downloads MongoDB (see docs/testing-strategy/testing-strategy.md); set MONGOMS_VERSION to reuse a
// version you already have. Without E2E_START_SERVER only the install check in e2e/setup.spec.js runs.
const startServers = !!process.env.E2E_START_SERVER;

module.exports = defineConfig({
  testDir: './e2e',
  // The workflow tests share one backend and reset its data before each test, so they run one at a time.
  fullyParallel: false,
  workers: 1,
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
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: startServers
    ? [
        {
          command: 'node e2e/server/backend.js',
          // The control server answers only for the E2E backend, so a backend someone already runs on
          // port 5000 is not reused; backend.js refuses to start while that port is taken.
          url: `${process.env.E2E_CONTROL_URL || 'http://127.0.0.1:5051'}/health`,
          reuseExistingServer: !isCI,
          timeout: 300000, // the first run downloads MongoDB
          stdout: 'pipe',
          stderr: 'pipe',
        },
        {
          command: 'node e2e/server/frontend.js',
          url: 'http://localhost:3000',
          reuseExistingServer: !isCI,
          timeout: 60000,
        },
      ]
    : undefined,
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
