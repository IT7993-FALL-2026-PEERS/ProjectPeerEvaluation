// Who a student rates (see findTeammates in controllers/evaluationController.js): the rest of their team,
// and nobody when they have no team (CICD-79: the sponsor wants the instructor told, not the student given
// the whole course to rate). A student with nobody to rate is given an empty form and a submission could
// never be accepted (CICD-72), so send, reminders, extend and status treat them separately. `students` must
// be every student of the course, or every student of one team when only that team is asked about.
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
  return { byTeam };
}

function hasNobodyToRate(student, counts) {
  const key = teamKey(student);
  if (!key) return true;
  return (counts.byTeam.get(key) || 0) <= 1;
}

module.exports = { countPeers, hasNobodyToRate };
