import { useState } from 'react';
import api from '../services/api';
import { getApiBaseUrl } from '../services/apiUrl';
import { describeEmailResult } from '../services/emailResult';
import { getErrorMessage } from '../services/apiError';

// The evaluations of a course, moved out of CourseManagement.js (CICD-57, step 6b-4): sending the
// invitations, sending reminders, the Evaluation Status dialog, and resetting the evaluation state.
// The page keeps the alert and passes in `setAlert`. The hook returns:
//   sendingEvaluations      { [course id]: true } while that course's invitations are going out
//   sendInvitations(id)     the Send Evaluations button on a course row
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

  return {
    sendingEvaluations,
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
      onSend: () => handleSendInvitations(selectedCourseForEval._id || selectedCourseForEval.id),
      onRemind: () => handleSendReminders(selectedCourseForEval._id || selectedCourseForEval.id),
      onReset: () => handleResetEvaluationState(selectedCourseForEval._id || selectedCourseForEval.id),
      onClose: () => setEvaluationStatusOpen(false),
    },
  };
}
