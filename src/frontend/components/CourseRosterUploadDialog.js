import React from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Box, Typography, Button, LinearProgress,
} from '@mui/material';
import UploadIcon from '@mui/icons-material/Upload';

// "Upload Student Roster", opened from the course row, moved out of CourseManagement.js (CICD-57,
// step 5). `onClose` is every way of closing it without uploading (Cancel, Escape, a click outside),
// and the page must forget the chosen file then, or the next course would be offered it.
// `progress` is 0 until an upload is running.
function CourseRosterUploadDialog({ open, file, progress, onFileChange, onClose, onUpload }) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Upload Student Roster</DialogTitle>
      <DialogContent>
        <Box sx={{ mt: 2 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Upload a CSV file with the following columns:
          </Typography>
          <span style={{ fontWeight: 'bold', color: 'red', fontSize: '1.1em' }}>student_id,name,email,team_name</span>
          <Button
            variant="outlined"
            component="label"
            fullWidth
            sx={{ mt: 2 }}
            startIcon={<UploadIcon />}
          >
            Select CSV File
            <input
              type="file"
              hidden
              accept=".csv"
              // Cleared on click, so choosing the same file again (after the dialog was closed) still fires a change.
              onClick={(e) => { e.target.value = ''; }}
              onChange={(e) => onFileChange(e.target.files[0])}
            />
          </Button>
          {file && (
            <Typography variant="body2" sx={{ mt: 1 }}>
              Selected: {file.name}
            </Typography>
          )}
          {progress > 0 && (
            <LinearProgress variant="determinate" value={progress} sx={{ mt: 2 }} />
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>
          Cancel
        </Button>
        <Button
          onClick={onUpload}
          variant="contained"
          disabled={!file || progress > 0}
        >
          Upload
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default CourseRosterUploadDialog;
