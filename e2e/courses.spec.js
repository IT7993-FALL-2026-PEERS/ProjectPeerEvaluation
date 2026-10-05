const { test, expect } = require('@playwright/test');
const { resetData, loginAsAda, courseAction, alertWith } = require('./support/app');

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
