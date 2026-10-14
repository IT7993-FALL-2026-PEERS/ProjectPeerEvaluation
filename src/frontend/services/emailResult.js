// Turns a send/remind response into an alert. The backend lists each failure as
// "Name (email): reason"; only the names are shown to the professor.
export function describeEmailResult({ sent = 0, total = 0, failed = [] }, successMessage) {
  if (!failed || failed.length === 0) {
    return { severity: 'success', message: successMessage };
  }
  const names = failed.map((entry) => entry.split(' (')[0]).join(', ');
  if (sent === 0) {
    return { severity: 'error', message: `No emails were sent. Not sent to: ${names}.` };
  }
  return { severity: 'warning', message: `Sent ${sent} of ${total} emails. Not sent to: ${names}.` };
}

// CICD-67: a send reaches only students with no active link who have not submitted, so the alert says who
// it skipped. Zero stays zero; a send that reached nobody is information, not a success.
// `successText` replaces the default first sentence (the team dialog names the team).
export function describeInvitationResult(data, successText) {
  const sent = data.emails_sent || 0;
  const skipped = [
    data.already_invited ? `${data.already_invited} already had a link.` : '',
    data.already_submitted ? `${data.already_submitted} already submitted.` : '',
  ].filter(Boolean).join(' ');
  if (!data.total_students) {
    return { severity: 'info', message: [data.message, skipped].filter(Boolean).join(' ') };
  }
  const result = describeEmailResult(
    { sent, total: data.total_students, failed: data.failed },
    [successText || `✅ ${data.message} - Emails sent to ${sent} students.`, skipped].filter(Boolean).join(' ')
  );
  // The backend adds "the link could not be reset" when a failed student's link stayed claimed
  const stuck = (data.failed || []).filter((entry) => entry.includes('could not be reset')).map((entry) => entry.split(' (')[0]);
  if (stuck.length === 0) return result;
  return { ...result, message: `${result.message} The link of ${stuck.join(', ')} could not be reset, so a new send will skip them until the deadline.` };
}

// A reminder only reaches students whose link still works; the others are named so the instructor
// knows who needs an extension first.
export function describeReminderResult(data) {
  const passed = data.deadline_passed || [];
  const extra = [
    passed.length ? `Deadline passed (extend first): ${passed.join(', ')}.` : '',
    data.not_invited ? `${data.not_invited} not invited yet.` : '',
  ].filter(Boolean).join(' ');
  const result = describeEmailResult(
    { sent: data.reminders_sent, total: data.total_reminded, failed: data.failed },
    data.message
  );
  if (!extra) return result;
  const severity = result.severity !== 'success' ? result.severity : (data.reminders_sent ? 'warning' : 'info');
  return { severity, message: `${result.message} ${extra}` };
}

// CICD-68: an extension names who got more time and why others did not.
export function describeExtendResult(data) {
  const extended = data.extended || [];
  const failedNames = (data.failed || []).map((entry) => entry.split(' (')[0]);
  const skipped = data.skipped || {};
  const parts = [extended.length ? `Deadline extended for ${extended.join(', ')}.` : 'Nobody was extended.'];
  if (failedNames.length) parts.push(`Not sent to: ${failedNames.join(', ')}.`);
  if (skipped.submitted) parts.push(`${skipped.submitted} already submitted.`);
  if (skipped.not_invited) parts.push(`${skipped.not_invited} not invited yet.`);
  if (skipped.changed) parts.push(`${skipped.changed} changed while extending (submitted or extended elsewhere); their link was left as it was.`);
  const trouble = failedNames.length > 0 || Boolean(skipped.changed);
  let severity = extended.length ? 'success' : 'info';
  if (trouble) severity = extended.length ? 'warning' : 'error';
  return { severity, message: parts.join(' ') };
}
