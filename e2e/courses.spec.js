const { test, expect } = require('@playwright/test');
const { resetData, loginAsAda, courseAction, alertWith, ROSTER_CSV, HEADER_ONLY_CSV } = require('./support/app');

// The Manage Students list with its search and delete, and the course dialogs: create, edit and
// delete a course. (Adding, editing, uploading and deleting all students are in students.spec.js;
// the roster upload from the course row is E2E-16.) These stand behind moving those dialogs into
// their own components (CICD-57, step 5).
// Run with E2E_START_SERVER=1 (see playwright.config.js).
let passwords;

test.skip(!process.env.E2E_START_SERVER, 'needs the E2E servers: run with E2E_START_SERVER=1');

test.beforeEach(async ({ page }) => {
  ({ passwords } = await resetData());
  await loginAsAda(page, passwords);
});

const top = (page) => page.getByRole('dialog').last();
const studentRow = (page, name) => page.getByRole('row', { name: new RegExp(name) });

async function openStudents(page) {
  await courseAction(page, 'Manage Students').click();
  await expect(studentRow(page, 'Ann Archer')).toBeVisible();
}

async function createCourse(page, { name, number, section, semester }) {
  await page.getByRole('button', { name: 'Create Course' }).click();
  await top(page).getByLabel('Course Name').fill(name);
  await top(page).getByLabel('Course Number').fill(number);
  await top(page).getByLabel('Course Section').fill(section);
  await top(page).getByLabel('Semester').fill(semester);
  await top(page).getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByRole('cell', { name: number })).toBeVisible();
}

test('E2E-31: with two courses, Manage Students opens one dialog, not one per course', async ({ page }) => {
  await createCourse(page, { name: 'Databases', number: 'IT 3100', section: '02', semester: 'Fall 2026' });

  await page.getByRole('row', { name: /CS 4850/ }).getByTitle('Manage Students').click();

  await expect(studentRow(page, 'Ann Archer')).toBeVisible();
  // A plain locator: role queries skip a dialog that another one on top has hidden, which would
  // hide exactly the duplicates this test is looking for.
  await expect(page.locator('[role=dialog]')).toHaveCount(1);
});

test('E2E-32: student search narrows the list, says when nothing matches, and Clear Search puts it back', async ({ page }) => {
  await openStudents(page);
  await page.getByRole('button', { name: 'Show Search' }).click();
  await expect(page.getByText('Search Students (4 of 4)')).toBeVisible();

  await page.getByLabel('Name', { exact: true }).fill('ann');
  await expect(page.getByText('Search Students (1 of 4)')).toBeVisible();
  await expect(studentRow(page, 'Ben Baker')).toHaveCount(0);

  await page.getByRole('button', { name: 'Clear Search' }).click();
  await expect(studentRow(page, 'Ben Baker')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Show Search' })).toBeVisible();

  await page.getByRole('button', { name: 'Show Search' }).click();
  await page.getByLabel('Team', { exact: true }).fill('beta');
  await expect(page.getByText('Search Students (2 of 4)')).toBeVisible();
  await page.getByLabel('Email', { exact: true }).fill('nobody');
  await expect(page.getByText('No students match your search criteria.')).toBeVisible();
});

test('E2E-33: deleting one student asks first; saying no keeps them, saying yes removes them', async ({ page }) => {
  await openStudents(page);

  page.once('dialog', (confirm) => confirm.dismiss());
  await studentRow(page, 'Ann Archer').getByTitle('Delete Student').click();
  await expect(studentRow(page, 'Ann Archer')).toBeVisible();

  page.once('dialog', (confirm) => confirm.accept());
  await studentRow(page, 'Ann Archer').getByTitle('Delete Student').click();

  await expect(alertWith(page, 'Student "Ann Archer" deleted successfully')).toBeVisible();
  await expect(studentRow(page, 'Ann Archer')).toHaveCount(0);
  await expect(studentRow(page, 'Ben Baker')).toBeVisible();
});

test('E2E-34: Create Course needs all four fields, and Cancel adds nothing', async ({ page }) => {
  await page.getByRole('button', { name: 'Create Course' }).click();
  const create = top(page).getByRole('button', { name: 'Create', exact: true });
  await expect(create).toBeDisabled();

  await top(page).getByLabel('Course Name').fill('Databases');
  await top(page).getByLabel('Course Number').fill('IT 3100');
  await top(page).getByLabel('Course Section').fill('02');
  await expect(create).toBeDisabled();

  await top(page).getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByText('Create New Course')).toHaveCount(0);
  await expect(page.getByRole('cell', { name: 'IT 3100' })).toHaveCount(0);

  await createCourse(page, { name: 'Databases', number: 'IT 3100', section: '02', semester: 'Fall 2026' });
  await expect(alertWith(page, 'Course created successfully')).toBeVisible();
});

