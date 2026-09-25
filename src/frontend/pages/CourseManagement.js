// ...existing code...

// ...existing code...
import React, { useState, useEffect, useCallback } from 'react';

// Test comment for GitHub upload - Preston

import {
  Grid,
  Paper,
  Typography,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  IconButton,
  Chip,
  Alert,
  Box,
  LinearProgress,
  CircularProgress,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Card,
  CardContent,
  Collapse
} from '@mui/material';

import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import UploadIcon from '@mui/icons-material/Upload';
import SendIcon from '@mui/icons-material/Send';
import GroupIcon from '@mui/icons-material/Group';
import EmojiObjectsIcon from '@mui/icons-material/EmojiObjects';
// Remove AssessmentIcon import if present
import PersonIcon from '@mui/icons-material/Person';
import PeopleIcon from '@mui/icons-material/People';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import FilterListIcon from '@mui/icons-material/FilterList';
import BarChartIcon from '@mui/icons-material/BarChart';
import DescriptionIcon from '@mui/icons-material/Description';
import { useNavigate } from 'react-router-dom';
import api, { getCourseById } from '../services/api';
import { getApiBaseUrl } from '../services/apiUrl';
import { useAuth } from '../contexts/AuthContext';
import styles from '../styles/CourseManagement.module.css';
import '../App.css';

