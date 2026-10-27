// Team names are numbered: Team 1, Team 2, Team 3, ... The server (backend utils/teamName.js) writes a name typed
// another way that means the same team ("team 3", "Team3", a bare "3") as "Team 3" and refuses any other name;
// this is the same check, so a dialog can say so before anything is sent.
export const TEAM_NAME_HELP = 'Team names are numbered: Team 1, Team 2, Team 3, ...';

export const isTeamName = (value) => /^(?:team\s*)?0*[1-9][0-9]*$/i.test(String(value ?? '').trim());
