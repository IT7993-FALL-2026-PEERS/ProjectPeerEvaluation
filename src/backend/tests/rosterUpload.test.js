const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const mongoose = require('mongoose');
const Student = require('../models/Student');
const Team = require('../models/Team');
const Course = require('../models/Course');
const Evaluation = require('../models/Evaluation');
const { uploadRoster } = require('../controllers/studentController');

// API-3: a roster upload used to clear every student's link token and delete all submitted
// evaluations, so an empty or unusable CSV destroyed student work and then reported success. The
// file is now checked first, and since the sponsor's decision of 12 Oct 2026 an upload never
// clears links or evaluations at all (the explicit reset-evaluation-state endpoint does that). No
// database: every model call is stubbed and recorded, and the controller runs against a real temp CSV file.
const courseId = String(new mongoose.Types.ObjectId());
const HEADER = 'student_id,name,email,group_assignment\n';

// A Mongoose query is a thenable with chainable .select(); this fakes that shape.
function query(result) {
  const q = { select: () => q, then: (resolve, reject) => Promise.resolve(result).then(resolve, reject) };
  return q;
}

function stubModels(t, { existing = [], findFails = false, insertFails = false, insertResult, insertThrowsAfterSaving = false, savedAfterInsert } = {}) {
  const calls = [];
  const record = (name, result) => async (...args) => { calls.push(name); return typeof result === 'function' ? result(...args) : result; };
  t.mock.method(Student, 'updateMany', record('clear-tokens', {}));
  t.mock.method(Evaluation, 'deleteMany', record('delete-evaluations', { deletedCount: 3 }));
  let lookups = 0;
  t.mock.method(Evaluation, 'distinct', async () => []);
  t.mock.method(Student, 'find', (filter) => {
    if (findFails) return query(Promise.reject(new Error('database down')));
    if (!filter.student_id) return query([]);
    lookups += 1; // the first lookup finds who is already in the course; a second one re-reads what an insert saved
    return query(lookups > 1 && savedAfterInsert ? savedAfterInsert : existing);
  });
  t.mock.method(Student, 'insertMany', record('insert-students', (docs) => {
    if (insertFails) throw new Error('database down');
    if (insertThrowsAfterSaving) throw new Error('E11000 duplicate key');
    if (insertResult) return insertResult;
    return docs.map((d) => ({ ...d, _id: new mongoose.Types.ObjectId() }));
  }));
  t.mock.method(Student, 'findByIdAndUpdate', record('link-student', {}));
  t.mock.method(Student, 'countDocuments', record('count-students', 0));
  t.mock.method(Team, 'findOne', record('find-team', null));
  t.mock.method(Team.prototype, 'save', async function save() { calls.push('save-team'); return this; });
  t.mock.method(Team, 'findByIdAndUpdate', record('update-team', {}));
  t.mock.method(Team, 'countDocuments', record('count-teams', 0));
  t.mock.method(Course, 'findByIdAndUpdate', record('update-course', {}));
  t.mock.method(console, 'log', () => {});
  t.mock.method(console, 'error', () => {});
  return calls;
}

// Runs the upload against a temp CSV and resolves with whatever the handler does.
async function upload(t, csvText, options) {
  const calls = stubModels(t, options);
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'roster-')), 'roster.csv');
  fs.writeFileSync(file, csvText);
  t.after(() => fs.rmSync(path.dirname(file), { recursive: true, force: true }));

  const outcome = await new Promise((resolve) => {
    const res = { status() { return this; }, json(body) { resolve({ body }); } };
    uploadRoster({ params: { course_id: courseId }, file: { path: file } }, res, (error) => resolve({ error }));
  });
  return { ...outcome, calls, file };
}

const DESTRUCTIVE = ['clear-tokens', 'delete-evaluations'];

function assertNothingDestroyed(calls) {
  for (const name of DESTRUCTIVE) assert.equal(calls.includes(name), false, `${name} must not run`);
}

