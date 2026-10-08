import React from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Box, Typography, Button, Alert,
  LinearProgress, CircularProgress, Grid, Card, CardContent, Chip,
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import GroupIcon from '@mui/icons-material/Group';
import ClearIcon from '@mui/icons-material/Clear';
import { groupStudentsByTeam } from '../services/evaluationStatus';

// The Evaluation Status dialog on the course row, moved out of CourseManagement.js (CICD-57, step 3).
// The page owns the status, the requests and the sending and resetting flags; this shows them, one
// card per team, and reports what the professor presses.
function EvaluationStatusDialog({ open, course, status, loading, sending, resetting, onSend, onRemind, onReset, onClose }) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
    >
      <DialogTitle>
        Evaluation Status - {course?.course_number || course?.course_code} {course?.course_section || ''} - {course?.course_name}
      </DialogTitle>
      <DialogContent>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
            <LinearProgress sx={{ width: '100%' }} />
          </Box>
        ) : status ? (
          <Box>
            {/* Check if evaluations have been sent */}
            {!status.evaluations_sent ? (
              <Alert severity="info" sx={{ textAlign: 'center', py: 4 }}>
                <Typography variant="h6" gutterBottom>
                  Evaluations Have Not Been Sent
                </Typography>
                <Typography variant="body1" sx={{ mb: 2 }}>
                  Send evaluations to students to begin tracking completion status.
                </Typography>
                <Button
                  variant="contained"
                  color="primary"
                  startIcon={sending ? <CircularProgress size={20} color="inherit" /> : <SendIcon />}
                  onClick={onSend}
                  size="large"
                  disabled={sending}
                >
                  {sending ? 'Sending Evaluations...' : 'Send Evaluations Now'}
                </Button>
              </Alert>
            ) : (
              <>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                  <Typography variant="h6">
                    Progress: {status.completed_count}/{status.total_count} evaluations completed
                  </Typography>
                  <Button
                    variant="contained"
                    color="primary"
                    startIcon={<SendIcon />}
                    onClick={onRemind}
                    disabled={status.completed_count === status.total_count}
                  >
                    Send Reminders
                  </Button>
                </Box>

                <LinearProgress
                  variant="determinate"
                  value={status.total_count > 0 ? (status.completed_count / status.total_count) * 100 : 0}
                  sx={{ height: 10, borderRadius: 5, mb: 3 }}
                />

                {/* Team-based view */}
                <Grid container spacing={2}>
                  {groupStudentsByTeam(status.students).map(([teamName, teamStudents]) => {
                    const completedCount = teamStudents.filter(s => s.completed).length;
                    const totalCount = teamStudents.length;
                    const completionRate = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

                    return (
                      <Grid item xs={12} sm={6} md={4} lg={2.4} key={teamName}>
                        <Card variant="outlined">
                          <CardContent>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                              <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center' }}>
                                <GroupIcon sx={{ mr: 1 }} />
                                {teamName}
                              </Typography>
                              <Chip
                                label={`${completedCount}/${totalCount}`}
                                color={completionRate === 100 ? 'success' : completionRate > 50 ? 'warning' : 'error'}
                                size="small"
                              />
                            </Box>

                            <LinearProgress
                              variant="determinate"
                              value={completionRate}
                              sx={{
                                height: 8,
                                borderRadius: 4,
                                mb: 2,
                                '& .MuiLinearProgress-bar': {
                                  backgroundColor: completionRate === 100 ? '#4caf50' : completionRate > 50 ? '#ff9800' : '#f44336'
                                }
                              }}
                            />

                            <Box sx={{ maxHeight: 200, overflowY: 'auto' }}>
                              {teamStudents.map((student, index) => (
                                <Box key={student.student_id || index} sx={{
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center',
                                  py: 0.5,
                                  borderBottom: index < teamStudents.length - 1 ? '1px solid #eee' : 'none'
                                }}>
                                  <Box>
                                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                      {student.name}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary">
                                      {student.student_id}
                                    </Typography>
                                  </Box>
                                  <Box sx={{ textAlign: 'right' }}>
                                    <Chip
                                      label={student.completed ? 'Done' : 'Pending'}
                                      color={student.completed ? 'success' : 'warning'}
                                      size="small"
                                      sx={{ mb: 0.5 }}
                                    />
                                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                                      {student.last_activity ? new Date(student.last_activity).toLocaleDateString() : 'Never'}
                                    </Typography>
                                  </Box>
                                </Box>
                              ))}
                            </Box>
                          </CardContent>
                        </Card>
                      </Grid>
                    );
                  })}
                </Grid>
              </>
            )}
          </Box>
        ) : (
          <Alert severity="info">No evaluation data available for this course.</Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button
          onClick={onReset}
          color="warning"
          disabled={resetting}
          startIcon={resetting ? <CircularProgress size={16} /> : <ClearIcon />}
        >
          {resetting ? 'Resetting...' : 'Reset Evaluation State'}
        </Button>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}

export default EvaluationStatusDialog;
