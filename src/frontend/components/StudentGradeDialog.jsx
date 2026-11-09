import React, { useEffect, useState } from 'react';
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, TextField,
} from '@mui/material';
import api from '../services/api';

// The final score of one student in the Contribution Multiplier report (CICD-81). The report calculates it; the
// instructor can replace it for any student (for example one the report flagged) or go back to the calculated grade.
// The grade typed here is used exactly as typed, it is not rounded.
export const scoreProblem = (text) => {
  if (String(text).trim() === '') return 'Enter a grade from 0 to 100, or use the calculated grade.';
  const number = Number(text);
  if (!Number.isFinite(number) || number < 0 || number > 100) return 'The grade must be a number from 0 to 100.';
  return '';
};

function StudentGradeDialog({ courseId, student, onClose, onChanged }) {
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // A new student: start from the grade the instructor set before, or empty
  useEffect(() => {
    if (student) {
      setValue(student.finalScoreSource === 'instructor' ? String(student.finalScore) : '');
      setError('');
    }
  }, [student]);

  const close = () => { if (!saving) onClose(); };

  const save = async (finalScore) => {
    setSaving(true);
    setError('');
    try {
      await api.put(`/courses/${courseId}/students/${student._id}/grade`, { final_score: finalScore });
      onClose();
      if (onChanged) await onChanged();
    } catch (err) {
      setError(err.response?.data?.error?.message || err.response?.data?.message || 'Could not save the final score.');
    } finally {
      setSaving(false);
    }
  };

  const problem = scoreProblem(value);
  const adjusted = Boolean(student) && student.finalScoreSource === 'instructor';

  return (
    <Dialog open={Boolean(student)} onClose={close} maxWidth="xs" fullWidth>
      <DialogTitle>{student ? `Final Score: ${student.name}` : 'Final Score'}</DialogTitle>
      <DialogContent>
        {student && (
          <DialogContentText sx={{ mb: 2 }}>
            {student.contributionScore != null && (
              <>
                Score {student.contributionScore}%, team grade {student.teamGrade == null ? '–' : `${student.teamGrade}%`},
                multiplier {student.multiplier == null ? '–' : student.multiplier.toFixed(2)}.{' '}
              </>
            )}
            {student.calculatedScore != null
              ? `Calculated final score: ${student.calculatedScore}%. `
              : 'Nobody has rated this student, so there is no calculated grade. '}
            {student.flagged && 'The multiplier took this grade below 70: check the ratings behind it. '}
            The grade you type is used exactly as typed.
          </DialogContentText>
        )}
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Box>
          <TextField
            label="Final score (0 to 100)"
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
        {adjusted && (
          <Button onClick={() => save(null)} disabled={saving} sx={{ mr: 'auto' }}>Use calculated grade</Button>
        )}
        <Button onClick={close} disabled={saving}>Cancel</Button>
        <Button variant="contained" onClick={() => save(Number(value))} disabled={saving || Boolean(problem)}>Save</Button>
      </DialogActions>
    </Dialog>
  );
}

export default StudentGradeDialog;
