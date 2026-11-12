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

// CICD-86: a send is one long request (the server spaces the emails), so while it runs the page says how many
// invitations are going out and about how long that takes. Both numbers are in the same preview answer:
// { names, estimate: { count, seconds } }, with no estimate when nobody will be invited or the answer has no count.
export async function fetchSendPreview(path) {
  try {
    const response = await api.get(path);
    const data = (response && response.data) || {};
    const names = Array.isArray(data.no_teammates) ? data.no_teammates : [];
    const count = data.will_invite;
    if (!Number.isInteger(count) || count < 1) return { names, estimate: null };
    const seconds = Number.isFinite(data.estimated_seconds) && data.estimated_seconds > 0 ? data.estimated_seconds : 0;
    return { names, estimate: { count, seconds } };
  } catch (error) {
    return { names: [], estimate: null };
  }
}

// Under this many seconds the wait is not worth announcing.
const WORTH_SAYING_SECONDS = 5;

function aboutHowLong(seconds) {
  if (seconds < WORTH_SAYING_SECONDS) return '';
  if (seconds < 60) return ` This takes about ${Math.ceil(seconds / 5) * 5} seconds.`;
  const minutes = Math.round(seconds / 60);
  return ` This takes about ${minutes} minute${minutes === 1 ? '' : 's'}.`;
}

export function describeSendEstimate(estimate) {
  if (!estimate) return '';
  const { count, seconds } = estimate;
  return `Sending ${count} invitation${count === 1 ? '' : 's'}.${aboutHowLong(seconds)} Keep this page open.`;
}

// How far along the send should be after `elapsedMs`, 0 to 95: an estimate from the pace, not a report from the
// server, so it never reaches the end by itself. null when there is no time to go by.
export const MOST_AN_ESTIMATE_SHOWS = 95;

export function sendProgressPercent(estimate, elapsedMs) {
  if (!estimate || !(estimate.seconds >= WORTH_SAYING_SECONDS)) return null;
  const percent = Math.round((Math.max(0, elapsedMs) / (estimate.seconds * 1000)) * 100);
  return Math.min(MOST_AN_ESTIMATE_SHOWS, percent);
}
