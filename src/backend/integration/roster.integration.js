const test = require('node:test');
const assert = require('node:assert/strict');
const Course = require('../models/Course');
const Student = require('../models/Student');
const Team = require('../models/Team');
const Evaluation = require('../models/Evaluation');
const { startDatabase, stopDatabase, clearDatabase } = require('./helpers/db');
const { startApp } = require('./helpers/app');
const { seed, IDS } = require('./helpers/seed');

// FR-06 / FR-07 / FR-08: roster upload. The upload writes students, teams and counts in several
// steps and links team membership in two places, which is where drift happens, so it is checked
// against a real database.
let replSet;
let app;
let ada;
let bo;

const ROSTER = [
  'student_id,name,email,group_assignment',
  '1005,Fay Foster,fay@example.edu,Team 3',
  '1006,Gus Green,gus@example.edu,Team 3',
  '',
].join('\n');
const uploadPath = (courseId) => `/api/courses/${courseId}/roster`;

// One evaluation Ann submitted for Ben, with the link she used.
async function seedSubmittedEvaluation() {
  await Student.findByIdAndUpdate(IDS.ann, {
    evaluation_token: 'a'.repeat(64),
    evaluation_token_expires_at: new Date(Date.now() + 86400000),
    evaluation_completed: true,
  });
  await Evaluation.create({
    course_id: IDS.courseAda, student_id: IDS.ben, evaluator_id: IDS.ann, evaluation_token: 'a'.repeat(64),
    ratings: { professionalism: 4, communication: 4, work_ethic: 4, content_knowledge_skills: 4, overall_contribution: 4, participation: 3 },
    overall_feedback: 'Reliable and prepared every week.',
  });
}

test.before(async () => {
  replSet = await startDatabase();
  app = await startApp();
  ada = app.tokenFor(IDS.ada, 'ada@example.edu');
  bo = app.tokenFor(IDS.bo, 'bo@example.edu');
});
test.after(async () => {
  await app.close();
  await stopDatabase(replSet);
});
test.beforeEach(async (t) => {
  t.mock.method(console, 'log', () => {});
  t.mock.method(console, 'error', () => {});
  await clearDatabase();
  await seed();
});

test('TC-06-20: a roster adds students and a new team, and membership matches on both sides', async () => {
  const res = await app.uploadCsv(uploadPath(IDS.courseAda), ROSTER, { token: ada });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.students.sort(), ['1005', '1006']);
  assert.deepEqual(res.body.team_names, ['Team 3']);

  const gamma = await Team.findOne({ course_id: IDS.courseAda, team_name: 'Team 3' });
  const members = await Student.find({ course_id: IDS.courseAda, team_id: gamma._id });
  assert.deepEqual(members.map((s) => s.student_id).sort(), ['1005', '1006']);
  assert.deepEqual(gamma.students.map(String).sort(), members.map((s) => String(s._id)).sort());
  assert.equal(gamma.student_count, 2);
});

test('TC-06-55: a roster row with a team that is not numbered (Alpha) is reported and skipped; team 4 and 5 become Team 4 and Team 5', async () => {
  const csv = [
    'student_id,name,email,team_name',
    '1005,Fay Foster,fay@example.edu,Alpha',
    '1006,Gus Green,gus@example.edu,Team 3',
    '1007,Hal Hill,hal@example.edu,team 4',
    '1008,Ivy Ives,ivy@example.edu,5',
    '1009,Jo Jones,jo@example.edu,',
    '',
  ].join('\n');
  const res = await app.uploadCsv(uploadPath(IDS.courseAda), csv, { token: ada });

  assert.equal(res.status, 200);
  assert.deepEqual(res.body.students.sort(), ['1006', '1007', '1008', '1009']);
  assert.ok(res.body.errors.some((message) => /Alpha/.test(message) && /Team 1, Team 2, Team 3/.test(message) && /1005/.test(message)), JSON.stringify(res.body.errors));
  assert.equal(await Student.countDocuments({ course_id: IDS.courseAda, student_id: '1005' }), 0);
  assert.deepEqual((await Team.find({ course_id: IDS.courseAda })).map((team) => team.team_name).sort(), ['Team 1', 'Team 2', 'Team 3', 'Team 4', 'Team 5']);
  assert.equal((await Student.findOne({ course_id: IDS.courseAda, student_id: '1009' })).team_id, null);
});

