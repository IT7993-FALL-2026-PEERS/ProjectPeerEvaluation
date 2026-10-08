import React from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, FormControl, InputLabel, Select, MenuItem,
} from '@mui/material';

// The Edit Team and Create New Team dialogs, moved out of CourseManagement.js (CICD-57, step 4).
// They hold no state: `form` is { team_name, team_status } and every change goes back to the page.
function TeamFields({ form, onFormChange, autoFocus, placeholder }) {
  return (
    <>
      <TextField
        fullWidth
        label="Team Name"
        value={form.team_name}
        onChange={(e) => onFormChange({ ...form, team_name: e.target.value })}
        margin="normal"
        required
        autoFocus={autoFocus}
        placeholder={placeholder}
      />
      <FormControl fullWidth margin="normal">
        <InputLabel>Team Status</InputLabel>
        <Select
          value={form.team_status}
          onChange={(e) => onFormChange({ ...form, team_status: e.target.value })}
          label="Team Status"
        >
          <MenuItem value="Active">Active</MenuItem>
          <MenuItem value="Inactive">Inactive</MenuItem>
        </Select>
      </FormControl>
    </>
  );
}

export function EditTeamDialog({ open, form, onFormChange, onClose, onSave }) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Edit Team</DialogTitle>
      <DialogContent>
        <TeamFields form={form} onFormChange={onFormChange} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          onClick={onSave}
          variant="contained"
          disabled={!form.team_name.trim()}
        >
          Save Changes
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export function CreateTeamDialog({ open, form, onFormChange, onClose, onCreate }) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Create New Team</DialogTitle>
      <DialogContent>
        <TeamFields form={form} onFormChange={onFormChange} autoFocus placeholder="Team 1" />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          onClick={onCreate}
          variant="contained"
          disabled={!form.team_name.trim()}
        >
          Create Team
        </Button>
      </DialogActions>
    </Dialog>
  );
}
