const test = require('node:test');
const assert = require('node:assert/strict');
const Student = require('../models/Student');
const Evaluation = require('../models/Evaluation');
const { startDatabase, stopDatabase, clearDatabase } = require('./helpers/db');
const { startApp } = require('./helpers/app');
const { seed, IDS } = require('./helpers/seed');

// CICD-92: the deployed backend keeps its console output in Render's log, so nothing a request
// handles about a student (name, university ID, email, ratings, written feedback) or about the
// signed-in professor (the request body, the decoded login token) may be written there. A count or a
// database id is fine. Each case records everything written to the console during one request.
let replSet;
let app;
let ada;

const FEEDBACK = 'Kept the sprint board tidy and reviewed every pull request quickly.';
const ROSTER = [
  'student_id,name,email,group_assignment',
  '987654,Quinn Quartz,quinn.quartz@example.edu,Team 3',
  '',
].join('\n');

function recordConsole(t) {
  const lines = [];
  const keep = (...args) => lines.push(args.map((a) => (typeof a === 'string' ? a : require('node:util').inspect(a, { depth: 6 }))).join(' '));
  for (const level of ['log', 'info', 'warn', 'error', 'debug']) t.mock.method(console, level, keep);
  return () => lines.join('\n');
}

function assertNoneLogged(text, values) {
  for (const value of values) assert.ok(!text.includes(value), `the log contains "${value}":\n${text}`);
}

test.before(async () => {
  replSet = await startDatabase();
  app = await startApp();
  ada = app.tokenFor(IDS.ada, 'ada@example.edu');
});
test.after(async () => {
  await app.close();
  await stopDatabase(replSet);
});
test.beforeEach(async () => {
  await clearDatabase();
  await seed();
});

test('TC-SEC-30: a roster upload logs no student name, university ID or email', async (t) => {
  const logged = recordConsole(t);
  const res = await app.uploadCsv(`/api/courses/${IDS.courseAda}/roster`, ROSTER, { token: ada });
  assert.equal(res.status, 200);
  assert.ok(await Student.findOne({ student_id: '987654' }), 'the student was added');
  assertNoneLogged(logged(), ['Quinn Quartz', '987654', 'quinn.quartz@example.edu']);
});

test('TC-SEC-31: a course report logs no student name, email, rating or feedback', async (t) => {
  await Evaluation.create({
    course_id: IDS.courseAda, student_id: IDS.ben, evaluator_id: IDS.ann, evaluation_token: 'a'.repeat(64),
    ratings: { professionalism: 4, communication: 4, work_ethic: 4, content_knowledge_skills: 4, overall_contribution: 4, participation: 3 },
    overall_feedback: FEEDBACK,
  });
  const logged = recordConsole(t);
  const res = await app.request('GET', `/api/courses/${IDS.courseAda}/reports?gradingMethod=mean`, { token: ada });
  assert.equal(res.status, 200);
  assertNoneLogged(logged(), ['Ann Archer', 'Ben Baker', 'ann@example.edu', 'ben@example.edu', 'professionalism', FEEDBACK]);
});

test('TC-SEC-32: creating a course logs neither the request body nor the signed-in professor', async (t) => {
  const logged = recordConsole(t);
  const res = await app.request('POST', '/api/courses', {
    token: ada,
    body: { course_name: 'Zebra Systems Lab', course_number: 'IT 9876', course_section: 'W77', semester: 'Spring 2027' },
  });
  assert.equal(res.status, 201);
  assertNoneLogged(logged(), ['Zebra Systems Lab', 'ada@example.edu', 'User from token', 'Received course creation request']);
});
