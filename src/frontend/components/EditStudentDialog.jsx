import React from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, TextField, Button } from '@mui/material';
import TeamSelect from './TeamSelect';

// The Edit Student dialog, moved out of CourseManagement.js (CICD-57, step 2). The page owns the
// form and the request; Save stays off while the student ID, name or email is empty. The team is optional (CICD-79).
function EditStudentDialog({ open, form, teamNames, onFormChange, onClose, onSave }) {
  const incomplete = [form.student_id, form.name, form.email].some(value => !value.trim());
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Edit Student</DialogTitle>
      <DialogContent>
        <TextField
          required
          fullWidth
          margin="normal"
          label="Student ID"
          value={form.student_id}
          onChange={e => onFormChange({ ...form, student_id: e.target.value })}
        />
        <TextField
          required
          fullWidth
          margin="normal"
          label="Name"
          value={form.name}
          onChange={e => onFormChange({ ...form, name: e.target.value })}
        />
        <TextField
          required
          fullWidth
          margin="normal"
          label="Email"
          value={form.email}
          onChange={e => onFormChange({ ...form, email: e.target.value })}
        />
        <TeamSelect
          value={form.group_assignment}
          onChange={team => onFormChange({ ...form, group_assignment: team })}
          existingTeams={teamNames}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={onSave} variant="contained" disabled={incomplete}>Save</Button>
      </DialogActions>
    </Dialog>
  );
}

export default EditStudentDialog;
