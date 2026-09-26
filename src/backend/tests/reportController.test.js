const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Course = require('../models/Course');
const Student = require('../models/Student');
const Team = require('../models/Team');
const Evaluation = require('../models/Evaluation');
const controller = require('../controllers/reportController');

const courseId = new mongoose.Types.ObjectId();
const teamId = new mongoose.Types.ObjectId();
test.beforeEach((t) => {
  t.mock.method(console, 'log', () => {});
  t.mock.method(console, 'error', () => {});
});

function fixture(scores = [60, 80]) {
  const course = new Course({ _id: courseId, course_name: 'Capstone', course_number: '7993',
    course_section: '01', semester: 'Fall 2026', professor_id: new mongoose.Types.ObjectId() });
  const team = new Team({ _id: teamId, team_name: 'Team "A"', course_id: courseId });
  const students = scores.map((score, i) => {
    const student = new Student({ student_id: 'S' + i, name: i === 0 ? 'Smith, John' : 'Jane',
      email: 'student' + i + '@example.com', course_id: courseId });
    student.team_id = team; // Match populate('team_id'), including toObject behavior.
    return student;
  });
  const evaluations = scores.map((score, i) => new Evaluation({
    course_id: courseId, student_id: students[i]._id, evaluator_id: new mongoose.Types.ObjectId(),
    ratings: { professionalism: score / 20, communication: score / 20, work_ethic: score / 20,
      content_knowledge_skills: score / 20, overall_contribution: score / 20, participation: score / 25 },
    overall_feedback: 'Reliable teammate.', evaluation_token: 'token-' + i
  }));
  return { course, team, students, evaluations };
}

function stubCourse(t, data) {
  t.mock.method(Course, 'findById', async () => data.course);
  t.mock.method(Student, 'find', () => ({ populate: async () => data.students }));
  t.mock.method(Evaluation, 'find', async () => data.evaluations);
  t.mock.method(Team, 'find', async () => [data.team]);
}

async function call(action, { params = {}, query = {} } = {}) {
  const res = {
    statusCode: undefined, body: undefined, headers: {}, sent: false,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    setHeader(key, value) { this.headers[key] = value; },
    send(body) { this.body = body; this.sent = true; return this; }
  };
  const errors = [];
  await controller[action]({ params: { course_id: courseId.toString(), team_id: teamId.toString(),
    student_id: 'S0', ...params }, query }, res, err => errors.push(err));
  return { res, errors };
}

function ok(result) {
  assert.deepEqual(result.errors, []);
  assert.equal(result.res.statusCode, 200);
  return result.res.body;
}

function error(result, status, code) {
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].status, status);
  assert.equal(result.errors[0].code, code);
  assert.equal(result.res.statusCode, undefined);
  assert.equal(result.res.body, undefined);
  assert.equal(result.res.sent, false);
}

for (const action of ['getCourseReport', 'getStudentReport', 'getTeamReport']) {
  test(action + ': invalid course id returns 400', async () => {
    error(await call(action, { params: { course_id: 'invalid' } }), 400, 'VALIDATION_ERROR');
  });
}
test('getTeamReport: invalid team id returns 400', async () => {
  error(await call('getTeamReport', { params: { team_id: 'invalid' } }), 400, 'VALIDATION_ERROR');
});

for (const action of ['getCourseReport', 'downloadReport']) {
  test(action + ': missing course returns 404 without sending a response', async (t) => {
    t.mock.method(Course, 'findById', async () => null);
    const result = await call(action);
    error(result, 404, 'NOT_FOUND');
    assert.deepEqual(result.res.headers, {});
  });
}

test('getCourseReport: no students response', async (t) => {
  const data = fixture([]);
  stubCourse(t, data);
  assert.deepEqual(ok(await call('getCourseReport')), {
    course: data.course, students: [], teams: [], gradingMethod: 'mean',
    message: 'No students found in this course'
  });
});

test('getCourseReport: no evaluations gives every student No evaluations', async (t) => {
  const data = fixture();
  data.evaluations = [];
  stubCourse(t, data);
  const body = ok(await call('getCourseReport'));
  assert.equal(body.message, 'No evaluations found for this course');
  assert.deepEqual(body.students, data.students.map(student => ({
    ...student.toObject(), meanScore: 0, letterGrade: 'No evaluations', evaluationsReceived: 0
  })));
  assert.deepEqual(body.teams, []);
});

test('getCourseReport: scales participation by 5/4 and averages all ratings across evaluations', async (t) => {
  const data = fixture([80]);
  data.evaluations[0].ratings.participation = 2;
  const second = new Evaluation(data.evaluations[0].toObject());
  second.ratings.participation = 4;
  data.evaluations.push(second);
  stubCourse(t, data);
  const student = ok(await call('getCourseReport')).students[0];
  // (5*4 + 2*5/4 + 5*4 + 4*5/4) / 12 * 20 = 79.1666...
  assert.equal(student.originalScore, 79.17);
  assert.equal(student.finalScore, 79.17);
  assert.equal(student.letterGrade, 'C');
  assert.equal(student.evaluationsReceived, 2);
});

test('getCourseReport: letter grade boundaries and summary distribution', async (t) => {
  const data = fixture([90, 89, 80, 79, 70, 69, 60, 59]);
  stubCourse(t, data);
  const body = ok(await call('getCourseReport'));
  assert.deepEqual(body.students.map(s => s.letterGrade), ['A', 'B', 'B', 'C', 'C', 'D', 'D', 'F']);
  assert.deepEqual(body.summary, { totalStudents: 8, studentsWithEvaluations: 8, averageScore: 74.5,
    gradeDistribution: { A: 1, B: 2, C: 2, D: 2, F: 1 } });
});

