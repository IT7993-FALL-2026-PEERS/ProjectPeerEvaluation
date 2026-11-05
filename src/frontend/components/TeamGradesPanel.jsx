import React, { useState } from 'react';
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle,
  Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import api from '../services/api';

// The team grades of the Contribution Multiplier report (CICD-81): the app proposes the highest student score in
// each team, and the instructor can replace it for any team or go back to the proposed one.
export const gradeProblem = (text) => {
  if (String(text).trim() === '') return 'Enter a grade from 0 to 100, or use the automatic grade.';
  const number = Number(text);
  if (!Number.isFinite(number) || number < 0 || number > 100) return 'The grade must be a number from 0 to 100.';
  return '';
};

const show = (grade) => (grade === null || grade === undefined ? '–' : `${grade}%`);

function TeamGradesPanel({ courseId, teams, onChanged }) {
  const [editing, setEditing] = useState(null);
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const open = (team) => {
    setEditing(team);
    setValue(team.teamGradeSource === 'instructor' && team.teamGrade !== null ? String(team.teamGrade) : '');
    setError('');
  };
  const close = () => { if (!saving) setEditing(null); };

  const save = async (teamGrade) => {
    setSaving(true);
    setError('');
    try {
      await api.put(`/courses/${courseId}/teams/${editing._id}/grade`, { team_grade: teamGrade });
      setEditing(null);
      if (onChanged) await onChanged();
    } catch (err) {
      setError(err.response?.data?.error?.message || err.response?.data?.message || 'Could not save the team grade.');
    } finally {
      setSaving(false);
    }
  };

  const problem = editing ? gradeProblem(value) : '';

  return (
    <Paper sx={{ p: 3, mb: 3 }}>
      <Typography variant="h6" gutterBottom>Team Grades</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Each team gets one grade. It starts as the highest student score in the team; set your own grade for a team
        when that is not the grade you want (for example when one score is far above the rest).
      </Typography>
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Team</TableCell>
              <TableCell align="center">Team Grade</TableCell>
              <TableCell align="center">Set By</TableCell>
              <TableCell align="center">Proposed Grade</TableCell>
              <TableCell align="center">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {teams.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} align="center"><Typography color="text.secondary">No teams in this course</Typography></TableCell>
              </TableRow>
            ) : teams.map((team) => (
              <TableRow key={team._id}>
                <TableCell>{team.team_name}</TableCell>
                <TableCell align="center"><strong>{show(team.teamGrade)}</strong></TableCell>
                <TableCell align="center">
                  {team.teamGradeSource === 'instructor' && <Chip label="You" color="primary" size="small" />}
                  {team.teamGradeSource === 'automatic' && <Chip label="Automatic" size="small" variant="outlined" />}
                  {!team.teamGradeSource && <Typography variant="body2" color="text.secondary">No ratings yet</Typography>}
                </TableCell>
                <TableCell align="center">{show(team.automaticTeamGrade)}</TableCell>
                <TableCell align="center">
                  <Button size="small" onClick={() => open(team)} aria-label={`Edit the grade of ${team.team_name}`}>Edit</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={Boolean(editing)} onClose={close} maxWidth="xs" fullWidth>
        <DialogTitle>Team Grade{editing ? `: ${editing.team_name}` : ''}</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            {editing && editing.automaticTeamGrade !== null
              ? `The highest student score in this team is ${editing.automaticTeamGrade}%. `
              : 'Nobody in this team has ratings yet. '}
            Students keep their own multiplier; this grade is what the multiplier is applied to.
          </DialogContentText>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          <Box>
            <TextField
              label="Team grade (0 to 100)"
              type="number"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              error={Boolean(value !== '' && problem)}
              helperText={value !== '' && problem ? problem : ' '}
              slotProps={{ htmlInput: { min: 0, max: 100, step: 'any' } }}
              fullWidth
              autoFocus
            />
          </Box>
        </DialogContent>
        <DialogActions>
          {editing && editing.teamGradeSource === 'instructor' && (
            <Button onClick={() => save(null)} disabled={saving} sx={{ mr: 'auto' }}>Use automatic grade</Button>
          )}
          <Button onClick={close} disabled={saving}>Cancel</Button>
          <Button variant="contained" onClick={() => save(Number(value))} disabled={saving || Boolean(problem)}>Save</Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}

export default TeamGradesPanel;
