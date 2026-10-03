const { test, expect } = require('@playwright/test');
const { resetData, loginAsAda, courseAction, invitationPath } = require('./support/app');

// The student's workflow through the real UI (CW-06, CW-07): an invitation arrives, the student
// opens the link without logging in, rates a teammate, submits, and the professor sees it.
// Run with E2E_START_SERVER=1 (see playwright.config.js).
let passwords;
const API = process.env.E2E_API_URL || 'http://localhost:5000/api';

test.skip(!process.env.E2E_START_SERVER, 'needs the E2E servers: run with E2E_START_SERVER=1');

test.beforeEach(async () => {
  ({ passwords } = await resetData());
});

// Chooses a score for each of the six rubric criteria on the form, in the order they are shown.
async function rate(page, scores) {
  const groups = page.getByRole('radiogroup');
  await expect(groups).toHaveCount(scores.length);
  for (const [index, score] of scores.entries()) {
    await groups.nth(index).locator(`input[value="${score}"]`).check({ force: true });
  }
}

async function sendInvitationsAsAda(page) {
  await loginAsAda(page, passwords);
  await courseAction(page, 'Send Evaluations').click();
  await expect(page.getByText('Progress: 0/4 evaluations completed')).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();
}

test('E2E-10: a student opens the emailed link without logging in and sees their teammate and the rubric', async ({ page, browser }) => {
  await sendInvitationsAsAda(page);
  const student = await (await browser.newContext()).newPage();
  await student.goto(await invitationPath('ann@example.edu'));

  await expect(student.getByRole('heading', { name: 'Group Member Evaluation Rubric' })).toBeVisible();
  await expect(student.getByRole('heading', { name: 'Evaluate: Ben Baker' })).toBeVisible();
  await expect(student.getByRole('heading', { name: 'Evaluate: Cy Cole' })).toHaveCount(0);
  await expect(student.getByRole('radiogroup')).toHaveCount(6);
});

test('E2E-11: a student rates a teammate and submits; the professor then sees one evaluation completed', async ({ page, browser }) => {
  await sendInvitationsAsAda(page);
  const student = await (await browser.newContext()).newPage();
  await student.goto(await invitationPath('ann@example.edu'));

  await rate(student, [4, 5, 4, 3, 4, 3]);
  await student.getByPlaceholder(/constructive feedback/i).fill('Reliable, prepared and easy to work with.');
  await student.getByRole('button', { name: /submit evaluation/i }).click();
  await expect(student.getByText(/Thank you for completing your peer evaluation/)).toBeVisible();

  // The professor's status now counts it.
  await courseAction(page, 'Evaluation Status').click();
  await expect(page.getByText('Progress: 1/4 evaluations completed')).toBeVisible();
});

test('E2E-12: the same link cannot be used to submit twice', async ({ page, browser }) => {
  await sendInvitationsAsAda(page);
  const link = await invitationPath('ann@example.edu');
  const student = await (await browser.newContext()).newPage();
  // Who the student may rate, taken from the form before it is used (it is not served afterwards).
  const token = link.split('/').pop();
  const form = await (await student.request.get(`${API}/evaluate/${token}`)).json();
  await student.goto(link);
  await rate(student, [4, 5, 4, 3, 4, 3]);
  await student.getByPlaceholder(/constructive feedback/i).fill('Reliable, prepared and easy to work with.');
  await student.getByRole('button', { name: /submit evaluation/i }).click();
  await expect(student.getByText(/Thank you for completing your peer evaluation/)).toBeVisible();

  await student.goto(link);
  await expect(student.getByRole('heading', { name: 'Evaluation Completed!' })).toBeVisible();
  await expect(student.getByRole('button', { name: /submit evaluation/i })).toHaveCount(0);

  // The page hides the form, but the server has to refuse a second submission too: post it again
  // through the API, as anyone holding the link could.
  const again = await student.request.post(`${API}/evaluate/${token}`, {
    data: {
      evaluations: form.teammates.map((mate) => ({
        student_id: mate._id,
        ratings: { professionalism: 5, communication: 5, work_ethic: 5, content_knowledge_skills: 5, overall_contribution: 5, participation: 4 },
        overall_feedback: 'A second attempt with the same link.',
      })),
    },
  });
  expect(again.status()).toBe(409);
  expect((await again.json()).error.code).toBe('ALREADY_COMPLETED');

  // And still only the first submission is counted.
  await loginAsAda(page, passwords);
  await courseAction(page, 'Evaluation Status').click();
  await expect(page.getByText('Progress: 1/4 evaluations completed')).toBeVisible();
});

test('E2E-13: a link that does not exist shows a clear message, not a form', async ({ page }) => {
  await page.goto(`/evaluate/${'0'.repeat(64)}`);
  await expect(page.getByText(/cancelled or is no longer available/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /submit evaluation/i })).toHaveCount(0);
});

test('E2E-14: submitting without written feedback is refused and nothing is saved', async ({ page, browser }) => {
  await sendInvitationsAsAda(page);
  const student = await (await browser.newContext()).newPage();
  await student.goto(await invitationPath('ann@example.edu'));
  await rate(student, [4, 5, 4, 3, 4, 3]);
  await student.getByRole('button', { name: /submit evaluation/i }).click();

  await expect(student.getByRole('alert')).toBeVisible();
  await expect(student.getByText(/Thank you for completing/)).toHaveCount(0);
  await courseAction(page, 'Evaluation Status').click();
  await expect(page.getByText('Progress: 0/4 evaluations completed')).toBeVisible();
});
