const { test, expect } = require('@playwright/test');
const { resetData, capturedEmails, loginAsAda, courseAction, alertWith, sendWithDeadline } = require('./support/app');

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
  await expect(teamRow(page, 'Team 1')).toBeVisible();
}

test('E2E-25: Manage Students in a team moves a student in and out, and the lists follow', async ({ page }) => {
  await openTeams(page);
  await teamRow(page, 'Team 1').getByTitle('Manage Students').click();

  await expect(top(page).getByText('Manage Students in Team 1')).toBeVisible();
  await expect(top(page).getByText('Students in Team (2)')).toBeVisible();
  await expect(top(page).getByText('Available Students (2)')).toBeVisible();
  await expect(top(page).getByText('Currently in: Team 2')).toHaveCount(2);

  await top(page).getByTitle('Add to team').first().click();
  await expect(alertWith(page, 'Student added to Team 1')).toBeVisible();
  await expect(top(page).getByText('Students in Team (3)')).toBeVisible();
  await expect(top(page).getByText('Available Students (1)')).toBeVisible();

  await top(page).getByTitle('Remove from team').first().click();
  await expect(alertWith(page, 'Student removed from Team 1')).toBeVisible();
  await expect(top(page).getByText('Students in Team (2)')).toBeVisible();
  await expect(top(page).getByText('Available Students (2)')).toBeVisible();
});

test('E2E-26: team search narrows the list, says when nothing matches, and Clear Search puts it back', async ({ page }) => {
  await openTeams(page);
  await page.getByRole('button', { name: 'Show Search' }).click();
  await expect(page.getByText('Search Teams (2 of 2)')).toBeVisible();

  await page.getByLabel('Team Name').fill('team 1');
  await expect(page.getByText('Search Teams (1 of 2)')).toBeVisible();
  await expect(teamRow(page, 'Team 2')).toHaveCount(0);

  await page.getByRole('button', { name: 'Clear Search' }).click();
  await expect(teamRow(page, 'Team 2')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Show Search' })).toBeVisible();

  await page.getByRole('button', { name: 'Show Search' }).click();
  await page.getByRole('combobox').click();
  await page.getByRole('option', { name: 'Inactive' }).click();
  await expect(page.getByText('No teams match your search criteria.')).toBeVisible();
});

test('E2E-27: Edit Team changes the status, refuses an empty name, and Cancel changes nothing', async ({ page }) => {
  await openTeams(page);

  await teamRow(page, 'Team 1').getByTitle('Edit Team').click();
  await top(page).getByLabel('Team Name').fill('');
  await expect(top(page).getByRole('button', { name: 'Save Changes' })).toBeDisabled();
  await top(page).getByLabel('Team Name').fill('Team 1');
  await top(page).getByRole('combobox').click();
  await page.getByRole('option', { name: 'Inactive' }).click();
  await top(page).getByRole('button', { name: 'Cancel' }).click();
  await expect(teamRow(page, 'Team 1')).toContainText('Active');
  await expect(teamRow(page, 'Team 1')).not.toContainText('Inactive');

  await teamRow(page, 'Team 1').getByTitle('Edit Team').click();
  await top(page).getByRole('combobox').click();
  await page.getByRole('option', { name: 'Inactive' }).click();
  await top(page).getByRole('button', { name: 'Save Changes' }).click();

  await expect(alertWith(page, 'Team "Team 1" updated successfully')).toBeVisible();
  await expect(teamRow(page, 'Team 1')).toContainText('Inactive');
});

test('E2E-28: sending to one team emails only that team\'s students', async ({ page }) => {
  await openTeams(page);

  await teamRow(page, 'Team 1').getByTitle('Send Evaluations to Team').click();
  await sendWithDeadline(page);

  await expect(alertWith(page, 'Evaluation invitations sent to team "Team 1".')).toBeVisible();
  const sent = (await capturedEmails()).map((e) => e.to).sort();
  expect(sent).toEqual(['ann@example.edu', 'ben@example.edu']);
});

test('E2E-29: Clear All Teams asks first, then empties the list and the course\'s team count', async ({ page }) => {
  await openTeams(page);

  page.once('dialog', (confirm) => confirm.dismiss());
  await top(page).getByRole('button', { name: 'Clear All Teams' }).click();
  await expect(teamRow(page, 'Team 2')).toBeVisible();

  page.once('dialog', (confirm) => confirm.accept());
  await top(page).getByRole('button', { name: 'Clear All Teams' }).click();

  await expect(alertWith(page, 'All teams cleared successfully. 2 teams deleted.')).toBeVisible();
  await expect(top(page).getByText('No teams found for this course.')).toBeVisible();
  await expect(top(page).getByRole('button', { name: 'Clear All Teams' })).toBeDisabled();

  // The course row behind the dialog already shows no teams (Teams is the sixth column). A plain
  // locator: while the dialog is open, role queries skip the table behind it.
  await expect(page.locator('tr', { hasText: 'CS 4850' }).locator('td').nth(5)).toHaveText('0');

  // And it still does once the dialog is closed.
  await top(page).getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('row', { name: /CS 4850/ }).getByRole('cell').nth(5)).toHaveText('0');
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

  await expect(teamRow(page, 'Team 1')).toBeVisible();
  // A plain locator: role queries skip a dialog that another one on top has hidden, which would
  // hide exactly the duplicates this test is looking for.
  await expect(page.locator('[role=dialog]')).toHaveCount(1);
});

