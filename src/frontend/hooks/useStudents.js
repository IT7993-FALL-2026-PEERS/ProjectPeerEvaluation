import { useState } from 'react';
import api from '../services/api';
import { isCsvFile } from '../services/csvFile';
import { getErrorMessage } from '../services/apiError';

const EMPTY_STUDENT_FORM = { student_id: '', name: '', email: '', group_assignment: '' };
const EMPTY_STUDENT_SEARCH = { student_id: '', name: '', email: '', team: '' };

// The Manage Students dialog and the four dialogs that open from it (add, edit, roster upload and
// delete all), moved out of CourseManagement.js (CICD-57, step 6b-2). The page keeps the alert, the
// course list and the teams, and passes in:
//   setAlert              shows a message on the page
//   refreshCourses        reloads the course list, so its student counts follow
//   onAllStudentsDeleted  called after "delete all", to clear what the teams dialogs still show
// The hook returns the props each dialog takes (studentsDialog, addStudentDialog, ...), plus
// openStudents(course) for the course row, and `students` with its setter for the team dialogs,
// which still refresh the list themselves.
export default function useStudents({ setAlert, refreshCourses, onAllStudentsDeleted }) {
  // State for add/edit student dialogs
  const [addStudentOpen, setAddStudentOpen] = useState(false);
  const [editStudentOpen, setEditStudentOpen] = useState(false);
  const [studentToEdit, setStudentToEdit] = useState(null);
  const [studentForm, setStudentForm] = useState({ ...EMPTY_STUDENT_FORM });
  const [studentFormError, setStudentFormError] = useState('');

  // State for CSV upload
  const [csvUploadOpen, setCsvUploadOpen] = useState(false);
  const [csvFile, setCsvFile] = useState(null);
  const [csvUploading, setCsvUploading] = useState(false);
  const [csvUploadError, setCsvUploadError] = useState('');
  const [csvUploadResults, setCsvUploadResults] = useState(null);

  // State for delete all students
  const [deleteAllStudentsOpen, setDeleteAllStudentsOpen] = useState(false);
  const [deleteAllStudentsLoading, setDeleteAllStudentsLoading] = useState(false);

  const [studentsDialogOpen, setStudentsDialogOpen] = useState(false);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [students, setStudents] = useState([]);
  const [studentsCourse, setStudentsCourse] = useState(null);

  // Student search state
  const [studentSearch, setStudentSearch] = useState({ ...EMPTY_STUDENT_SEARCH });
  const [showStudentSearch, setShowStudentSearch] = useState(false);

  const handleViewStudents = async (course) => {
    setStudentsDialogOpen(true);
    setStudentsCourse(course);
    setStudentsLoading(true);
    // Reset search when opening dialog
    setStudentSearch({ ...EMPTY_STUDENT_SEARCH });
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

  // Clear student search
  const clearStudentSearch = () => {
    setStudentSearch({ ...EMPTY_STUDENT_SEARCH });
    setShowStudentSearch(false); // Hide search after clearing
  };

  // Handle search input changes (the list is filtered as the user types)
  const handleStudentSearchChange = (field, value) => {
    setStudentSearch(previous => ({ ...previous, [field]: value }));
  };

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
      setStudentForm({ ...EMPTY_STUDENT_FORM });
      // Refresh students list
      const response = await api.get(`/courses/${studentsCourse._id || studentsCourse.id}/students`);
      setStudents(response.data);
      // Reset search filters so all students are shown
      setStudentSearch({ ...EMPTY_STUDENT_SEARCH });
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
      setStudentForm({ ...EMPTY_STUDENT_FORM });
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

      // Clear search filters
      setStudentSearch({ ...EMPTY_STUDENT_SEARCH });
      setShowStudentSearch(false);
      onAllStudentsDeleted();

      // Close the delete confirmation dialog
      setDeleteAllStudentsOpen(false);

      // Refresh the main courses list to update counts
      await refreshCourses();

    } catch (error) {
      const errorMessage = getErrorMessage(error, 'Failed to delete all students');
      setAlert({ severity: 'error', message: errorMessage });
    } finally {
      setDeleteAllStudentsLoading(false);
    }
  };

  return {
    students,
    setStudents,
    openStudents: handleViewStudents,
    studentsDialog: {
      open: studentsDialogOpen,
      course: studentsCourse,
      students,
      loading: studentsLoading,
      search: studentSearch,
      showSearch: showStudentSearch,
      onToggleSearch: () => setShowStudentSearch(!showStudentSearch),
      onSearchChange: handleStudentSearchChange,
      onClearSearch: clearStudentSearch,
      onUploadCsv: () => setCsvUploadOpen(true),
      onAddStudent: () => setAddStudentOpen(true),
      onEdit: handleEditStudent,
      onDelete: handleDeleteStudent,
      onDeleteAll: () => setDeleteAllStudentsOpen(true),
      onClose: () => { setStudentsDialogOpen(false); refreshCourses(); },
    },
    addStudentDialog: {
      open: addStudentOpen,
      form: studentForm,
      error: studentFormError,
      onFormChange: setStudentForm,
      onClose: () => { setAddStudentOpen(false); setStudentFormError(''); },
      onSubmit: handleAddStudent,
    },
    editStudentDialog: {
      open: editStudentOpen,
      form: studentForm,
      onFormChange: setStudentForm,
      onClose: () => { setEditStudentOpen(false); setStudentToEdit(null); setStudentForm({ ...EMPTY_STUDENT_FORM }); },
      onSave: handleUpdateStudent,
    },
    csvUploadDialog: {
      open: csvUploadOpen,
      file: csvFile,
      uploading: csvUploading,
      error: csvUploadError,
      results: csvUploadResults,
      onFileChange: handleCsvFileChange,
      onUpload: handleCsvUpload,
      onClose: () => { setCsvUploadOpen(false); setCsvUploadError(''); setCsvUploadResults(null); },
    },
    deleteAllStudentsDialog: {
      open: deleteAllStudentsOpen,
      studentCount: students.length,
      loading: deleteAllStudentsLoading,
      onClose: () => setDeleteAllStudentsOpen(false),
      onConfirm: handleDeleteAllStudents,
      onMismatch: () => setAlert({ severity: 'error', message: 'Please type "DELETE ALL" to confirm' }),
    },
  };
}
