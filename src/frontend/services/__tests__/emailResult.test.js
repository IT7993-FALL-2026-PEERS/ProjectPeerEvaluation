import { describeEmailResult, describeExtendResult, describeInvitationResult, describeReminderResult } from '../emailResult';

// The backend reports each failure as "Name (email): reason" in `failed`.
describe('describeEmailResult', () => {
  test('all sent is a success with the given message', () => {
    expect(describeEmailResult({ sent: 3, total: 3, failed: [] }, 'Invitations sent.')).toEqual({
      severity: 'success',
      message: 'Invitations sent.',
    });
  });

  test('some failed is a warning that names who was missed', () => {
    const result = describeEmailResult(
      {
        sent: 1,
        total: 3,
        failed: [
          'Bob Test (bob@example.com): Data command failed: 550 5.7.0 Too many emails per second.',
          'Carol Test (carol@example.com): Data command failed: 550 5.7.0 Too many emails per second.',
        ],
      },
      'Invitations sent.'
    );
    expect(result.severity).toBe('warning');
    expect(result.message).toBe('Sent 1 of 3 emails. Not sent to: Bob Test, Carol Test.');
  });

  test('none sent is an error', () => {
    const result = describeEmailResult(
      { sent: 0, total: 1, failed: ['Bob Test (bob@example.com): Invalid login'] },
      'Invitations sent.'
    );
    expect(result.severity).toBe('error');
    expect(result.message).toBe('No emails were sent. Not sent to: Bob Test.');
  });

  test('a missing failed list counts as all sent', () => {
    expect(describeEmailResult({ sent: 0, total: 0 }, 'No students need reminders.').severity).toBe('success');
  });
});

// CICD-67: a send now reports who it skipped, and a reminder who it could not reach.
describe('describeInvitationResult', () => {
  test('says how many were invited, and who already had a link or had submitted', () => {
    const result = describeInvitationResult({
      message: 'Evaluation invitations sent successfully.', emails_sent: 2, total_students: 2, failed: [], already_invited: 3, already_submitted: 1,
    });
    expect(result.severity).toBe('success');
    expect(result.message).toBe('✅ Evaluation invitations sent successfully. - Emails sent to 2 students. 3 already had a link. 1 already submitted.');
  });

  test('zero sent stays zero, and a send that reached nobody is information, not success', () => {
    const result = describeInvitationResult({
      message: 'Nobody needs an invitation: every student already has an active link or has submitted.',
      emails_sent: 0, total_students: 0, failed: [], already_invited: 4, already_submitted: 0,
    });
    expect(result.severity).toBe('info');
    expect(result.message).toBe('Nobody needs an invitation: every student already has an active link or has submitted. 4 already had a link.');
  });

  test('failures are still reported by name', () => {
    const result = describeInvitationResult({
      message: 'sent', emails_sent: 1, total_students: 2, failed: ['Bob Test (bob@example.com): SMTP down'], already_invited: 0, already_submitted: 0,
    });
    expect(result.severity).toBe('warning');
    expect(result.message).toBe('Sent 1 of 2 emails. Not sent to: Bob Test.');
  });
});

describe('describeReminderResult', () => {
  test('names students whose deadline has passed, so the instructor knows to extend first', () => {
    const result = describeReminderResult({
      message: 'Reminder emails sent successfully.', reminders_sent: 2, total_reminded: 2, failed: [], deadline_passed: ['Pat Lee', 'Nia Roe'], not_invited: 0,
    });
    expect(result.severity).toBe('warning');
    expect(result.message).toBe('Reminders sent to 2 students. Deadline passed: Pat Lee, Nia Roe. Use Extend Deadline.');
  });

  test('counts students who were never invited', () => {
    const result = describeReminderResult({
      message: 'No reminders sent: no student with an unfinished evaluation has an active link.', reminders_sent: 0, total_reminded: 0, failed: [], deadline_passed: [], not_invited: 2,
    });
    expect(result.severity).toBe('info');
    expect(result.message).toBe('No reminders sent: no student with an unfinished evaluation has an active link. 2 not invited yet: use Send Evaluations.');
  });

  // CICD-71: found on staging, "Reminder emails sent successfully. 1 not invited yet." said neither how many
  // reminders went out nor what to do about the student who was not invited.
  test('says how many students were reminded, with 1 student in the singular', () => {
    expect(describeReminderResult({ message: 'Reminder emails sent successfully.', reminders_sent: 3, total_reminded: 3, failed: [] }))
      .toEqual({ severity: 'success', message: 'Reminders sent to 3 students.' });
    expect(describeReminderResult({ message: 'Reminder emails sent successfully.', reminders_sent: 1, total_reminded: 1, failed: [] }))
      .toEqual({ severity: 'success', message: 'Reminders sent to 1 student.' });
  });

  test('the screenshot case: some reminded and one student not invited says to use Send Evaluations', () => {
    expect(describeReminderResult({ message: 'Reminder emails sent successfully.', reminders_sent: 2, total_reminded: 2, failed: [], deadline_passed: [], not_invited: 1 }))
      .toEqual({ severity: 'warning', message: 'Reminders sent to 2 students. 1 not invited yet: use Send Evaluations.' });
  });

  test('a failed reminder is still named, and the next steps follow', () => {
    const result = describeReminderResult({
      message: 'Reminder emails sent successfully.', reminders_sent: 1, total_reminded: 2, failed: ['Bob Test (bob@example.com): refused'], deadline_passed: ['Pat Lee'], not_invited: 1,
    });
    expect(result.severity).toBe('warning');
    expect(result.message).toBe('Sent 1 of 2 emails. Not sent to: Bob Test. Deadline passed: Pat Lee. Use Extend Deadline. 1 not invited yet: use Send Evaluations.');
  });
});