test('TC-06-56: a roster with only unnumbered team names changes nothing', async () => {
  const csv = ['student_id,name,email,team_name', '1005,Fay Foster,fay@example.edu,Alpha', '1006,Gus Green,gus@example.edu,Beta', ''].join('\n');
  const res = await app.uploadCsv(uploadPath(IDS.courseAda), csv, { token: ada });

  assert.equal(res.status, 400);
  assert.equal(await Student.countDocuments({ course_id: IDS.courseAda }), 4);
  assert.equal(await Team.countDocuments({ course_id: IDS.courseAda }), 2);
});

test('TC-06-21: the course counts follow the roster', async () => {
  await app.uploadCsv(uploadPath(IDS.courseAda), ROSTER, { token: ada });
  const course = await Course.findById(IDS.courseAda);
  assert.equal(course.student_count, 6);
  assert.equal(course.team_count, 3);
});

test('TC-06-22: uploading the same roster twice adds nobody twice', async () => {
  await app.uploadCsv(uploadPath(IDS.courseAda), ROSTER, { token: ada });
  const second = await app.uploadCsv(uploadPath(IDS.courseAda), ROSTER, { token: ada });
  assert.equal(second.status, 200);
  assert.deepEqual(second.body.students, []);
  assert.equal(await Student.countDocuments({ course_id: IDS.courseAda }), 6);
  assert.equal(await Team.countDocuments({ course_id: IDS.courseAda, team_name: 'Team 3' }), 1);
});

test('TC-06-23: a file with no usable rows gets 400 and changes nothing, evaluations included', async () => {
  await seedSubmittedEvaluation();
  for (const csv of ['', 'student_id,name,email,group_assignment\n', 'ID,Full Name,Mail\n9,Zed,zed@example.edu\n']) {
    const res = await app.uploadCsv(uploadPath(IDS.courseAda), csv, { token: ada });
    assert.equal(res.status, 400, JSON.stringify(csv));
  }
  assert.equal(await Evaluation.countDocuments({ course_id: IDS.courseAda }), 1);
  assert.equal(await Student.countDocuments({ course_id: IDS.courseAda }), 4);
  const ann = await Student.findById(IDS.ann);
  assert.equal(ann.evaluation_token, 'a'.repeat(64));
});

test('TC-06-24: rows missing a required field are reported and the good rows are still added', async () => {
  const csv = [
    'student_id,name,email,group_assignment',
    '1005,Fay Foster,fay@example.edu,Team 3',
    '1006,   ,gus@example.edu,Team 3',
    '',
  ].join('\n');
  const res = await app.uploadCsv(uploadPath(IDS.courseAda), csv, { token: ada });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.students, ['1005']);
  assert.equal(res.body.errors.length, 1);
  assert.equal(await Student.countDocuments({ course_id: IDS.courseAda, student_id: '1006' }), 0);
});

// FR-07 (CICD-47): a row whose email is not in the form name@domain.tld is reported, is not
// saved, and the good rows are still added.
test('TC-07-10: a row with a badly formed email is reported and not saved, and the good rows are still added', async () => {
  const csv = [
    'student_id,name,email,group_assignment',
    '1005,Fay Foster,fay@example.edu,Team 3',
    '1006,Gus Green,gus@example,Team 3',
    '',
  ].join('\n');
  const res = await app.uploadCsv(uploadPath(IDS.courseAda), csv, { token: ada });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.students, ['1005']);
  assert.equal(res.body.errors.length, 1);
  assert.match(res.body.errors[0], /Invalid email/);
  assert.equal(await Student.countDocuments({ course_id: IDS.courseAda, student_id: '1006' }), 0);
});
// Sponsor decision (12 Oct 2026): "Previously submitted evaluations must be saved. Professors should be able to
// upload or update rosters for multiple course sections without losing existing data."
test('TC-06-25: a successful re-upload keeps the submitted evaluations and the evaluation links', async () => {
  await seedSubmittedEvaluation();
  const before = await Student.findById(IDS.ann);
  const res = await app.uploadCsv(uploadPath(IDS.courseAda), ROSTER, { token: ada });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.students.sort(), ['1005', '1006'], 'the new students are added');
  assert.equal(res.body.evaluations_cleared, undefined);
  assert.equal(res.body.evaluation_state_reset, undefined);
  assert.doesNotMatch(res.body.message, /reset|fresh start|cleared/i);

  assert.equal(await Evaluation.countDocuments({ course_id: IDS.courseAda }), 1, 'the submitted evaluation is still there');
  const ann = await Student.findById(IDS.ann);
  assert.equal(ann.evaluation_token, 'a'.repeat(64), 'the link is still the one she was sent');
  assert.equal(new Date(ann.evaluation_token_expires_at).getTime(), new Date(before.evaluation_token_expires_at).getTime());
  assert.equal(ann.evaluation_completed, true, 'and she is still marked as having submitted');
});

