const { test, expect } = require('@playwright/test');
const { resetData, loginAsAda, courseAction, alertWith, ROSTER_CSV, HEADER_ONLY_CSV } = require('./support/app');

// The professor's student roster dialogs, opened with Manage Students on the course row: add a
// student, edit one, upload a CSV into the course, and delete everyone. They sit on top of the
// Manage Students dialog, so the one on top is the last dialog on the page (CICD-57: these are
// the tests that stand behind moving the dialogs into their own components).
// Run with E2E_START_SERVER=1 (see playwright.config.js).
let passwords;

test.skip(!process.env.E2E_START_SERVER, 'needs the E2E servers: run with E2E_START_SERVER=1');

test.beforeEach(async ({ page }) => {
  ({ passwords } = await resetData());
  await loginAsAda(page, passwords);
  await courseAction(page, 'Manage Students').click();
  await expect(page.getByRole('row', { name: /Ann Archer/ })).toBeVisible();
});

const top = (page) => page.getByRole('dialog').last();

test('E2E-17: adding a student asks for the required fields, then the student appears in the list', async ({ page }) => {
  await page.getByRole('button', { name: 'Add Student' }).click();

  await top(page).getByRole('button', { name: 'Add', exact: true }).click();
  await expect(top(page).getByText('Student ID, name, and email are required.')).toBeVisible();

  await top(page).getByLabel('Student ID').fill('1007');
  await top(page).getByLabel('Name').fill('Zed Zimmer');
  await top(page).getByLabel('Email').fill('zed@example.edu');
  await top(page).getByRole('button', { name: 'Add', exact: true }).click();

  await expect(alertWith(page, 'Student added successfully')).toBeVisible();
  await expect(page.getByRole('row', { name: /Zed Zimmer/ })).toContainText('zed@example.edu');
  await expect(page.getByRole('dialog', { name: /Add Student/ })).toHaveCount(0);
});

test('E2E-18: editing a student saves the change, and Save is off while a required field is empty', async ({ page }) => {
  await page.getByRole('row', { name: /Ann Archer/ }).getByTitle('Edit Student').click();

  await expect(top(page).getByLabel('Name')).toHaveValue('Ann Archer');
  await top(page).getByLabel('Name').fill('');
  await expect(top(page).getByRole('button', { name: 'Save' })).toBeDisabled();

  await top(page).getByLabel('Name').fill('Ann Archer-Reyes');
  await top(page).getByRole('button', { name: 'Save' }).click();

  await expect(alertWith(page, 'Student updated successfully')).toBeVisible();
  await expect(page.getByRole('row', { name: /Ann Archer-Reyes/ })).toBeVisible();
  // The team is kept (CICD-45).
  await expect(page.getByRole('row', { name: /Ann Archer-Reyes/ })).toContainText('Alpha');
});

test('E2E-19: the roster upload inside Manage Students shows the server\'s reason for a bad file, then adds a good one', async ({ page }) => {
  await page.getByRole('button', { name: 'Upload CSV' }).click();
  await expect(top(page).getByRole('button', { name: 'Upload', exact: true })).toBeDisabled();

  await top(page).locator('input[type=file]').setInputFiles(HEADER_ONLY_CSV);
  await expect(top(page).getByText('Selected: header-only.csv')).toBeVisible();
  await top(page).getByRole('button', { name: 'Upload', exact: true }).click();
  await expect(top(page).getByText('The file has no students')).toBeVisible();

  await top(page).locator('input[type=file]').setInputFiles(ROSTER_CSV);
  await top(page).getByRole('button', { name: 'Upload', exact: true }).click();
  await expect(top(page).getByText('Students added: 2')).toBeVisible();

  await top(page).getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('row', { name: /Fay Foster/ })).toBeVisible();
  await expect(page.getByRole('row', { name: /Gus Green/ })).toBeVisible();
});

test('E2E-20: deleting all students needs the words DELETE ALL, then empties the course', async ({ page }) => {
  await page.getByRole('button', { name: 'Delete All Students' }).click();
  await expect(top(page).getByText('Delete all 4 students from the course')).toBeVisible();

  await top(page).getByRole('button', { name: 'Delete All Students' }).click();
  await expect(alertWith(page, 'Please type "DELETE ALL" to confirm')).toBeVisible();
  // The list is behind the confirmation, so role queries skip it; a plain locator still finds it.
  await expect(page.locator('tr', { hasText: 'Ann Archer' })).toHaveCount(1);

  await top(page).getByPlaceholder('Type DELETE ALL to confirm').fill('DELETE ALL');
  await top(page).getByRole('button', { name: 'Delete All Students' }).click();

  await expect(alertWith(page, '4 students, 2 teams deleted')).toBeVisible();
  await expect(page.getByRole('row', { name: /Ann Archer/ })).toHaveCount(0);
});
