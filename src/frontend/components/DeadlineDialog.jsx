import React, { useEffect, useRef, useState } from 'react';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Typography } from '@mui/material';
import DeadlineField, { deadlineProblem } from './DeadlineField';

// Asks for the evaluation deadline before evaluations are sent (CICD-67). Used by the course-row send, the
// status dialog's send and the team send, and for an approved resubmission (CICD-68). A send passes a `warning`
// (CICD-80) naming the students it cannot reach; it is a heads-up, not a block. While the page is still
// `checking` who that is, Send stays off, so a prefilled deadline cannot be sent before the warning is known.
function DeadlineDialog({ open, title, description, warning = '', checking = false, initialValue, busy, onConfirm, onClose }) {
  const [value, setValue] = useState(initialValue || '');
  // Set up when the dialog opens, not on every new prefill, so what the instructor typed is kept.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) setValue(initialValue || '');
    wasOpen.current = open;
  }, [open, initialValue]);

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 2 }}>{description}</DialogContentText>
        {checking && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>Checking who can be reached...</Typography>}
        {warning && <Alert severity="warning" sx={{ mb: 2 }}>{warning}</Alert>}
        <DeadlineField value={value} onChange={setValue} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="contained" disabled={!value || Boolean(deadlineProblem(value)) || busy || checking} onClick={() => onConfirm(value)}>Send</Button>
      </DialogActions>
    </Dialog>
  );
}

export default DeadlineDialog;
