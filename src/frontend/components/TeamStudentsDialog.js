import React from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, Box, Card, CardContent, Typography, IconButton,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';

// "Manage Students in <team>", moved out of CourseManagement.js (CICD-57, step 4). The page loads
// the two lists and does the adding and removing; this shows them and reports which student the
// professor picked.
function TeamStudentsDialog({ open, team, teamStudents, availableStudents, onAdd, onRemove, onClose }) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        Manage Students in {team?.team_name}
      </DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3, mt: 2 }}>
          {/* Students in Team */}
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Students in Team ({teamStudents.length})
              </Typography>
              {teamStudents.length === 0 ? (
                <Typography color="text.secondary">No students in this team</Typography>
              ) : (
                <Box sx={{ maxHeight: 300, overflow: 'auto' }}>
                  {teamStudents.map((student) => (
                    <Box key={student._id} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 1, borderBottom: '1px solid #eee' }}>
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 'medium' }}>
                          {student.name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {student.student_id} • {student.email}
                        </Typography>
                      </Box>
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => onRemove(student._id)}
                        title="Remove from team"
                      >
                        <DeleteIcon />
                      </IconButton>
                    </Box>
                  ))}
                </Box>
              )}
            </CardContent>
          </Card>

          {/* Available Students */}
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Available Students ({availableStudents.length})
              </Typography>
              {availableStudents.length === 0 ? (
                <Typography color="text.secondary">No available students</Typography>
              ) : (
                <Box sx={{ maxHeight: 300, overflow: 'auto' }}>
                  {availableStudents.map((student) => (
                    <Box key={student._id} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 1, borderBottom: '1px solid #eee' }}>
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 'medium' }}>
                          {student.name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {student.student_id} • {student.email}
                        </Typography>
                        {student.group_assignment && (
                          <Typography variant="caption" color="warning.main" sx={{ display: 'block' }}>
                            Currently in: {student.group_assignment}
                          </Typography>
                        )}
                      </Box>
                      <IconButton
                        size="small"
                        color="primary"
                        onClick={() => onAdd(student._id)}
                        title="Add to team"
                      >
                        <AddIcon />
                      </IconButton>
                    </Box>
                  ))}
                </Box>
              )}
            </CardContent>
          </Card>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}

export default TeamStudentsDialog;
