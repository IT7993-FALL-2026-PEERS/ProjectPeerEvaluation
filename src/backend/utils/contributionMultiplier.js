// The Contribution Multiplier (CICD-81; the rule is in docs/requirements/contribution-multiplier-proposal.md).
// A team has one grade. The peer ratings do not decide how good the team is, only how that grade is shared inside it:
//   student score = the median of the scores of the ratings the student received (a rating by themselves is not used)
//   team grade    = the instructor's grade for the team, or else the highest student score in the team
//   multiplier    = student score / average score of the OTHER scored teammates, at most CAP
//   final grade   = team grade x multiplier, never above the team grade, and the multiplier never takes the student
//                   below FLOOR (or below the team grade, when that is lower than FLOOR)
// The cap, the floor and the way the automatic grade is chosen are the team's proposal; the sponsor decides, so they
// live here and nowhere else.

const CAP = 1;
const FLOOR = 70;

const CRITERIA = ['professionalism', 'communication', 'work_ethic', 'content_knowledge_skills', 'overall_contribution', 'participation'];

const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

const round = (value, places) => {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
};

// One rater's score for one student: the mean of the criteria they rated, as a percentage (1 to 5 times 20), the
// same arithmetic as the report's mean score. null when no criterion has a rating.
function evaluationScore(ratings) {
  const given = CRITERIA.map((criterion) => ratings && ratings[criterion]).filter((value) => value > 0);
  return given.length === 0 ? null : mean(given) * 20;
}

// A student's score: the median of the per-rater scores. With two ratings that is their average, with one that rating.
// null when nobody (other than the student) rated them.
function studentScore(evaluations, studentId) {
  const own = String(studentId);
  const scores = (evaluations || [])
    .filter((evaluation) => String(evaluation.evaluator_id) !== own)
    .map((evaluation) => evaluationScore(evaluation.ratings))
    .filter((score) => score !== null);
  return scores.length === 0 ? null : median(scores);
}

// The grade the app proposes for a team: its highest student score, or null when nobody has one.
function automaticTeamGrade(scores) {
  const scored = (scores || []).filter((score) => score !== null && score !== undefined);
  return scored.length === 0 ? null : Math.max(...scored);
}

// members: [{ id, score }] with score null for a student nobody rated. override: the instructor's team grade, or
// null/undefined for the automatic one. Returns the team grade, where it came from, and for each member the score,
// multiplier and final grade (null for a member with no ratings: they are not guessed, the instructor decides).
function gradeTeam(members, override) {
  const scored = members.filter((member) => member.score !== null && member.score !== undefined);
  const typed = override !== null && override !== undefined;
  const teamGrade = typed ? override : automaticTeamGrade(scored.map((member) => member.score));
  const source = typed ? 'instructor' : teamGrade === null ? null : 'automatic';

  return {
    teamGrade: teamGrade === null ? null : round(teamGrade, 2),
    teamGradeSource: source,
    members: members.map((member) => {
      if (teamGrade === null || member.score === null || member.score === undefined) {
        return { id: member.id, score: member.score ?? null, multiplier: null, finalScore: null };
      }
      const others = scored.filter((other) => other !== member).map((other) => other.score);
      const multiplier = others.length === 0 ? CAP : Math.min(CAP, member.score / mean(others));
      const finalScore = Math.max(Math.min(teamGrade, FLOOR), teamGrade * multiplier);
      return { id: member.id, score: member.score, multiplier: round(multiplier, 4), finalScore: round(finalScore, 2) };
    })
  };
}

// A whole course. students: [{ id, teamId, evaluations }] (teamId null for a student with no team, who is graded
// alone: their own score and a multiplier of 1); teams: [{ id, teamGrade }] with teamGrade the instructor's grade or
// null. Returns byStudent (by id as text) and byTeam (by team id as text, one entry for every team of the list,
// including a team without students).
function gradeCourse(students, teams) {
  const overrides = new Map(teams.map((team) => [String(team.id), team.teamGrade]));
  const groups = new Map();
  for (const student of students) {
    const key = student.teamId === null || student.teamId === undefined ? `alone:${student.id}` : String(student.teamId);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ id: String(student.id), score: studentScore(student.evaluations, student.id) });
  }

  const byStudent = new Map();
  const byTeam = new Map();
  const keys = new Set([...groups.keys(), ...overrides.keys()]);
  for (const key of keys) {
    const group = groups.get(key) || [];
    const result = gradeTeam(group, overrides.get(key));
    const automatic = automaticTeamGrade(group.map((member) => member.score));
    if (overrides.has(key)) {
      byTeam.set(key, {
        teamGrade: result.teamGrade,
        teamGradeSource: result.teamGradeSource,
        automaticTeamGrade: automatic === null ? null : round(automatic, 2)
      });
    }
    for (const member of result.members) {
      byStudent.set(member.id, {
        contributionScore: member.score === null ? null : round(member.score, 2),
        multiplier: member.multiplier,
        finalScore: member.finalScore,
        teamGrade: result.teamGrade,
        teamGradeSource: result.teamGradeSource
      });
    }
  }
  return { byStudent, byTeam };
}

module.exports = { CAP, FLOOR, evaluationScore, studentScore, automaticTeamGrade, gradeTeam, gradeCourse };
