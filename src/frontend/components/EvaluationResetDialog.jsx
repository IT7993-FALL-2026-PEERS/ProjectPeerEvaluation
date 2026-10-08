import React from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Typography, Button } from '@mui/material';

// The "Evaluations Already Sent" confirmation, moved out of CourseManagement.js (CICD-57, step 3).
// It appears when a team changes after invitations went out; the page decides what Continue does.
function EvaluationResetDialog({ open, onCancel, onConfirm }) {
  return (
    <Dialog open={open} onClose={onCancel} maxWidth="xs" fullWidth>
      <DialogTitle>Evaluations Already Sent</DialogTitle>
      <DialogContent>
        <Typography variant="body1" sx={{ mb: 2 }}>
          Evaluations have already been sent for this course. If you continue, the evaluation state will be reset and you will need to resend evaluations. This will clear all evaluation tokens and responses for this course.
        </Typography>
        <Typography variant="body2" color="error" sx={{ mb: 2 }}>
          This action cannot be undone. Do you want to continue?
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} color="secondary">Cancel</Button>
        <Button onClick={onConfirm} color="warning" variant="contained">Continue</Button>
      </DialogActions>
    </Dialog>
  );
}

export default EvaluationResetDialog;
