const { test, expect } = require('@playwright/test');
const {
  resetData, capturedEmails, invitationPath, loginAs, loginAsAda, courseAction, alertWith, sendWithDeadline, ROSTER_CSV, HEADER_ONLY_CSV,
} = require('./support/app');

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

// The roster upload used to mount two dialogs on the same flag: a leftover stub with no buttons and the
// real one. Both were in the page, one hidden behind the other (CICD-57).
test('E2E-16: the roster upload from the course row opens one dialog, the real one', async ({ page }) => {
  await loginAsAda(page, passwords);
  await courseAction(page, 'Upload Roster').click();

  await expect(page.locator('[role=dialog]')).toHaveCount(1);
  await expect(page.getByRole('dialog', { name: 'Upload Student Roster' })).toBeVisible();
  await expect(page.locator('input[type=file]')).toHaveCount(1);
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
  await sendWithDeadline(page);

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
  await expect(page.getByText('80.84%')).toBeVisible();
  const ann = page.getByRole('row', { name: /Ann Archer/ });
  await expect(ann).toContainText('100%');
  await expect(ann).toContainText('A');
  await expect(page.getByRole('row', { name: /Di Diaz/ })).toContainText('56.67%');

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download CSV' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/report\.csv$/);

  // The file name is set by the page, so check what is inside: the header and one row per student,
  // with the same scores the screen shows (the arithmetic is written out in the integration tests).
  const chunks = [];
  for await (const chunk of await download.createReadStream()) chunks.push(chunk);
  const lines = Buffer.concat(chunks).toString('utf8').trim().split(/\r?\n/);
  expect(lines[0]).toBe('Student ID,Name,Email,Team,Original Score,Final Score,Letter Grade,Evaluations Received,Improvement');
  expect(lines.slice(1).sort()).toEqual([
    '1001,Ann Archer,ann@example.edu,Alpha,100,100,A,1,0',
    '1002,Ben Baker,ben@example.edu,Alpha,76.67,76.67,C,1,0',
    '1003,Cy Cole,cy@example.edu,Beta,90,90,A,1,0',
    '1004,Di Diaz,di@example.edu,Beta,56.67,56.67,F,1,0',
  ]);
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

test('E2E-41: when the login has expired the page says so, and Use the login page goes back to the login page', async ({ page }) => {
  await loginAsAda(page, passwords);
  await expect(page).toHaveURL(/course-management/);

  // An expired token and a bad one fail the same check on the server (a 401), so replace it with a bad one.
  await page.evaluate(() => localStorage.setItem('peer_eval_token', 'an-expired-token'));
  await page.reload();

  await expect(page.getByText('Session timed out. Log in again to keep your work.')).toBeVisible();
  await expect(page).toHaveURL(/course-management/);

  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await page.getByRole('button', { name: 'Use the login page' }).click();
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('heading', { name: 'Professor Login' })).toBeVisible();
  await expect(page.getByText('Session timed out. Log in again to keep your work.')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('peer_eval_token'))).toBeNull();
});

// CICD-69: a timed-out professor logs in again on the same page and keeps what was typed.
test('E2E-46: after the login expires, logging in again keeps the half-filled Create Course form, and saving works', async ({ page }) => {
  await loginAsAda(page, passwords);
  await page.getByRole('button', { name: 'Create Course' }).click();
  // A plain locator that keeps pointing at this form once the log-in dialog opens above it.
  const form = page.locator('[role=dialog]').filter({ hasText: 'Create New Course' });
  await form.getByLabel('Course Name').fill('Databases');
  await form.getByLabel('Course Number').fill('IT 3100');
  await form.getByLabel('Course Section').fill('02');
  await form.getByLabel('Semester').fill('Fall 2026');

  // The login runs out while the form is open; saving is refused with a 401.
  await page.evaluate(() => localStorage.setItem('peer_eval_token', 'an-expired-token'));
  await form.getByRole('button', { name: 'Create', exact: true }).click();

  // A plain locator: the open form hides the banner from role queries, though the banner sits above it.
  const banner = alertWith(page, 'Session timed out');
  await expect(banner).toContainText('Session timed out. Log in again to keep your work.');
  await expect(form.getByLabel('Course Name')).toHaveValue('Databases');
  await expect(page).toHaveURL(/course-management/);

  // The form traps the keyboard, so the log-in dialog opens by itself above it (the form stays underneath).
  const relogin = page.getByRole('dialog', { name: 'Log in again' });
  await expect(relogin).toContainText('ada@example.edu');
  await relogin.getByLabel('Password').fill('not-the-password');
  await relogin.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(relogin.getByText(/invalid email or password/i)).toBeVisible();
  await expect(form.getByLabel('Course Name')).toHaveValue('Databases');

  await relogin.getByLabel('Password').fill(passwords.ada);
  await relogin.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(banner).toHaveCount(0);
  await expect(page).toHaveURL(/course-management/);
  await expect(form.getByLabel('Course Name')).toHaveValue('Databases');

  await form.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByRole('cell', { name: 'IT 3100' })).toBeVisible();
});

// CICD-67: the instructor sets the deadline with each send, and the student sees it.
test('E2E-42: a student opens the emailed link and sees when the evaluation is due', async ({ page, browser }) => {
  await loginAsAda(page, passwords);
  await courseAction(page, 'Send Evaluations').click();
  await sendWithDeadline(page, { days: 3 });
  await expect(alertWith(page, 'Emails sent to 4 students')).toBeVisible();
  expect((await capturedEmails()).every((e) => /Deadline:<\/strong> [A-Z][a-z]{2}, /.test(e.html))).toBe(true);

  const student = await (await browser.newContext()).newPage();
  await student.goto(await invitationPath('ann@example.edu'));
  const due = student.getByRole('alert').filter({ hasText: 'Due:' });
  await expect(due).toBeVisible();
  await expect(due).toContainText(String(new Date(Date.now() + 3 * 86400000).getFullYear()));
});

test('E2E-43: sending needs a deadline: Send stays disabled without one, and Cancel sends nothing', async ({ page }) => {
  await loginAsAda(page, passwords);
  await courseAction(page, 'Send Evaluations').click();
  const dialog = page.getByRole('dialog').filter({ has: page.getByLabel('Deadline') });
  await expect(dialog.getByRole('button', { name: 'Send', exact: true })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
  expect((await capturedEmails()).length).toBe(0);
});
