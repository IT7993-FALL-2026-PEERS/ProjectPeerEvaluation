import React, { useEffect, useRef, useState } from 'react';
import {
  Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle,
  FormControlLabel, Radio, RadioGroup, TextField,
} from '@mui/material';
import DeadlineField, { deadlineProblem } from './DeadlineField';

// Gives more time with a new link (CICD-68): one student, one team, or everyone who has not submitted.
// Each old link stops working once its new one has been emailed; students who submitted are not changed.
function ExtendDeadlineDialog({ open, students, teams, initialValue, busy, onConfirm, onClose }) {
  const [scope, setScope] = useState('unsubmitted');
  const [studentId, setStudentId] = useState('');
  const [teamId, setTeamId] = useState('');
  const [value, setValue] = useState(initialValue || '');
  // Set up when the dialog opens, not on every new prefill: a response arriving while it is open must not
  // throw away what the instructor chose (Codex review).
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) {
      setScope('unsubmitted');
      setStudentId('');
      setTeamId('');
      setValue(initialValue || '');
    }
    wasOpen.current = open;
  }, [open, initialValue]);

  const chosen = scope === 'unsubmitted' || (scope === 'student' && studentId) || (scope === 'team' && teamId);
  const confirm = () => onConfirm({
    scope,
    ...(scope === 'student' ? { student_id: studentId } : {}),
    ...(scope === 'team' ? { team_id: teamId } : {}),
    localValue: value,
  });
  const picker = { select: { native: true }, inputLabel: { shrink: true } };

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Extend Deadline</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 1 }}>
          Each student gets a new link that works until this deadline, and their old link stops working.
          Students who have submitted are not changed.
        </DialogContentText>
        <RadioGroup value={scope} onChange={(event) => setScope(event.target.value)}>
          <FormControlLabel value="unsubmitted" control={<Radio />} label="Everyone who has not submitted" />
          <FormControlLabel value="team" control={<Radio />} label="One team" />
          <FormControlLabel value="student" control={<Radio />} label="One student" />
        </RadioGroup>
        {scope === 'team' && (
          <TextField select label="Team" value={teamId} onChange={(event) => setTeamId(event.target.value)}
            fullWidth slotProps={picker} sx={{ mt: 1 }}>
            <option value="">Choose a team</option>
            {(teams || []).map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
          </TextField>
        )}
        {scope === 'student' && (
          <TextField select label="Student" value={studentId} onChange={(event) => setStudentId(event.target.value)}
            fullWidth slotProps={picker} sx={{ mt: 1 }}>
            <option value="">Choose a student</option>
            {(students || []).map((student) => <option key={student.id} value={student.id}>{student.name}</option>)}
          </TextField>
        )}
        <DeadlineField value={value} onChange={setValue} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="contained" disabled={!chosen || !value || Boolean(deadlineProblem(value)) || busy} onClick={confirm}>
          Extend
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default ExtendDeadlineDialog;