const rejectedFiles = [
  ['TC-06-01', 'an empty file', ''],
  ['TC-06-02', 'a file with only a header row', HEADER],
  ['TC-06-03', 'a file where every row is missing a required field', `${HEADER}S1,Alice,,Team A\nS2,,bob@example.com,Team A\n`],
  ['TC-06-04', 'a file with the wrong column names', 'ID,Full Name,Mail\nS1,Alice,alice@example.com\n'],
  // A space is truthy, so it used to pass the required-field check, then fail schema
  // validation on insert and get swallowed, and the wipe still ran.
  ['TC-06-07', 'a file where the required fields are only spaces', `${HEADER}S1, ,alice@example.com,Team A\n  ,Bob,bob@example.com,\n`],
];

for (const [id, label, csvText] of rejectedFiles) {
  test(`${id}: ${label} is rejected and nothing is deleted`, async (t) => {
    const { error, body, calls, file } = await upload(t, csvText);
    assert.equal(body, undefined);
    assert.equal(error.status, 400);
    assert.equal(error.code, 'VALIDATION_ERROR');
    assert.match(error.message, /student_id, name and email/);
    assertNothingDestroyed(calls);
    assert.equal(calls.length, 0, `no database write at all, got ${JSON.stringify(calls)}`);
    assert.equal(fs.existsSync(file), false, 'the temp file is removed');
  });
}

test('the rejection quotes the problem rows so the professor can fix the file', async (t) => {
  const { error } = await upload(t, `${HEADER}S1,Alice,,Team A\nS2,,bob@example.com,\n`);
  assert.match(error.message, /Missing required fields in row: .*"student_id":"S1"/);
  assert.match(error.message, /"student_id":"S2"/);
});

test('the rejection shows at most three problem rows', async (t) => {
  const rows = Array.from({ length: 5 }, (_, i) => `S${i + 1},Name${i + 1},,\n`).join('');
  const { error } = await upload(t, HEADER + rows);
  assert.match(error.message, /and 2 more/);
  assert.doesNotMatch(error.message, /"student_id":"S4"/);
});

test('TC-06-05: a database error while applying the roster leaves evaluations and links untouched', async (t) => {
  const { body, calls } = await upload(t, `${HEADER}S1,Alice,alice@example.com,Team A\n`, { findFails: true });
  assert.match(body.message, /errors/i);
  assertNothingDestroyed(calls);
});

test('TC-06-08: if no student can be saved, evaluations and links are left alone', async (t) => {
  const { body, calls } = await upload(t, `${HEADER}S1,Alice,alice@example.com,Team A\n`, { insertFails: true });
  assert.match(body.message, /errors/i);
  assert.equal(body.evaluation_state_reset, undefined);
  assertNothingDestroyed(calls);
});

// Sponsor decision (12 Oct 2026): previously submitted evaluations must be saved, and professors must be able to
// upload or update rosters without losing existing data. A valid upload therefore never clears links or evaluations.
test('TC-06-06: a valid roster is applied, and evaluations and links are not touched', async (t) => {
  const { body, calls } = await upload(t, `${HEADER}S1,Alice,alice@example.com,Team A\nS2,Bob,bob@example.com,Team A\n`);
  assert.deepEqual(body.students.sort(), ['S1', 'S2']);
  assert.ok(calls.includes('insert-students'), 'the students are saved');
  assertNothingDestroyed(calls);
  assert.equal(body.evaluation_state_reset, undefined);
  assert.equal(body.evaluations_cleared, undefined);
  assert.doesNotMatch(body.message, /reset|fresh start|cleared/i);
});

test('TC-06-83: a roster of students who are all already in the course changes no evaluation or link either', async (t) => {
  const existing = [{ _id: new mongoose.Types.ObjectId(), student_id: 'S1', name: 'Alice', email: 'alice@example.com' }];
  const { body, calls } = await upload(t, `${HEADER}S1,Alice,alice@example.com,Team A\n`, { existing });
  assert.deepEqual(body.students_updated, ['S1']);
  assertNothingDestroyed(calls);
});

