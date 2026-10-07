import { useState, useRef } from 'react';
import api from '../services/api';
import { getErrorMessage } from '../services/apiError';

const EMPTY_NEW_COURSE = { course_name: '', course_number: '', course_section: '', semester: '' };
const EMPTY_EDIT_COURSE = { course_name: '', course_number: '', course_section: '', semester: '', course_status: 'Active' };

// The four course dialogs (create, edit, delete, and the roster upload from a course row), moved out
// of CourseManagement.js (CICD-57, step 6b-5). The page keeps the alert and the course list and
// passes in:
//   setAlert        shows a message on the page
//   refreshCourses  reloads the course list
// The hook returns the props each dialog takes (createCourseDialog, ...), and what the page needs to
// open them: openCreate() for the Create Course button, and startEdit(course), startDelete(course)
// and startRosterUpload(course) for the buttons on a course row.
export default function useCourseDialogs({ setAlert, refreshCourses }) {
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [courseToEdit, setCourseToEdit] = useState(null);
  const [editCourse, setEditCourse] = useState({ ...EMPTY_EDIT_COURSE });

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
      refreshCourses();
    } catch (error) {
      setAlert({ severity: 'error', message: 'Failed to update course' });
    }
  };

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
      refreshCourses();
    } catch (error) {
      setAlert({ severity: 'error', message: 'Failed to delete course' });
    }
  };
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [newCourse, setNewCourse] = useState({ ...EMPTY_NEW_COURSE });
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  // Which opening of the upload dialog an upload belongs to. Closing the dialog starts a new one, so an
  // upload still in flight (the server still gets it) cannot touch the next dialog's file or progress.
  const uploadSession = useRef(0);

  const handleCreateCourse = async () => {
    try {
      console.log('Creating course with data:', newCourse);
      const response = await api.post('/courses', newCourse);
      console.log('Course creation successful:', response);
      setAlert({ severity: 'success', message: 'Course created successfully' });
      setCreateDialogOpen(false);
      refreshCourses();
      setNewCourse({ ...EMPTY_NEW_COURSE });
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
      refreshCourses();
    } catch (error) {
      setAlert({ severity: 'error', message: getErrorMessage(error, 'Failed to upload roster') });
      if (stillOpen()) setUploadProgress(0);
    }
  };

  return {
    openCreate: () => setCreateDialogOpen(true),
    startEdit: handleEditClick,
    startDelete: (course) => { setCourseToDelete(course); setDeleteDialogOpen(true); },
    startRosterUpload: (course) => { setSelectedCourse(course); setUploadDialogOpen(true); },
    createCourseDialog: {
      open: createDialogOpen,
      form: newCourse,
      onFormChange: setNewCourse,
      onClose: () => setCreateDialogOpen(false),
      onCreate: handleCreateCourse,
    },
    editCourseDialog: {
      open: editDialogOpen,
      form: editCourse,
      onFormChange: setEditCourse,
      onClose: () => setEditDialogOpen(false),
      onSave: handleEditCourse,
    },
    deleteCourseDialog: {
      open: deleteDialogOpen,
      onClose: () => setDeleteDialogOpen(false),
      onConfirm: handleDeleteCourse,
    },
    rosterUploadDialog: {
      open: uploadDialogOpen,
      file: uploadFile,
      progress: uploadProgress,
      onFileChange: setUploadFile,
      onClose: closeUploadDialog,
      onUpload: handleUploadRoster,
    },
  };
}