// Codex review: the backend says when a failed student's link could not be given back; the alert keeps it.
test('a link that could not be reset after a failed email is named in the alert', () => {
  const result = describeInvitationResult({
    message: 'sent', emails_sent: 0, total_students: 1, already_invited: 0, already_submitted: 0,
    failed: ['Ann Archer (ann@example.edu): SMTP down; the link could not be reset, so a new send will skip this student until the deadline'],
  });
  expect(result.severity).toBe('error');
  expect(result.message).toBe('No emails were sent. Not sent to: Ann Archer. The link of Ann Archer could not be reset, so a new send will skip them until the deadline.');
});

// CICD-68: an extension names who got more time and why others did not.
describe('describeExtendResult', () => {
  test('names who was extended and counts who was skipped', () => {
    expect(describeExtendResult({ extended: ['Ann Archer', 'Ben Baker'], failed: [], skipped: { submitted: 1, not_invited: 2, changed: 0 } }))
      .toEqual({ severity: 'success', message: 'Deadline extended for Ann Archer, Ben Baker. 1 already submitted. 2 not invited yet.' });
  });

  test('a link that changed meanwhile and failed emails are reported', () => {
    const result = describeExtendResult({ extended: [], failed: ['Ann Archer (ann@x.edu): SMTP down'], skipped: { submitted: 0, not_invited: 0, changed: 1 } });
    expect(result.severity).toBe('error');
    expect(result.message).toBe('Nobody was extended. Not sent to: Ann Archer. 1 changed while extending (submitted or extended elsewhere); their link was left as it was.');
  });

  test('extending nobody because everyone submitted is information', () => {
    expect(describeExtendResult({ extended: [], failed: [], skipped: { submitted: 3, not_invited: 0, changed: 0 } }))
      .toEqual({ severity: 'info', message: 'Nobody was extended. 3 already submitted.' });
  });
});

// CICD-72: a student alone on their team has nobody to rate, so send, reminders and extend skip them and say so.
describe('students alone on their team', () => {
  test('a send names who was skipped because they have nobody to rate', () => {
    const result = describeInvitationResult({ emails_sent: 3, total_students: 3, failed: [], no_teammates: ['Ann Archer'], message: 'Evaluation invitations sent successfully.' });
    expect(result.message).toContain('Alone on their team (add a teammate, then send again): Ann Archer.');
  });

  test('a send that reached nobody still says who was skipped, as information', () => {
    const result = describeInvitationResult({ emails_sent: 0, total_students: 0, failed: [], no_teammates: ['Ann Archer'], message: 'Nobody was invited: the students left have nobody to rate.' });
    expect(result.severity).toBe('info');
    expect(result.message).toContain('Nobody was invited: the students left have nobody to rate.');
    expect(result.message).toContain('Alone on their team (add a teammate, then send again): Ann Archer.');
  });

  test('a failed email does not hide who was skipped, for a partial and a total failure', () => {
    const base = { total_students: 2, no_teammates: ['Ann Archer'], message: 'Evaluation invitations sent successfully.' };
    const partial = describeInvitationResult({ ...base, emails_sent: 1, failed: ['Ben Baker (ben@example.edu): SMTP down'] });
    expect(partial.severity).toBe('warning');
    expect(partial.message).toContain('Not sent to: Ben Baker.');
    expect(partial.message).toContain('Alone on their team (add a teammate, then send again): Ann Archer.');
    const total = describeInvitationResult({ ...base, total_students: 1, emails_sent: 0, failed: ['Ben Baker (ben@example.edu): SMTP down'] });
    expect(total.severity).toBe('error');
    expect(total.message).toContain('No emails were sent. Not sent to: Ben Baker.');
    expect(total.message).toContain('Alone on their team (add a teammate, then send again): Ann Archer.');
  });

  test('a reminder names them and does not treat them as not invited', () => {
    const result = describeReminderResult({ reminders_sent: 3, total_reminded: 3, failed: [], deadline_passed: [], not_invited: 0, no_teammates: ['Ann Archer'] });
    expect(result.message).toContain('Alone on their team: Ann Archer.');
    expect(result.message).not.toContain('not invited');
  });

  test('an extension counts them', () => {
    const result = describeExtendResult({ extended: ['Cy Cole'], failed: [], skipped: { submitted: 0, not_invited: 0, changed: 0, no_teammates: 1 } });
    expect(result.message).toContain('1 alone on their team.');
  });
});
