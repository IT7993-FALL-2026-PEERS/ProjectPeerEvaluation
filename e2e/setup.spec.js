const { test, expect } = require('@playwright/test');

// Verifies the Playwright install itself works, independent of the app
// being up. Real student-workflow E2E tests (Milestone 2, M4) replace
// this once the app is running in CI.
test('playwright launches a browser and can navigate', async ({ page }) => {
  await page.goto('about:blank');
  await expect(page).toHaveURL('about:blank');
});
