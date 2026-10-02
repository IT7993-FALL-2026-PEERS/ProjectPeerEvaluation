const { test, expect } = require('@playwright/test');
const { resetData, capturedEmails, loginAs, loginAsAda, courseAction, alertWith, ROSTER_CSV, HEADER_ONLY_CSV } = require('./support/app');

// The instructor's workflow through the real UI (CW-01, 03 to 09): sign in, load a roster, form a
// team, send invitations, read the reports. Run with E2E_START_SERVER=1 (see playwright.config.js).
let passwords;

test.skip(!process.env.E2E_START_SERVER, 'needs the E2E servers: run with E2E_START_SERVER=1');

test.beforeEach(async () => {
  ({ passwords } = await resetData());
});

test('E2E-01: a wrong password is refused with a message, and the right one opens the course list', async ({ page }) => {
  await loginAs(page, 'ada@example.edu', 'not-the-password');
  await expect(page.getByText(/invalid email or password/i)).toBeVisible();
  await expect(page).toHaveURL('/');

  await loginAs(page, 'ada@example.edu', passwords.ada);
  await expect(page).toHaveURL(/course-management/);
  const row = page.getByRole('row', { name: /Capstone/ });
  await expect(row).toContainText('CS 4850');
  await expect(row).toContainText('Fall 2026');
});

test('E2E-02: a page that needs a login sends a visitor back to the login page, and logout ends the session', async ({ page }) => {
  await page.goto('/course-management');
  await expect(page).toHaveURL('/');

  await loginAsAda(page, passwords);
  await page.getByRole('button', { name: 'Logout' }).click();
  await expect(page).toHaveURL('/');
  await page.goto('/course-management');
  await expect(page).toHaveURL('/');
});

test('E2E-03: uploading a roster adds the students and their team, and the course counts follow', async ({ page }) => {
  await loginAsAda(page, passwords);
  await courseAction(page, 'Upload Roster').click();
  await page.locator('input[type=file]').setInputFiles(ROSTER_CSV);
  await page.getByRole('button', { name: 'Upload', exact: true }).click();

  await expect(alertWith(page, '2 students added successfully')).toBeVisible();
  const row = page.getByRole('row', { name: /Capstone/ });
  await expect(row.getByRole('cell', { name: '6', exact: true })).toBeVisible();
  await expect(row.getByRole('cell', { name: '3', exact: true })).toBeVisible();
});

test('E2E-04: a roster with no students is refused with the server\'s reason, and nothing changes (CICD-49)', async ({ page }) => {
  await loginAsAda(page, passwords);
  await courseAction(page, 'Upload Roster').click();
  await page.locator('input[type=file]').setInputFiles(HEADER_ONLY_CSV);
  await page.getByRole('button', { name: 'Upload', exact: true }).click();

  await expect(alertWith(page, 'The file has no students')).toBeVisible();
  await expect(alertWith(page, 'Failed to upload roster')).toHaveCount(0);
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('row', { name: /Capstone/ }).getByRole('cell', { name: '4', exact: true })).toBeVisible();
});

test('E2E-05: the Create Team dialog creates a team (CICD-52)', async ({ page }) => {
  await loginAsAda(page, passwords);
  await courseAction(page, 'Manage Teams').click();
  await page.getByRole('button', { name: 'Create Team' }).click();
  await page.getByRole('dialog').last().getByLabel(/team name/i).fill('Gamma');
  await page.getByRole('dialog').last().getByRole('button', { name: /^create/i }).click();

  await expect(alertWith(page, 'created successfully')).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Gamma', exact: true })).toBeVisible();
});

test('E2E-06: sending invitations emails every student a link and opens the status, with nobody done yet', async ({ page }) => {
  await loginAsAda(page, passwords);
  await courseAction(page, 'Send Evaluations').click();

  await expect(alertWith(page, 'Emails sent to 4 students')).toBeVisible();
  await expect(page.getByText('Progress: 0/4 evaluations completed')).toBeVisible();

  const emails = await capturedEmails();
  expect(emails.map((e) => e.to).sort()).toEqual(['ann@example.edu', 'ben@example.edu', 'cy@example.edu', 'di@example.edu']);
  expect(emails.every((e) => /\/evaluate\/[0-9a-f]{64}/.test(e.html))).toBe(true);
});

test('E2E-07: the report shows the class totals and each student\'s score, and downloads as CSV', async ({ page }) => {
  await resetData({ evaluations: true });
  await loginAsAda(page, passwords);
  await courseAction(page, 'View Reports').click();

  await expect(page.getByRole('heading', { name: /Evaluation Reports/ })).toBeVisible();
  await expect(page.getByText('81.88%')).toBeVisible();
  const ann = page.getByRole('row', { name: /Ann Archer/ });
  await expect(ann).toContainText('100%');
  await expect(ann).toContainText('A');
  await expect(page.getByRole('row', { name: /Di Diaz/ })).toContainText('58.33%');

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download CSV' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/report\.csv$/);
});

// The team list used to keep showing the old teams after a create, edit or delete, because the
// filter ran on the list from before the change. These check the dialog's list itself.
test('E2E-08: renaming a team shows the new name in the team list straight away', async ({ page }) => {
  await loginAsAda(page, passwords);
  await courseAction(page, 'Manage Teams').click();
  await page.getByRole('row', { name: /Alpha/ }).getByTitle('Edit Team').click();
  await page.getByRole('dialog').last().getByLabel(/team name/i).fill('Alpha Squad');
  await page.getByRole('dialog').last().getByRole('button', { name: /save|update/i }).click();

  await expect(alertWith(page, 'updated successfully')).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Alpha Squad', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Alpha', exact: true })).toHaveCount(0);
});

test('E2E-09: deleting an empty team removes it from the team list straight away', async ({ page }) => {
  await loginAsAda(page, passwords);
  await courseAction(page, 'Manage Teams').click();
  await page.getByRole('button', { name: 'Create Team' }).click();
  await page.getByRole('dialog').last().getByLabel(/team name/i).fill('Gamma');
  await page.getByRole('dialog').last().getByRole('button', { name: /^create/i }).click();
  await expect(page.getByRole('cell', { name: 'Gamma', exact: true })).toBeVisible();

  page.once('dialog', (confirm) => confirm.accept()); // the page asks with the browser's own confirm box
  await page.getByRole('row', { name: /Gamma/ }).getByTitle('Delete Team').click();
  await expect(alertWith(page, 'deleted successfully')).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Gamma', exact: true })).toHaveCount(0);
});

test('E2E-15: if the team list cannot be refreshed after a delete, the delete still shows as done and the team is gone', async ({ page }) => {
  await loginAsAda(page, passwords);
  await courseAction(page, 'Manage Teams').click();
  await page.getByRole('button', { name: 'Create Team' }).click();
  await page.getByRole('dialog').last().getByLabel(/team name/i).fill('Gamma');
  await page.getByRole('dialog').last().getByRole('button', { name: /^create/i }).click();
  await expect(page.getByRole('cell', { name: 'Gamma', exact: true })).toBeVisible();

  // From now on the team list request fails; the delete itself still goes through.
  await page.route('**/api/courses/*/teams', (route) => (route.request().method() === 'GET' ? route.abort() : route.continue()));
  page.once('dialog', (confirm) => confirm.accept());
  await page.getByRole('row', { name: /Gamma/ }).getByTitle('Delete Team').click();

  await expect(alertWith(page, 'deleted successfully')).toBeVisible();
  await expect(alertWith(page, 'Failed to delete team')).toHaveCount(0);
  await expect(page.getByRole('cell', { name: 'Gamma', exact: true })).toHaveCount(0);
});
