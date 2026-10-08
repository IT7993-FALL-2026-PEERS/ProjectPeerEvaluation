import React from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, TextField, Button } from '@mui/material';

// The Edit Student dialog, moved out of CourseManagement.js (CICD-57, step 2). The page owns the
// form and the request; Save stays off while the student ID, name or email is empty.
function EditStudentDialog({ open, form, onFormChange, onClose, onSave }) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Edit Student</DialogTitle>
      <DialogContent>
        <TextField
          fullWidth
          margin="normal"
          label="Student ID"
          value={form.student_id}
          onChange={e => onFormChange({ ...form, student_id: e.target.value })}
        />
        <TextField
          fullWidth
          margin="normal"
          label="Name"
          value={form.name}
          onChange={e => onFormChange({ ...form, name: e.target.value })}
        />
        <TextField
          fullWidth
          margin="normal"
          label="Email"
          value={form.email}
          onChange={e => onFormChange({ ...form, email: e.target.value })}
        />
        <TextField
          fullWidth
          margin="normal"
          label="Team Assignment (Optional)"
          value={form.group_assignment}
          onChange={e => onFormChange({ ...form, group_assignment: e.target.value })}
          helperText="Enter team name or identifier for this student"
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={onSave} variant="contained" disabled={!form.student_id || !form.name || !form.email}>Save</Button>
      </DialogActions>
    </Dialog>
  );
}

export default EditStudentDialog;
