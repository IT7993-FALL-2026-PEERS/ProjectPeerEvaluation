import React, { useMemo } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, Box, Card, CardContent, Collapse, Typography,
  TextField, LinearProgress, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Chip,
  IconButton,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ClearIcon from '@mui/icons-material/Clear';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import FilterListIcon from '@mui/icons-material/FilterList';
import UploadIcon from '@mui/icons-material/Upload';

// "Manage Students", moved out of CourseManagement.js (CICD-57, step 5). The page owns the students,
// the search fields and every request; this narrows the list for display and reports what the
// professor presses. `search` is { student_id, name, email, team }.
function StudentsDialog({
  open, course, students, loading, search, showSearch,
  onToggleSearch, onSearchChange, onClearSearch, onUploadCsv, onAddStudent, onEdit, onDelete, onDeleteAll, onClose,
}) {
  // Derived from the props, so the list can never be out of date: change `students` or a search
  // field and it follows.
  const filteredStudents = useMemo(() => students.filter(student => {
    const matchesId = search.student_id === '' ||
      student.student_id.toLowerCase().includes(search.student_id.toLowerCase());
    const matchesName = search.name === '' ||
      student.name.toLowerCase().includes(search.name.toLowerCase());
    const matchesEmail = search.email === '' ||
      student.email.toLowerCase().includes(search.email.toLowerCase());
    const matchesTeam = search.team === '' ||
      (student.group_assignment && student.group_assignment.toLowerCase().includes(search.team.toLowerCase()));
    return matchesId && matchesName && matchesEmail && matchesTeam;
  }), [students, search]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Manage Students for {course?.course_number || course?.course_code} {course?.course_section || ''} - {course?.course_name}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Button
            variant="outlined"
            startIcon={<FilterListIcon />}
            onClick={onToggleSearch}
            size="small"
          >
            {showSearch ? 'Hide Search' : 'Show Search'}
          </Button>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button variant="outlined" size="small" startIcon={<UploadIcon />} onClick={onUploadCsv}>
              Upload CSV
            </Button>
            <Button variant="contained" size="small" startIcon={<AddIcon />} onClick={onAddStudent}>
              Add Student
            </Button>
          </Box>
        </Box>

        {/* Student Search Filters */}
        <Collapse in={showSearch}>
          <Card sx={{ mb: 2 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Search Students ({filteredStudents.length} of {students.length})
              </Typography>
              <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
                <TextField
                  size="small"
                  label="Student ID"
                  value={search.student_id}
                  onChange={(e) => onSearchChange('student_id', e.target.value)}
                  placeholder="Search by ID..."
                  sx={{ minWidth: 150, flex: 1 }}
                />
                <TextField
                  size="small"
                  label="Name"
                  value={search.name}
                  onChange={(e) => onSearchChange('name', e.target.value)}
                  placeholder="Search by name..."
                  sx={{ minWidth: 150, flex: 1 }}
                />
                <TextField
                  size="small"
                  label="Email"
                  value={search.email}
                  onChange={(e) => onSearchChange('email', e.target.value)}
                  placeholder="Search by email..."
                  sx={{ minWidth: 150, flex: 1 }}
                />
                <TextField
                  size="small"
                  label="Team"
                  value={search.team}
                  onChange={(e) => onSearchChange('team', e.target.value)}
                  placeholder="Search by team..."
                  sx={{ minWidth: 150, flex: 1 }}
                />
              </Box>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<ClearIcon />}
                  onClick={onClearSearch}
                  disabled={!search.student_id && !search.name && !search.email && !search.team}
                >
                  Clear Search
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Collapse>
        {loading ? (
          <LinearProgress />
        ) : filteredStudents.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            {students.length === 0 ? (
              <Typography>No students found for this course.</Typography>
            ) : (
              <Typography>No students match your search criteria.</Typography>
            )}
          </Box>
        ) : (
          <TableContainer component={Paper} sx={{ mt: 2 }}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Student ID</TableCell>
                  <TableCell>Name</TableCell>
                  <TableCell>Email</TableCell>
                  <TableCell>Team</TableCell>
                  <TableCell align="center">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredStudents.map((student) => (
                  <TableRow key={student.id || student._id}>
                    <TableCell>{student.student_id}</TableCell>
                    <TableCell>{student.name}</TableCell>
                    <TableCell>{student.email}</TableCell>
                    <TableCell>
                      {student.group_assignment ? (
                        <Chip label={student.group_assignment} size="small" variant="outlined" />
                      ) : (
                        <Typography variant="body2" color="text.secondary">Not assigned</Typography>
                      )}
                    </TableCell>
                    <TableCell align="center">
                      <IconButton size="small" color="primary" onClick={() => onEdit(student)} title="Edit Student">
                        <EditIcon />
                      </IconButton>
                      <IconButton size="small" color="error" onClick={() => onDelete(student)} title="Delete Student">
                        <DeleteIcon />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </DialogContent>
      <DialogActions>
        <Button
          onClick={onDeleteAll}
          color="error"
          variant="outlined"
          disabled={!students || students.length === 0}
          startIcon={<DeleteIcon />}
        >
          Delete All Students
        </Button>
        <Box sx={{ flex: 1 }} />
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}

export default StudentsDialog;
