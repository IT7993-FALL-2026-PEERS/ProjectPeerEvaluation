// ...existing code...

// ...existing code...
import React, { useState, useEffect, useCallback } from 'react';

// Test comment for GitHub upload - Preston

import {
  Paper,
  Typography,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
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
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import FilterListIcon from '@mui/icons-material/FilterList';
import BarChartIcon from '@mui/icons-material/BarChart';
import DescriptionIcon from '@mui/icons-material/Description';
import { useNavigate } from 'react-router-dom';
import api, { getCourseById } from '../services/api';
import { getApiBaseUrl } from '../services/apiUrl';
import { describeEmailResult } from '../services/emailResult';
import { isCsvFile } from '../services/csvFile';
import { getErrorMessage } from '../services/apiError';
import { buildCreateTeamBody } from '../services/teamRequest';
import { useAuth } from '../contexts/AuthContext';
import AddStudentDialog from '../components/AddStudentDialog';
import EditStudentDialog from '../components/EditStudentDialog';
import CsvUploadDialog from '../components/CsvUploadDialog';
import DeleteAllStudentsDialog from '../components/DeleteAllStudentsDialog';
import EvaluationResetDialog from '../components/EvaluationResetDialog';
import EvaluationStatusDialog from '../components/EvaluationStatusDialog';
import TeamsDialog from '../components/TeamsDialog';
import { EditTeamDialog, CreateTeamDialog } from '../components/TeamFormDialogs';
import TeamStudentsDialog from '../components/TeamStudentsDialog';
import StudentsDialog from '../components/StudentsDialog';
import { CreateCourseDialog, EditCourseDialog } from '../components/CourseFormDialogs';
import DeleteCourseDialog from '../components/DeleteCourseDialog';
import CourseRosterUploadDialog from '../components/CourseRosterUploadDialog';
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
      const response = await api.post(`/courses/${teamsCourse._id || teamsCourse.id}/teams/${teamId}/evaluations/send`, {});
      setAlert(describeEmailResult(
        { sent: response.data.emails_sent, total: response.data.total_students, failed: response.data.failed },
        `Evaluation invitations sent to team "${team.team_name}".`
      ));
      fetchCoursesWithCounts();
    } catch (error) {
      setAlert({ severity: 'error', message: error.userMessage || getErrorMessage(error, `Failed to send evaluations to team "${team.team_name}".`) });
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
      
      // Reset form
      setCsvFile(null);
      
    } catch (error) {
      const errorMessage = getErrorMessage(error, 'Failed to upload CSV file');
      setCsvUploadError(errorMessage);
      setAlert({ severity: 'error', message: errorMessage });
    } finally {
      setCsvUploading(false);
    }
  };

  const handleCsvFileChange = (event) => {
    const file = event.target.files[0];
    if (isCsvFile(file)) {
      setCsvFile(file);
      setCsvUploadError('');
    } else {
      setCsvUploadError('Please choose a file whose name ends in .csv');
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
      setTeams([]);
      
      // Clear search filters
      setStudentSearch({ student_id: '', name: '', email: '', team: '' });
      setTeamSearch({ team_name: '', team_status: '' });
      setShowStudentSearch(false);
      setShowTeamSearch(false);
      
      // Close the delete confirmation dialog
      setDeleteAllStudentsOpen(false);
      
      // Refresh the main courses list to update counts
      await fetchCoursesWithCounts();
      
    } catch (error) {
      const errorMessage = getErrorMessage(error, 'Failed to delete all students');
      setAlert({ severity: 'error', message: errorMessage });
    } finally {
      setDeleteAllStudentsLoading(false);
    }
  };
