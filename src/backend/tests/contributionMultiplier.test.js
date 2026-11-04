const test = require('node:test');
const assert = require('node:assert/strict');
const {
  CAP,
  FLOOR,
  evaluationScore,
  studentScore,
  automaticTeamGrade,
  gradeTeam,
  gradeCourse
} = require('../utils/contributionMultiplier');

// CICD-81: the Contribution Multiplier (docs/requirements/contribution-multiplier-proposal.md). The worked-examples
// table of that document is the specification: every row of it is a test here.
const members = (scores) => scores.map((score, i) => ({ id: `s${i}`, score }));
const one = (n) => Math.round(n * 10) / 10;
const finals = (scores, override) => gradeTeam(members(scores), override).members.map((m) => (m.finalScore === null ? null : one(m.finalScore)));

test('TC-17-40: the cap is 1.00 and the floor is 70', () => {
  assert.equal(CAP, 1);
  assert.equal(FLOOR, 70);
});

// The table of worked examples: peer scores, the automatic team grade (the highest score) and the final grades.
const TABLE = [
  ['3 strong, 1 weak', [95, 95, 95, 60], 95, [95, 95, 95, 70]],
  ['1 strong, 3 weak', [95, 60, 60, 60], 95, [95, 79.5, 79.5, 79.5]],
  ['2 strong, 2 weak', [95, 95, 60, 60], 95, [95, 95, 70, 70]],
  ['all strong', [95, 94, 93, 92], 95, [95, 95, 94.3, 93]],
  ['one weak, 70', [95, 94, 93, 70], 95, [95, 95, 95, 70.7]],
  ['a team of 5, one weak', [95, 95, 95, 95, 50], 95, [95, 95, 95, 95, 70]],
  ['a team of 2', [90, 88], 90, [90, 88]],
  ['everyone low: the team grade is not raised', [60, 60, 60, 60], 60, [60, 60, 60, 60]],
  ['one very high score lifts the team', [99, 80, 80, 80], 99, [99, 91.7, 91.7, 91.7]]
];
for (const [name, scores, grade, expected] of TABLE) {
  test(`TC-17-41: worked example, ${name} (${scores.join(', ')})`, () => {
    const result = gradeTeam(members(scores));
    assert.equal(result.teamGrade, grade);
    assert.equal(result.teamGradeSource, 'automatic');
    assert.deepEqual(finals(scores), expected);
  });
}

test('TC-17-42: the instructor can replace the team grade: 99, 80, 80, 80 with 85 gives 85, 78.8, 78.8, 78.8', () => {
  const result = gradeTeam(members([99, 80, 80, 80]), 85);
  assert.equal(result.teamGrade, 85);
  assert.equal(result.teamGradeSource, 'instructor');
  assert.deepEqual(finals([99, 80, 80, 80], 85), [85, 78.8, 78.8, 78.8]);
});

test('TC-17-43: no override (null or undefined) means the automatic grade', () => {
  assert.equal(gradeTeam(members([90, 80]), null).teamGradeSource, 'automatic');
  assert.equal(gradeTeam(members([90, 80]), undefined).teamGradeSource, 'automatic');
});

test('TC-17-44: nobody ends above the team grade, and the multiplier is at most 1', () => {
  const result = gradeTeam(members([90, 88, 70, 100]), 80);
  for (const m of result.members) {
    assert.ok(m.finalScore <= 80, `${m.id} got ${m.finalScore}`);
    assert.ok(m.multiplier <= 1, `${m.id} multiplier ${m.multiplier}`);
  }
});

test('TC-17-45: a team grade below 70 is not raised by the floor: the floor is the team grade', () => {
  // 60 with one very weak teammate: the multiplier cannot take anybody below the team grade, and nothing is raised.
  assert.deepEqual(finals([95, 30], 60), [60, 60]);
  assert.deepEqual(finals([60, 60, 60, 60]), [60, 60, 60, 60]);
});

