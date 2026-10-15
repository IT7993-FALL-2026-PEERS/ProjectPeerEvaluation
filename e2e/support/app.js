const path = require('node:path');
const { expect } = require('@playwright/test');

// Helpers shared by the end-to-end specs. The backend's control server (e2e/server/backend.js)
// resets the data and returns the email it captured.
const CONTROL = process.env.E2E_CONTROL_URL || 'http://127.0.0.1:5051';

const ROSTER_CSV = path.join(__dirname, '..', 'fixtures', 'roster.csv');
const HEADER_ONLY_CSV = path.join(__dirname, '..', 'fixtures', 'header-only.csv');

// Empties the database and seeds it again: professor Ada (course CS 4850, 4 students in teams Alpha
// and Beta) and professor Bo. Pass { evaluations: true } to add four submitted evaluations.
async function resetData({ evaluations = false } = {}) {
  const res = await fetch(`${CONTROL}/reset${evaluations ? '?evaluations=1' : ''}`, { method: 'POST' });
  if (!res.ok) throw new Error(`reset failed: ${res.status}`);
  return res.json();
}

async function capturedEmails() {
  const res = await fetch(`${CONTROL}/emails`);
  return res.json();
}

// The link in the invitation email sent to an address, as a path on the app (/evaluate/<token>).
async function invitationPath(address) {
  const email = (await capturedEmails()).find((e) => e.to === address);
  expect(email, `an invitation email to ${address}`).toBeTruthy();
  const match = email.html.match(/href="[^"]*(\/evaluate\/[0-9a-f]{64})"/);
  expect(match, 'an evaluation link in the email').toBeTruthy();
  return match[1];
}

async function loginAs(page, email, password) {
  await page.goto('/');
  await page.getByPlaceholder('Email').fill(email);
  await page.getByPlaceholder('Password').fill(password);
  await page.getByRole('button', { name: 'Login' }).click();
}

// Logs in as Ada and waits for her course list.
async function loginAsAda(page, passwords) {
  await loginAs(page, 'ada@example.edu', passwords.ada);
  await expect(page.getByRole('heading', { name: 'Welcome Ada Lovelace' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'CS 4850' })).toBeVisible();
}

// The page's message banners (success and error). A plain locator rather than getByRole('alert'):
// while a dialog is open the banner sits behind it, and role queries skip content a modal hides.
const alertWith = (page, text) => page.locator('[role=alert]').filter({ hasText: text });

// Every send asks for the evaluation deadline first (CICD-67). Fills the dialog with a time `days`
// from now, in the browser's own time, and presses Send.
const pad2 = (n) => String(n).padStart(2, '0');
async function sendWithDeadline(page, { days = 7 } = {}) {
  const when = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  const value = `${when.getFullYear()}-${pad2(when.getMonth() + 1)}-${pad2(when.getDate())}T${pad2(when.getHours())}:${pad2(when.getMinutes())}`;
  const dialog = page.getByRole('dialog').filter({ has: page.getByLabel('Deadline') });
  await dialog.getByLabel('Deadline').fill(value);
  await dialog.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(dialog).toBeHidden();
}

// A button in the course row, found by its tooltip (the row has icon buttons only).
const courseAction = (page, title) => page.getByTitle(title).first();

module.exports = {
  resetData, capturedEmails, invitationPath, loginAs, loginAsAda, courseAction, alertWith, sendWithDeadline,
  ROSTER_CSV, HEADER_ONLY_CSV,
};
