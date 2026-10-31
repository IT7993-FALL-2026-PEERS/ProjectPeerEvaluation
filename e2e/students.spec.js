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

test('E2E-17: adding a student asks for the student ID, name and email; the team is optional, and a student without one is marked', async ({ page }) => {
  await page.getByRole('button', { name: 'Add Student' }).click();

  await top(page).getByRole('button', { name: 'Add', exact: true }).click();
  await expect(top(page).getByText('Student ID, name, and email are required.')).toBeVisible();

  // No team chosen: a small alert says so, and the student can still be added (the sponsor's answer).
  await top(page).getByLabel('Student ID').fill('1007');
  await top(page).getByLabel('Name').fill('Zed Zimmer');
  await top(page).getByLabel('Email').fill('zed@example.edu');
  await expect(top(page).getByRole('combobox', { name: /Team Assignment/ })).toHaveText('No team assigned');
  await expect(top(page).getByRole('alert')).toContainText('No team assigned');

  // The team list is outside the dialog (a portal): No team assigned, Team 1 to Team 10, then "+ Add another team".
  await top(page).getByRole('combobox', { name: /Team Assignment/ }).click();
  await expect(page.getByRole('option')).toHaveCount(12);
  await expect(page.getByRole('option').first()).toHaveText('No team assigned');
  await expect(page.getByRole('option').nth(1)).toHaveText('Team 1');
  await expect(page.getByRole('option').last()).toHaveText('+ Add another team');
  await page.getByRole('option', { name: 'Team 3', exact: true }).click();
  await expect(top(page).getByRole('alert')).toHaveCount(0);
  await top(page).getByRole('combobox', { name: /Team Assignment/ }).click();
  await page.getByRole('option', { name: 'No team assigned', exact: true }).click();
  await expect(top(page).getByRole('alert')).toContainText('No team assigned');
  await top(page).getByRole('button', { name: 'Add', exact: true }).click();

  await expect(alertWith(page, 'Student added successfully')).toBeVisible();
  await expect(page.getByRole('row', { name: /Zed Zimmer/ })).toContainText('zed@example.edu');
  await expect(page.getByRole('row', { name: /Zed Zimmer/ })).toContainText('No team assigned');
  await expect(page.getByRole('dialog', { name: /Add Student/ })).toHaveCount(0);
});

test('E2E-48: "+ Add another team" adds Team 11 to the list and picks it, and the next dialog goes on with Team 12', async ({ page }) => {
  const teamField = () => top(page).getByRole('combobox', { name: /Team Assignment/ });

  await page.getByRole('button', { name: 'Add Student' }).click();
  await top(page).getByLabel('Student ID').fill('1008');
  await top(page).getByLabel('Name').fill('Yan Young');
  await top(page).getByLabel('Email').fill('yan@example.edu');
  await teamField().click();
  await page.getByRole('option', { name: '+ Add another team' }).click();

  // Team 11 is picked and now in the list, before the add-another item.
  await expect(teamField()).toHaveText('Team 11');
  await teamField().click();
  await expect(page.getByRole('option')).toHaveCount(13);
  await expect(page.getByRole('option').nth(11)).toHaveText('Team 11');
  await page.getByRole('option', { name: 'Team 11', exact: true }).click();
  await top(page).getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByRole('row', { name: /Yan Young/ })).toContainText('Team 11');
  await expect(page.getByRole('dialog', { name: /Add Student/ })).toHaveCount(0);

  // Team 11 now exists in the course: the next dialog lists it and goes on with Team 12.
  await page.getByRole('button', { name: 'Add Student' }).click();
  await top(page).getByLabel('Student ID').fill('1009');
  await top(page).getByLabel('Name').fill('Xia Xu');
  await top(page).getByLabel('Email').fill('xia@example.edu');
  await teamField().click();
  await expect(page.getByRole('option')).toHaveCount(13);
  await page.getByRole('option', { name: '+ Add another team' }).click();
  await expect(teamField()).toHaveText('Team 12');
  await top(page).getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByRole('row', { name: /Xia Xu/ })).toContainText('Team 12');
});

test('E2E-18: editing a student saves the change, and Save is off while a required field is empty', async ({ page }) => {
  await page.getByRole('row', { name: /Ann Archer/ }).getByTitle('Edit Student').click();

  await expect(top(page).getByLabel('Name')).toHaveValue('Ann Archer');
  // Her team is kept (CICD-45): Team 1 is in the list, so it is the one chosen.
  await expect(top(page).getByRole('combobox', { name: /Team Assignment/ })).toHaveText('Team 1');
  await top(page).getByLabel('Name').fill('');
  await expect(top(page).getByRole('button', { name: 'Save' })).toBeDisabled();

  await top(page).getByLabel('Name').fill('Ann Archer-Reyes');
  await top(page).getByRole('button', { name: 'Save' }).click();

  await expect(alertWith(page, 'Student updated successfully')).toBeVisible();
  await expect(page.getByRole('row', { name: /Ann Archer-Reyes/ })).toBeVisible();
  // The team is kept (CICD-45).
  await expect(page.getByRole('row', { name: /Ann Archer-Reyes/ })).toContainText('Team 1');
});

test('E2E-52: a student can be taken out of a team ("No team assigned") and put in one again, and the list shows which', async ({ page }) => {
  const teamField = () => top(page).getByRole('combobox', { name: /Team Assignment/ });

  await page.getByRole('row', { name: /Ann Archer/ }).getByTitle('Edit Student').click();
  await expect(teamField()).toHaveText('Team 1');
  await teamField().click();
  await page.getByRole('option', { name: 'No team assigned', exact: true }).click();
  await expect(top(page).getByRole('alert')).toContainText('No team assigned');
  await expect(top(page).getByRole('button', { name: 'Save' })).toBeEnabled();
  await top(page).getByRole('button', { name: 'Save' }).click();

  await expect(alertWith(page, 'Student updated successfully')).toBeVisible();
  await expect(page.getByRole('row', { name: /Ann Archer/ })).toContainText('No team assigned');

  await page.getByRole('row', { name: /Ann Archer/ }).getByTitle('Edit Student').click();
  await expect(teamField()).toHaveText('No team assigned');
  await teamField().click();
  await page.getByRole('option', { name: 'Team 2', exact: true }).click();
  await top(page).getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('row', { name: /Ann Archer/ })).toContainText('Team 2');
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

test('E2E-50: the roster upload dialogs explain the format: the columns, numbered team names and an example', async ({ page }) => {
  await page.getByRole('button', { name: 'Upload CSV' }).click();

  await expect(top(page).getByText('Upload a CSV file with these columns. The first row is the header:')).toBeVisible();
  await expect(top(page).getByText('student_id, name and email are required on every row.')).toBeVisible();
  await expect(top(page).getByText(/Team names are numbered: Team 1, Team 2, Team 3/)).toBeVisible();
  await expect(top(page).getByLabel('Example CSV file')).toContainText('1003,Cy Cole,cy@example.edu,Team 2');
});
