import React, { useState } from 'react';
import { TextField, MenuItem, Alert } from '@mui/material';

// The optional Team field of the add and edit student dialogs (the sponsor's answer, CICD-79): "No team
// assigned", Team 1 to Team 10, then "+ Add another team", which adds the next numbered team (Team 11, Team 12, ...) to the list and picks it. A team exists
// on the server once a student is saved in it. The numbered teams the course already has beyond Team 10
// are in the list from the start (`existingTeams`: the team names of the course's students), so the
// numbering goes on from them. "+ Add another team" is never passed on as a team name.
export const TEAM_CHOICES = Array.from({ length: 10 }, (_, index) => `Team ${index + 1}`);

const ADD_ANOTHER = '__add_another_team__';
export const NO_TEAM = 'No team assigned';

// The number of a name written exactly as "Team 12", otherwise 0 ("Team 012" and "Group A" are not numbered).
const teamNumber = (name) => {
  const match = /^Team (\d+)$/.exec(name);
  return match && name === `Team ${Number(match[1])}` ? Number(match[1]) : 0;
};

// A student without a team is allowed (the sponsor's answer), but is not sent an evaluation: they have nobody to
// rate (evaluationController findTeammates). A small alert tells the instructor so while no team is chosen.
function TeamSelect({ value, onChange, existingTeams = [] }) {
  const [added, setAdded] = useState(() => [...new Set(existingTeams)]
    .filter((name) => teamNumber(name) > TEAM_CHOICES.length)
    .sort((a, b) => teamNumber(a) - teamNumber(b)));
  // A team the student already has (from a roster upload, say) that is not a numbered one: keep it as an
  // option for as long as the dialog is open, so it can be chosen back after another team was picked.
  const [original] = useState(value);
  const otherCurrent = original.trim() && !TEAM_CHOICES.includes(original) && !added.includes(original) ? [original] : [];
  const empty = !value.trim();

  const handleSelect = (event) => {
    const chosen = event.target.value;
    if (chosen !== ADD_ANOTHER) {
      onChange(chosen);
      return;
    }
    const next = `Team ${Math.max(TEAM_CHOICES.length, teamNumber(original), ...added.map(teamNumber)) + 1}`;
    setAdded((previous) => [...previous, next]);
    onChange(next);
  };

  return (
    <>
      <TextField
        select
        fullWidth
        margin="normal"
        label="Team Assignment"
        value={value}
        onChange={handleSelect}
        slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
      >
        <MenuItem value="">{NO_TEAM}</MenuItem>
        {[...TEAM_CHOICES, ...added, ...otherCurrent].map((team) => (
          <MenuItem key={team} value={team}>{team}</MenuItem>
        ))}
        <MenuItem value={ADD_ANOTHER}>+ Add another team</MenuItem>
      </TextField>
      {empty && (
        <Alert severity="warning" sx={{ py: 0 }}>
          No team assigned. This student will not be sent an evaluation until you assign a team.
        </Alert>
      )}
    </>
  );
}

export default TeamSelect;
