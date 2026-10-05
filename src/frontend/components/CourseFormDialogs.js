import React from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, Box, Grid, TextField, FormControl, InputLabel,
  Select, MenuItem,
} from '@mui/material';

// The Create New Course and Edit Course dialogs, moved out of CourseManagement.js (CICD-57, step 5).
// They hold no state: `form` is the course fields and every change goes back to the page. The two
// layouts differ a little (the edit form adds the status), so they stay as they were.
export function CreateCourseDialog({ open, form, onFormChange, onClose, onCreate }) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Create New Course</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mt: 1 }}>
          <TextField
            fullWidth
            variant="outlined"
            label="Course Name"
            value={form.course_name}
            onChange={(e) => onFormChange({ ...form, course_name: e.target.value })}
            placeholder="Software Engineering"
            autoFocus
            margin="normal"
          />
          <TextField
            fullWidth
            variant="outlined"
            label="Course Number"
            value={form.course_number}
            onChange={(e) => onFormChange({ ...form, course_number: e.target.value })}
            placeholder="CS 4850"
            margin="normal"
          />
          <TextField
            fullWidth
            variant="outlined"
            label="Course Section"
            value={form.course_section}
            onChange={(e) => onFormChange({ ...form, course_section: e.target.value })}
            placeholder="01"
            margin="normal"
          />
          <TextField
            fullWidth
            variant="outlined"
            label="Semester"
            value={form.semester}
            onChange={(e) => onFormChange({ ...form, semester: e.target.value })}
            placeholder="Fall 2025"
            margin="normal"
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          onClick={onCreate}
          variant="contained"
          disabled={!form.course_name || !form.course_number || !form.course_section || !form.semester}
        >
          Create
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export function EditCourseDialog({ open, form, onFormChange, onClose, onSave }) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Edit Course</DialogTitle>
      <DialogContent>
        <Grid container columns={12} columnSpacing={2} sx={{ mt: 1 }}>
          <Grid sx={{ width: '100%' }}>
            <TextField
              fullWidth
              variant="outlined"
              label="Course Name"
              value={form.course_name}
              onChange={(e) => onFormChange({ ...form, course_name: e.target.value })}
              placeholder="Software Engineering"
              autoComplete="off"
              autoFocus
              margin="normal"
            />
          </Grid>
          <Grid sx={{ width: '100%' }}>
            <TextField
              fullWidth
              variant="outlined"
              label="Course Number"
              value={form.course_number}
              onChange={(e) => onFormChange({ ...form, course_number: e.target.value })}
              placeholder="CS 4850"
              autoComplete="off"
              margin="normal"
            />
          </Grid>
          <Grid sx={{ width: '100%' }}>
            <TextField
              fullWidth
              variant="outlined"
              label="Course Section"
              value={form.course_section}
              onChange={(e) => onFormChange({ ...form, course_section: e.target.value })}
              placeholder="01"
              autoComplete="off"
              margin="normal"
            />
          </Grid>
          <Grid sx={{ width: '100%' }}>
            <TextField
              fullWidth
              variant="outlined"
              label="Semester"
              value={form.semester}
              onChange={(e) => onFormChange({ ...form, semester: e.target.value })}
              placeholder="Fall 2025"
              autoComplete="off"
              margin="normal"
            />
          </Grid>
          <Grid sx={{ width: '100%' }}>
            <FormControl fullWidth margin="normal">
              <InputLabel>Course Status</InputLabel>
              <Select
                value={form.course_status}
                label="Course Status"
                onChange={(e) => onFormChange({ ...form, course_status: e.target.value })}
              >
                <MenuItem value="Active">Active</MenuItem>
                <MenuItem value="Inactive">Inactive</MenuItem>
              </Select>
            </FormControl>
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          onClick={onSave}
          variant="contained"
          disabled={!form.course_name || !form.course_number || !form.course_section || !form.semester}
        >
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}
