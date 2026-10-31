import api from './api';

// CICD-80: before a send, the Send dialogs tell the instructor who the send cannot reach (a student alone on
// their team, or with no team: nobody to rate), so the assignment can be checked first. The names come from the
// server's own rule (the send preview endpoints), not from a copy of it here. A preview that cannot be loaded
// gives no warning: it is a help, and the send itself still skips and reports those students.
export async function fetchNobodyToRate(path) {
  try {
    const response = await api.get(path);
    const names = response && response.data && response.data.no_teammates;
    return Array.isArray(names) ? names : [];
  } catch (error) {
    return [];
  }
}

export const describeNobodyToRate = (names) => (names.length
  ? `No evaluation will be sent to ${names.join(', ')}: alone on their team, or no team assigned, so there is nobody to rate. Cancel to check the assignment before sending.`
  : '');