function CourseManagement() {
  const { currentUser } = useAuth();
  // --- Team evaluation send state/handler (place after other hooks, before return) ---
  const [sendingTeamEvaluations, setSendingTeamEvaluations] = useState({});

  const handleSendTeamEvaluations = async (team) => {
    if (!teamsCourse || !team) return;
    const teamId = team._id || team.id;
    setSendingTeamEvaluations((prev) => ({ ...prev, [teamId]: true }));
    try {
      await api.post(`/courses/${teamsCourse._id || teamsCourse.id}/teams/${teamId}/evaluations/send`, {});
      setAlert({ severity: 'success', message: `Evaluation invitations sent to team "${team.team_name}".` });
      fetchCoursesWithCounts();
    } catch (error) {
      setAlert({ severity: 'error', message: error.userMessage || `Failed to send evaluations to team "${team.team_name}".` });
    } finally {
      setSendingTeamEvaluations((prev) => ({ ...prev, [teamId]: false }));
    }
  };
  // State for add/edit student dialogs
  const [addStudentOpen, setAddStudentOpen] = useState(false);
  const [editStudentOpen, setEditStudentOpen] = useState(false);
  const [studentToEdit, setStudentToEdit] = useState(null);
  const [studentForm, setStudentForm] = useState({ student_id: '', name: '', email: '', group_assignment: '' });
  const [studentFormError, setStudentFormError] = useState('');

  // State for sorting courses table
  const [sortConfig, setSortConfig] = useState({ key: 'course_name', direction: 'asc' });

  // Sorting handler

  // State for CSV upload
  const [csvUploadOpen, setCsvUploadOpen] = useState(false);
  const [csvFile, setCsvFile] = useState(null);
  const [csvUploading, setCsvUploading] = useState(false);
  const [csvUploadError, setCsvUploadError] = useState('');
  const [csvUploadResults, setCsvUploadResults] = useState(null);

  // State for delete all students
  const [deleteAllStudentsOpen, setDeleteAllStudentsOpen] = useState(false);
  const [deleteAllStudentsLoading, setDeleteAllStudentsLoading] = useState(false);

  // State for evaluation management
  const [evaluationStatusOpen, setEvaluationStatusOpen] = useState(false);
  const [evaluationStatusLoading, setEvaluationStatusLoading] = useState(false);
  const [evaluationStatus, setEvaluationStatus] = useState(null);
  const [selectedCourseForEval, setSelectedCourseForEval] = useState(null);

  // State for test evaluation
  const [testEvaluationOpen, setTestEvaluationOpen] = useState(false);
  const [testEvaluationData] = useState(null);
  const [testEvaluationLoading] = useState(false);
  

  // State for sending evaluations (per course)
  const [sendingEvaluations, setSendingEvaluations] = useState({});

  // State for resetting evaluation state
  const [resettingEvaluations, setResettingEvaluations] = useState(false);
  // State for showing evaluation reset confirmation dialog
  const [showEvalResetDialog, setShowEvalResetDialog] = useState(false);
  const [pendingEvalResetCourseId, setPendingEvalResetCourseId] = useState(null);
  const [pendingTeamAction, setPendingTeamAction] = useState(null); // { type: 'add'|'remove', studentId }

  // Handler stubs for add, edit, delete
  const handleAddStudent = async () => {
    setStudentFormError('');
    if (!studentsCourse) return;
    if (!studentForm.student_id || !studentForm.name || !studentForm.email) {
      setStudentFormError('Student ID, name, and email are required.');
      return;
    }
    try {
      await api.post(`/courses/${studentsCourse._id || studentsCourse.id}/students`, studentForm);
      setAlert({ severity: 'success', message: 'Student added successfully' });
      setAddStudentOpen(false); // Only close the Add Student dialog
      setStudentForm({ student_id: '', name: '', email: '', group_assignment: '' });
      // Refresh students list
      const response = await api.get(`/courses/${studentsCourse._id || studentsCourse.id}/students`);
  setStudents(response.data);
  setFilteredStudents(response.data); // Immediately update filtered list
  // Reset search filters so all students are shown
  setStudentSearch({ student_id: '', name: '', email: '', team: '' });
      // Ensure Manage Students dialog stays open and refreshed
      setStudentsDialogOpen(true);
    } catch (error) {
      if (error.response && error.response.data && error.response.data.error && error.response.data.error.message) {
        setStudentFormError(error.response.data.error.message);
      } else {
        setStudentFormError('Failed to add student.');
      }
    }
  };

  const handleEditStudent = (student) => {
    setStudentToEdit(student);
    setStudentForm({ 
      student_id: student.student_id, 
      name: student.name, 
      email: student.email,
      group_assignment: student.group_assignment || ''
    });
    setEditStudentOpen(true);
  };

  const handleUpdateStudent = async () => {
    if (!studentsCourse || !studentToEdit) return;
    try {
      await api.put(`/courses/${studentsCourse._id || studentsCourse.id}/students/${studentToEdit._id || studentToEdit.id}`, studentForm);
      setAlert({ severity: 'success', message: 'Student updated successfully' });
      setEditStudentOpen(false);
      setStudentToEdit(null);
      setStudentForm({ student_id: '', name: '', email: '', group_assignment: '' });
      // Refresh students list
      const response = await api.get(`/courses/${studentsCourse._id || studentsCourse.id}/students`);
      setStudents(response.data);
      // Re-apply current search filters
      handleStudentSearchChange('student_id', studentSearch.student_id);
    } catch (error) {
      setAlert({ severity: 'error', message: 'Failed to update student' });
    }
  };

  const handleDeleteStudent = async (student) => {
    if (!studentsCourse || !student) {
      console.error('Delete failed: missing studentsCourse or student', { studentsCourse, student });
      return;
    }
    const studentId = student._id || student.id;
    if (!studentId) {
      setAlert({ severity: 'error', message: 'Student ID is missing. Cannot delete.' });
      console.error('Delete failed: student object missing _id and id', student);
      return;
    }
    // Confirmation dialog
    const studentName = student.name || `Student ${student.student_id}`;
    const teamInfo = student.group_assignment ? `\nTeam: ${student.group_assignment}` : `\nNot assigned to any team`;
    const confirmMessage = `Are you sure you want to delete "${studentName}" (ID: ${student.student_id})?${teamInfo}\n\nThis action cannot be undone and will:\n• Remove the student from the course\n• Unlink them from their team (if any)\n• Delete their evaluation data`;
    if (!window.confirm(confirmMessage)) {
      return;
    }
    try {
      await api.delete(`/courses/${studentsCourse._id || studentsCourse.id}/students/${studentId}`);
      setAlert({ severity: 'success', message: `Student "${studentName}" deleted successfully` });
      // Refresh students list
      const response = await api.get(`/courses/${studentsCourse._id || studentsCourse.id}/students`);
      setStudents(response.data);
      // Re-apply current search filters
      handleStudentSearchChange('student_id', studentSearch.student_id);
    } catch (error) {
      setAlert({ severity: 'error', message: `Failed to delete student "${studentName}"` });
      console.error('Delete student error:', error);
    }
  };

  // CSV Upload handlers
  const handleCsvUpload = async () => {
    if (!csvFile || !studentsCourse) return;
    
    setCsvUploading(true);
    setCsvUploadError('');
    setCsvUploadResults(null);
    
    const formData = new FormData();
    formData.append('file', csvFile);
    
    try {
      const response = await api.post(`/courses/${studentsCourse._id || studentsCourse.id}/roster`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      
      setCsvUploadResults(response.data);
      setAlert({ severity: 'success', message: response.data.message });
      
      // Refresh students list
      const studentsResponse = await api.get(`/courses/${studentsCourse._id || studentsCourse.id}/students`);
      setStudents(studentsResponse.data);
      // Re-apply current search filters
      handleStudentSearchChange('student_id', studentSearch.student_id);
      
      // Reset form
      setCsvFile(null);
      
    } catch (error) {
      const errorMessage = error.response?.data?.error?.message || 'Failed to upload CSV file';
      setCsvUploadError(errorMessage);
      setAlert({ severity: 'error', message: errorMessage });
    } finally {
      setCsvUploading(false);
    }
  };

  const handleCsvFileChange = (event) => {
    const file = event.target.files[0];
    if (file && file.type === 'text/csv') {
      setCsvFile(file);
      setCsvUploadError('');
    } else {
      setCsvUploadError('Please select a valid CSV file');
      setCsvFile(null);
    }
  };

  // Delete All Students handler
  const handleDeleteAllStudents = async () => {
    if (!studentsCourse) return;
    
    setDeleteAllStudentsLoading(true);
    
    try {
      const response = await api.delete(`/courses/${studentsCourse._id || studentsCourse.id}/students`);
      
      setAlert({ 
        severity: 'success', 
        message: `${response.data.message} (${response.data.deleted_students} students, ${response.data.deleted_teams} teams deleted)` 
      });
      
      // Clear students and teams data immediately
      setStudents([]);
      setFilteredStudents([]);
      setTeams([]);
      setFilteredTeams([]);
      
      // Clear search filters
      setStudentSearch({ student_id: '', name: '', email: '', team: '' });
      setTeamSearch({ team_name: '' });
      setShowStudentSearch(false);
      setShowTeamSearch(false);
      
      // Close the delete confirmation dialog
      setDeleteAllStudentsOpen(false);
      
      // Refresh the main courses list to update counts
      await fetchCoursesWithCounts();
      
    } catch (error) {
      const errorMessage = error.response?.data?.error?.message || 'Failed to delete all students';
      setAlert({ severity: 'error', message: errorMessage });
    } finally {
      setDeleteAllStudentsLoading(false);
    }
  };
// ...existing code...

  // Add Student Dialog (moved to top-level)
  const addStudentDialog = (
    <Dialog open={addStudentOpen} onClose={() => { setAddStudentOpen(false); setStudentFormError(''); }} maxWidth="xs" fullWidth>
      <DialogTitle>Add Student</DialogTitle>
      <DialogContent>
        <TextField
          fullWidth
          margin="normal"
          label="Student ID"
          value={studentForm.student_id}
          onChange={e => setStudentForm({ ...studentForm, student_id: e.target.value })}
          error={!!studentFormError && !studentForm.student_id}
        />
        <TextField
          fullWidth
          margin="normal"
          label="Name"
          value={studentForm.name}
          onChange={e => setStudentForm({ ...studentForm, name: e.target.value })}
          error={!!studentFormError && !studentForm.name}
        />
        <TextField
          fullWidth
          margin="normal"
          label="Email"
          value={studentForm.email}
          onChange={e => setStudentForm({ ...studentForm, email: e.target.value })}
          error={!!studentFormError && !studentForm.email}
        />
        <TextField
          fullWidth
          margin="normal"
          label="Team Assignment (Optional)"
          value={studentForm.group_assignment}
          onChange={e => setStudentForm({ ...studentForm, group_assignment: e.target.value })}
          helperText="Enter team name or identifier for this student"
        />
        {studentFormError && (
          <Typography color="error" variant="body2" sx={{ mt: 1 }}>{studentFormError}</Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={() => { setAddStudentOpen(false); setStudentFormError(''); }}>Cancel</Button>
        <Button onClick={handleAddStudent} variant="contained">Add</Button>
      </DialogActions>
    </Dialog>
  );

  // Edit Student Dialog (moved to top-level)
  const editStudentDialog = (
  <Dialog open={editStudentOpen} onClose={() => { setEditStudentOpen(false); setStudentToEdit(null); setStudentForm({ student_id: '', name: '', email: '', group_assignment: '' }); }} maxWidth="xs" fullWidth>
      <DialogTitle>Edit Student</DialogTitle>
      <DialogContent>
        <TextField
          fullWidth
          margin="normal"
          label="Student ID"
          value={studentForm.student_id}
          onChange={e => setStudentForm({ ...studentForm, student_id: e.target.value })}
        />
        <TextField
          fullWidth
          margin="normal"
          label="Name"
          value={studentForm.name}
          onChange={e => setStudentForm({ ...studentForm, name: e.target.value })}
        />
        <TextField
          fullWidth
          margin="normal"
          label="Email"
          value={studentForm.email}
          onChange={e => setStudentForm({ ...studentForm, email: e.target.value })}
        />
        <TextField
          fullWidth
          margin="normal"
          label="Team Assignment (Optional)"
          value={studentForm.group_assignment}
          onChange={e => setStudentForm({ ...studentForm, group_assignment: e.target.value })}
          helperText="Enter team name or identifier for this student"
        />
      </DialogContent>
      <DialogActions>
  <Button onClick={() => { setEditStudentOpen(false); setStudentToEdit(null); setStudentForm({ student_id: '', name: '', email: '', group_assignment: '' }); }}>Cancel</Button>
        <Button onClick={handleUpdateStudent} variant="contained" disabled={!studentForm.student_id || !studentForm.name || !studentForm.email}>Save</Button>
      </DialogActions>
    </Dialog>
  );

  // CSV Upload Dialog
  const csvUploadDialog = (
    <Dialog open={csvUploadOpen} onClose={() => { setCsvUploadOpen(false); setCsvUploadError(''); setCsvUploadResults(null); }} maxWidth="sm" fullWidth>
      <DialogTitle>Upload Student Roster (CSV)</DialogTitle>
      <DialogContent>
        <Box sx={{ mb: 2 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Upload a CSV file with the following columns:
            </Typography>
            <Box sx={{ mt: 1, pl: 2 }}>
              <span style={{ fontWeight: 'bold', color: 'red', fontSize: '1.1em' }}>student_id,name,email,team_name</span>
            </Box>
          {/* Note removed as requested */}
        </Box>
        
        <Box sx={{ mb: 2 }}>
          <input
            accept=".csv"
            style={{ display: 'none' }}
            id="csv-file-input"
            type="file"
            onChange={handleCsvFileChange}
          />
          <label htmlFor="csv-file-input">
            <Button variant="outlined" component="span" startIcon={<UploadIcon />}>
              Choose CSV File
            </Button>
          </label>
          {csvFile && (
            <Typography variant="body2" sx={{ mt: 1 }}>
              Selected: {csvFile.name}
            </Typography>
          )}
        </Box>

        {csvUploadError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {csvUploadError}
          </Alert>
        )}

        {csvUploadResults && (
          <Alert severity={csvUploadResults.errors && csvUploadResults.errors.length > 0 ? "warning" : "success"} sx={{ mb: 2 }}>
            <Typography variant="body2" sx={{ mb: 1 }}>
              {csvUploadResults.message}
            </Typography>
            {csvUploadResults.students && csvUploadResults.students.length > 0 && (
              <Typography variant="body2">
                Students added: {csvUploadResults.students.length}
              </Typography>
            )}
            {csvUploadResults.teams_created !== undefined && csvUploadResults.teams_created > 0 && (
              <Typography variant="body2" color="primary">
                Teams created: {csvUploadResults.teams_created}
              </Typography>
            )}
            {csvUploadResults.team_names && csvUploadResults.team_names.length > 0 && (
              <Typography variant="body2" sx={{ fontSize: '0.9rem', color: 'text.secondary' }}>
                Team names: {csvUploadResults.team_names.join(', ')}
              </Typography>
            )}
            {csvUploadResults.errors && csvUploadResults.errors.length > 0 && (
              <Box sx={{ mt: 1 }}>
                <Typography variant="body2" color="error">Errors:</Typography>
                {csvUploadResults.errors.map((error, index) => (
                  <Typography key={index} variant="body2" color="error" sx={{ fontSize: '0.8rem' }}>
                    • {error}
                  </Typography>
                ))}
              </Box>
            )}
          </Alert>
        )}

        {csvUploading && <LinearProgress sx={{ mb: 2 }} />}
      </DialogContent>
      <DialogActions>
        <Button onClick={() => { setCsvUploadOpen(false); setCsvUploadError(''); setCsvUploadResults(null); }}>
          Close
        </Button>
        <Button 
          onClick={handleCsvUpload} 
          variant="contained" 
          disabled={!csvFile || csvUploading}
          startIcon={<UploadIcon />}
        >
          {csvUploading ? 'Uploading...' : 'Upload'}
        </Button>
      </DialogActions>
    </Dialog>
  );

  const [studentsDialogOpen, setStudentsDialogOpen] = useState(false);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [students, setStudents] = useState([]);
  const [studentsCourse, setStudentsCourse] = useState(null);

  // Teams dialog state
  const [teamsDialogOpen, setTeamsDialogOpen] = useState(false);
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [teams, setTeams] = useState([]);
  const [teamsCourse, setTeamsCourse] = useState(null);

  // Edit team dialog state
  const [editTeamDialogOpen, setEditTeamDialogOpen] = useState(false);
  const [teamToEdit, setTeamToEdit] = useState(null);
  const [editTeamData, setEditTeamData] = useState({ team_name: '', team_status: 'Active' });

  // Create team dialog state
  const [createTeamDialogOpen, setCreateTeamDialogOpen] = useState(false);
  const [newTeamData, setNewTeamData] = useState({ team_name: '', team_status: 'Active' });

  // Manage team students dialog state
  const [manageStudentsDialogOpen, setManageStudentsDialogOpen] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [teamStudents, setTeamStudents] = useState([]);
  const [availableStudents, setAvailableStudents] = useState([]);

  // Student search state
  const [studentSearch, setStudentSearch] = useState({
    student_id: '',
    name: '',
    email: '',
    team: ''
  });
  const [filteredStudents, setFilteredStudents] = useState([]);
  const [showStudentSearch, setShowStudentSearch] = useState(false);

  // Team search state
  const [teamSearch, setTeamSearch] = useState({
    team_name: '',
    team_status: ''
  });
  const [filteredTeams, setFilteredTeams] = useState([]);
  const [showTeamSearch, setShowTeamSearch] = useState(false);

  const handleViewStudents = async (course) => {
    setStudentsDialogOpen(true);
    setStudentsCourse(course);
    setStudentsLoading(true);
    // Reset search when opening dialog
    setStudentSearch({ student_id: '', name: '', email: '', team: '' });
    setShowStudentSearch(false); // Default to hidden
    try {
      const response = await api.get(`/courses/${course._id || course.id}/students`);
      setStudents(response.data);
      setFilteredStudents(response.data); // Initialize filtered list with all students
    } catch (error) {
      setStudents([]);
      setFilteredStudents([]);
    } finally {
      setStudentsLoading(false);
    }
  };

  // Filter students based on search criteria
  const filterStudents = () => {
    let filtered = students.filter(student => {
      const matchesId = studentSearch.student_id === '' || 
        student.student_id.toLowerCase().includes(studentSearch.student_id.toLowerCase());
      const matchesName = studentSearch.name === '' || 
        student.name.toLowerCase().includes(studentSearch.name.toLowerCase());
      const matchesEmail = studentSearch.email === '' || 
        student.email.toLowerCase().includes(studentSearch.email.toLowerCase());
      const matchesTeam = studentSearch.team === '' || 
        (student.group_assignment && student.group_assignment.toLowerCase().includes(studentSearch.team.toLowerCase()));
      
      return matchesId && matchesName && matchesEmail && matchesTeam;
    });
    
    setFilteredStudents(filtered);
  };

  // Clear student search
  const clearStudentSearch = () => {
    setStudentSearch({ student_id: '', name: '', email: '', team: '' });
    setFilteredStudents(students);
    setShowStudentSearch(false); // Hide search after clearing
  };

  // Handle search input changes
  const handleStudentSearchChange = (field, value) => {
    const newSearch = { ...studentSearch, [field]: value };
    setStudentSearch(newSearch);
    
    // Filter immediately as user types
    let filtered = students.filter(student => {
      const matchesId = newSearch.student_id === '' || 
        student.student_id.toLowerCase().includes(newSearch.student_id.toLowerCase());
      const matchesName = newSearch.name === '' || 
        student.name.toLowerCase().includes(newSearch.name.toLowerCase());
      const matchesEmail = newSearch.email === '' || 
        student.email.toLowerCase().includes(newSearch.email.toLowerCase());
      const matchesTeam = newSearch.team === '' || 
        (student.group_assignment && student.group_assignment.toLowerCase().includes(newSearch.team.toLowerCase()));
      
      return matchesId && matchesName && matchesEmail && matchesTeam;
    });
    
    setFilteredStudents(filtered);
  };

  // Filter teams based on search criteria
  const filterTeams = () => {
    let filtered = teams.filter(team => {
      const matchesName = teamSearch.team_name === '' || 
        team.team_name.toLowerCase().includes(teamSearch.team_name.toLowerCase());
      const matchesStatus = teamSearch.team_status === '' || 
        team.team_status === teamSearch.team_status;
      
      return matchesName && matchesStatus;
    });
    
    setFilteredTeams(filtered);
  };

  // Clear team search
  const clearTeamSearch = () => {
    setTeamSearch({ team_name: '', team_status: '' });
    setFilteredTeams(teams);
    setShowTeamSearch(false); // Hide search after clearing
  };

  // Handle team search input changes
  const handleTeamSearchChange = (field, value) => {
    const newSearch = { ...teamSearch, [field]: value };
    setTeamSearch(newSearch);
    
    // Filter immediately as user types
    let filtered = teams.filter(team => {
      const matchesName = newSearch.team_name === '' || 
        team.team_name.toLowerCase().includes(newSearch.team_name.toLowerCase());
      const matchesStatus = newSearch.team_status === '' || 
        team.team_status === newSearch.team_status;
      
      return matchesName && matchesStatus;
    });
    
    setFilteredTeams(filtered);
  };

  const handleViewTeams = async (course) => {
    setTeamsDialogOpen(true);
    setTeamsCourse(course);
    setTeamsLoading(true);
    // Reset search when opening dialog
    setTeamSearch({ team_name: '', team_status: '' });
    setShowTeamSearch(false); // Default to hidden
    try {
      const response = await api.get(`/courses/${course._id || course.id}/teams`);
      setTeams(response.data);
      setFilteredTeams(response.data); // Initialize filtered list with all teams
    } catch (error) {
      setTeams([]);
      setFilteredTeams([]);
    } finally {
      setTeamsLoading(false);
    }
  };

  const handleClearAllTeams = async () => {
    if (!teamsCourse) return;
    
    if (!window.confirm(`Are you sure you want to delete ALL teams for ${teamsCourse.course_name}? This will also unlink all students from their teams.`)) {
      return;
    }
    
    try {
      const response = await api.delete(`/courses/${teamsCourse._id}/teams`);
      setAlert({ severity: 'success', message: response.data.message });
      setTeams([]); // Clear the teams list
      setFilteredTeams([]); // Clear the filtered teams list
      fetchCoursesWithCounts(); // Refresh the course list to update team count
    } catch (error) {
      console.error('Error clearing teams:', error);
      setAlert({ severity: 'error', message: 'Failed to clear teams' });
    }
  };

  const handleDeleteTeam = async (teamId, teamName) => {
    if (!teamsCourse || !teamId) return;
    
    if (!window.confirm(`Are you sure you want to delete "${teamName}"? This will unlink all students from this team.`)) {
      return;
    }
    
    try {
      await api.delete(`/courses/${teamsCourse._id}/teams/${teamId}`);
      setAlert({ severity: 'success', message: `Team "${teamName}" deleted successfully` });
      
      // Remove the deleted team from the local state
      setTeams(prevTeams => prevTeams.filter(team => team._id !== teamId));
      // Re-apply current search filters
      handleTeamSearchChange('team_name', teamSearch.team_name);
      
      // Refresh the course list to update team count
      fetchCoursesWithCounts();
    } catch (error) {
      console.error('Error deleting team:', error);
      setAlert({ severity: 'error', message: `Failed to delete team "${teamName}"` });
    }
  };

  const handleEditTeam = (team) => {
    setTeamToEdit(team);
    setEditTeamData({
      team_name: team.team_name,
      team_status: team.team_status
    });
    setEditTeamDialogOpen(true);
  };

  const handleSaveTeamEdit = async () => {
    if (!teamToEdit || !teamsCourse) return;
    
    // Validation
    if (!editTeamData.team_name.trim()) {
      setAlert({ severity: 'error', message: 'Team name is required' });
      return;
    }
    
    try {
      await api.put(`/courses/${teamsCourse._id}/teams/${teamToEdit._id}`, editTeamData);
      setAlert({ severity: 'success', message: `Team "${editTeamData.team_name}" updated successfully` });
      
      // Update the team in the local state
      setTeams(prevTeams => 
        prevTeams.map(team => 
          team._id === teamToEdit._id 
            ? { ...team, ...editTeamData }
            : team
        )
      );
      // Re-apply current search filters
      handleTeamSearchChange('team_name', teamSearch.team_name);
      
      // If team name was changed, refresh students list to show updated team assignments
      if (editTeamData.team_name !== teamToEdit.team_name && students.length > 0) {
        try {
          const studentsResponse = await api.get(`/courses/${teamsCourse._id}/students`);
          setStudents(studentsResponse.data);
        } catch (error) {
          console.error('Error refreshing students list:', error);
        }
      }
      
      // Close the dialog
      setEditTeamDialogOpen(false);
      setTeamToEdit(null);
      setEditTeamData({ team_name: '', team_status: 'Active' });
      
    } catch (error) {
      console.error('Error updating team:', error);
      setAlert({ severity: 'error', message: 'Failed to update team' });
    }
  };

  const handleCreateTeam = async () => {
    if (!teamsCourse) return;
    
    // Validation
    if (!newTeamData.team_name.trim()) {
      setAlert({ severity: 'error', message: 'Team name is required' });
      return;
    }
    
    try {
      await api.post(`/courses/${teamsCourse._id}/teams`, [newTeamData]);
      setAlert({ severity: 'success', message: `Team "${newTeamData.team_name}" created successfully` });
      
      // Refresh teams list
      const teamsResponse = await api.get(`/courses/${teamsCourse._id}/teams`);
      setTeams(teamsResponse.data);
      // Re-apply current search filters
      handleTeamSearchChange('team_name', teamSearch.team_name);
      
      // Close the dialog and reset form
      setCreateTeamDialogOpen(false);
      setNewTeamData({ team_name: '', team_status: 'Active' });
      
      // Refresh course counts
      fetchCoursesWithCounts();
      
    } catch (error) {
      console.error('Error creating team:', error);
      setAlert({ severity: 'error', message: 'Failed to create team' });
    }
  };

  const handleManageTeamStudents = async (team) => {
    setSelectedTeam(team);
    setManageStudentsDialogOpen(true);
    
    try {
      // Get all students in the course
      const allStudentsResponse = await api.get(`/courses/${teamsCourse._id}/students`);
      const allStudents = allStudentsResponse.data;
      
      // Filter students by team
      const studentsInTeam = allStudents.filter(student => 
        student.team_id === team._id || student.group_assignment === team.team_name
      );
      const studentsNotInTeam = allStudents.filter(student => 
        !student.team_id || (student.team_id !== team._id && student.group_assignment !== team.team_name)
      );
      
      setTeamStudents(studentsInTeam);
      setAvailableStudents(studentsNotInTeam);
    } catch (error) {
      console.error('Error fetching team students:', error);
      setAlert({ severity: 'error', message: 'Failed to load team students' });
    }
  };

  const handleAddStudentToTeam = async (studentId) => {
    if (!selectedTeam || !teamsCourse) return;
    try {
      // Check if evaluations have been sent BEFORE making changes
      const evalStatusResp = await api.get(`/courses/${teamsCourse._id}/evaluations/status`);
      if (evalStatusResp.data && evalStatusResp.data.evaluations_sent) {
        setPendingEvalResetCourseId(teamsCourse._id);
        setPendingTeamAction({ type: 'add', studentId, selectedTeam, teamsCourse });
        setShowEvalResetDialog(true);
        return;
      }
      // If not sent, proceed as normal
      await doAddStudentToTeam(studentId, selectedTeam, teamsCourse);
    } catch (error) {
      console.error('Error adding student to team:', error);
      setAlert({ severity: 'error', message: 'Failed to add student to team' });
    }
  };

  // Actual add logic, separated for reuse
  const doAddStudentToTeam = async (studentId, teamOverride, courseOverride) => {
    const team = teamOverride || selectedTeam;
    const course = courseOverride || teamsCourse;
    if (!team || !course) return;
    await api.post(`/courses/${course._id}/teams/${team._id}/students/${studentId}`);
    // Move student from available to team
    const student = availableStudents.find(s => s._id === studentId);
    if (student) {
      setTeamStudents(prev => [...prev, { ...student, team_id: team._id, group_assignment: team.team_name }]);
      setAvailableStudents(prev => prev.filter(s => s._id !== studentId));
    }
    // Refresh teams list to update counts
    const teamsResponse = await api.get(`/courses/${course._id}/teams`);
    setTeams(teamsResponse.data);
    setAlert({ severity: 'success', message: `Student added to ${team.team_name}` });
    // Refresh students in team dialog
    await handleManageTeamStudents(team);
  };

  const handleRemoveStudentFromTeam = async (studentId) => {
    if (!selectedTeam || !teamsCourse) return;
    try {
      // Check if evaluations have been sent BEFORE making changes
      const evalStatusResp = await api.get(`/courses/${teamsCourse._id}/evaluations/status`);
      if (evalStatusResp.data && evalStatusResp.data.evaluations_sent) {
        setPendingEvalResetCourseId(teamsCourse._id);
        setPendingTeamAction({ type: 'remove', studentId, selectedTeam, teamsCourse });
        setShowEvalResetDialog(true);
        return;
      }
      // If not sent, proceed as normal
      await doRemoveStudentFromTeam(studentId, selectedTeam, teamsCourse);
    } catch (error) {
      console.error('Error removing student from team:', error);
      setAlert({ severity: 'error', message: 'Failed to remove student from team' });
    }
  };

  // Actual remove logic, separated for reuse
  const doRemoveStudentFromTeam = async (studentId, teamOverride, courseOverride) => {
    const team = teamOverride || selectedTeam;
    const course = courseOverride || teamsCourse;
    if (!team || !course) return;
    await api.delete(`/courses/${course._id}/teams/${team._id}/students/${studentId}`);
    // Move student from team to available
    const student = teamStudents.find(s => s._id === studentId);
    if (student) {
      setAvailableStudents(prev => [...prev, { ...student, team_id: null, group_assignment: '' }]);
      setTeamStudents(prev => prev.filter(s => s._id !== studentId));
    }
    // Refresh teams list to update counts
    const teamsResponse = await api.get(`/courses/${course._id}/teams`);
    setTeams(teamsResponse.data);
    setAlert({ severity: 'success', message: `Student removed from ${team.team_name}` });
    // Refresh students in team dialog
    await handleManageTeamStudents(team);
  };

  // Handler for confirming evaluation reset and then performing the pending team action
  const handleConfirmEvalReset = async () => {
    console.log('handleConfirmEvalReset called', { pendingEvalResetCourseId, pendingTeamAction });
    if (!pendingEvalResetCourseId || !pendingTeamAction) {
      console.log('Missing pendingEvalResetCourseId or pendingTeamAction');
      return;
    }
    setShowEvalResetDialog(false);
    await handleResetEvaluationState(pendingEvalResetCourseId);
    // After reset, perform the pending action with stored team/course
    if (pendingTeamAction.type === 'add') {
      console.log('Proceeding with doAddStudentToTeam', pendingTeamAction);
      await doAddStudentToTeam(pendingTeamAction.studentId, pendingTeamAction.selectedTeam, pendingTeamAction.teamsCourse);
    } else if (pendingTeamAction.type === 'remove') {
      console.log('Proceeding with doRemoveStudentFromTeam', pendingTeamAction);
      await doRemoveStudentFromTeam(pendingTeamAction.studentId, pendingTeamAction.selectedTeam, pendingTeamAction.teamsCourse);
    }
    setPendingEvalResetCourseId(null);
    setPendingTeamAction(null);
  };

  // Handler for cancelling evaluation reset
  const handleCancelEvalReset = () => {
    setShowEvalResetDialog(false);
    setPendingEvalResetCourseId(null);
    setPendingTeamAction(null);
  };
  // ...existing code...

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [courseToEdit, setCourseToEdit] = useState(null);
  const [editCourse, setEditCourse] = useState({ 
    course_name: '', 
    course_number: '', 
    course_section: '', 
    semester: '',
    course_status: 'Active'
  });

  const handleEditClick = (course) => {
    setCourseToEdit(course);
    setEditCourse({
      course_name: course.course_name,
      course_number: course.course_number || course.course_code || '',
      course_section: course.course_section || '',
      semester: course.semester,
      course_status: course.course_status || 'Active'
    });
    setEditDialogOpen(true);
  };

  const handleEditCourse = async () => {
    if (!courseToEdit) return;
    try {
      await api.put(`/courses/${courseToEdit._id || courseToEdit.id}`, editCourse);
      setAlert({ severity: 'success', message: 'Course updated successfully' });
      setEditDialogOpen(false);
      setCourseToEdit(null);
      fetchCoursesWithCounts();
    } catch (error) {
      setAlert({ severity: 'error', message: 'Failed to update course' });
    }
  };
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [courseToDelete, setCourseToDelete] = useState(null);
  const handleDeleteCourse = async () => {
    if (!courseToDelete || !(courseToDelete.id || courseToDelete._id)) return;
    const courseId = courseToDelete.id || courseToDelete._id;
    try {
      await api.delete(`/courses/${courseId}`);
      setAlert({ severity: 'success', message: 'Course deleted successfully' });
      setDeleteDialogOpen(false);
      setCourseToDelete(null);
      fetchCoursesWithCounts();
    } catch (error) {
      setAlert({ severity: 'error', message: 'Failed to delete course' });
    }
  };
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [newCourse, setNewCourse] = useState({
    course_name: '',
    course_number: '',
    course_section: '',
    semester: ''
  });
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [alert, setAlert] = useState(null);

  // Search filter state
  const [searchFilters, setSearchFilters] = useState({
    course_name: '',
    course_number: '',
    course_section: '',
    semester: '',
    course_status: 'Active' // Back to default Active filter
  });
  const [showSearchFilters, setShowSearchFilters] = useState(false);

  // Fetch all courses, then update each with the latest student_count
  const fetchCoursesWithCounts = useCallback(async (filters = null) => {
    setLoading(true);
    try {
      // Use provided filters or current search filters
      const activeFilters = filters || searchFilters;
      
      // Build query parameters
      const queryParams = new URLSearchParams();
      Object.entries(activeFilters).forEach(([key, value]) => {
        if (value && value.trim()) {
          queryParams.append(key, value.trim());
        }
      });
      
      const response = await api.get(`/courses?${queryParams.toString()}`);
      let coursesList = response.data;
      
      // Fetch the latest course object for each course in parallel
      const updatedCourses = await Promise.all(
        coursesList.map(async (course) => {
          try {
            const fresh = await getCourseById(course._id || course.id);
            // Use all fields from the fresh course object
            return { ...fresh };
          } catch (e) {
            // fallback to original if error
            return course;
          }
        })
      );
      
      setCourses(updatedCourses);
    } catch (error) {
      setAlert({ severity: 'error', message: 'Failed to fetch courses' });
    } finally {
      setLoading(false);
    }
  }, [searchFilters]);

  useEffect(() => {
    fetchCoursesWithCounts();
  }, [fetchCoursesWithCounts]); // Re-fetch when fetchCoursesWithCounts changes

  // Search handlers
  const handleSearch = () => {
    fetchCoursesWithCounts(searchFilters);
  };

  const handleClearSearch = () => {
    const clearedFilters = {
      course_name: '',
      course_number: '',
      course_section: '',
      semester: '',
      course_status: 'Active'
    };
    setSearchFilters(clearedFilters);
    fetchCoursesWithCounts(clearedFilters);
  };

  const handleCreateCourse = async () => {
    try {
      console.log('Creating course with data:', newCourse);
  // eslint-disable-next-line
  const response = await api.post('/courses', newCourse);
      console.log('Course creation successful:', response);
      setAlert({ severity: 'success', message: 'Course created successfully' });
      setCreateDialogOpen(false);
  fetchCoursesWithCounts();
      setNewCourse({ 
        course_name: '', 
        course_number: '', 
        course_section: '', 
        semester: '' 
      });
    } catch (error) {
      console.error('Course creation error:', error.response?.data || error.message);
      console.error('Full error object:', error);
      console.error('Error response:', error.response);
      console.error('Error status:', error.response?.status);
      setAlert({ severity: 'error', message: 'Failed to create course' });
    }
  };

  const handleUploadRoster = async () => {
    if (!uploadFile || !selectedCourse || !(selectedCourse.id || selectedCourse._id)) {
      setAlert({ severity: 'error', message: 'No course selected.' });
      return;
    }

    const courseId = selectedCourse.id || selectedCourse._id;
    const formData = new FormData();
    formData.append('file', uploadFile);

    try {
      setUploadProgress(25);
      const response = await api.post(
        `/courses/${courseId}/roster`,
        formData,
        {
          headers: { 'Content-Type': 'multipart/form-data' },
          onUploadProgress: (progressEvent) => {
            const progress = Math.round(
              (progressEvent.loaded * 100) / progressEvent.total
            );
            setUploadProgress(progress);
          }
        }
      );
      setAlert({ 
        severity: 'success', 
        message: `${response.data.students.length} students added successfully` 
      });
      setUploadDialogOpen(false);
      setUploadFile(null);
      setUploadProgress(0);
  fetchCoursesWithCounts();
    } catch (error) {
      setAlert({ severity: 'error', message: 'Failed to upload roster' });
      setUploadProgress(0);
    }
  };

  const handleSendInvitations = async (courseId) => {
    setSendingEvaluations(prev => ({ ...prev, [courseId]: true }));
    
    // First check if backend is reachable
    try {
      console.log('Testing backend connectivity...');
      // Test with the root endpoint that we know exists
      const testUrl = getApiBaseUrl().replace(/\/api$/, '/');
      console.log('Testing backend URL:', testUrl);
      const testResponse = await fetch(testUrl);
      if (!testResponse.ok) {
        throw new Error(`Backend returned ${testResponse.status}`);
      }
      const result = await testResponse.json();
      console.log('Backend response:', result);
      console.log('Backend is reachable, proceeding with evaluation send...');
    } catch (connectError) {
      console.error('Backend connectivity test failed:', connectError);
      setSendingEvaluations(prev => ({ ...prev, [courseId]: false }));
      setAlert({
        severity: 'error',
        message: '❌ Cannot connect to backend server. Please check if the backend is running.'
      });
      return;
    }
    
    try {
      console.log(`Sending evaluations for course: ${courseId}`);
      console.log('API Base URL:', api.defaults.baseURL);
      console.log('Full URL:', `${api.defaults.baseURL}/courses/${courseId}/evaluations/send`);
      
      const response = await api.post(`/courses/${courseId}/evaluations/send`);
      setAlert({ 
        severity: 'success', 
        message: `✅ ${response.data.message} - Emails sent to ${response.data.emails_sent || 'all'} students`
      });
      // Close the evaluation status dialog if open
      setEvaluationStatusOpen(false);
      // Refresh the evaluation status after sending
      setTimeout(() => {
        handleViewEvaluationStatus({ _id: courseId, id: courseId });
      }, 1000);
    } catch (error) {
      console.error('Send evaluations error:', error);
      
      let errorMessage = 'Failed to send evaluation invitations';
      
      if (error.code === 'ECONNABORTED') {
        errorMessage = 'Email sending is taking longer than expected. This is normal for the first time. Please wait a few more minutes and check your email, or try again.';
      } else if (error.response?.status === 500) {
        errorMessage = 'Server error - check backend logs for SMTP configuration issues';
      } else if (error.response?.status === 401) {
        errorMessage = 'Authentication failed - please log in again';
      } else if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error.response?.data?.error?.message) {
        errorMessage = error.response.data.error.message;
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      setAlert({ 
        severity: 'error', 
        message: `❌ ${errorMessage}` 
      });
    } finally {
      setSendingEvaluations(prev => ({ ...prev, [courseId]: false }));
    }
  };

  const handleResetEvaluationState = async (courseId) => {
    setResettingEvaluations(true);
    try {
      const response = await api.delete(`/courses/${courseId}/evaluations/reset`);
      setAlert({
        severity: 'success',
        message: `✅ ${response.data.message} - Cleared ${response.data.tokens_cleared} tokens and ${response.data.evaluations_deleted} evaluations`
      });
      
      // Refresh evaluation status after reset
      setTimeout(() => {
        const course = { _id: courseId, id: courseId };
        handleViewEvaluationStatus(course);
      }, 1000);
      
    } catch (error) {
      console.error('Reset evaluation state error:', error);
      const errorMessage = error.response?.data?.message || 'Failed to reset evaluation state';
      setAlert({
        severity: 'error',
        message: `❌ ${errorMessage}`
      });
    } finally {
      setResettingEvaluations(false);
    }
  };

  const handleViewEvaluationStatus = async (course) => {
    setSelectedCourseForEval(course);
    setEvaluationStatusLoading(true);
    setEvaluationStatusOpen(true);
    
    try {
      const response = await api.get(`/courses/${course._id || course.id}/evaluations/status`);
      setEvaluationStatus(response.data);
    } catch (error) {
      setAlert({ severity: 'error', message: 'Failed to load evaluation status' });
      setEvaluationStatus(null);
    } finally {
      setEvaluationStatusLoading(false);
    }
  };

  const handleSendReminders = async (courseId) => {
    try {
      const response = await api.post(`/courses/${courseId}/evaluations/remind`);
      setAlert({ 
        severity: 'success', 
        message: response.data.message 
      });
      
      // Refresh evaluation status if dialog is open
      if (evaluationStatusOpen && (selectedCourseForEval?._id || selectedCourseForEval?.id) === courseId) {
        const statusResponse = await api.get(`/courses/${courseId}/evaluations/status`);
        setEvaluationStatus(statusResponse.data);
      }
    } catch (error) {
      setAlert({ severity: 'error', message: 'Failed to send reminders' });
    }
  };


  const handleLogout = () => {
    logout();
    navigate('/');
  };

  // Delete All Students Confirmation Dialog
  const deleteAllStudentsDialog = (
    <Dialog 
      open={deleteAllStudentsOpen} 
      onClose={() => setDeleteAllStudentsOpen(false)} 
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
          <li>Delete all {students.length} students from the course</li>
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
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setDeleteAllStudentsOpen(false)}>
          Cancel
        </Button>
        <Button 
          onClick={() => {
            const confirmationInput = document.getElementById('delete-confirmation');
            if (confirmationInput.value === 'DELETE ALL') {
              handleDeleteAllStudents();
            } else {
              setAlert({ severity: 'error', message: 'Please type "DELETE ALL" to confirm' });
            }
          }}
          variant="contained" 
          color="error"
          disabled={deleteAllStudentsLoading || students.length === 0}
          startIcon={<DeleteIcon />}
        >
          {deleteAllStudentsLoading ? 'Deleting...' : 'Delete All Students'}
        </Button>
      </DialogActions>
    </Dialog>
  );

  return (
    <div className={styles.courseManagementContainer}>
      {/* PEERS System Title at Top */}
  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
  <EmojiObjectsIcon sx={{ fontSize: 48, color: '#1976d2' }} />
        <Box>
          <Typography variant="h3" sx={{ fontWeight: 800, color: '#1a237e', letterSpacing: 1, mb: 0 }}>
            PEERS
            <Typography component="span" variant="h6" sx={{ color: '#1976d2', fontWeight: 600, ml: 1 }}>
              (Peer End to End Review System)
            </Typography>
          </Typography>
        </Box>
      </Box>
      {/* Evaluation Reset Confirmation Dialog */}
      <Dialog open={showEvalResetDialog} onClose={handleCancelEvalReset} maxWidth="xs" fullWidth>
        {console.log('Eval Reset Dialog rendered', { showEvalResetDialog, pendingEvalResetCourseId, pendingTeamAction })}
        <DialogTitle>Evaluations Already Sent</DialogTitle>
        <DialogContent>
          <Typography variant="body1" sx={{ mb: 2 }}>
            Evaluations have already been sent for this course. If you continue, the evaluation state will be reset and you will need to resend evaluations. This will clear all evaluation tokens and responses for this course.
          </Typography>
          <Typography variant="body2" color="error" sx={{ mb: 2 }}>
            This action cannot be undone. Do you want to continue?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCancelEvalReset} color="secondary">Cancel</Button>
          <Button onClick={handleConfirmEvalReset} color="warning" variant="contained">Continue</Button>
        </DialogActions>
      </Dialog>
      {addStudentDialog}
      {editStudentDialog}
      {csvUploadDialog}
      {deleteAllStudentsDialog}
      <Box display="flex" justifyContent="flex-end" mb={2} gap={2}>
        <Button variant="outlined" className={styles.logoutButton} color="primary" onClick={() => navigate('/settings')}>
          Settings
        </Button>
        <Button variant="outlined" className={styles.logoutButton} color="secondary" onClick={handleLogout}>
          Logout
        </Button>
      </Box>
      {/* Modern Dashboard Header */}
      <Paper elevation={3} sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        p: 3,
        mb: 3,
        borderRadius: 3,
        background: 'linear-gradient(90deg, #e3f2fd 0%, #f9fafe 100%)',
        boxShadow: '0 2px 12px rgba(25, 118, 210, 0.08)'
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Box>
            <Typography variant="h3" sx={{ color: '#1976d2', fontWeight: 700, mt: 0, mb: 0 }}>
              {currentUser?.name ? `Welcome ${currentUser.name}` : "Welcome Professor"}
            </Typography>
            <Typography variant="h4" sx={{ color: '#1976d2', fontWeight: 500, mt: 0, mb: 0 }}>
              Course Management Dashboard
            </Typography>
          </Box>
        </Box>
        <Button
          variant="contained"
          className={styles.createButton}
          startIcon={<AddIcon />}
          size="large"
          onClick={() => setCreateDialogOpen(true)}
        >
          Create Course
        </Button>
      </Paper>
      
      {/* Search Filters */}
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
            <Typography variant="h6" component="h2">
              Search Courses
            </Typography>
            <Button
              variant="outlined"
              startIcon={<FilterListIcon />}
              onClick={() => setShowSearchFilters(!showSearchFilters)}
            >
              {showSearchFilters ? 'Hide Filters' : 'Show Filters'}
            </Button>
          </Box>
          
          <Collapse in={showSearchFilters}>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 2, mb: 2 }}>
              <TextField
                fullWidth
                label="Course Name"
                value={searchFilters.course_name}
                onChange={(e) => setSearchFilters({ ...searchFilters, course_name: e.target.value })}
                placeholder="Software Engineering"
              />
              <TextField
                fullWidth
                label="Course Number"
                value={searchFilters.course_number}
                onChange={(e) => setSearchFilters({ ...searchFilters, course_number: e.target.value })}
                placeholder="CS 4850"
              />
              <TextField
                fullWidth
                label="Course Section"
                value={searchFilters.course_section}
                onChange={(e) => setSearchFilters({ ...searchFilters, course_section: e.target.value })}
                placeholder="01"
              />
              <TextField
                fullWidth
                label="Semester"
                value={searchFilters.semester}
                onChange={(e) => setSearchFilters({ ...searchFilters, semester: e.target.value })}
                placeholder="Fall 2025"
              />
              <FormControl fullWidth>
                <InputLabel>Course Status</InputLabel>
                <Select
                  value={searchFilters.course_status}
                  label="Course Status"
                  onChange={(e) => setSearchFilters({ ...searchFilters, course_status: e.target.value })}
                >
                  <MenuItem value="Active">Active</MenuItem>
                  <MenuItem value="Inactive">Inactive</MenuItem>
                  <MenuItem value="">All</MenuItem>
                </Select>
              </FormControl>
            </Box>
            
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                variant="contained"
                startIcon={<SearchIcon />}
                onClick={handleSearch}
              >
                Search
              </Button>
              <Button
                variant="outlined"
                startIcon={<ClearIcon />}
                onClick={handleClearSearch}
              >
                Clear
              </Button>
            </Box>
          </Collapse>
        </CardContent>
      </Card>

      {alert && (
        <Alert severity={alert.severity} className={styles.alert} onClose={() => setAlert(null)}>
          {alert.message}
        </Alert>
      )}
      <div className={styles.tableContainer} style={{ width: '100%' }}>
        <TableContainer component={Paper} style={{ width: '100%' }}>
          <Table style={{ width: '100%' }}>
            <TableHead>
              <TableRow>
                <TableCell
                  onClick={() => setSortConfig(prev => ({ key: 'course_name', direction: prev.key === 'course_name' && prev.direction === 'asc' ? 'desc' : 'asc' }))}
                  style={{ cursor: 'pointer', fontWeight: 'bold', whiteSpace: 'nowrap' }}
                >
                  Course Name {sortConfig.key === 'course_name' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : ''}
                </TableCell>
                <TableCell
                  onClick={() => setSortConfig(prev => ({ key: 'course_number', direction: prev.key === 'course_number' && prev.direction === 'asc' ? 'desc' : 'asc' }))}
                  style={{ cursor: 'pointer', fontWeight: 'bold', whiteSpace: 'nowrap' }}
                >
                  Course Number {sortConfig.key === 'course_number' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : ''}
                </TableCell>
                <TableCell style={{ whiteSpace: 'nowrap' }}>Course Section</TableCell>
                <TableCell
                  onClick={() => setSortConfig(prev => ({ key: 'semester', direction: prev.key === 'semester' && prev.direction === 'asc' ? 'desc' : 'asc' }))}
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
                // Sort courses before mapping
                [...courses].sort((a, b) => {
                  const { key, direction } = sortConfig;
                  let aValue = a[key];
                  let bValue = b[key];
                  // Handle alternate keys for course_number
                  if (key === 'course_number') {
                    aValue = a.course_number || a.course_code || '';
                    bValue = b.course_number || b.course_code || '';
                  }
                  // Handle numbers for student_count/team_count
                  if (key === 'student_count' || key === 'team_count') {
                    aValue = a[key] || 0;
                    bValue = b[key] || 0;
                  }
                  // Fallback to string compare
                  if (typeof aValue === 'string' && typeof bValue === 'string') {
                    aValue = aValue.toLowerCase();
                    bValue = bValue.toLowerCase();
                  }
                  if (aValue < bValue) return direction === 'asc' ? -1 : 1;
                  if (aValue > bValue) return direction === 'asc' ? 1 : -1;

                  // If sorting by semester, use course_name as secondary (alphabetical)
                  if (key === 'semester') {
                    const aName = (a.course_name || '').toLowerCase();
                    const bName = (b.course_name || '').toLowerCase();
                    if (aName < bName) return -1;
                    if (aName > bName) return 1;
                  }
                  // Always use course_section as final tiebreaker (numeric, ascending)
                  const aSection = parseInt(a.course_section, 10) || 0;
                  const bSection = parseInt(b.course_section, 10) || 0;
                  if (aSection < bSection) return -1;
                  if (aSection > bSection) return 1;
                  return 0;
                }).map((course) => (
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
                        {/* ...other action buttons... */}
                        <IconButton
                          size="small"
                          color="primary"
                          onClick={() => {
                            setSelectedCourse(course);
                            setUploadDialogOpen(true);
                          }}
                          title="Upload Roster"
                        >
                          <UploadIcon />
                        </IconButton>
                        <IconButton
                          size="small"
                          color="primary"
                          onClick={() => handleViewStudents(course)}
                          title="Manage Students"
                        >
                          <PersonIcon />
                        </IconButton>
      {/* Manage Students Dialog */}
  <Dialog open={studentsDialogOpen} onClose={() => { setStudentsDialogOpen(false); fetchCoursesWithCounts(); }} maxWidth="md" fullWidth>
        <DialogTitle>Manage Students for {studentsCourse?.course_number || studentsCourse?.course_code} {studentsCourse?.course_section || ''} - {studentsCourse?.course_name}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Button
              variant="outlined"
              startIcon={<FilterListIcon />}
              onClick={() => setShowStudentSearch(!showStudentSearch)}
              size="small"
            >
              {showStudentSearch ? 'Hide Search' : 'Show Search'}
            </Button>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button variant="outlined" size="small" startIcon={<UploadIcon />} onClick={() => setCsvUploadOpen(true)}>
                Upload CSV
              </Button>
              <Button variant="contained" size="small" startIcon={<AddIcon />} onClick={() => setAddStudentOpen(true)}>
                Add Student
              </Button>
            </Box>
          </Box>

          {/* Student Search Filters */}
          <Collapse in={showStudentSearch}>
            <Card sx={{ mb: 2 }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Search Students ({filteredStudents.length} of {students.length})
                </Typography>
                <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
                  <TextField
                    size="small"
                    label="Student ID"
                    value={studentSearch.student_id}
                    onChange={(e) => handleStudentSearchChange('student_id', e.target.value)}
                    placeholder="Search by ID..."
                    sx={{ minWidth: 150, flex: 1 }}
                  />
                  <TextField
                    size="small"
                    label="Name"
                    value={studentSearch.name}
                    onChange={(e) => handleStudentSearchChange('name', e.target.value)}
                    placeholder="Search by name..."
                    sx={{ minWidth: 150, flex: 1 }}
                  />
                  <TextField
                    size="small"
                    label="Email"
                    value={studentSearch.email}
                    onChange={(e) => handleStudentSearchChange('email', e.target.value)}
                    placeholder="Search by email..."
                    sx={{ minWidth: 150, flex: 1 }}
                  />
                  <TextField
                    size="small"
                    label="Team"
                    value={studentSearch.team}
                    onChange={(e) => handleStudentSearchChange('team', e.target.value)}
                    placeholder="Search by team..."
                    sx={{ minWidth: 150, flex: 1 }}
                  />
                </Box>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Button
                    variant="contained"
                    size="small"
                    startIcon={<SearchIcon />}
                    onClick={filterStudents}
                  >
                    Search
                  </Button>
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<ClearIcon />}
                    onClick={clearStudentSearch}
                    disabled={!studentSearch.student_id && !studentSearch.name && !studentSearch.email && !studentSearch.team}
                  >
                    Clear Search
                  </Button>
                </Box>
              </CardContent>
            </Card>
          </Collapse>
          {studentsLoading ? (
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
                        <IconButton size="small" color="primary" onClick={() => handleEditStudent(student)} title="Edit Student">
                          <EditIcon />
                        </IconButton>
                        <IconButton size="small" color="error" onClick={() => handleDeleteStudent(student)} title="Delete Student">
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
            onClick={() => setDeleteAllStudentsOpen(true)}
            color="error"
            variant="outlined"
            disabled={!students || students.length === 0}
            startIcon={<DeleteIcon />}
          >
            Delete All Students
          </Button>
          <Box sx={{ flex: 1 }} />
          <Button onClick={() => { setStudentsDialogOpen(false); fetchCoursesWithCounts(); }}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Manage Teams Dialog */}
      <Dialog open={teamsDialogOpen} onClose={() => { setTeamsDialogOpen(false); fetchCoursesWithCounts(); }} maxWidth="md" fullWidth>
        <DialogTitle>Manage Teams for {teamsCourse?.course_number || teamsCourse?.course_code} {teamsCourse?.course_section || ''} - {teamsCourse?.course_name}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Button
              variant="outlined"
              startIcon={<FilterListIcon />}
              onClick={() => setShowTeamSearch(!showTeamSearch)}
              size="small"
            >
              {showTeamSearch ? 'Hide Search' : 'Show Search'}
            </Button>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button 
                variant="contained" 
                size="small" 
                startIcon={<AddIcon />}
                onClick={() => setCreateTeamDialogOpen(true)}
              >
                Create Team
              </Button>
            </Box>
          </Box>

          {/* Team Search Filters */}
          <Collapse in={showTeamSearch}>
            <Card sx={{ mb: 2 }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Search Teams ({filteredTeams.length} of {teams.length})
                </Typography>
                <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
                  <TextField
                    size="small"
                    label="Team Name"
                    value={teamSearch.team_name}
                    onChange={(e) => handleTeamSearchChange('team_name', e.target.value)}
                    placeholder="Search by team name..."
                    sx={{ minWidth: 200, flex: 1 }}
                  />
                  <FormControl size="small" sx={{ minWidth: 150, flex: 1 }}>
                    <InputLabel>Team Status</InputLabel>
                    <Select
                      value={teamSearch.team_status}
                      label="Team Status"
                      onChange={(e) => handleTeamSearchChange('team_status', e.target.value)}
                    >
                      <MenuItem value="">All</MenuItem>
                      <MenuItem value="Active">Active</MenuItem>
                      <MenuItem value="Inactive">Inactive</MenuItem>
                    </Select>
                  </FormControl>
                </Box>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Button
                    variant="contained"
                    size="small"
                    startIcon={<SearchIcon />}
                    onClick={filterTeams}
                  >
                    Search
                  </Button>
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<ClearIcon />}
                    onClick={clearTeamSearch}
                    disabled={!teamSearch.team_name && !teamSearch.team_status}
                  >
                    Clear Search
                  </Button>
                </Box>
              </CardContent>
            </Card>
          </Collapse>

          {teamsLoading ? (
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
                    filteredTeams
                      .sort((a, b) => {
                        // Natural sort that handles both alphabetical and numerical sorting
                        const nameA = (a.team_name || '').toLowerCase();
                        const nameB = (b.team_name || '').toLowerCase();
                        
                        // Use localeCompare with numeric option for natural sorting
                        return nameA.localeCompare(nameB, undefined, {
                          numeric: true,
                          sensitivity: 'base'
                        });
                      })
                      .map((team) => (
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
                            onClick={() => handleManageTeamStudents(team)}
                          >
                            <PeopleIcon />
                          </IconButton>
                          <IconButton 
                            size="small" 
                            color="success" 
                            title="Send Evaluations to Team"
                            onClick={() => handleSendTeamEvaluations(team)}
                            disabled={sendingTeamEvaluations[team._id || team.id]}
                          >
                            {sendingTeamEvaluations[team._id || team.id] ? <CircularProgress size={20} /> : <SendIcon />}
                          </IconButton>
                          <IconButton 
                            size="small" 
                            color="error" 
                            title="Delete Team"
                            onClick={() => handleDeleteTeam(team._id || team.id, team.team_name)}
                          >
                            <DeleteIcon />
                          </IconButton>
                          <IconButton 
                            size="small" 
                            color="primary" 
                            title="Edit Team"
                            onClick={() => handleEditTeam(team)}
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
            onClick={handleClearAllTeams}
            color="error"
            variant="outlined"
            disabled={!teams || teams.length === 0}
          >
            Clear All Teams
          </Button>
          <Box sx={{ flex: 1 }} />
          <Button onClick={() => { setTeamsDialogOpen(false); fetchCoursesWithCounts(); }}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Edit Team Dialog */}
      <Dialog open={editTeamDialogOpen} onClose={() => setEditTeamDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Edit Team</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="Team Name"
            value={editTeamData.team_name}
            onChange={(e) => setEditTeamData({ ...editTeamData, team_name: e.target.value })}
            margin="normal"
            required
          />
          <FormControl fullWidth margin="normal">
            <InputLabel>Team Status</InputLabel>
            <Select
              value={editTeamData.team_status}
              onChange={(e) => setEditTeamData({ ...editTeamData, team_status: e.target.value })}
              label="Team Status"
            >
              <MenuItem value="Active">Active</MenuItem>
              <MenuItem value="Inactive">Inactive</MenuItem>
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditTeamDialogOpen(false)}>Cancel</Button>
          <Button 
            onClick={handleSaveTeamEdit} 
            variant="contained"
            disabled={!editTeamData.team_name.trim()}
          >
            Save Changes
          </Button>
        </DialogActions>
      </Dialog>

      {/* Create Team Dialog */}
      <Dialog open={createTeamDialogOpen} onClose={() => setCreateTeamDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Create New Team</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="Team Name"
            value={newTeamData.team_name}
            onChange={(e) => setNewTeamData({ ...newTeamData, team_name: e.target.value })}
            margin="normal"
            required
            autoFocus
            placeholder="Team 1"
          />
          <FormControl fullWidth margin="normal">
            <InputLabel>Team Status</InputLabel>
            <Select
              value={newTeamData.team_status}
              onChange={(e) => setNewTeamData({ ...newTeamData, team_status: e.target.value })}
              label="Team Status"
            >
              <MenuItem value="Active">Active</MenuItem>
              <MenuItem value="Inactive">Inactive</MenuItem>
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateTeamDialogOpen(false)}>Cancel</Button>
          <Button 
            onClick={handleCreateTeam} 
            variant="contained"
            disabled={!newTeamData.team_name.trim()}
          >
            Create Team
          </Button>
        </DialogActions>
      </Dialog>

      {/* Manage Team Students Dialog */}
      <Dialog open={manageStudentsDialogOpen} onClose={() => setManageStudentsDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          Manage Students in {selectedTeam?.team_name}
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
                          onClick={() => handleRemoveStudentFromTeam(student._id)}
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
                          onClick={() => handleAddStudentToTeam(student._id)}
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
          <Button onClick={() => setManageStudentsDialogOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
                        <IconButton
                          size="small"
                          color="primary"
                          onClick={() => handleViewTeams(course)}
                          title="Manage Teams"
                        >
                          <GroupIcon />
                        </IconButton>
                        <IconButton
                          size="small"
                          color="success"
                          onClick={() => handleSendInvitations(course._id || course.id)}
                          title="Send Evaluations"
                          disabled={sendingEvaluations[course._id || course.id]}
                        >
                          {sendingEvaluations[course._id || course.id] ? <CircularProgress size={20} /> : <SendIcon />}
                        </IconButton>
                        <IconButton
                          size="small"
                          color="secondary"
                          onClick={() => handleViewEvaluationStatus(course)}
                          title="Evaluation Status"
                        >
                          <BarChartIcon />
                        </IconButton>
                        <IconButton
                          size="small"
                          color="primary"
                          onClick={() => navigate(`/reports?course=${course._id || course.id}`)}
                          title="View Reports"
                        >
                          <DescriptionIcon />
                        </IconButton>
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => {
                            setCourseToDelete(course);
                            setDeleteDialogOpen(true);
                          }}
                          title="Delete Course"
                        >
                          <DeleteIcon />
                        </IconButton>
                        <IconButton
                          size="small"
                          color="primary"
                          onClick={() => handleEditClick(course)}
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

      {/* Create Course Dialog */}
      <Dialog open={createDialogOpen} onClose={() => setCreateDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Create New Course</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mt: 1 }}>
            <TextField
              fullWidth
              variant="outlined"
              label="Course Name"
              value={newCourse.course_name}
              onChange={(e) => setNewCourse({ ...newCourse, course_name: e.target.value })}
              placeholder="Software Engineering"
              autoFocus
              margin="normal"
            />
            <TextField
              fullWidth
              variant="outlined"
              label="Course Number"
              value={newCourse.course_number}
              onChange={(e) => setNewCourse({ ...newCourse, course_number: e.target.value })}
              placeholder="CS 4850"
              margin="normal"
            />
            <TextField
              fullWidth
              variant="outlined"
              label="Course Section"
              value={newCourse.course_section}
              onChange={(e) => setNewCourse({ ...newCourse, course_section: e.target.value })}
              placeholder="01"
              margin="normal"
            />
            <TextField
              fullWidth
              variant="outlined"
              label="Semester"
              value={newCourse.semester}
              onChange={(e) => setNewCourse({ ...newCourse, semester: e.target.value })}
              placeholder="Fall 2025"
              margin="normal"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
          <Button 
            onClick={handleCreateCourse} 
            variant="contained"
            disabled={!newCourse.course_name || !newCourse.course_number || !newCourse.course_section || !newCourse.semester}
          >
            Create
          </Button>
        </DialogActions>
      </Dialog>

  {/* Upload Roster Dialog */}
  <Dialog open={uploadDialogOpen} onClose={() => setUploadDialogOpen(false)} maxWidth="sm" fullWidth>
    <DialogTitle>Upload Roster</DialogTitle>
    <DialogContent>
      <Box sx={{ mb: 2 }}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Upload a CSV file with the following columns:
        </Typography>
        <Box sx={{ mt: 1, pl: 2 }}>
          <span style={{ fontWeight: 'bold', color: 'red', fontSize: '1.1em' }}>student_id,name,email,team_name</span>
        </Box>
      </Box>
      {/* ...existing upload controls and content... */}
    </DialogContent>
  </Dialog>

      {/* Edit Course Dialog */}
  <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Edit Course</DialogTitle>
        <DialogContent>
          <Grid container columns={12} columnSpacing={2} sx={{ mt: 1 }}>
            <Grid sx={{ width: '100%' }}>
              <TextField
                fullWidth
                variant="outlined"
                label="Course Name"
                value={editCourse.course_name}
                onChange={(e) => setEditCourse({ ...editCourse, course_name: e.target.value })}
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
                value={editCourse.course_number}
                onChange={(e) => setEditCourse({ ...editCourse, course_number: e.target.value })}
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
                value={editCourse.course_section}
                onChange={(e) => setEditCourse({ ...editCourse, course_section: e.target.value })}
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
                value={editCourse.semester}
                onChange={(e) => setEditCourse({ ...editCourse, semester: e.target.value })}
                placeholder="Fall 2025"
                autoComplete="off"
                margin="normal"
              />
            </Grid>
            <Grid sx={{ width: '100%' }}>
              <FormControl fullWidth margin="normal">
                <InputLabel>Course Status</InputLabel>
                <Select
                  value={editCourse.course_status}
                  label="Course Status"
                  onChange={(e) => setEditCourse({ ...editCourse, course_status: e.target.value })}
                >
                  <MenuItem value="Active">Active</MenuItem>
                  <MenuItem value="Inactive">Inactive</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialogOpen(false)}>Cancel</Button>
          <Button 
            onClick={handleEditCourse} 
            variant="contained"
            disabled={!editCourse.course_name || !editCourse.course_number || !editCourse.course_section || !editCourse.semester}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>
      {/* Delete Course Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Delete Course</DialogTitle>
        <DialogContent>
          <Typography>Are you sure you want to delete this course?</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleDeleteCourse} color="error" variant="contained">Delete</Button>
        </DialogActions>
      </Dialog>
      <Dialog open={uploadDialogOpen} onClose={() => setUploadDialogOpen(false)} maxWidth="sm" fullWidth>
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
                onChange={(e) => setUploadFile(e.target.files[0])}
              />
            </Button>
            {uploadFile && (
              <Typography variant="body2" sx={{ mt: 1 }}>
                Selected: {uploadFile.name}
              </Typography>
            )}
            {uploadProgress > 0 && (
              <LinearProgress variant="determinate" value={uploadProgress} sx={{ mt: 2 }} />
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => {
            setUploadDialogOpen(false);
            setUploadFile(null);
            setUploadProgress(0);
          }}>
            Cancel
          </Button>
          <Button 
            onClick={handleUploadRoster} 
            variant="contained"
            disabled={!uploadFile || uploadProgress > 0}
          >
            Upload
          </Button>
        </DialogActions>
      </Dialog>

      {/* Evaluation Status Dialog */}
      <Dialog 
        open={evaluationStatusOpen} 
        onClose={() => setEvaluationStatusOpen(false)} 
        maxWidth="lg" 
        fullWidth
      >
        <DialogTitle>
          Evaluation Status - {selectedCourseForEval?.course_number || selectedCourseForEval?.course_code} {selectedCourseForEval?.course_section || ''} - {selectedCourseForEval?.course_name}
        </DialogTitle>
        <DialogContent>
          {evaluationStatusLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
              <LinearProgress sx={{ width: '100%' }} />
            </Box>
          ) : evaluationStatus ? (
            <Box>
              {/* Check if evaluations have been sent */}
              {!evaluationStatus.evaluations_sent ? (
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
                    startIcon={sendingEvaluations[selectedCourseForEval._id || selectedCourseForEval.id] ? <CircularProgress size={20} color="inherit" /> : <SendIcon />}
                    onClick={() => {
                      handleSendInvitations(selectedCourseForEval._id || selectedCourseForEval.id);
                    }}
                    size="large"
                    disabled={sendingEvaluations[selectedCourseForEval._id || selectedCourseForEval.id]}
                  >
                    {sendingEvaluations[selectedCourseForEval._id || selectedCourseForEval.id] ? 'Sending Evaluations...' : 'Send Evaluations Now'}
                  </Button>
                </Alert>
              ) : (
                <>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                    <Typography variant="h6">
                      Progress: {evaluationStatus.completed_count}/{evaluationStatus.total_count} evaluations completed
                    </Typography>
                    <Button
                      variant="contained"
                      color="primary"
                      startIcon={<SendIcon />}
                      onClick={() => handleSendReminders(selectedCourseForEval._id || selectedCourseForEval.id)}
                      disabled={evaluationStatus.completed_count === evaluationStatus.total_count}
                    >
                      Send Reminders
                    </Button>
                  </Box>
                  
                  <LinearProgress 
                    variant="determinate" 
                    value={evaluationStatus.total_count > 0 ? (evaluationStatus.completed_count / evaluationStatus.total_count) * 100 : 0}
                    sx={{ height: 10, borderRadius: 5, mb: 3 }}
                  />
                  
                  {/* Team-based view */}
                  {(() => {
                    // Group students by team
                    const teamGroups = evaluationStatus.students?.reduce((acc, student) => {
                      const teamName = student.team || 'No Team';
                      if (!acc[teamName]) {
                        acc[teamName] = [];
                      }
                      acc[teamName].push(student);
                      return acc;
                    }, {}) || {};

                    const sortedTeams = Object.entries(teamGroups).sort(([a], [b]) => {
                      // Sort teams by name, with "No Team" last
                      if (a === 'No Team') return 1;
                      if (b === 'No Team') return -1;
                      
                      // Handle team names with numbers (e.g., "Team 1", "Team 10", "Team 2")
                      const aMatch = a.match(/^(.+?)(\d+)(.*)$/);
                      const bMatch = b.match(/^(.+?)(\d+)(.*)$/);
                      
                      if (aMatch && bMatch) {
                        // Both have numbers - compare prefix first
                        const prefixCompare = aMatch[1].localeCompare(bMatch[1]);
                        if (prefixCompare !== 0) return prefixCompare;
                        
                        // Same prefix - compare numbers numerically
                        const numA = parseInt(aMatch[2]);
                        const numB = parseInt(bMatch[2]);
                        if (numA !== numB) return numA - numB;
                        
                        // Same number - compare suffix
                        return aMatch[3].localeCompare(bMatch[3]);
                      }
                      
                      // Fallback to regular string comparison
                      return a.localeCompare(b);
                    });

                    return (
                      <Grid container spacing={2}>
                        {sortedTeams.map(([teamName, teamStudents]) => {
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
                    );
                  })()}
                </>
              )}
            </Box>
          ) : (
            <Alert severity="info">No evaluation data available for this course.</Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button 
            onClick={() => handleResetEvaluationState(selectedCourseForEval._id || selectedCourseForEval.id)}
            color="warning"
            disabled={resettingEvaluations}
            startIcon={resettingEvaluations ? <CircularProgress size={16} /> : <ClearIcon />}
          >
            {resettingEvaluations ? 'Resetting...' : 'Reset Evaluation State'}
          </Button>
          <Button onClick={() => setEvaluationStatusOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Test Evaluation Dialog */}
      <Dialog 
        open={testEvaluationOpen} 
        onClose={() => setTestEvaluationOpen(false)} 
        maxWidth="md" 
        fullWidth
      >
        <DialogTitle>
          Test Evaluation Form - {testEvaluationData?.course?.course_number || testEvaluationData?.course?.course_code} {testEvaluationData?.course?.course_section || ''} - {testEvaluationData?.course?.course_name}
        </DialogTitle>
        <DialogContent>
          {testEvaluationLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
              <LinearProgress sx={{ width: '100%' }} />
            </Box>
          ) : testEvaluationData ? (
            <Box>
              {!testEvaluationData.evaluations_sent ? (
                <Alert severity="info" sx={{ textAlign: 'center', py: 4 }}>
                  <Typography variant="h6" gutterBottom>
                    Evaluations Have Not Been Sent
                  </Typography>
                  <Typography variant="body1">
                    You must send evaluations to students before you can test the evaluation form.
                    Use the "Send Evaluations" button in the course management interface.
                  </Typography>
                </Alert>
              ) : (
                <>
                  <Alert severity="info" sx={{ mb: 2 }}>
                    This allows you to test the student evaluation form using real student data from your course.
                  </Alert>
                  
                  <Typography variant="h6" gutterBottom>
                    Test Student: {testEvaluationData.student.name} ({testEvaluationData.student.student_id})
                  </Typography>
                  
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Email: {testEvaluationData.student.email}
                  </Typography>
                  
                  <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
                    <Button
                      variant="contained"
                      color="primary"
                      onClick={() => window.open(testEvaluationData.evaluationUrl, '_blank')}
                      startIcon={<BarChartIcon />}
                    >
                      Open Evaluation Form
                    </Button>
                    
                    <Button
                      variant="outlined"
                      onClick={() => {
                        navigator.clipboard.writeText(testEvaluationData.evaluationUrl);
                        setAlert({ severity: 'success', message: 'Evaluation URL copied to clipboard' });
                      }}
                    >
                      Copy URL
                    </Button>
                  </Box>
                  
                  <Typography variant="body2" sx={{ mb: 1 }}>
                    <strong>Evaluation URL:</strong>
                  </Typography>
                  <TextField
                    fullWidth
                    value={testEvaluationData.evaluationUrl}
                    InputProps={{
                      readOnly: true,
                    }}
                    size="small"
                    sx={{ mb: 2 }}
                  />
                  
                  {testEvaluationData.allStudents.length > 1 && (
                    <Box>
                      <Typography variant="body2" sx={{ mb: 1 }}>
                        <strong>Other students in course:</strong>
                      </Typography>
                      <Box sx={{ maxHeight: 200, overflow: 'auto' }}>
                        {testEvaluationData.allStudents.slice(1).map((student) => (
                          <Box key={student.student_id} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 1, borderBottom: '1px solid #eee' }}>
                            <Typography variant="body2">
                              {student.name} ({student.student_id})
                            </Typography>
                            <Button
                              size="small"
                              onClick={() => {
                                window.open(`${window.location.origin}/evaluate/${student.evaluation_token}`, '_blank');
                              }}
                            >
                              Test
                            </Button>
                          </Box>
                        ))}
                      </Box>
                    </Box>
                  )}
                </>
              )}
            </Box>
          ) : (
            <Alert severity="warning">No evaluation data available for testing.</Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTestEvaluationOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}

export default CourseManagement;