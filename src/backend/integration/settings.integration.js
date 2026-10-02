const test = require('node:test');
const assert = require('node:assert/strict');
const Professor = require('../models/Professor');
const Student = require('../models/Student');
const { startDatabase, stopDatabase, clearDatabase } = require('./helpers/db');
const { startApp } = require('./helpers/app');
const { seed, IDS } = require('./helpers/seed');

// CW-10 AI features, FR-22 flag list, and CW-12 the rubric.
//
// Summaries, red flags and sentiment are stubs that answer 501, and the rubric is one fixed
// configuration with nothing to manage (open sponsor questions: FR-21, FR-23, D-09). The 501 and
// fixed-rubric tests record how things are today; replace them if those features are built.
let server;
let app;
let ada;
let bo;

test.before(async () => {
  server = await startDatabase();
  app = await startApp();
  ada = app.tokenFor(IDS.ada, 'ada@example.edu');
  bo = app.tokenFor(IDS.bo, 'bo@example.edu');
});
test.after(async () => {
  await app.close();
  await stopDatabase(server);
});
test.beforeEach(async (t) => {
  t.mock.method(console, 'log', () => {});
  t.mock.method(console, 'error', () => {});
  await clearDatabase();
  await seed();
});

const words = (token) => app.request('GET', '/api/professor/ai-words', { token });
const change = (token, body) => app.request('POST', '/api/professor/ai-words', { token, body });

test('TC-21-20: summarize, red-flags and sentiment are not implemented yet and say so (501)', async () => {
  for (const path of ['summarize', 'red-flags', 'sentiment']) {
    const res = await app.request('POST', `/api/ai/${path}`, { token: ada, body: {} });
    assert.equal(res.status, 501, path);
    assert.equal(res.body.error.code, 'NOT_IMPLEMENTED');
  }
});

test('TC-21-21: the AI routes need a login', async () => {
  const res = await app.request('POST', '/api/ai/summarize', { body: {} });
  assert.equal(res.status, 401);
});

test('TC-22-30: a new professor starts with the default list of concerning words', async () => {
  const res = await words(ada);
  assert.equal(res.status, 200);
  assert.ok(res.body.words.includes('bully'));
  assert.ok(res.body.words.length > 20);
});

test('TC-22-31: a word can be added, edited and deleted, and the saved list is what is returned next time', async () => {
  const start = (await words(ada)).body.words.length;

  const added = await change(ada, { action: 'add', word: 'tardy' });
  assert.equal(added.body.words[start], 'tardy');

  await change(ada, { action: 'edit', index: start, word: 'tardiness' });
  assert.equal((await Professor.findById(IDS.ada)).aiConcerningWords[start], 'tardiness');

  await change(ada, { action: 'delete', index: start });
  const after = (await words(ada)).body.words;
  assert.equal(after.length, start);
  assert.ok(!after.includes('tardiness'));
});

test('TC-22-32: one professor\'s word list does not change another\'s', async () => {
  await change(ada, { action: 'add', word: 'tardy' });
  assert.ok(!(await words(bo)).body.words.includes('tardy'));
});

test('TC-13-20: the form\'s rubric is the one fixed rubric: five criteria scored 1-5, participation 1-4, and written feedback', async () => {
  const send = await app.request('POST', `/api/courses/${IDS.courseAda}/evaluations/send`, { token: ada, body: {} });
  assert.equal(send.status, 200);
  const { evaluation_token: token } = await Student.findById(IDS.ann);

  const form = await app.request('GET', `/api/evaluate/${token}`);
  assert.equal(form.status, 200);
  const scales = Object.fromEntries(form.body.rubric.criteria.map((c) => [c.id, c.scale]));
  assert.deepEqual(scales, {
    professionalism: '1-5', communication: '1-5', work_ethic: '1-5',
    content_knowledge_skills: '1-5', overall_contribution: '1-5', participation: '1-4',
  });
  assert.equal(form.body.rubric.overallFeedback.id, 'overall_feedback');
});
