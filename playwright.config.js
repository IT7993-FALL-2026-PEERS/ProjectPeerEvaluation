const { defineConfig, devices } = require('@playwright/test');

// Milestone 2 (M4): end-to-end student workflow tests live in e2e/.
// This config is scaffolding only — see e2e/setup.spec.js for the install
// verification check. Real workflow tests (receive invitation -> open link
// -> complete evaluation -> submit -> verify) come in Milestone 2.
module.exports = defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