// CICD-72: a student alone on a team has nobody to rate, so no invitation is sent to them and the
// instructor is told; the status screen lists them without counting them as unfinished.
test('E2E-47: a student alone on a team is skipped by Send Evaluations and shown as having no teammates', async ({ page }) => {
  await openTeams(page);

  // Ben moves to Team 2, so Ann is alone on Team 1
  await teamRow(page, 'Team 2').getByTitle('Manage Students').click();
  // the row is a plain box: the innermost one that holds Ben's name and an Add button
  await top(page).locator('div', { hasText: 'Ben Baker' }).filter({ has: page.getByTitle('Add to team') }).last().getByTitle('Add to team').click();
  await expect(alertWith(page, 'Student added to Team 2')).toBeVisible();
  await top(page).getByRole('button', { name: 'Close' }).click();

  // Sending to Team 1 reaches nobody and says why
  await teamRow(page, 'Team 1').getByTitle('Send Evaluations to Team').click();
  await sendWithDeadline(page);
  await expect(alertWith(page, 'Alone on their team (add a teammate, then send again): Ann Archer.')).toBeVisible();
  expect(await capturedEmails()).toHaveLength(0);

  // Sending to the whole course reaches the other three
  await top(page).getByRole('button', { name: 'Close' }).click();
  await expect(page.locator('[role=dialog]')).toHaveCount(0);
  await page.getByTitle('Send Evaluations', { exact: true }).click();
  await sendWithDeadline(page);
  await expect(alertWith(page, 'Alone on their team (add a teammate, then send again): Ann Archer.')).toBeVisible();
  // the first alert may still be on screen, so wait for the emails themselves
  await expect.poll(async () => (await capturedEmails()).map((e) => e.to).sort()).toEqual(['ben@example.edu', 'cy@example.edu', 'di@example.edu']);

  // The status screen lists Ann with the reason and counts only the three who can submit
  await courseAction(page, 'Evaluation Status').click();
  await expect(top(page).getByText('Progress: 0/3 evaluations completed')).toBeVisible();
  await expect(top(page).getByText('No teammates to rate. Add a teammate to their team, then send again.')).toBeVisible();
});

test('E2E-51: a team name must be numbered: Alpha cannot be created, team 4 becomes Team 4, and an Edit cannot rename a team to Alpha', async ({ page }) => {
  await openTeams(page);
  await page.getByRole('button', { name: 'Create Team' }).click();
  await expect(top(page).getByText('Create New Team')).toBeVisible();

  await top(page).getByLabel(/Team Name/).fill('Alpha');
  await expect(top(page).getByText('Team names are numbered: Team 1, Team 2, Team 3, ...')).toBeVisible();
  await expect(top(page).getByRole('button', { name: 'Create Team' })).toBeDisabled();

  await top(page).getByLabel(/Team Name/).fill('team 4');
  await expect(top(page).getByRole('button', { name: 'Create Team' })).toBeEnabled();
  await top(page).getByRole('button', { name: 'Create Team' }).click();
  await expect(teamRow(page, 'Team 4')).toBeVisible();

  await teamRow(page, 'Team 4').getByTitle('Edit Team').click();
  await top(page).getByLabel(/Team Name/).fill('Alpha');
  await expect(top(page).getByRole('button', { name: 'Save Changes' })).toBeDisabled();
});