test('getCourseReport: curved scores move toward the mean below the protection threshold', async (t) => {
  const data = fixture([40, 70, 80, 90]);
  stubCourse(t, data);
  const body = ok(await call('getCourseReport', {
    query: { gradingMethod: 'curved', boostFactor: '0.5', protectionThreshold: '80' }
  }));
  assert.deepEqual(body.students.map(s => s.originalScore), [40, 70, 80, 90]);
  assert.deepEqual(body.students.map(s => s.finalScore), [55, 70, 80, 90]);
  assert.deepEqual(body.students.map(s => s.improvement), [15, 0, 0, 0]);
  assert.deepEqual(body.gradingSettings, { boostFactor: 0.5, protectionThreshold: 80,
    classStats: { mean: 70, standardDeviation: 18.71, boostFactor: 0.5, protectionThreshold: 80 } });
});

test('getCourseReport: team averages include populated team members',
  { todo: 'populated team ids are compared as plain objects' }, async (t) => {
    const data = fixture([60, 80]);
    stubCourse(t, data);
    const body = ok(await call('getCourseReport'));
    assert.equal(body.teams[0].students.length, 2);
    assert.equal(body.teams[0].averageScore, 70);
    assert.equal(body.teams[0].letterGrade, 'C');
  });

for (const kind of ['allFive', 'concerning']) {
  test('getCourseReport: AI flags ' + kind, async (t) => {
    const data = fixture([kind === 'allFive' ? 100 : 80]);
    if (kind === 'concerning') data.evaluations[0].overall_feedback = 'They cheat on assignments.';
    stubCourse(t, data);
    assert.deepEqual(ok(await call('getCourseReport')).students[0].evaluationDetails[0].aiFlags, {
      allFive: kind === 'allFive', concerning: kind === 'concerning', flagged: true
    });
  });
}

test('downloadReport: sends CSV headers and preserves commas and quotes in columns', async (t) => {
  const data = fixture([80]);
  stubCourse(t, data);
  const result = await call('downloadReport');
  const csv = ok(result);
  assert.equal(result.res.sent, true);
  assert.deepEqual(result.res.headers, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': 'attachment; filename="course_' + courseId + '_report.csv"'
  });
  assert.equal(csv, 'Student ID,Name,Email,Team,Original Score,Final Score,Letter Grade,Evaluations Received,Improvement\n' +
    'S0,"Smith, John",student0@example.com,"Team ""A""",80,80,B,1,0');
});

test('downloadReport: prefixes formula names and preserves negative improvement', async (t) => {
  const data = fixture([40, 75, 80]);
  data.students[1].name = '=SUM(1,2)';
  stubCourse(t, data);
  const csv = ok(await call('downloadReport', {
    query: { gradingMethod: 'curved', boostFactor: '0.5', protectionThreshold: '80' }
  }));
  // Mean is 65: 75 + 0.5*(65-75) = 70, so improvement remains numeric -5.
  assert.equal(csv.split('\n')[2], 'S1,"\'=SUM(1,2)",student1@example.com,"Team ""A""",75,70,C,1,-5');
});

test('getStudentReport: unknown student returns 404', async (t) => {
  t.mock.method(Student, 'findOne', () => ({ populate: async () => null }));
  error(await call('getStudentReport'), 404, 'NOT_FOUND');
});

test('getStudentReport: returns received and given evaluations', async (t) => {
  const data = fixture([80]);
  const student = data.students[0];
  const find = t.mock.method(Student, 'findOne', () => ({ populate: async () => student }));
  const evaluations = t.mock.method(Evaluation, 'find', async filter =>
    filter.evaluator_id ? [data.evaluations[0], data.evaluations[0]] : data.evaluations);
  assert.deepEqual(ok(await call('getStudentReport')), {
    student, meanScore: 80, letterGrade: 'B', evaluationsReceived: 1, evaluationsGiven: 2,
    detailedEvaluations: data.evaluations
  });
  assert.deepEqual(find.mock.calls[0].arguments, [{ course_id: courseId, student_id: 'S0' }]);
  assert.deepEqual(evaluations.mock.calls.map(c => c.arguments[0]), [
    { course_id: courseId, student_id: student._id }, { course_id: courseId, evaluator_id: student._id }
  ]);
});

test('getTeamReport: unknown team returns 404', async (t) => {
  t.mock.method(Team, 'findById', async () => null);
  error(await call('getTeamReport'), 404, 'NOT_FOUND');
});

test('getTeamReport: returns member scores and teamAverage', async (t) => {
  const data = fixture([60, 80]);
  t.mock.method(Team, 'findById', async () => data.team);
  const find = t.mock.method(Student, 'find', async () => data.students);
  t.mock.method(Evaluation, 'find', async () => data.evaluations);
  const body = ok(await call('getTeamReport'));
  assert.equal(body.team, data.team);
  assert.equal(body.teamAverage, 70);
  assert.equal(body.teamLetterGrade, 'C');
  assert.deepEqual(body.members.map(m => [m.meanScore, m.letterGrade, m.evaluationsReceived]),
    [[60, 'D', 1], [80, 'B', 1]]);
  assert.deepEqual(find.mock.calls[0].arguments, [{ course_id: courseId, team_id: teamId }]);
});

test('generateReport: returns the same report as getCourseReport', async (t) => {
  stubCourse(t, fixture());
  assert.deepEqual(ok(await call('generateReport')), ok(await call('getCourseReport')));
});
