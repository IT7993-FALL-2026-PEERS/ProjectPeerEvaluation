import { useState } from 'react';
import api from '../services/api';
import { describeEmailResult } from '../services/emailResult';
import { getErrorMessage } from '../services/apiError';
import { buildCreateTeamBody } from '../services/teamRequest';

const EMPTY_TEAM_SEARCH = { team_name: '', team_status: '' };
const EMPTY_TEAM_FORM = { team_name: '', team_status: 'Active' };

// The Manage Teams dialog and the dialogs that open from it (edit and create a team, a team's
// students, the "evaluations were already sent" question), plus sending to one team, moved out of
// CourseManagement.js (CICD-57, step 6b-3). The page keeps the alert, the course list, the students
// and the evaluation reset, and passes in:
//   setAlert               shows a message on the page
//   refreshCourses         reloads the course list, so its team counts follow
//   students, setStudents  the students list (a renamed team shows in it, so it is reloaded)
//   resetEvaluationState   clears the sent evaluations of a course (called after the professor agrees)
// The hook returns the props each dialog takes (teamsDialog, editTeamDialog, ...), openTeams(course)
// for the course row, and clearTeamsState() for the page to call after "delete all students".
export default function useTeams({ setAlert, refreshCourses, students, setStudents, resetEvaluationState }) {
  // --- Team evaluation send state/handler ---
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
      refreshCourses();
    } catch (error) {
      setAlert({ severity: 'error', message: error.userMessage || getErrorMessage(error, `Failed to send evaluations to team "${team.team_name}".`) });
    } finally {
      setSendingTeamEvaluations((prev) => ({ ...prev, [teamId]: false }));
    }
  };

  // State for showing evaluation reset confirmation dialog
  const [showEvalResetDialog, setShowEvalResetDialog] = useState(false);
  const [pendingEvalResetCourseId, setPendingEvalResetCourseId] = useState(null);
  const [pendingTeamAction, setPendingTeamAction] = useState(null); // { type: 'add'|'remove', studentId }

  // Teams dialog state
  const [teamsDialogOpen, setTeamsDialogOpen] = useState(false);
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [teams, setTeams] = useState([]);
  const [teamsCourse, setTeamsCourse] = useState(null);

  // Edit team dialog state
  const [editTeamDialogOpen, setEditTeamDialogOpen] = useState(false);
  const [teamToEdit, setTeamToEdit] = useState(null);
  const [editTeamData, setEditTeamData] = useState({ ...EMPTY_TEAM_FORM });

  // Create team dialog state
  const [createTeamDialogOpen, setCreateTeamDialogOpen] = useState(false);
  const [newTeamData, setNewTeamData] = useState({ ...EMPTY_TEAM_FORM });

  // Manage team students dialog state
  const [manageStudentsDialogOpen, setManageStudentsDialogOpen] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [teamStudents, setTeamStudents] = useState([]);
  const [availableStudents, setAvailableStudents] = useState([]);

  // Team search state
  const [teamSearch, setTeamSearch] = useState({ ...EMPTY_TEAM_SEARCH });
  const [showTeamSearch, setShowTeamSearch] = useState(false);

  // Clear team search
  const clearTeamSearch = () => {
    setTeamSearch({ ...EMPTY_TEAM_SEARCH });
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
    setTeamSearch({ ...EMPTY_TEAM_SEARCH });
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
      refreshCourses(); // Refresh the course list to update team count
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
      refreshCourses();
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
      setEditTeamData({ ...EMPTY_TEAM_FORM });

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
      setNewTeamData({ ...EMPTY_TEAM_FORM });

      // Refresh course counts
      refreshCourses();

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
    await resetEvaluationState(pendingEvalResetCourseId);
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

  // Delete all students removes the course's teams too, so the page calls this to forget them here.
  const clearTeamsState = () => {
    setTeams([]);
    setTeamSearch({ ...EMPTY_TEAM_SEARCH });
    setShowTeamSearch(false);
  };

  return {
    openTeams: handleViewTeams,
    clearTeamsState,
    teamsDialog: {
      open: teamsDialogOpen,
      course: teamsCourse,
      teams,
      loading: teamsLoading,
      search: teamSearch,
      showSearch: showTeamSearch,
      sendingTeamIds: sendingTeamEvaluations,
      onToggleSearch: () => setShowTeamSearch(!showTeamSearch),
      onSearchChange: handleTeamSearchChange,
      onClearSearch: clearTeamSearch,
      onCreate: () => setCreateTeamDialogOpen(true),
      onManageStudents: handleManageTeamStudents,
      onSend: handleSendTeamEvaluations,
      onEdit: handleEditTeam,
      onDelete: (team) => handleDeleteTeam(team._id || team.id, team.team_name),
      onClearAll: handleClearAllTeams,
      onClose: () => { setTeamsDialogOpen(false); refreshCourses(); },
    },
    editTeamDialog: {
      open: editTeamDialogOpen,
      form: editTeamData,
      onFormChange: setEditTeamData,
      onClose: () => setEditTeamDialogOpen(false),
      onSave: handleSaveTeamEdit,
    },
    createTeamDialog: {
      open: createTeamDialogOpen,
      form: newTeamData,
      onFormChange: setNewTeamData,
      onClose: () => setCreateTeamDialogOpen(false),
      onCreate: handleCreateTeam,
    },
    teamStudentsDialog: {
      open: manageStudentsDialogOpen,
      team: selectedTeam,
      teamStudents,
      availableStudents,
      onAdd: handleAddStudentToTeam,
      onRemove: handleRemoveStudentFromTeam,
      onClose: () => setManageStudentsDialogOpen(false),
    },
    evaluationResetDialog: {
      open: showEvalResetDialog,
      onCancel: handleCancelEvalReset,
      onConfirm: handleConfirmEvalReset,
    },
  };
}
