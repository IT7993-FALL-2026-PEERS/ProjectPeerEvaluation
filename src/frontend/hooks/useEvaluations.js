import { useState } from 'react';
import api from '../services/api';
import { getApiBaseUrl } from '../services/apiUrl';
import { describeExtendResult, describeInvitationResult, describeReminderResult } from '../services/emailResult';
import { prefillDeadline, toDeadlinePayload } from '../services/deadline';
import { getErrorMessage } from '../services/apiError';

// The evaluations of a course, moved out of CourseManagement.js (CICD-57, step 6b-4): sending the
// invitations, sending reminders, the Evaluation Status dialog, and resetting the evaluation state.
// The page keeps the alert and passes in `setAlert`. The hook returns:
//   sendingEvaluations      { [course id]: true } while that course's invitations are going out
//   requestSend(course)     the Send Evaluations button on a course row: asks for the deadline first
//   sendDeadlineDialog      the props the deadline dialog takes (CICD-67)
//   sendInvitations(id, deadlinePayload)  sends, once the deadline is chosen
//   viewStatus(course)      the Evaluation Status button on a course row
//   resetEvaluationState(id) used by the team dialogs after the professor agrees to a reset
//   evaluationStatusDialog  the props the Evaluation Status dialog takes
export default function useEvaluations({ setAlert }) {
  // State for evaluation management
  const [evaluationStatusOpen, setEvaluationStatusOpen] = useState(false);
  const [evaluationStatusLoading, setEvaluationStatusLoading] = useState(false);
  const [evaluationStatus, setEvaluationStatus] = useState(null);
  const [selectedCourseForEval, setSelectedCourseForEval] = useState(null);

  // State for sending evaluations (per course)
  const [sendingEvaluations, setSendingEvaluations] = useState({});

  // State for resetting evaluation state
  const [resettingEvaluations, setResettingEvaluations] = useState(false);

  // The course a deadline is being chosen for (CICD-67); nothing is sent until the instructor confirms.
  const [sendRequest, setSendRequest] = useState(null);
  // The deadline each course was last sent with in this session, to prefill the next send: the course
  // list is not reloaded after a send, so its copy of the last deadline would be out of date.
  const [lastDeadlines, setLastDeadlines] = useState({});
  // CICD-68: the Extend Deadline dialog, and the student a resubmission is being allowed for
  const [extendOpen, setExtendOpen] = useState(false);
  const [resubmitStudent, setResubmitStudent] = useState(null);

  const handleSendInvitations = async (courseId, deadlinePayload) => {
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

      const response = await api.post(`/courses/${courseId}/evaluations/send`, deadlinePayload);
      setAlert(describeInvitationResult(response.data));
      if (response.data.emails_sent > 0 && response.data.deadline) {
        setLastDeadlines(prev => ({ ...prev, [courseId]: response.data.deadline }));
      }
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
      setAlert(describeReminderResult(response.data));

      // Refresh evaluation status if dialog is open
      if (evaluationStatusOpen && (selectedCourseForEval?._id || selectedCourseForEval?.id) === courseId) {
        const statusResponse = await api.get(`/courses/${courseId}/evaluations/status`);
        setEvaluationStatus(statusResponse.data);
      }
    } catch (error) {
      setAlert({ severity: 'error', message: getErrorMessage(error, 'Failed to send reminders') });
    }
  };

  const requestSend = (course) => setSendRequest(course);
  const lastDeadlineFor = (course) => course && (lastDeadlines[course._id || course.id] || course.last_evaluation_deadline);
  const confirmSend = async (localValue) => {
    const course = sendRequest;
    const payload = toDeadlinePayload(localValue, { keep: lastDeadlineFor(course) });
    setSendRequest(null);
    if (!course || !payload) return;
    await handleSendInvitations(course._id || course.id, payload);
  };

  const courseIdOf = (course) => course && (course._id || course.id);
  const refreshStatus = async (courseId) => {
    const statusResponse = await api.get(`/courses/${courseId}/evaluations/status`);
    setEvaluationStatus(statusResponse.data);
  };
  const confirmExtend = async ({ localValue, ...scope }) => {
    const courseId = courseIdOf(selectedCourseForEval);
    const payload = toDeadlinePayload(localValue, { keep: lastDeadlineFor(selectedCourseForEval) });
    setExtendOpen(false);
    if (!courseId || !payload) return;
    try {
      const response = await api.post(`/courses/${courseId}/evaluations/extend`, { ...scope, ...payload });
      setAlert(describeExtendResult(response.data));
      if (response.data.extended?.length && response.data.deadline) {
        setLastDeadlines(prev => ({ ...prev, [courseId]: response.data.deadline }));
      }
      await refreshStatus(courseId);
    } catch (error) {
      setAlert({ severity: 'error', message: getErrorMessage(error, 'Failed to extend the deadline') });
    }
  };
  const confirmResubmit = async (localValue) => {
    const courseId = courseIdOf(selectedCourseForEval);
    const student = resubmitStudent;
    const payload = toDeadlinePayload(localValue);
    setResubmitStudent(null);
    if (!courseId || !student || !payload) return;
    try {
      const response = await api.post(`/courses/${courseId}/students/${student.id}/evaluations/resubmit`, payload);
      setAlert({ severity: 'success', message: response.data.message });
      await refreshStatus(courseId);
    } catch (error) {
      setAlert({ severity: 'error', message: getErrorMessage(error, 'Failed to allow a resubmission') });
    }
  };
  const statusRows = evaluationStatus?.students || [];

  return {
    sendingEvaluations,
    extendDialog: {
      open: extendOpen,
      // A student with nobody to rate is left out: an extension would skip them (CICD-72)
      students: statusRows.filter((row) => !row.completed && !row.nobody_to_rate && row.id).map((row) => ({ id: row.id, name: row.name })),
      teams: Object.values(statusRows.reduce((found, row) => {
        if (row.team_id) found[row.team_id] = { id: row.team_id, name: row.team };
        return found;
      }, {})),
      initialValue: prefillDeadline(lastDeadlineFor(selectedCourseForEval)),
      busy: false,
      onConfirm: confirmExtend,
      onClose: () => setExtendOpen(false),
    },
    resubmitDialog: {
      open: resubmitStudent !== null,
      title: `Allow ${resubmitStudent?.name || ''} to resubmit`,
      description: 'They get a new link that works until this deadline, and their old link stops working. Their new answers replace the earlier ones.',
      initialValue: '',
      busy: false,
      onConfirm: confirmResubmit,
      onClose: () => setResubmitStudent(null),
    },
    requestSend,
    sendDeadlineDialog: {
      open: sendRequest !== null,
      title: 'Send evaluations',
      description: 'Students must submit their evaluations by this deadline; after it their links stop working. Students who already have a working link, or have submitted, are not emailed again.',
      initialValue: prefillDeadline(lastDeadlineFor(sendRequest)),
      busy: false,
      onConfirm: confirmSend,
      onClose: () => setSendRequest(null),
    },
    sendInvitations: handleSendInvitations,
    viewStatus: handleViewEvaluationStatus,
    resetEvaluationState: handleResetEvaluationState,
    evaluationStatusDialog: {
      open: evaluationStatusOpen,
      course: selectedCourseForEval,
      status: evaluationStatus,
      loading: evaluationStatusLoading,
      sending: Boolean(selectedCourseForEval && sendingEvaluations[selectedCourseForEval._id || selectedCourseForEval.id]),
      resetting: resettingEvaluations,
      onSend: () => requestSend(selectedCourseForEval),
      onRemind: () => handleSendReminders(selectedCourseForEval._id || selectedCourseForEval.id),
      onReset: () => handleResetEvaluationState(selectedCourseForEval._id || selectedCourseForEval.id),
      onClose: () => setEvaluationStatusOpen(false),
      onExtend: () => setExtendOpen(true),
      onAllowResubmission: (student) => setResubmitStudent(student),
    },
  };
}