// Codex review (13 Oct): evaluations are tied to who is on a team. A student who has submitted or received
// evaluations keeps their team when a roster says otherwise (the upload says so in `errors`), because moving
// them would leave the saved evaluations pointing at a team they are no longer in. Everyone else can move.
test('TC-06-81: an updated roster adds new students and moves those with no evaluations; students with evaluations keep their team', async () => {
  await seedSubmittedEvaluation(); // Ann submitted an evaluation of Ben (both in Team 1)
  const updated = [
    'student_id,name,email,group_assignment',
    '1001,Ann Archer,ann@example.edu,Team 3', // submitted: stays in Team 1
    '1002,Ben Baker,ben@example.edu,Team 3', // received one: stays in Team 1
    '1003,Cy Cole,cy@example.edu,Team 3', // nothing yet: moves
    '1005,Fay Foster,fay@example.edu,Team 3', // new
    '',
  ].join('\n');
  const res = await app.uploadCsv(uploadPath(IDS.courseAda), updated, { token: ada });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.students, ['1005']);
  assert.deepEqual(res.body.students_updated, ['1003'], 'only the student who was moved is listed as updated; the two who kept their team are not');
  assert.equal(await Evaluation.countDocuments({ course_id: IDS.courseAda }), 1, 'the evaluation is kept');
  assert.equal(await Student.countDocuments({ course_id: IDS.courseAda }), 5, 'nobody who was not in the file was removed');

  assert.equal((await Student.findById(IDS.ann)).group_assignment, 'Team 1');
  assert.equal((await Student.findById(IDS.ben)).group_assignment, 'Team 1');
  const reported = res.body.errors.join(' | ');
  assert.match(reported, /1001/);
  assert.match(reported, /1002/);
  assert.match(reported, /submitted or received evaluations/);
  assert.doesNotMatch(reported, /1003/, 'Cy was moved, so there is nothing to report');

  const cy = await Student.findById(IDS.cy);
  assert.equal(cy.group_assignment, 'Team 3');
  const gamma = await Team.findOne({ course_id: IDS.courseAda, team_name: 'Team 3' });
  assert.deepEqual([...gamma.students].map(String).sort(), [String(IDS.cy), String((await Student.findOne({ student_id: '1005', course_id: IDS.courseAda }))._id)].sort());
  assert.equal(gamma.student_count, 2);
});

// Codex review, second pass (13 Oct). The guard compares the requested team with the team the student is really in
// (their team id), not the label; a failed write must not leave a student out of their own team; and a submission
// that arrives after the first check is caught by a second look just before the move.
test('TC-06-91: the evaluation guard uses the team the student is really in, not the label, so a mismatched label does not let a move through', async () => {
  await seedSubmittedEvaluation();
  await Student.updateOne({ _id: IDS.ann }, { group_assignment: 'Team 3' }); // the label says Team 3, the team id says Team 1
  const csv = ['student_id,name,email,group_assignment', '1001,Ann Archer,ann@example.edu,Team 3', ''].join('\n');
  const res = await app.uploadCsv(uploadPath(IDS.courseAda), csv, { token: ada });
  assert.equal(res.status, 200);
  assert.match(res.body.errors.join(' | '), /1001.*submitted or received evaluations/);
  const ann = await Student.findById(IDS.ann);
  assert.equal(String(ann.team_id), String(IDS.teamAlpha), 'she was not moved');
  assert.ok([...(await Team.findById(IDS.teamAlpha)).students].map(String).includes(String(IDS.ann)), 'and she is still listed in her team');
  assert.equal(await Team.countDocuments({ course_id: IDS.courseAda, team_name: 'Team 3' }), 0, 'no team was made only for a student who could not move');
  assert.equal(await Evaluation.countDocuments({ course_id: IDS.courseAda }), 1);
});