// Codex review (13 Oct): an insert that saves some rows and not others used to be reported as a plain success.
test('TC-06-88: if the database saves only some of the new students, the ones it did not save are named', async (t) => {
  const saved = [{ _id: new mongoose.Types.ObjectId(), student_id: 'S1', name: 'Alice', email: 'alice@example.com' }];
  const csv = `${HEADER}S1,Alice,alice@example.com,\nS2,Bob,bob@example.com,\nS3,Carol,carol@example.com,\n`;
  const { body } = await upload(t, csv, { insertResult: saved });
  assert.deepEqual(body.students, ['S1']);
  assert.deepEqual(body.students_failed.sort(), ['S2', 'S3']);
  assert.match(body.errors.join(' | '), /S2/);
  assert.match(body.errors.join(' | '), /S3/);
  assert.doesNotMatch(body.message, /successfully/i, 'it is not reported as a plain success');
});

test('TC-06-89: if the insert throws after saving some students, the ones that were not saved are named', async (t) => {
  const saved = [{ _id: new mongoose.Types.ObjectId(), student_id: 'S1', name: 'Alice', email: 'alice@example.com' }];
  const csv = `${HEADER}S1,Alice,alice@example.com,\nS2,Bob,bob@example.com,\n`;
  const { body, calls } = await upload(t, csv, { insertThrowsAfterSaving: true, savedAfterInsert: saved });
  assert.deepEqual(body.students, ['S1']);
  assert.deepEqual(body.students_failed, ['S2']);
  assert.match(body.errors.join(' | '), /S2/);
  assertNothingDestroyed(calls);
});

test('TC-06-90: when every new student is saved there is no failed list and the message is a plain success', async (t) => {
  const { body } = await upload(t, `${HEADER}S1,Alice,alice@example.com,\nS2,Bob,bob@example.com,\n`);
  assert.deepEqual(body.students_failed, []);
  assert.match(body.message, /successfully/i);
});

// A bad row is reported (FR-07) and the rest are added; only a file with no usable
// rows is rejected (FR-06).
test('TC-07-01: bad rows are reported and the good rows are still added', async (t) => {
  const csv = `${HEADER}S1,Alice,alice@example.com,Team A\nS2,Bob,,Team A\nS3,Carol,carol@example.com,\n`;
  const { body, error, calls } = await upload(t, csv);
  assert.equal(error, undefined);
  assert.deepEqual(body.students.sort(), ['S1', 'S3']);
  assert.equal(body.errors.length, 1);
  assert.match(body.errors[0], /Missing required fields/);
  assertNothingDestroyed(calls);
});

// FR-07 (CICD-47): a row whose email is not in the form name@domain.tld is reported as an
// error and not added, and the other rows are still added. Only the form is checked: this
// makes no claim that the address can receive mail. Each case is its own test with its ID
// written out, so scripts/check-rtm.js can find it.
async function assertBadEmailReported(t, email) {
  const csv = `${HEADER}S1,Alice,alice@example.com,Team A\nS2,Bob,${email},Team A\nS3,Carol,carol@example.com,\n`;
  const { body, error } = await upload(t, csv);
  assert.equal(error, undefined);
  assert.deepEqual(body.students.sort(), ['S1', 'S3']);
  assert.equal(body.errors.length, 1);
  assert.match(body.errors[0], /Invalid email/);
  assert.match(body.errors[0], /"student_id":"S2"/);
}

test('TC-07-04: a row with the email "bob@" is reported and the good rows are still added', (t) => assertBadEmailReported(t, 'bob@'));
test('TC-07-05: a row with the email "bob" is reported and the good rows are still added', (t) => assertBadEmailReported(t, 'bob'));
test('TC-07-06: a row with the email "bob@x" is reported and the good rows are still added', (t) => assertBadEmailReported(t, 'bob@x'));