test('E2E-35: Edit Course shows the course, refuses an empty field, and saves a change', async ({ page }) => {
  await courseAction(page, 'Edit Course').click();

  await expect(top(page).getByLabel('Course Name')).toHaveValue('Capstone');
  await expect(top(page).getByLabel('Course Number')).toHaveValue('CS 4850');
  await expect(top(page).getByLabel('Course Section')).toHaveValue('01');
  await expect(top(page).getByLabel('Semester')).toHaveValue('Fall 2026');
  await expect(top(page).getByRole('combobox')).toHaveText('Active');

  await top(page).getByLabel('Semester').fill('');
  await expect(top(page).getByRole('button', { name: 'Save' })).toBeDisabled();

  await top(page).getByLabel('Semester').fill('Spring 2027');
  await top(page).getByLabel('Course Name').fill('Senior Capstone');
  await top(page).getByRole('button', { name: 'Save' }).click();

  await expect(alertWith(page, 'Course updated successfully')).toBeVisible();
  await expect(page.getByRole('row', { name: /CS 4850/ })).toContainText('Senior Capstone');
  await expect(page.getByRole('row', { name: /CS 4850/ })).toContainText('Spring 2027');
});

test('E2E-36: Delete Course asks first; Cancel keeps the course, Delete removes it', async ({ page }) => {
  await courseAction(page, 'Delete Course').click();
  await expect(top(page).getByText('Are you sure you want to delete this course?')).toBeVisible();
  await top(page).getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByText('Are you sure you want to delete this course?')).toHaveCount(0);
  await expect(page.getByRole('cell', { name: 'CS 4850' })).toBeVisible();

  await courseAction(page, 'Delete Course').click();
  await top(page).getByRole('button', { name: 'Delete', exact: true }).click();

  await expect(alertWith(page, 'Course deleted successfully')).toBeVisible();
  await expect(page.getByText('No courses found. Create your first course to get started.')).toBeVisible();
});

// Closing the roster dialog with Escape or a click outside used to keep the chosen file, so opening
// it again on another course offered to upload the first course's file into the second.
test('E2E-37: a roster file chosen for one course is forgotten when the dialog closes, whichever way it closes', async ({ page }) => {
  await createCourse(page, { name: 'Databases', number: 'IT 3100', section: '02', semester: 'Fall 2026' });
  const ways = {
    'Escape': () => page.keyboard.press('Escape'),
    'Cancel': () => top(page).getByRole('button', { name: 'Cancel' }).click(),
    'a click outside': () => page.locator('.MuiDialog-container').last().click({ position: { x: 5, y: 5 } }),
  };

  for (const [way, close] of Object.entries(ways)) {
    await page.getByRole('row', { name: /CS 4850/ }).getByTitle('Upload Roster').click();
    await top(page).locator('input[type=file]').setInputFiles(ROSTER_CSV);
    await expect(top(page).getByText('Selected: roster.csv'), `chosen before closing with ${way}`).toBeVisible();
    await close();
    await expect(page.locator('[role=dialog]')).toHaveCount(0);

    await page.getByRole('row', { name: /IT 3100/ }).getByTitle('Upload Roster').click();
    await expect(top(page).getByRole('heading', { name: 'Upload Student Roster' })).toBeVisible();
    await expect(top(page).getByText(/Selected:/), `after closing with ${way}`).toHaveCount(0);
    await expect(top(page).getByRole('button', { name: 'Upload', exact: true })).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(page.locator('[role=dialog]')).toHaveCount(0);
  }
});

// Closing the dialog does not cancel an upload that is already on its way, and the server still gets
// it. Its progress and its success used to land on whichever dialog was open by then: the next
// course's, which then closed itself and forgot its file.
test('E2E-38: an upload that finishes after its dialog was closed leaves the next dialog alone', async ({ page }) => {
  await createCourse(page, { name: 'Databases', number: 'IT 3100', section: '02', semester: 'Fall 2026' });
  await page.route('**/api/courses/*/roster', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    await route.continue();
  });

  await page.getByRole('row', { name: /CS 4850/ }).getByTitle('Upload Roster').click();
  await top(page).locator('input[type=file]').setInputFiles(ROSTER_CSV);
  await top(page).getByRole('button', { name: 'Upload', exact: true }).click();
  // Cancel, not Escape: the Upload button that had focus is now disabled, so the keyboard no longer
  // reaches the dialog until the upload ends.
  await top(page).getByRole('button', { name: 'Cancel' }).click();
  await expect(page.locator('[role=dialog]')).toHaveCount(0);

  await page.getByRole('row', { name: /IT 3100/ }).getByTitle('Upload Roster').click();
  await expect(top(page).getByRole('heading', { name: 'Upload Student Roster' })).toBeVisible();
  await top(page).locator('input[type=file]').setInputFiles(HEADER_ONLY_CSV);
  await expect(top(page).getByText('Selected: header-only.csv')).toBeVisible();

  // The first upload still finishes and says so ...
  await expect(alertWith(page, /students added successfully/)).toBeVisible({ timeout: 10000 });
  // ... but the second course's dialog keeps its own file and shows no progress from the first.
  await expect(top(page).getByText('Selected: header-only.csv')).toBeVisible();
  await expect(top(page).getByRole('progressbar')).toHaveCount(0);
  await expect(page.locator('[role=dialog]')).toHaveCount(1);
});

