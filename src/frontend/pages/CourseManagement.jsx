// ...existing code...

// ...existing code...
import React, { useState } from 'react';

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
import useCourses from '../hooks/useCourses';
import useCourseDialogs from '../hooks/useCourseDialogs';
import useEvaluations from '../hooks/useEvaluations';
import useStudents from '../hooks/useStudents';
import useTeams from '../hooks/useTeams';
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
  const navigate = useNavigate();
  const { logout } = useAuth();
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
    onAllStudentsDeleted: () => clearTeamsState(),
  });
  const {
    openCreate, startEdit, startDelete, startRosterUpload,
    createCourseDialog, editCourseDialog, deleteCourseDialog, rosterUploadDialog,
  } = useCourseDialogs({ setAlert, refreshCourses: fetchCoursesWithCounts });
  const {
    sendingEvaluations, sendInvitations, viewStatus, resetEvaluationState, evaluationStatusDialog,
  } = useEvaluations({ setAlert });
  const {
    openTeams, clearTeamsState,
    teamsDialog, editTeamDialog, createTeamDialog, teamStudentsDialog, evaluationResetDialog,
  } = useTeams({
    setAlert,
    refreshCourses: fetchCoursesWithCounts,
    students,
    setStudents,
    resetEvaluationState,
  });

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
      <EvaluationResetDialog {...evaluationResetDialog} />
      <AddStudentDialog {...addStudentDialog} />
      <EditStudentDialog {...editStudentDialog} />
      <CsvUploadDialog {...csvUploadDialog} />
      <DeleteAllStudentsDialog {...deleteAllStudentsDialog} />
      <TeamsDialog {...teamsDialog} />
      <EditTeamDialog {...editTeamDialog} />
      <CreateTeamDialog {...createTeamDialog} />
      <StudentsDialog {...studentsDialog} />
      <CreateCourseDialog {...createCourseDialog} />
      <EditCourseDialog {...editCourseDialog} />
      <DeleteCourseDialog {...deleteCourseDialog} />
      <CourseRosterUploadDialog {...rosterUploadDialog} />
      <TeamStudentsDialog {...teamStudentsDialog} />
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
          onClick={openCreate}
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
        onUploadRoster={startRosterUpload}
        onManageStudents={openStudents}
        onManageTeams={openTeams}
        onSendEvaluations={(course) => sendInvitations(course._id || course.id)}
        onEvaluationStatus={viewStatus}
        onViewReports={(course) => navigate(`/reports?course=${course._id || course.id}`)}
        onDelete={startDelete}
        onEdit={startEdit}
      />

      <EvaluationStatusDialog {...evaluationStatusDialog} />
    </div>
  );
}

export default CourseManagement;