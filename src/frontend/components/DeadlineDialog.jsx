import React, { useEffect, useState } from 'react';
import { Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, TextField } from '@mui/material';
import { browserZone, isRealLocalTime, toLocalInputValue } from '../services/deadline';

// Asks for the evaluation deadline before evaluations are sent (CICD-67). Used by the course-row send, the
// status dialog's send and the team send. The server checks the deadline again; this only stops the obvious.
function DeadlineDialog({ open, title, description, initialValue, busy, onConfirm, onClose }) {
  const [value, setValue] = useState(initialValue || '');
  useEffect(() => {
    if (open) setValue(initialValue || '');
  }, [open, initialValue]);

  const minimum = toLocalInputValue(new Date());
  const inThePast = Boolean(value) && value <= minimum;
  const skipped = Boolean(value) && !inThePast && !isRealLocalTime(value);

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 2 }}>{description}</DialogContentText>
        <TextField
          label="Deadline"
          type="datetime-local"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          fullWidth
          error={inThePast || skipped}
          helperText={inThePast
            ? 'The deadline must be in the future.'
            : skipped
              ? 'That time does not exist here: the clocks change that night. Choose another time.'
              : `Time zone: ${browserZone()}. Students see this moment in their own time zone.`}
          slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: minimum } }}
          sx={{ mt: 1 }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="contained" disabled={!value || inThePast || skipped || busy} onClick={() => onConfirm(value)}>Send</Button>
      </DialogActions>
    </Dialog>
  );
}

export default DeadlineDialog;
