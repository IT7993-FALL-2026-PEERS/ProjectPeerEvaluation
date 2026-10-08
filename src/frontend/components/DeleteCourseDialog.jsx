import React from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Typography, Button } from '@mui/material';

// The "Delete Course" confirmation, moved out of CourseManagement.js (CICD-57, step 5). The page
// knows which course it is about and does the deleting.
function DeleteCourseDialog({ open, onClose, onConfirm }) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Delete Course</DialogTitle>
      <DialogContent>
        <Typography>Are you sure you want to delete this course?</Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={onConfirm} color="error" variant="contained">Delete</Button>
      </DialogActions>
    </Dialog>
  );
}

export default DeleteCourseDialog;