// The course list's own controls: the search filters and the sortable column headers. These stand
// behind moving them into their own components (CICD-57, step 6).
const courseNames = (page) => page.locator('tbody tr td:first-child');

test('E2E-39: course search narrows the list by name and status, and Clear puts the defaults back', async ({ page }) => {
  await createCourse(page, { name: 'Databases', number: 'IT 3100', section: '02', semester: 'Fall 2026' });
  await createCourse(page, { name: 'Algorithms', number: 'CS 3000', section: '01', semester: 'Spring 2027' });
  await page.getByRole('row', { name: /CS 3000/ }).getByTitle('Edit Course').click();
  await top(page).getByRole('combobox').click();
  await page.getByRole('option', { name: 'Inactive' }).click();
  await top(page).getByRole('button', { name: 'Save' }).click();
  await expect(alertWith(page, 'Course updated successfully')).toBeVisible();
  // The list shows Active courses by default, so the inactive one is gone.
  await expect(courseNames(page)).toHaveText(['Capstone', 'Databases']);

  await page.getByRole('button', { name: 'Show Filters' }).click();
  await expect(page.getByRole('button', { name: 'Hide Filters' })).toBeVisible();
  await page.getByLabel('Course Name').fill('data');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(courseNames(page)).toHaveText(['Databases']);

  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(page.getByLabel('Course Name')).toHaveValue('');
  await expect(courseNames(page)).toHaveText(['Capstone', 'Databases']);

  // All lists the inactive course too (CICD-60).
  await page.getByRole('combobox').click();
  await page.getByRole('option', { name: 'All' }).click();
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(courseNames(page)).toHaveText(['Algorithms', 'Capstone', 'Databases']);

  await page.getByRole('combobox').click();
  await page.getByRole('option', { name: 'Inactive' }).click();
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(courseNames(page)).toHaveText(['Algorithms']);

  await page.getByLabel('Course Name').fill('zzz');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByText('No courses found. Create your first course to get started.')).toBeVisible();

  await page.getByRole('button', { name: 'Hide Filters' }).click();
  await expect(page.getByRole('button', { name: 'Show Filters' })).toBeVisible();
});

test('E2E-40: clicking a column header sorts the courses, and clicking it again reverses them', async ({ page }) => {
  await createCourse(page, { name: 'Databases', number: 'IT 3100', section: '02', semester: 'Fall 2026' });
  await createCourse(page, { name: 'Algorithms', number: 'CS 3000', section: '01', semester: 'Spring 2027' });
  const header = (label) => page.getByRole('columnheader', { name: new RegExp(`^${label}`) });

  // By name, ascending, to begin with.
  await expect(courseNames(page)).toHaveText(['Algorithms', 'Capstone', 'Databases']);
  await expect(header('Course Name')).toContainText('▲');

  await header('Course Name').click();
  await expect(courseNames(page)).toHaveText(['Databases', 'Capstone', 'Algorithms']);
  await expect(header('Course Name')).toContainText('▼');

  await header('Course Number').click();
  await expect(courseNames(page)).toHaveText(['Algorithms', 'Capstone', 'Databases']);
  await expect(header('Course Number')).toContainText('▲');
  await expect(header('Course Name')).not.toContainText('▲');
  await expect(header('Course Name')).not.toContainText('▼');
  await header('Course Number').click();
  await expect(courseNames(page)).toHaveText(['Databases', 'Capstone', 'Algorithms']);

  // Same semester: the name breaks the tie, in the same order whichever way the semesters go.
  await header('Semester').click();
  await expect(courseNames(page)).toHaveText(['Capstone', 'Databases', 'Algorithms']);
  await header('Semester').click();
  await expect(courseNames(page)).toHaveText(['Algorithms', 'Capstone', 'Databases']);
});
