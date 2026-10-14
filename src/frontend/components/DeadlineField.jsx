import React from 'react';
import { TextField } from '@mui/material';
import { browserZone, isRealLocalTime, toLocalInputValue } from '../services/deadline';

// The deadline input shared by the send, extend and resubmit dialogs (CICD-67, CICD-68). The server checks the
// deadline again; this only stops the obvious.
export function deadlineProblem(value) {
  if (!value) return '';
  if (value <= toLocalInputValue(new Date())) return 'past';
  return isRealLocalTime(value) ? '' : 'skipped';
}

const HELP = {
  past: 'The deadline must be in the future.',
  skipped: 'That time does not exist here: the clocks change that night. Choose another time.',
};

function DeadlineField({ value, onChange }) {
  const problem = deadlineProblem(value);
  return (
    <TextField
      label="Deadline"
      type="datetime-local"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      fullWidth
      error={Boolean(problem)}
      helperText={HELP[problem] || `Time zone: ${browserZone()}. Students see this moment in their own time zone.`}
      slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: toLocalInputValue(new Date()) } }}
      sx={{ mt: 1 }}
    />
  );
}

export default DeadlineField;
