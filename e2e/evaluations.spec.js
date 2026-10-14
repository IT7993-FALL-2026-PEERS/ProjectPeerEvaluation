const { test, expect } = require('@playwright/test');
const {
  resetData, capturedEmails, loginAsAda, courseAction, alertWith, sendWithDeadline, invitationPath,
} = require('./support/app');

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
  await sendWithDeadline(page);
  await expect(top(page).getByText('Progress: 0/4 evaluations completed')).toBeVisible();
}

test('E2E-21: before sending, the status says so; after sending, it shows every team and student as pending', async ({ page }) => {
  await courseAction(page, 'Evaluation Status').click();
  await expect(top(page).getByText('Evaluations Have Not Been Sent')).toBeVisible();
  await expect(top(page).getByRole('button', { name: 'Reset Evaluation State' })).toBeVisible();

  await top(page).getByRole('button', { name: 'Send Evaluations Now' }).click();
  await sendWithDeadline(page);

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

// CICD-68: more time with a new link, and a second try for a student who has submitted.
const API = process.env.E2E_API_URL || 'http://localhost:5000/api';
const pad2 = (n) => String(n).padStart(2, '0');
const localIn = (days) => {
  const when = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return `${when.getFullYear()}-${pad2(when.getMonth() + 1)}-${pad2(when.getDate())}T${pad2(when.getHours())}:${pad2(when.getMinutes())}`;
};
const lastLinkTo = async (address) => {
  const emails = (await capturedEmails()).filter((e) => e.to === address);
  return emails[emails.length - 1].html.match(/href="[^"]*(\/evaluate\/[0-9a-f]{64})"/)[1];
};

test('E2E-44: extending the deadline emails a new link that works, and the old link stops working', async ({ page, browser }) => {
  await sendFromStatus(page);
  const oldPath = await invitationPath('ann@example.edu');

  await top(page).getByRole('button', { name: 'Extend Deadline' }).click();
  const dialog = page.getByRole('dialog').filter({ has: page.getByLabel('Deadline') });
  await dialog.getByRole('radio', { name: 'One student' }).check();
  await dialog.getByLabel('Student', { exact: true }).selectOption({ label: 'Ann Archer' });
  await dialog.getByLabel('Deadline').fill(localIn(9));
  await dialog.getByRole('button', { name: 'Extend' }).click();
  await expect(alertWith(page, 'Deadline extended for Ann Archer')).toBeVisible();

  const newPath = await lastLinkTo('ann@example.edu');
  expect(newPath).not.toBe(oldPath);
  const student = await (await browser.newContext()).newPage();
  await student.goto(newPath);
  await expect(student.getByText('Due:')).toBeVisible();
  await student.goto(oldPath);
  await expect(student.getByText(/cancelled or is no longer available/i)).toBeVisible();
});

test('E2E-45: allowing a resubmission marks the student and emails them a new link', async ({ page }) => {
  await sendFromStatus(page);
  const link = (await invitationPath('ann@example.edu')).split('/').pop();
  const ben = await (await fetch(`${API}/evaluate/${link}`)).json();
  const submitted = await fetch(`${API}/evaluate/${link}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ evaluations: [{
      student_id: ben.teammates[0]._id,
      ratings: { professionalism: 4, communication: 4, work_ethic: 4, content_knowledge_skills: 4, overall_contribution: 4, participation: 3 },
      overall_feedback: 'Reliable and prepared every week.',
    }] }),
  });
  expect(submitted.status).toBe(201);

  await top(page).getByRole('button', { name: 'Close' }).click();
  await courseAction(page, 'Evaluation Status').click();
  await top(page).getByRole('button', { name: 'Allow Ann Archer to resubmit' }).click();
  await sendWithDeadline(page, { days: 4 });
  await expect(alertWith(page, 'Ann Archer can submit again')).toBeVisible();
  await expect(top(page).getByText('Resubmission allowed')).toBeVisible();
  expect(await lastLinkTo('ann@example.edu')).not.toBe(`/evaluate/${link}`);
});
