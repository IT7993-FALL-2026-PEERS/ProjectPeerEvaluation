import React, { useMemo } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, Box, Card, CardContent, Collapse, Typography,
  TextField, FormControl, InputLabel, Select, MenuItem, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Chip, IconButton, CircularProgress,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ClearIcon from '@mui/icons-material/Clear';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import FilterListIcon from '@mui/icons-material/FilterList';
import PeopleIcon from '@mui/icons-material/People';
import SendIcon from '@mui/icons-material/Send';

// "Manage Teams", moved out of CourseManagement.js (CICD-57, step 4). The page owns the teams, the
// search fields and every request; this narrows and orders the list for display and reports what
// the professor presses. `search` is { team_name, team_status }; `sendingTeamIds` maps a team id to
// true while its invitations are going out.
function TeamsDialog({
  open, course, teams, loading, search, showSearch, sendingTeamIds,
  onToggleSearch, onSearchChange, onClearSearch, onCreate, onManageStudents, onSend, onEdit, onDelete,
  onClearAll, onClose,
}) {
  // Derived from the props, so the list can never be out of date: change `teams` or a search field
  // and it follows. Natural sort handles both alphabetical and numerical order ("Team 2" before "Team 10").
  const filteredTeams = useMemo(() => teams.filter(team => {
    const matchesName = search.team_name === '' ||
      team.team_name.toLowerCase().includes(search.team_name.toLowerCase());
    const matchesStatus = search.team_status === '' ||
      team.team_status === search.team_status;
    return matchesName && matchesStatus;
  }).sort((a, b) => {
    const nameA = (a.team_name || '').toLowerCase();
    const nameB = (b.team_name || '').toLowerCase();
    return nameA.localeCompare(nameB, undefined, {
      numeric: true,
      sensitivity: 'base'
    });
  }), [teams, search]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Manage Teams for {course?.course_number || course?.course_code} {course?.course_section || ''} - {course?.course_name}</DialogTitle>
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
            <Button
              variant="contained"
              size="small"
              startIcon={<AddIcon />}
              onClick={onCreate}
            >
              Create Team
            </Button>
          </Box>
        </Box>

        {/* Team Search Filters */}
        <Collapse in={showSearch}>
          <Card sx={{ mb: 2 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Search Teams ({filteredTeams.length} of {teams.length})
              </Typography>
              <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
                <TextField
                  size="small"
                  label="Team Name"
                  value={search.team_name}
                  onChange={(e) => onSearchChange('team_name', e.target.value)}
                  placeholder="Search by team name..."
                  sx={{ minWidth: 200, flex: 1 }}
                />
                <FormControl size="small" sx={{ minWidth: 150, flex: 1 }}>
                  <InputLabel>Team Status</InputLabel>
                  <Select
                    value={search.team_status}
                    label="Team Status"
                    onChange={(e) => onSearchChange('team_status', e.target.value)}
                  >
                    <MenuItem value="">All</MenuItem>
                    <MenuItem value="Active">Active</MenuItem>
                    <MenuItem value="Inactive">Inactive</MenuItem>
                  </Select>
                </FormControl>
              </Box>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<ClearIcon />}
                  onClick={onClearSearch}
                  disabled={!search.team_name && !search.team_status}
                >
                  Clear Search
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Collapse>

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <Typography>Loading teams...</Typography>
          </Box>
        ) : (
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Team Name</TableCell>
                  <TableCell align="center">Students</TableCell>
                  <TableCell align="center">Status</TableCell>
                  <TableCell align="center">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredTeams.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} align="center">
                      <Typography color="text.secondary">
                        {teams.length === 0 ? 'No teams found for this course.' : 'No teams match your search criteria.'}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredTeams.map((team) => (
                    <TableRow key={team._id || team.id}>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 'medium' }}>
                          {team.team_name}
                        </Typography>
                      </TableCell>
                      <TableCell align="center">
                        <Chip
                          label={team.student_count || 0}
                          size="small"
                          color="primary"
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell align="center">
                        <Chip
                          label={team.team_status || 'Active'}
                          size="small"
                          color={team.team_status === 'Active' ? 'success' : 'default'}
                        />
                      </TableCell>
                      <TableCell align="center">
                        <IconButton
                          size="small"
                          color="primary"
                          title="Manage Students"
                          onClick={() => onManageStudents(team)}
                        >
                          <PeopleIcon />
                        </IconButton>
                        <IconButton
                          size="small"
                          color="success"
                          title="Send Evaluations to Team"
                          onClick={() => onSend(team)}
                          disabled={sendingTeamIds[team._id || team.id]}
                        >
                          {sendingTeamIds[team._id || team.id] ? <CircularProgress size={20} /> : <SendIcon />}
                        </IconButton>
                        <IconButton
                          size="small"
                          color="error"
                          title="Delete Team"
                          onClick={() => onDelete(team)}
                        >
                          <DeleteIcon />
                        </IconButton>
                        <IconButton
                          size="small"
                          color="primary"
                          title="Edit Team"
                          onClick={() => onEdit(team)}
                        >
                          <EditIcon />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </DialogContent>
      <DialogActions>
        <Button
          onClick={onClearAll}
          color="error"
          variant="outlined"
          disabled={!teams || teams.length === 0}
        >
          Clear All Teams
        </Button>
        <Box sx={{ flex: 1 }} />
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}

export default TeamsDialog;
