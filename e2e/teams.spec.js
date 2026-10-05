const { test, expect } = require('@playwright/test');
const { resetData, capturedEmails, loginAsAda, courseAction, alertWith } = require('./support/app');

// The professor's team screens, opened with Manage Teams on the course row: the team list with its
// search, Edit Team, Manage Students in a team, sending to one team, and Clear All Teams. (Create
// and delete are in instructor.spec.js, E2E-05, 08, 09 and 15.) These stand behind moving the four
// team dialogs into their own components (CICD-57, step 4).
// Run with E2E_START_SERVER=1 (see playwright.config.js).
let passwords;

test.skip(!process.env.E2E_START_SERVER, 'needs the E2E servers: run with E2E_START_SERVER=1');

test.beforeEach(async ({ page }) => {
  ({ passwords } = await resetData());
  await loginAsAda(page, passwords);
});

const top = (page) => page.getByRole('dialog').last();
const teamRow = (page, name) => page.getByRole('row', { name: new RegExp(name) });

async function openTeams(page) {
  await courseAction(page, 'Manage Teams').click();
  await expect(teamRow(page, 'Alpha')).toBeVisible();
}

test('E2E-25: Manage Students in a team moves a student in and out, and the lists follow', async ({ page }) => {
  await openTeams(page);
  await teamRow(page, 'Alpha').getByTitle('Manage Students').click();

  await expect(top(page).getByText('Manage Students in Alpha')).toBeVisible();
  await expect(top(page).getByText('Students in Team (2)')).toBeVisible();
  await expect(top(page).getByText('Available Students (2)')).toBeVisible();
  await expect(top(page).getByText('Currently in: Beta')).toHaveCount(2);

  await top(page).getByTitle('Add to team').first().click();
  await expect(alertWith(page, 'Student added to Alpha')).toBeVisible();
  await expect(top(page).getByText('Students in Team (3)')).toBeVisible();
  await expect(top(page).getByText('Available Students (1)')).toBeVisible();

  await top(page).getByTitle('Remove from team').first().click();
  await expect(alertWith(page, 'Student removed from Alpha')).toBeVisible();
  await expect(top(page).getByText('Students in Team (2)')).toBeVisible();
  await expect(top(page).getByText('Available Students (2)')).toBeVisible();
});

test('E2E-26: team search narrows the list, says when nothing matches, and Clear Search puts it back', async ({ page }) => {
  await openTeams(page);
  await page.getByRole('button', { name: 'Show Search' }).click();
  await expect(page.getByText('Search Teams (2 of 2)')).toBeVisible();

  await page.getByLabel('Team Name').fill('alp');
  await expect(page.getByText('Search Teams (1 of 2)')).toBeVisible();
  await expect(teamRow(page, 'Beta')).toHaveCount(0);

  await page.getByRole('button', { name: 'Clear Search' }).click();
  await expect(teamRow(page, 'Beta')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Show Search' })).toBeVisible();

  await page.getByRole('button', { name: 'Show Search' }).click();
  await page.getByRole('combobox').click();
  await page.getByRole('option', { name: 'Inactive' }).click();
  await expect(page.getByText('No teams match your search criteria.')).toBeVisible();
});

test('E2E-27: Edit Team changes the status, refuses an empty name, and Cancel changes nothing', async ({ page }) => {
  await openTeams(page);

  await teamRow(page, 'Alpha').getByTitle('Edit Team').click();
  await top(page).getByLabel('Team Name').fill('');
  await expect(top(page).getByRole('button', { name: 'Save Changes' })).toBeDisabled();
  await top(page).getByLabel('Team Name').fill('Alpha');
  await top(page).getByRole('combobox').click();
  await page.getByRole('option', { name: 'Inactive' }).click();
  await top(page).getByRole('button', { name: 'Cancel' }).click();
  await expect(teamRow(page, 'Alpha')).toContainText('Active');
  await expect(teamRow(page, 'Alpha')).not.toContainText('Inactive');

  await teamRow(page, 'Alpha').getByTitle('Edit Team').click();
  await top(page).getByRole('combobox').click();
  await page.getByRole('option', { name: 'Inactive' }).click();
  await top(page).getByRole('button', { name: 'Save Changes' }).click();

  await expect(alertWith(page, 'Team "Alpha" updated successfully')).toBeVisible();
  await expect(teamRow(page, 'Alpha')).toContainText('Inactive');
});

test('E2E-28: sending to one team emails only that team\'s students', async ({ page }) => {
  await openTeams(page);

  await teamRow(page, 'Alpha').getByTitle('Send Evaluations to Team').click();

  await expect(alertWith(page, 'Evaluation invitations sent to team "Alpha".')).toBeVisible();
  const sent = (await capturedEmails()).map((e) => e.to).sort();
  expect(sent).toEqual(['ann@example.edu', 'ben@example.edu']);
});

test('E2E-29: Clear All Teams asks first, then empties the list and the course\'s team count', async ({ page }) => {
  await openTeams(page);

  page.once('dialog', (confirm) => confirm.dismiss());
  await top(page).getByRole('button', { name: 'Clear All Teams' }).click();
  await expect(teamRow(page, 'Beta')).toBeVisible();

  page.once('dialog', (confirm) => confirm.accept());
  await top(page).getByRole('button', { name: 'Clear All Teams' }).click();

  await expect(alertWith(page, 'All teams cleared successfully. 2 teams deleted.')).toBeVisible();
  await expect(top(page).getByText('No teams found for this course.')).toBeVisible();
  await expect(top(page).getByRole('button', { name: 'Clear All Teams' })).toBeDisabled();
});

test('E2E-30: with two courses, Manage Teams opens one dialog, not one per course', async ({ page }) => {
  await page.getByRole('button', { name: 'Create Course' }).click();
  await top(page).getByLabel('Course Name').fill('Databases');
  await top(page).getByLabel('Course Number').fill('IT 3100');
  await top(page).getByLabel('Course Section').fill('02');
  await top(page).getByLabel('Semester').fill('Fall 2026');
  await top(page).getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByRole('cell', { name: 'IT 3100' })).toBeVisible();

  await page.getByRole('row', { name: /CS 4850/ }).getByTitle('Manage Teams').click();

  await expect(teamRow(page, 'Alpha')).toBeVisible();
  // A plain locator: role queries skip a dialog that another one on top has hidden, which would
  // hide exactly the duplicates this test is looking for.
  await expect(page.locator('[role=dialog]')).toHaveCount(1);
});
