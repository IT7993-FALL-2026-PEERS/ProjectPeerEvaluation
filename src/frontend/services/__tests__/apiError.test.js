import { getErrorMessage } from '../apiError';

// CICD-49: the roster upload from the course row showed "Failed to upload roster" whatever the
// server said, hiding why a file was rejected.
const FALLBACK = 'Failed to upload roster';

describe('getErrorMessage', () => {
  test('shows the server\'s message when it sent one', () => {
    const error = { response: { status: 400, data: { error: { code: 'VALIDATION_ERROR', message: 'The file has no students. Each row needs student_id, name and email.' } } } };
    expect(getErrorMessage(error, FALLBACK)).toBe('The file has no students. Each row needs student_id, name and email.');
  });

  test.each([
    ['a network failure with no response', { message: 'Network Error' }],
    ['a response with no body', { response: { status: 502 } }],
    ['a body with no error object', { response: { status: 500, data: {} } }],
    ['an error with an empty message', { response: { data: { error: { message: '   ' } } } }],
    ['a message that is not text', { response: { data: { error: { message: { nested: true } } } } }],
  ])('falls back to the generic text for %s', (_name, error) => {
    expect(getErrorMessage(error, FALLBACK)).toBe(FALLBACK);
  });

  test('falls back when there is no error at all', () => {
    expect(getErrorMessage(undefined, FALLBACK)).toBe(FALLBACK);
    expect(getErrorMessage(null, FALLBACK)).toBe(FALLBACK);
  });
});
