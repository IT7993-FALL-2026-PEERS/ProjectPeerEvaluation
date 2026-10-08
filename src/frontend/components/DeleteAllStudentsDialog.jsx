import React, { useRef } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Box, Typography, TextField, Button } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';

// The "Delete All Students" confirmation, moved out of CourseManagement.js (CICD-57, step 2). The
// professor has to type DELETE ALL; the page decides what a match and a mismatch do. The box is
// read through a ref (the page used document.getElementById) and, as before, empties whenever the
// dialog closes, because MUI unmounts its content.
function DeleteAllStudentsDialog({ open, studentCount, loading, onClose, onConfirm, onMismatch }) {
  const confirmationRef = useRef(null);

  const handleConfirm = () => {
    if (confirmationRef.current && confirmationRef.current.value === 'DELETE ALL') {
      onConfirm();
    } else {
      onMismatch();
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle>Delete All Students</DialogTitle>
      <DialogContent>
        <Typography variant="body1" sx={{ mb: 2 }}>
          Are you sure you want to delete ALL students from this course?
        </Typography>
        <Typography variant="body2" color="error" sx={{ mb: 2 }}>
          This action will:
        </Typography>
        <Box component="ul" sx={{ mt: 1, pl: 2, color: 'error.main' }}>
          <li>Delete all {studentCount} students from the course</li>
          <li>Delete all teams (since they will be empty)</li>
          <li>This action cannot be undone</li>
        </Box>
        <Typography variant="body2" sx={{ mt: 2, fontWeight: 'bold' }}>
          Type "DELETE ALL" to confirm:
        </Typography>
        <TextField
          fullWidth
          size="small"
          sx={{ mt: 1 }}
          placeholder="Type DELETE ALL to confirm"
          id="delete-confirmation"
          inputRef={confirmationRef}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>
          Cancel
        </Button>
        <Button
          onClick={handleConfirm}
          variant="contained"
          color="error"
          disabled={loading || studentCount === 0}
          startIcon={<DeleteIcon />}
        >
          {loading ? 'Deleting...' : 'Delete All Students'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default DeleteAllStudentsDialog;
