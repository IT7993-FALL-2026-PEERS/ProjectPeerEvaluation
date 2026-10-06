import React, { useMemo } from 'react';
import {
  Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, IconButton, Chip, Box,
  LinearProgress, CircularProgress,
} from '@mui/material';
import BarChartIcon from '@mui/icons-material/BarChart';
import DeleteIcon from '@mui/icons-material/Delete';
import DescriptionIcon from '@mui/icons-material/Description';
import EditIcon from '@mui/icons-material/Edit';
import GroupIcon from '@mui/icons-material/Group';
import PersonIcon from '@mui/icons-material/Person';
import SendIcon from '@mui/icons-material/Send';
import UploadIcon from '@mui/icons-material/Upload';
import { sortCourses } from '../services/courseSort';
import styles from '../styles/CourseManagement.module.css';

// The course list, moved out of CourseManagement.js (CICD-57, step 6). The page owns the courses,
// the sort and every request; this orders the rows for display and reports what the professor
// presses, each time with the course of that row. `sendingIds` is { [course id]: true } for the
// courses whose evaluations are going out.
function CourseTable({
  courses, loading, sortConfig, sendingIds, onSort,
  onUploadRoster, onManageStudents, onManageTeams, onSendEvaluations, onEvaluationStatus, onViewReports, onDelete, onEdit,
}) {
  // Derived from the props, so the order can never be out of date.
  const sortedCourses = useMemo(() => sortCourses(courses, sortConfig), [courses, sortConfig]);

  return (
    <div className={styles.tableContainer} style={{ width: '100%' }}>
      <TableContainer component={Paper} style={{ width: '100%' }}>
        <Table style={{ width: '100%' }}>
          <TableHead>
            <TableRow>
              <TableCell
                onClick={() => onSort('course_name')}
                style={{ cursor: 'pointer', fontWeight: 'bold', whiteSpace: 'nowrap' }}
              >
                Course Name {sortConfig.key === 'course_name' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : ''}
              </TableCell>
              <TableCell
                onClick={() => onSort('course_number')}
                style={{ cursor: 'pointer', fontWeight: 'bold', whiteSpace: 'nowrap' }}
              >
                Course Number {sortConfig.key === 'course_number' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : ''}
              </TableCell>
              <TableCell style={{ whiteSpace: 'nowrap' }}>Course Section</TableCell>
              <TableCell
                onClick={() => onSort('semester')}
                style={{ cursor: 'pointer', fontWeight: 'bold', whiteSpace: 'nowrap' }}
              >
                Semester {sortConfig.key === 'semester' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : ''}
              </TableCell>
              <TableCell align="center">Students</TableCell>
              <TableCell align="center">Teams</TableCell>
              <TableCell align="center">Status</TableCell>
              <TableCell align="center">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} align="center">
                  <LinearProgress />
                </TableCell>
              </TableRow>
            ) : courses.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} align="center">
                  No courses found. Create your first course to get started.
                </TableCell>
              </TableRow>
            ) : (
              sortedCourses.map((course) => (
                <TableRow key={course.id || course._id}>
                  <TableCell>{course.course_name}</TableCell>
                  <TableCell>{course.course_number || course.course_code || 'N/A'}</TableCell>
                  <TableCell>{course.course_section || 'N/A'}</TableCell>
                  <TableCell style={{ whiteSpace: 'nowrap' }}>{course.semester}</TableCell>
                  <TableCell align="center">
                    <Chip label={course.student_count || 0} size="small" />
                  </TableCell>
                  <TableCell align="center">
                    <Chip label={Number.isInteger(course.team_count) && course.team_count > 0 ? course.team_count : 0} size="small" />
                  </TableCell>
                  <TableCell align="center">
                    <Chip
                      label={course.course_status || 'Active'}
                      color={course.course_status === 'Active' ? 'success' : 'default'}
                      size="small"
                    />
                  </TableCell>
                  <TableCell align="center">
                    <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center' }}>
                      <IconButton
                        size="small"
                        color="primary"
                        onClick={() => onUploadRoster(course)}
                        title="Upload Roster"
                      >
                        <UploadIcon />
                      </IconButton>
                      <IconButton
                        size="small"
                        color="primary"
                        onClick={() => onManageStudents(course)}
                        title="Manage Students"
                      >
                        <PersonIcon />
                      </IconButton>

                      <IconButton
                        size="small"
                        color="primary"
                        onClick={() => onManageTeams(course)}
                        title="Manage Teams"
                      >
                        <GroupIcon />
                      </IconButton>
                      <IconButton
                        size="small"
                        color="success"
                        onClick={() => onSendEvaluations(course)}
                        title="Send Evaluations"
                        disabled={sendingIds[course._id || course.id]}
                      >
                        {sendingIds[course._id || course.id] ? <CircularProgress size={20} /> : <SendIcon />}
                      </IconButton>
                      <IconButton
                        size="small"
                        color="secondary"
                        onClick={() => onEvaluationStatus(course)}
                        title="Evaluation Status"
                      >
                        <BarChartIcon />
                      </IconButton>
                      <IconButton
                        size="small"
                        color="primary"
                        onClick={() => onViewReports(course)}
                        title="View Reports"
                      >
                        <DescriptionIcon />
                      </IconButton>
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => onDelete(course)}
                        title="Delete Course"
                      >
                        <DeleteIcon />
                      </IconButton>
                      <IconButton
                        size="small"
                        color="primary"
                        onClick={() => onEdit(course)}
                        title="Edit Course"
                      >
                        <EditIcon />
                      </IconButton>
                    </Box>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </div>
  );
}

export default CourseTable;
