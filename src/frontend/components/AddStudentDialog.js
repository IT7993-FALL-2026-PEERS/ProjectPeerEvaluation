import React from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, TextField, Typography, Button } from '@mui/material';

// The Add Student dialog, moved out of CourseManagement.js (CICD-57, step 2). It holds no state: the
// page owns the form, the error and the request, and passes the handlers in.
function AddStudentDialog({ open, form, error, onFormChange, onClose, onSubmit }) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Add Student</DialogTitle>
      <DialogContent>
        <TextField
          fullWidth
          margin="normal"
          label="Student ID"
          value={form.student_id}
          onChange={e => onFormChange({ ...form, student_id: e.target.value })}
          error={!!error && !form.student_id}
        />
        <TextField
          fullWidth
          margin="normal"
          label="Name"
          value={form.name}
          onChange={e => onFormChange({ ...form, name: e.target.value })}
          error={!!error && !form.name}
        />
        <TextField
          fullWidth
          margin="normal"
          label="Email"
          value={form.email}
          onChange={e => onFormChange({ ...form, email: e.target.value })}
          error={!!error && !form.email}
        />
        <TextField
          fullWidth
          margin="normal"
          label="Team Assignment (Optional)"
          value={form.group_assignment}
          onChange={e => onFormChange({ ...form, group_assignment: e.target.value })}
          helperText="Enter team name or identifier for this student"
        />
        {error && (
          <Typography color="error" variant="body2" sx={{ mt: 1 }}>{error}</Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={onSubmit} variant="contained">Add</Button>
      </DialogActions>
    </Dialog>
  );
}

export default AddStudentDialog;
