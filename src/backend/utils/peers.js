// Who a student rates (see findTeammates in controllers/evaluationController.js): the rest of their team,
// or the rest of the course when they have no team. A student with nobody to rate is given an empty form
// and a submission could never be accepted (CICD-72), so send, reminders, extend and status treat them
// separately. `students` must be every student of the course, or every student of one team when only that
// team is asked about (a student with no team is never in a team's list).
const teamKey = (student) => {
  const team = student.team_id;
  return team ? String(team._id || team) : null;
};

function countPeers(students) {
  const byTeam = new Map();
  for (const student of students) {
    const key = teamKey(student);
    if (key) byTeam.set(key, (byTeam.get(key) || 0) + 1);
  }
  return { byTeam, course: students.length };
}

function hasNobodyToRate(student, counts) {
  const key = teamKey(student);
  const members = key ? counts.byTeam.get(key) || 0 : counts.course;
  return members <= 1;
}

module.exports = { countPeers, hasNobodyToRate };
