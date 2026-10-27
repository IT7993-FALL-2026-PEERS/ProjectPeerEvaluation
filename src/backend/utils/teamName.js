// Team names are numbered: Team 1, Team 2, Team 3, ... A name typed another way that means the same team
// ("team 3", "Team3", a bare "3", "Team 03") is written the one way, so the same team never exists twice
// under two spellings. Any other name (Alpha, Team A, Team 0, Team 1 2) is refused.
const TEAM_NAME_HELP = 'Team names are numbered: Team 1, Team 2, Team 3, ...';

// The team's name written as "Team N", or null when the text is not a numbered team name.
function normalizeTeamName(value) {
  if (typeof value !== 'string') return null;
  const match = /^(?:team\s*)?0*([1-9][0-9]*)$/i.exec(value.trim());
  return match ? `Team ${match[1]}` : null;
}

module.exports = { TEAM_NAME_HELP, normalizeTeamName };
