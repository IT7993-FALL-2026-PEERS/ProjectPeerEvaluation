// ...existing code...

// ...existing code...
import React, { useState, useRef } from 'react';

// Test comment for GitHub upload - Preston

import {
  Paper,
  Typography,
  Button,
  Alert,
  Box
} from '@mui/material';

import AddIcon from '@mui/icons-material/Add';
import EmojiObjectsIcon from '@mui/icons-material/EmojiObjects';
// Remove AssessmentIcon import if present
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { getApiBaseUrl } from '../services/apiUrl';
import { describeEmailResult } from '../services/emailResult';
import { getErrorMessage } from '../services/apiError';
import { buildCreateTeamBody } from '../services/teamRequest';
import useCourses from '../hooks/useCourses';
import useStudents from '../hooks/useStudents';
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
import CourseSearchFilters from '../components/CourseSearchFilters';
import CourseTable from '../components/CourseTable';
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

// ...existing code...


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

  // Team search state
  const [teamSearch, setTeamSearch] = useState({
    team_name: '',
    team_status: ''
  });
  const [showTeamSearch, setShowTeamSearch] = useState(false);

  // The lists shown in the dialogs are worked out from the full list and the search fields, so they
  // can never be out of date: change `students`, `teams` or a search field and they follow. (They used
  // to be separate state set by hand, which showed the old list after a refresh.)

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
  // Which opening of the upload dialog an upload belongs to. Closing the dialog starts a new one, so an
  // upload still in flight (the server still gets it) cannot touch the next dialog's file or progress.
  const uploadSession = useRef(0);
  const [alert, setAlert] = useState(null);

  const {
    courses, loading, searchFilters, setSearchFilters, showSearchFilters, toggleSearchFilters,
    sortConfig, sortBy, fetchCoursesWithCounts, handleSearch, handleClearSearch,
  } = useCourses({ onError: setAlert });
  const {
    students, setStudents, openStudents,
    studentsDialog, addStudentDialog, editStudentDialog, csvUploadDialog, deleteAllStudentsDialog,
  } = useStudents({
    setAlert,
    refreshCourses: fetchCoursesWithCounts,
    // Delete all students also removes the course's teams, so the team dialogs forget them too.
    onAllStudentsDeleted: () => {
      setTeams([]);
      setTeamSearch({ team_name: '', team_status: '' });
      setShowTeamSearch(false);
    },
  });

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

  const closeUploadDialog = () => {
    uploadSession.current += 1;
    setUploadDialogOpen(false);
    setUploadFile(null);
    setUploadProgress(0);
  };

  const handleUploadRoster = async () => {
    if (!uploadFile || !selectedCourse || !(selectedCourse.id || selectedCourse._id)) {
      setAlert({ severity: 'error', message: 'No course selected.' });
      return;
    }

    const courseId = selectedCourse.id || selectedCourse._id;
    const session = uploadSession.current;
    const stillOpen = () => session === uploadSession.current;
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
            if (stillOpen()) setUploadProgress(progress);
          }
        }
      );
      setAlert({ 
        severity: 'success', 
        message: `${response.data.students.length} students added successfully` 
      });
      if (stillOpen()) closeUploadDialog();
  fetchCoursesWithCounts();
    } catch (error) {
      setAlert({ severity: 'error', message: getErrorMessage(error, 'Failed to upload roster') });
      if (stillOpen()) setUploadProgress(0);
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
      <AddStudentDialog {...addStudentDialog} />
      <EditStudentDialog {...editStudentDialog} />
      <CsvUploadDialog {...csvUploadDialog} />
      <DeleteAllStudentsDialog {...deleteAllStudentsDialog} />
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
      <StudentsDialog {...studentsDialog} />
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
        onClose={closeUploadDialog}
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
      
      <CourseSearchFilters
        filters={searchFilters}
        show={showSearchFilters}
        onToggle={toggleSearchFilters}
        onChange={setSearchFilters}
        onSearch={handleSearch}
        onClear={handleClearSearch}
      />

      {alert && (
        <Alert severity={alert.severity} className={styles.alert} onClose={() => setAlert(null)}>
          {alert.message}
        </Alert>
      )}
      <CourseTable
        courses={courses}
        loading={loading}
        sortConfig={sortConfig}
        sendingIds={sendingEvaluations}
        onSort={sortBy}
        onUploadRoster={(course) => { setSelectedCourse(course); setUploadDialogOpen(true); }}
        onManageStudents={openStudents}
        onManageTeams={handleViewTeams}
        onSendEvaluations={(course) => handleSendInvitations(course._id || course.id)}
        onEvaluationStatus={handleViewEvaluationStatus}
        onViewReports={(course) => navigate(`/reports?course=${course._id || course.id}`)}
        onDelete={(course) => { setCourseToDelete(course); setDeleteDialogOpen(true); }}
        onEdit={handleEditClick}
      />

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