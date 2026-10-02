const assert = require('node:assert/strict');
const Course = require('../../models/Course');
const Student = require('../../models/Student');
const Team = require('../../models/Team');

// Team membership is stored in two places: Team.students (the list) and Student.team_id (the
// back-reference), plus counts on Team and Course. They drift when a write updates one side only
// (D-10). Call this after any roster, student or team change; it fails if the pieces disagree.
async function assertCourseConsistent(courseId) {
  const teams = await Team.find({ course_id: courseId });
  const students = await Student.find({ course_id: courseId });

  for (const team of teams) {
    const fromStudents = students.filter((s) => String(s.team_id) === String(team._id)).map((s) => String(s._id)).sort();
    const fromTeam = team.students.map(String).sort();
    assert.deepEqual(fromTeam, fromStudents, `team ${team.team_name}: Team.students and Student.team_id disagree`);
    assert.equal(team.student_count, fromTeam.length, `team ${team.team_name}: student_count`);
  }

  // A student's team_id must point at a team that exists in this course.
  const teamIds = new Set(teams.map((t) => String(t._id)));
  for (const student of students) {
    if (student.team_id) {
      assert.ok(teamIds.has(String(student.team_id)), `student ${student.student_id} points at a missing team`);
    }
  }

  const course = await Course.findById(courseId);
  assert.equal(course.student_count, students.length, 'course.student_count');
  assert.equal(course.team_count, teams.length, 'course.team_count');
}

module.exports = { assertCourseConsistent };