// ...existing code...

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
  const [showStudentSearch, setShowStudentSearch] = useState(false);

  // Team search state
  const [teamSearch, setTeamSearch] = useState({
    team_name: '',
    team_status: ''
  });
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
    } catch (error) {
      setStudents([]);
    } finally {
      setStudentsLoading(false);
    }
  };

  // The lists shown in the dialogs are worked out from the full list and the search fields, so they
  // can never be out of date: change `students`, `teams` or a search field and they follow. (They used
  // to be separate state set by hand, which showed the old list after a refresh.)


  // Clear student search
  const clearStudentSearch = () => {
    setStudentSearch({ student_id: '', name: '', email: '', team: '' });
    setShowStudentSearch(false); // Hide search after clearing
  };

  // Handle search input changes (the list is filtered as the user types)
  const handleStudentSearchChange = (field, value) => {
    setStudentSearch(previous => ({ ...previous, [field]: value }));
  };

  // Clear team search
  const clearTeamSearch = () => {
    setTeamSearch({ team_name: '', team_status: '' });
    setShowTeamSearch(false); // Hide search after clearing
  };

  // Handle team search input changes
  const handleTeamSearchChange = (field, value) => {
    setTeamSearch(previous => ({ ...previous, [field]: value }));
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
    } catch (error) {
      setTeams([]);
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
      fetchCoursesWithCounts(); // Refresh the course list to update team count
    } catch (error) {
      console.error('Error clearing teams:', error);
      setAlert({ severity: 'error', message: 'Failed to clear teams' });
    }
  };

  // The team list from the server, or `fallback` when it cannot be fetched. The change that came
  // before has already succeeded, so a failed refresh must not be reported as a failed change.
  const fetchTeamsOr = async (fallback) => {
    try {
      const response = await api.get(`/courses/${teamsCourse._id}/teams`);
      return response.data;
    } catch (error) {
      console.error('Error refreshing teams:', error);
      return fallback;
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
      
      // Refresh from the server rather than editing the local list: two changes in flight at once
      // would otherwise each start from the same old list and bring back what the other removed. If
      // only the refresh fails the delete still happened, so fall back to the local list.
      const freshTeams = await fetchTeamsOr(teams.filter(team => team._id !== teamId));
      setTeams(freshTeams);
      
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
      
      // Refresh from the server, as for a delete, falling back to the local list if that fails.
      const freshTeams = await fetchTeamsOr(teams.map(team => (
        team._id === teamToEdit._id ? { ...team, ...editTeamData } : team
      )));
      setTeams(freshTeams);
      
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
      await api.post(`/courses/${teamsCourse._id}/teams`, buildCreateTeamBody(newTeamData));
      setAlert({ severity: 'success', message: `Team "${newTeamData.team_name}" created successfully` });
      
      // Refresh teams list
      const teamsResponse = await api.get(`/courses/${teamsCourse._id}/teams`);
      setTeams(teamsResponse.data);
      
      // Close the dialog and reset form
      setCreateTeamDialogOpen(false);
      setNewTeamData({ team_name: '', team_status: 'Active' });
      
      // Refresh course counts
      fetchCoursesWithCounts();
      
    } catch (error) {
      console.error('Error creating team:', error);
      setAlert({ severity: 'error', message: getErrorMessage(error, 'Failed to create team') });
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
      setAlert({ severity: 'error', message: getErrorMessage(error, 'Failed to upload roster') });
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
      setAlert(describeEmailResult(
        { sent: response.data.emails_sent, total: response.data.total_students, failed: response.data.failed },
        `✅ ${response.data.message} - Emails sent to ${response.data.emails_sent || 'all'} students`
      ));
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
      } else {
        errorMessage = getErrorMessage(error, error.message || errorMessage);
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
      setAlert(describeEmailResult(
        { sent: response.data.reminders_sent, total: response.data.total_reminded, failed: response.data.failed },
        response.data.message
      ));
      
      // Refresh evaluation status if dialog is open
      if (evaluationStatusOpen && (selectedCourseForEval?._id || selectedCourseForEval?.id) === courseId) {
        const statusResponse = await api.get(`/courses/${courseId}/evaluations/status`);
        setEvaluationStatus(statusResponse.data);
      }
    } catch (error) {
      setAlert({ severity: 'error', message: getErrorMessage(error, 'Failed to send reminders') });
    }
  };


  const handleLogout = () => {
    logout();
    navigate('/');
  };

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
      <EvaluationResetDialog
        open={showEvalResetDialog}
        onCancel={handleCancelEvalReset}
        onConfirm={handleConfirmEvalReset}
      />
      <AddStudentDialog
        open={addStudentOpen}
        form={studentForm}
        error={studentFormError}
        onFormChange={setStudentForm}
        onClose={() => { setAddStudentOpen(false); setStudentFormError(''); }}
        onSubmit={handleAddStudent}
      />
      <EditStudentDialog
        open={editStudentOpen}
        form={studentForm}
        onFormChange={setStudentForm}
        onClose={() => { setEditStudentOpen(false); setStudentToEdit(null); setStudentForm({ student_id: '', name: '', email: '', group_assignment: '' }); }}
        onSave={handleUpdateStudent}
      />
      <CsvUploadDialog
        open={csvUploadOpen}
        file={csvFile}
        uploading={csvUploading}
        error={csvUploadError}
        results={csvUploadResults}
        onFileChange={handleCsvFileChange}
        onUpload={handleCsvUpload}
        onClose={() => { setCsvUploadOpen(false); setCsvUploadError(''); setCsvUploadResults(null); }}
      />
      <DeleteAllStudentsDialog
        open={deleteAllStudentsOpen}
        studentCount={students.length}
        loading={deleteAllStudentsLoading}
        onClose={() => setDeleteAllStudentsOpen(false)}
        onConfirm={handleDeleteAllStudents}
        onMismatch={() => setAlert({ severity: 'error', message: 'Please type "DELETE ALL" to confirm' })}
      />
      <TeamsDialog
        open={teamsDialogOpen}
        course={teamsCourse}
        teams={teams}
        loading={teamsLoading}
        search={teamSearch}
        showSearch={showTeamSearch}
        sendingTeamIds={sendingTeamEvaluations}
        onToggleSearch={() => setShowTeamSearch(!showTeamSearch)}
        onSearchChange={handleTeamSearchChange}
        onClearSearch={clearTeamSearch}
        onCreate={() => setCreateTeamDialogOpen(true)}
        onManageStudents={handleManageTeamStudents}
        onSend={handleSendTeamEvaluations}
        onEdit={handleEditTeam}
        onDelete={(team) => handleDeleteTeam(team._id || team.id, team.team_name)}
        onClearAll={handleClearAllTeams}
        onClose={() => { setTeamsDialogOpen(false); fetchCoursesWithCounts(); }}
      />
      <EditTeamDialog
        open={editTeamDialogOpen}
        form={editTeamData}
        onFormChange={setEditTeamData}
        onClose={() => setEditTeamDialogOpen(false)}
        onSave={handleSaveTeamEdit}
      />
      <CreateTeamDialog
        open={createTeamDialogOpen}
        form={newTeamData}
        onFormChange={setNewTeamData}
        onClose={() => setCreateTeamDialogOpen(false)}
        onCreate={handleCreateTeam}
      />
      <StudentsDialog
        open={studentsDialogOpen}
        course={studentsCourse}
        students={students}
        loading={studentsLoading}
        search={studentSearch}
        showSearch={showStudentSearch}
        onToggleSearch={() => setShowStudentSearch(!showStudentSearch)}
        onSearchChange={handleStudentSearchChange}
        onClearSearch={clearStudentSearch}
        onUploadCsv={() => setCsvUploadOpen(true)}
        onAddStudent={() => setAddStudentOpen(true)}
        onEdit={handleEditStudent}
        onDelete={handleDeleteStudent}
        onDeleteAll={() => setDeleteAllStudentsOpen(true)}
        onClose={() => { setStudentsDialogOpen(false); fetchCoursesWithCounts(); }}
      />
      <CreateCourseDialog
        open={createDialogOpen}
        form={newCourse}
        onFormChange={setNewCourse}
        onClose={() => setCreateDialogOpen(false)}
        onCreate={handleCreateCourse}
      />
      <EditCourseDialog
        open={editDialogOpen}
        form={editCourse}
        onFormChange={setEditCourse}
        onClose={() => setEditDialogOpen(false)}
        onSave={handleEditCourse}
      />
      <DeleteCourseDialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        onConfirm={handleDeleteCourse}
      />
      <CourseRosterUploadDialog
        open={uploadDialogOpen}
        file={uploadFile}
        progress={uploadProgress}
        onFileChange={setUploadFile}
        onClose={() => setUploadDialogOpen(false)}
        onCancel={() => {
          setUploadDialogOpen(false);
          setUploadFile(null);
          setUploadProgress(0);
        }}
        onUpload={handleUploadRoster}
      />
      <TeamStudentsDialog
        open={manageStudentsDialogOpen}
        team={selectedTeam}
        teamStudents={teamStudents}
        availableStudents={availableStudents}
        onAdd={handleAddStudentToTeam}
        onRemove={handleRemoveStudentFromTeam}
        onClose={() => setManageStudentsDialogOpen(false)}
      />
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

      <EvaluationStatusDialog
        open={evaluationStatusOpen}
        course={selectedCourseForEval}
        status={evaluationStatus}
        loading={evaluationStatusLoading}
        sending={Boolean(selectedCourseForEval && sendingEvaluations[selectedCourseForEval._id || selectedCourseForEval.id])}
        resetting={resettingEvaluations}
        onSend={() => handleSendInvitations(selectedCourseForEval._id || selectedCourseForEval.id)}
        onRemind={() => handleSendReminders(selectedCourseForEval._id || selectedCourseForEval.id)}
        onReset={() => handleResetEvaluationState(selectedCourseForEval._id || selectedCourseForEval.id)}
        onClose={() => setEvaluationStatusOpen(false)}
      />
    </div>
  );
}

export default CourseManagement;