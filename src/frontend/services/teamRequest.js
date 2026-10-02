// The body for POST /courses/:course_id/teams. The API expects { teams: [ ... ] }; the dialog used
// to send the bare array, which the server answers with 400 "Teams array required." Teams are
// created empty, so only the name and status are sent.
export function buildCreateTeamBody({ team_name, team_status }) {
  return { teams: [{ team_name: team_name.trim(), team_status }] };
}
