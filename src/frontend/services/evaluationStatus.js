// How the evaluation status dialog lays students out (moved out of CourseManagement.js, CICD-57,
// step 3): one group per team, teams in natural order, and students without a team last.
const NO_TEAM = 'No Team';

// Natural order for team names: "Team 2" before "Team 10". Words before the number are compared
// first, then the number, then what follows it; names without a number compare as plain text.
function compareTeams(a, b) {
  if (a === NO_TEAM) return 1;
  if (b === NO_TEAM) return -1;

  const aMatch = a.match(/^(.+?)(\d+)(.*)$/);
  const bMatch = b.match(/^(.+?)(\d+)(.*)$/);

  if (aMatch && bMatch) {
    const prefixCompare = aMatch[1].localeCompare(bMatch[1]);
    if (prefixCompare !== 0) return prefixCompare;

    const numA = parseInt(aMatch[2]);
    const numB = parseInt(bMatch[2]);
    if (numA !== numB) return numA - numB;

    return aMatch[3].localeCompare(bMatch[3]);
  }

  return a.localeCompare(b);
}

// Returns [[teamName, students], ...] in display order.
export function groupStudentsByTeam(students) {
  const groups = students?.reduce((acc, student) => {
    const teamName = student.team || NO_TEAM;
    if (!acc[teamName]) {
      acc[teamName] = [];
    }
    acc[teamName].push(student);
    return acc;
  }, {}) || {};

  return Object.entries(groups).sort(([a], [b]) => compareTeams(a, b));
}