test('TC-17-46: the multiplier never takes a student below 70 when the team grade is higher', () => {
  const result = gradeTeam(members([100, 100, 100, 20]), 90);
  assert.equal(result.members[3].finalScore, 70);
  assert.ok(result.members[3].multiplier < 0.7);
});

test('TC-17-47: a student alone in a team gets a multiplier of 1 and the team grade', () => {
  const result = gradeTeam(members([83.4]));
  assert.equal(result.teamGrade, 83.4);
  assert.equal(result.members[0].multiplier, 1);
  assert.equal(result.members[0].finalScore, 83.4);
  const typed = gradeTeam(members([83.4]), 90);
  assert.equal(typed.members[0].finalScore, 90);
});

test('TC-17-48: a teammate with no ratings is left out of the others, not counted as 0', () => {
  // The unrated teammate changes neither the team grade nor the others' multipliers: the team grades like the pair 90, 80.
  const result = gradeTeam(members([90, 80, null]));
  assert.equal(result.teamGrade, 90);
  assert.deepEqual(result.members.map((m) => (m.finalScore === null ? null : one(m.finalScore))), [90, 80, null]);
  const pair = gradeTeam(members([90, 80]));
  assert.equal(result.members[1].multiplier, pair.members[1].multiplier);
});

test('TC-17-49: a student with no ratings shows no score, multiplier or grade, even when the instructor typed a team grade', () => {
  const none = gradeTeam(members([90, null]), 85).members[1];
  assert.deepEqual({ score: none.score, multiplier: none.multiplier, finalScore: none.finalScore }, { score: null, multiplier: null, finalScore: null });
});

test('TC-17-50: a team with no ratings has no automatic grade; the instructor can still enter one', () => {
  const empty = gradeTeam(members([null, null]));
  assert.equal(empty.teamGrade, null);
  assert.equal(empty.teamGradeSource, null);
  assert.deepEqual(empty.members.map((m) => m.finalScore), [null, null]);
  const typed = gradeTeam(members([null, null]), 80);
  assert.equal(typed.teamGrade, 80);
  assert.equal(typed.teamGradeSource, 'instructor');
  assert.deepEqual(typed.members.map((m) => m.finalScore), [null, null]);
});

test('TC-17-51: an empty team, and the automatic grade of a list of scores', () => {
  assert.equal(gradeTeam([]).teamGrade, null);
  assert.equal(automaticTeamGrade([70, 95, null, 80]), 95);
  assert.equal(automaticTeamGrade([null]), null);
  assert.equal(automaticTeamGrade([]), null);
});

test('TC-17-52: the final grade is rounded to two decimals and the multiplier to four', () => {
  const result = gradeTeam(members([95, 60, 60, 60]));
  assert.equal(result.members[1].finalScore, 79.53);
  assert.equal(result.members[1].multiplier, 0.8372);
});

// The score of one rating and of one student.
const ratings = (n) => ({ professionalism: n, communication: n, work_ethic: n, content_knowledge_skills: n, overall_contribution: n, participation: n });
const evaluation = (evaluator, n) => ({ evaluator_id: evaluator, ratings: ratings(n) });

test('TC-17-53: one rater\'s score is the mean of the six criteria as a percentage (1 to 5 times 20)', () => {
  assert.equal(evaluationScore(ratings(5)), 100);
  assert.equal(evaluationScore(ratings(1)), 20);
  assert.equal(evaluationScore({ ...ratings(4), participation: 5 }), (4 * 5 + 5) / 6 * 20);
  assert.equal(evaluationScore(undefined), null);
  assert.equal(evaluationScore({}), null);
});

test('TC-17-54: a student\'s score is the median of the per-rater scores; two ratings: their average; one: that rating', () => {
  assert.equal(studentScore([evaluation('a', 5), evaluation('b', 5), evaluation('c', 1)], 'x'), 100);
  assert.equal(studentScore([evaluation('a', 5), evaluation('b', 3)], 'x'), 80);
  assert.equal(studentScore([evaluation('a', 4)], 'x'), 80);
});