test('TC-06-92: if writing a moved student fails, they stay in their team, and uploading again completes the move cleanly', async (t) => {
  const csv = ['student_id,name,email,group_assignment', '1003,Cy Cole,cy@example.edu,Team 1', ''].join('\n');
  const original = Student.findByIdAndUpdate.bind(Student);
  const failing = t.mock.method(Student, 'findByIdAndUpdate', async (id, ...rest) => {
    if (String(id) === String(IDS.cy)) throw new Error('write failed');
    return original(id, ...rest);
  });

  const first = await app.uploadCsv(uploadPath(IDS.courseAda), csv, { token: ada });
  assert.equal(first.status, 200);
  assert.match(first.body.errors.join(' | '), /1003/);
  assert.equal(String((await Student.findById(IDS.cy)).team_id), String(IDS.teamBeta), 'still in Team 2');
  assert.ok([...(await Team.findById(IDS.teamBeta)).students].map(String).includes(String(IDS.cy)), 'and still listed in Team 2');
  assert.ok(![...(await Team.findById(IDS.teamAlpha)).students].map(String).includes(String(IDS.cy)), 'and not listed in Team 1');

  failing.mock.restore();
  const second = await app.uploadCsv(uploadPath(IDS.courseAda), csv, { token: ada });
  assert.equal(second.status, 200);
  const alpha = await Team.findById(IDS.teamAlpha);
  const beta = await Team.findById(IDS.teamBeta);
  assert.equal([...alpha.students].map(String).filter((id) => id === String(IDS.cy)).length, 1);
  assert.ok(![...beta.students].map(String).includes(String(IDS.cy)));
  assert.equal(alpha.student_count, 3);
  assert.equal(beta.student_count, 1);
});

test('TC-06-93: an upload run again repairs a student left in two teams\' lists by an earlier failure', async () => {
  // Cy is really in Team 1 but is still listed in Team 2's array (a leftover of an interrupted move)
  await Student.updateOne({ _id: IDS.cy }, { team_id: IDS.teamAlpha, group_assignment: 'Team 1' });
  await Team.updateOne({ _id: IDS.teamAlpha }, { $addToSet: { students: IDS.cy } });
  const csv = ['student_id,name,email,group_assignment', '1003,Cy Cole,cy@example.edu,Team 1', ''].join('\n');
  const res = await app.uploadCsv(uploadPath(IDS.courseAda), csv, { token: ada });
  assert.equal(res.status, 200);
  const beta = await Team.findById(IDS.teamBeta);
  assert.ok(![...beta.students].map(String).includes(String(IDS.cy)), 'no longer listed in the old team');
  assert.equal(beta.student_count, 1);
  assert.equal((await Team.findById(IDS.teamAlpha)).student_count, 3);
});

test('TC-06-94: an evaluation saved after the first check but before the move still stops the move', async (t) => {
  const csv = ['student_id,name,email,group_assignment', '1003,Cy Cole,cy@example.edu,Team 1', ''].join('\n');
  const original = Team.findOne.bind(Team);
  let submitted = false;
  t.mock.method(Team, 'findOne', async (...args) => {
    if (!submitted) {
      submitted = true; // Cy submits an evaluation of Di while the upload is working, after it has already looked
      await Evaluation.create({
        course_id: IDS.courseAda, student_id: IDS.di, evaluator_id: IDS.cy, evaluation_token: 'c'.repeat(64),
        ratings: { professionalism: 4, communication: 4, work_ethic: 4, content_knowledge_skills: 4, overall_contribution: 4, participation: 3 },
        overall_feedback: 'Reliable and prepared every week.',
      });
    }
    return original(...args);
  });
  const res = await app.uploadCsv(uploadPath(IDS.courseAda), csv, { token: ada });
  assert.equal(res.status, 200);
  assert.match(res.body.errors.join(' | '), /1003.*submitted or received evaluations/);
  assert.equal(String((await Student.findById(IDS.cy)).team_id), String(IDS.teamBeta), 'Cy was not moved');
  assert.equal(await Evaluation.countDocuments({ course_id: IDS.courseAda }), 1);
});

