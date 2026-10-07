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
import { getErrorMessage } from '../services/apiError';
import useCourses from '../hooks/useCourses';
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

// ...existing code...


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
    onAllStudentsDeleted: () => clearTeamsState(),
  });
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
        onManageTeams={openTeams}
        onSendEvaluations={(course) => sendInvitations(course._id || course.id)}
        onEvaluationStatus={viewStatus}
        onViewReports={(course) => navigate(`/reports?course=${course._id || course.id}`)}
        onDelete={(course) => { setCourseToDelete(course); setDeleteDialogOpen(true); }}
        onEdit={handleEditClick}
      />

      <EvaluationStatusDialog {...evaluationStatusDialog} />
    </div>
  );
}

export default CourseManagement;