import React from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Box, Typography, Button, Alert, LinearProgress } from '@mui/material';
import UploadIcon from '@mui/icons-material/Upload';

// The Upload Student Roster (CSV) dialog on Manage Students, moved out of CourseManagement.js
// (CICD-57, step 2). The page owns the chosen file, the request and its result.
function CsvUploadDialog({ open, file, uploading, error, results, onFileChange, onUpload, onClose }) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Upload Student Roster (CSV)</DialogTitle>
      <DialogContent>
        <Box sx={{ mb: 2 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Upload a CSV file with the following columns:
          </Typography>
          <Box sx={{ mt: 1, pl: 2 }}>
            <span style={{ fontWeight: 'bold', color: 'red', fontSize: '1.1em' }}>student_id,name,email,team_name</span>
          </Box>
        </Box>

        <Box sx={{ mb: 2 }}>
          <input
            accept=".csv"
            style={{ display: 'none' }}
            id="csv-file-input"
            type="file"
            onChange={onFileChange}
          />
          <label htmlFor="csv-file-input">
            <Button variant="outlined" component="span" startIcon={<UploadIcon />}>
              Choose CSV File
            </Button>
          </label>
          {file && (
            <Typography variant="body2" sx={{ mt: 1 }}>
              Selected: {file.name}
            </Typography>
          )}
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {results && (
          <Alert severity={results.errors && results.errors.length > 0 ? "warning" : "success"} sx={{ mb: 2 }}>
            <Typography variant="body2" sx={{ mb: 1 }}>
              {results.message}
            </Typography>
            {results.students && results.students.length > 0 && (
              <Typography variant="body2">
                Students added: {results.students.length}
              </Typography>
            )}
            {results.teams_created !== undefined && results.teams_created > 0 && (
              <Typography variant="body2" color="primary">
                Teams created: {results.teams_created}
              </Typography>
            )}
            {results.team_names && results.team_names.length > 0 && (
              <Typography variant="body2" sx={{ fontSize: '0.9rem', color: 'text.secondary' }}>
                Team names: {results.team_names.join(', ')}
              </Typography>
            )}
            {results.errors && results.errors.length > 0 && (
              <Box sx={{ mt: 1 }}>
                <Typography variant="body2" color="error">Errors:</Typography>
                {results.errors.map((rowError, index) => (
                  <Typography key={index} variant="body2" color="error" sx={{ fontSize: '0.8rem' }}>
                    • {rowError}
                  </Typography>
                ))}
              </Box>
            )}
          </Alert>
        )}

        {uploading && <LinearProgress sx={{ mb: 2 }} />}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>
          Close
        </Button>
        <Button
          onClick={onUpload}
          variant="contained"
          disabled={!file || uploading}
          startIcon={<UploadIcon />}
        >
          {uploading ? 'Uploading...' : 'Upload'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default CsvUploadDialog;