test('TC-06-84: moving a student with no evaluations takes them out of the old team and keeps both teams\' lists and counts right', async () => {
  const csv = ['student_id,name,email,group_assignment', '1003,Cy Cole,cy@example.edu,Team 1', ''].join('\n');
  const res = await app.uploadCsv(uploadPath(IDS.courseAda), csv, { token: ada });
  assert.equal(res.status, 200);
  const alpha = await Team.findById(IDS.teamAlpha);
  const beta = await Team.findById(IDS.teamBeta);
  const inAlpha = [...alpha.students].map(String);
  assert.equal(inAlpha.filter((id) => id === String(IDS.cy)).length, 1, 'in the new team once');
  assert.ok(![...beta.students].map(String).includes(String(IDS.cy)), 'and no longer in the old team');
  assert.equal(alpha.student_count, 3);
  assert.equal(beta.student_count, 1, 'the old team\'s count was recalculated');
  assert.equal(String((await Student.findById(IDS.cy)).team_id), String(IDS.teamAlpha));

  // uploading the same file again changes nothing
  await app.uploadCsv(uploadPath(IDS.courseAda), csv, { token: ada });
  const alphaAgain = await Team.findById(IDS.teamAlpha);
  assert.equal([...alphaAgain.students].length, 3);
  assert.equal(alphaAgain.student_count, 3);
});

test('TC-06-87: the same student id twice in one file adds one student (the first row) and says so', async () => {
  const csv = [
    'student_id,name,email,group_assignment',
    '1005,Fay Foster,fay@example.edu,Team 3',
    '1005,Someone Else,other@example.edu,Team 4',
    '1006,Gus Green,gus@example.edu,Team 3',
    '',
  ].join('\n');
  const res = await app.uploadCsv(uploadPath(IDS.courseAda), csv, { token: ada });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.students.sort(), ['1005', '1006']);
  assert.match(res.body.errors.join(' | '), /1005.*(twice|more than once|duplicate)/i);
  const fay = await Student.findOne({ student_id: '1005', course_id: IDS.courseAda });
  assert.equal(fay.name, 'Fay Foster', 'the first row was used');
  assert.equal(fay.group_assignment, 'Team 3');
  assert.equal(await Team.countDocuments({ course_id: IDS.courseAda, team_name: 'Team 4' }), 0, 'the ignored row made no team');
});

test('TC-06-82: uploading rosters for several sections of the same professor keeps every section\'s data', async () => {
  const sectionTwo = await Course.create({
    course_name: 'Capstone', course_number: 'CS 4850', course_section: '02', professor_id: IDS.ada,
    semester: 'Fall', year: 2026, course_status: 'Active',
  });
  await seedSubmittedEvaluation();
  const sameIds = ['student_id,name,email,group_assignment', '1001,Ann Archer,ann@example.edu,Team 4', '1007,Hal Hart,hal@example.edu,Team 4', ''].join('\n');
  const res = await app.uploadCsv(uploadPath(sectionTwo._id), sameIds, { token: ada });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.students.sort(), ['1001', '1007'], 'the same university id may be in two sections');
  assert.equal(await Student.countDocuments({ course_id: sectionTwo._id }), 2);
  assert.equal(await Evaluation.countDocuments({ course_id: IDS.courseAda }), 1, 'the first section keeps its evaluation');
  assert.equal(await Student.countDocuments({ course_id: IDS.courseAda }), 4, 'and its students');
  assert.equal((await Student.findById(IDS.ann)).evaluation_token, 'a'.repeat(64));

  // and uploading the same file again changes nothing in either section
  const again = await app.uploadCsv(uploadPath(sectionTwo._id), sameIds, { token: ada });
  assert.equal(again.status, 200);
  assert.equal(await Student.countDocuments({ course_id: sectionTwo._id }), 2);
  assert.equal(await Evaluation.countDocuments({ course_id: IDS.courseAda }), 1);
});

test('TC-06-26: another professor cannot upload to the course, and nothing changes', async () => {
  const res = await app.uploadCsv(uploadPath(IDS.courseAda), ROSTER, { token: bo });
  assert.equal(res.status, 404);
  assert.equal(await Student.countDocuments({ course_id: IDS.courseAda }), 4);
  assert.equal(await Team.countDocuments({ course_id: IDS.courseAda }), 2);
});

test('TC-06-27: an upload with no token gets 401', async () => {
  const res = await app.uploadCsv(uploadPath(IDS.courseAda), ROSTER);
  assert.equal(res.status, 401);
});
