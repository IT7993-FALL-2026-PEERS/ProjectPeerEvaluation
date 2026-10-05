const { test, expect } = require('@playwright/test');
const { resetData, capturedEmails, loginAsAda, courseAction, alertWith } = require('./support/app');

// The professor's evaluation screens on the course row: the status dialog (before and after sending,
// by team), reminders, resetting the evaluation state, and the "Evaluations Already Sent"
// confirmation that appears when a team changes after invitations went out. These stand behind
// moving those dialogs into their own components (CICD-57, step 3).
// Run with E2E_START_SERVER=1 (see playwright.config.js).
let passwords;

test.skip(!process.env.E2E_START_SERVER, 'needs the E2E servers: run with E2E_START_SERVER=1');

test.beforeEach(async ({ page }) => {
  ({ passwords } = await resetData());
  await loginAsAda(page, passwords);
});

const top = (page) => page.getByRole('dialog').last();

// Opens the status dialog and sends the invitations from inside it.
async function sendFromStatus(page) {
  await courseAction(page, 'Evaluation Status').click();
  await top(page).getByRole('button', { name: 'Send Evaluations Now' }).click();
  await expect(top(page).getByText('Progress: 0/4 evaluations completed')).toBeVisible();
}

test('E2E-21: before sending, the status says so; after sending, it shows every team and student as pending', async ({ page }) => {
  await courseAction(page, 'Evaluation Status').click();
  await expect(top(page).getByText('Evaluations Have Not Been Sent')).toBeVisible();
  await expect(top(page).getByRole('button', { name: 'Reset Evaluation State' })).toBeVisible();

  await top(page).getByRole('button', { name: 'Send Evaluations Now' }).click();

  await expect(top(page).getByText('Progress: 0/4 evaluations completed')).toBeVisible();
  for (const name of ['Alpha', 'Beta']) await expect(top(page).getByText(name, { exact: true })).toBeVisible();
  for (const name of ['Ann Archer', 'Ben Baker', 'Cy Cole', 'Di Diaz']) await expect(top(page).getByText(name)).toBeVisible();
  await expect(top(page).getByText('Pending', { exact: true })).toHaveCount(4);
  await expect(top(page).getByText('0/2', { exact: true })).toHaveCount(2);
});

test('E2E-22: Send Reminders emails the students who have not finished and says so', async ({ page }) => {
  await sendFromStatus(page);
  const before = (await capturedEmails()).length;

  await top(page).getByRole('button', { name: 'Send Reminders' }).click();

  await expect(alertWith(page, /reminder/i)).toBeVisible();
  // Nobody has finished, so all four students get exactly one reminder each.
  await expect.poll(async () => (await capturedEmails()).length).toBe(before + 4);
  const sent = (await capturedEmails()).slice(before).map((e) => e.to).sort();
  expect(sent).toEqual(['ann@example.edu', 'ben@example.edu', 'cy@example.edu', 'di@example.edu']);
});

test('E2E-23: Reset Evaluation State clears the links and returns the dialog to "not sent"', async ({ page }) => {
  await sendFromStatus(page);

  await top(page).getByRole('button', { name: 'Reset Evaluation State' }).click();

  await expect(alertWith(page, 'Cleared 4 tokens')).toBeVisible();
  await expect(top(page).getByText('Evaluations Have Not Been Sent')).toBeVisible();
});

test('E2E-24: changing a team after invitations went out asks first; Cancel changes nothing, Continue resets and applies it', async ({ page }) => {
  await sendFromStatus(page);
  await top(page).getByRole('button', { name: 'Close' }).click();

  await courseAction(page, 'Manage Teams').click();
  await page.getByRole('row', { name: /Alpha/ }).getByTitle('Manage Students').click();
  await expect(top(page).getByText('Students in Team (2)')).toBeVisible();

  // Cancel: the question is shown, nothing changes.
  await top(page).getByTitle('Remove from team').first().click();
  await expect(top(page).getByText('Evaluations Already Sent')).toBeVisible();
  await top(page).getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByText('Evaluations Already Sent')).toHaveCount(0);
  await expect(top(page).getByText('Students in Team (2)')).toBeVisible();

  // Continue: the evaluation state is reset, then the student is removed.
  await top(page).getByTitle('Remove from team').first().click();
  await top(page).getByRole('button', { name: 'Continue' }).click();
  await expect(alertWith(page, 'Student removed from Alpha')).toBeVisible();
  await expect(top(page).getByText('Students in Team (1)')).toBeVisible();

  // The page has one message slot, so "Cleared 4 tokens" is replaced by the line above within one
  // round trip; check the reset by what it did: the status goes back to "not sent".
  await top(page).getByRole('button', { name: 'Close' }).click();
  await expect(page.getByText('Manage Students in Alpha')).toHaveCount(0);
  await top(page).getByRole('button', { name: 'Close' }).click();
  await expect(page.getByText('Manage Teams for CS 4850')).toHaveCount(0);
  await courseAction(page, 'Evaluation Status').click();
  await expect(top(page).getByText('Evaluations Have Not Been Sent')).toBeVisible();
});