test('TC-17-55: one angry rater does not move the median (a team of 4 or more)', () => {
  // Three raters: 95, 95 and a 20 from a weak student: the mean is 70, the median 95.
  const raters = [evaluation('a', 4.75), evaluation('b', 4.75), evaluation('c', 1)];
  assert.equal(studentScore(raters, 'x'), 95);
});

test('TC-17-56: a rating by the student of themselves is not used', () => {
  const evaluations = [evaluation('x', 1), evaluation('a', 5), evaluation('b', 5)];
  assert.equal(studentScore(evaluations, 'x'), 100);
  assert.equal(studentScore([evaluation('x', 5)], 'x'), null);
});

test('TC-17-57: no evaluations, or ratings that cannot be scored, give no score', () => {
  assert.equal(studentScore([], 'x'), null);
  assert.equal(studentScore(undefined, 'x'), null);
  assert.equal(studentScore([{ evaluator_id: 'a' }], 'x'), null);
});

test('TC-17-58: ids can be ObjectId-like values: they are compared as text', () => {
  const id = { toString: () => 'abc' };
  assert.equal(studentScore([{ evaluator_id: { toString: () => 'abc' }, ratings: ratings(5) }, evaluation('z', 3)], id), 60);
});

// A whole course: students with the evaluations they received, and the teams with the instructor's grades.
const rated = (id, teamId, n) => ({ id, teamId, evaluations: [evaluation('rater', n)] });

test('TC-17-59: gradeCourse grades each team on its own: students, instructor grades and the summary of the teams', () => {
  const students = [rated('a', 't1', 5), rated('b', 't1', 3), rated('c', 't2', 4), rated('d', 't2', 4), { id: 'e', teamId: 't3', evaluations: [] }];
  const teams = [{ id: 't1', teamGrade: null }, { id: 't2', teamGrade: 70 }, { id: 't3', teamGrade: null }, { id: 't4', teamGrade: 88 }];
  const { byStudent, byTeam } = gradeCourse(students, teams);
  assert.equal(byStudent.get('a').teamGrade, 100);
  assert.equal(byStudent.get('a').teamGradeSource, 'automatic');
  assert.equal(byStudent.get('b').contributionScore, 60);
  assert.equal(byStudent.get('b').multiplier, 0.6);
  assert.equal(byStudent.get('b').finalScore, 70);
  assert.equal(byStudent.get('c').teamGradeSource, 'instructor');
  assert.equal(byStudent.get('c').finalScore, 70);
  assert.equal(byStudent.get('e').finalScore, null);
  assert.deepEqual(byTeam.get('t1'), { teamGrade: 100, teamGradeSource: 'automatic', automaticTeamGrade: 100 });
  assert.deepEqual(byTeam.get('t2'), { teamGrade: 70, teamGradeSource: 'instructor', automaticTeamGrade: 80 });
  assert.deepEqual(byTeam.get('t3'), { teamGrade: null, teamGradeSource: null, automaticTeamGrade: null });
  assert.deepEqual(byTeam.get('t4'), { teamGrade: 88, teamGradeSource: 'instructor', automaticTeamGrade: null });
});

test('TC-17-60: a student with no team is graded alone: their own score, multiplier 1', () => {
  const { byStudent } = gradeCourse([rated('a', null, 4), rated('b', undefined, 5), rated('c', 't1', 3)], [{ id: 't1', teamGrade: null }]);
  assert.equal(byStudent.get('a').finalScore, 80);
  assert.equal(byStudent.get('a').multiplier, 1);
  assert.equal(byStudent.get('b').finalScore, 100);
  assert.equal(byStudent.get('c').finalScore, 60);
});

test('TC-17-61: ids may be ObjectId-like, and a team that is not in the list still groups its students', () => {
  const asId = (text) => ({ toString: () => text });
  const { byStudent } = gradeCourse([rated(asId('a'), asId('gone'), 5), rated(asId('b'), asId('gone'), 4)], []);
  assert.equal(byStudent.get('a').finalScore, 100);
  assert.equal(byStudent.get('b').teamGrade, 100);
});
