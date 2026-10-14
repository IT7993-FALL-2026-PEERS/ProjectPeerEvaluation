import { describeEmailResult, describeInvitationResult, describeReminderResult } from '../emailResult';

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
    expect(result.message).toBe('Reminder emails sent successfully. Deadline passed (extend first): Pat Lee, Nia Roe.');
  });

  test('counts students who were never invited', () => {
    const result = describeReminderResult({
      message: 'No reminders sent: no student with an unfinished evaluation has an active link.', reminders_sent: 0, total_reminded: 0, failed: [], deadline_passed: [], not_invited: 2,
    });
    expect(result.severity).toBe('info');
    expect(result.message).toBe('No reminders sent: no student with an unfinished evaluation has an active link. 2 not invited yet.');
  });

  test('a plain successful reminder is unchanged', () => {
    expect(describeReminderResult({ message: 'Reminder emails sent successfully.', reminders_sent: 3, total_reminded: 3, failed: [] }))
      .toEqual({ severity: 'success', message: 'Reminder emails sent successfully.' });
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
