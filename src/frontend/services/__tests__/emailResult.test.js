import { describeEmailResult } from '../emailResult';

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
