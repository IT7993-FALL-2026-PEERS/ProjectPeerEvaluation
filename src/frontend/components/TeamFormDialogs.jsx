import React from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, FormControl, InputLabel, Select, MenuItem,
} from '@mui/material';
import { isTeamName, TEAM_NAME_HELP } from '../services/teamName';

// The Edit Team and Create New Team dialogs, moved out of CourseManagement.js (CICD-57, step 4).
// They hold no state: `form` is { team_name, team_status } and every change goes back to the page.
// A team is named Team 1, Team 2, ... (services/teamName.js). A team named before that rule can still be saved
// while its name is left alone (`originalName`), but not renamed to another name that is not numbered.
const nameIsAllowed = (name, originalName) => isTeamName(name) || (originalName !== undefined && name === originalName);

function TeamFields({ form, onFormChange, autoFocus, placeholder, originalName }) {
  const wrong = form.team_name.trim() !== '' && !nameIsAllowed(form.team_name, originalName);
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
        error={wrong}
        helperText={TEAM_NAME_HELP}
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

export function EditTeamDialog({ open, form, originalName, onFormChange, onClose, onSave }) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Edit Team</DialogTitle>
      <DialogContent>
        <TeamFields form={form} onFormChange={onFormChange} originalName={originalName} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          onClick={onSave}
          variant="contained"
          disabled={!form.team_name.trim() || !nameIsAllowed(form.team_name, originalName)}
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
          disabled={!isTeamName(form.team_name)}
        >
          Create Team
        </Button>
      </DialogActions>
    </Dialog>
  );
}
