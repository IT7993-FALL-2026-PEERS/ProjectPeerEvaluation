import api from '../api';
import {
  fetchNobodyToRate, describeNobodyToRate, fetchSendPreview, describeSendEstimate, sendProgressPercent,
} from '../sendPreview';

vi.mock('../api', () => ({ __esModule: true, default: { get: vi.fn() } }));

// CICD-80: before a send, the instructor is told who it cannot reach (alone on a team, or no team), so the
// assignment can be checked. The names come from the server's own rule (the send preview endpoints).
beforeEach(() => { api.get.mockReset(); });

describe('fetchNobodyToRate', () => {
  test('asks the preview endpoint and returns the names', async () => {
    api.get.mockResolvedValue({ data: { no_teammates: ['Ann Archer', 'Eve Evans'], will_invite: 3 } });
    expect(await fetchNobodyToRate('/courses/c1/evaluations/send-preview')).toEqual(['Ann Archer', 'Eve Evans']);
    expect(api.get).toHaveBeenCalledWith('/courses/c1/evaluations/send-preview');
  });

  test.each([
    ['no list in the answer', { data: {} }],
    ['no answer body', {}],
    ['a list that is not a list', { data: { no_teammates: 'Ann' } }],
  ])('returns nobody for %s', async (_name, answer) => {
    api.get.mockResolvedValue(answer);
    expect(await fetchNobodyToRate('/x')).toEqual([]);
  });

  test('returns nobody when the request fails: the warning is a help, and the send itself still checks', async () => {
    api.get.mockRejectedValue(new Error('offline'));
    expect(await fetchNobodyToRate('/x')).toEqual([]);
  });
});

describe('describeNobodyToRate', () => {
  test('is empty when nobody is affected', () => {
    expect(describeNobodyToRate([])).toBe('');
  });

  test('names the students, says why, and tells the instructor to check the assignment', () => {
    expect(describeNobodyToRate(['Ann Archer'])).toBe('No evaluation will be sent to Ann Archer: alone on their team, or no team assigned, so there is nobody to rate. Cancel to check the assignment before sending.');
    expect(describeNobodyToRate(['Ann Archer', 'Eve Evans'])).toContain('Ann Archer, Eve Evans');
  });
});

// CICD-86: a send is one long request (the emails are spaced), so the page says how many invitations are going out
// and about how long it takes. The numbers come from the same preview answer.
describe('fetchSendPreview', () => {
  test('returns the names and the estimate', async () => {
    api.get.mockResolvedValue({ data: { no_teammates: ['Ann Archer'], will_invite: 5, estimated_seconds: 44 } });
    expect(await fetchSendPreview('/courses/c1/evaluations/send-preview')).toEqual({ names: ['Ann Archer'], estimate: { count: 5, seconds: 44 } });
    expect(api.get).toHaveBeenCalledWith('/courses/c1/evaluations/send-preview');
  });

  test('an answer with no time (an older server) still gives the count', async () => {
    api.get.mockResolvedValue({ data: { no_teammates: [], will_invite: 3 } });
    expect(await fetchSendPreview('/x')).toEqual({ names: [], estimate: { count: 3, seconds: 0 } });
  });

  test.each([
    ['no count', { data: { no_teammates: [] } }],
    ['a count that is not a number', { data: { will_invite: 'many' } }],
    ['nobody to invite', { data: { will_invite: 0, estimated_seconds: 0 } }],
    ['no answer body', {}],
  ])('gives no estimate for %s', async (_name, answer) => {
    api.get.mockResolvedValue(answer);
    expect((await fetchSendPreview('/x')).estimate).toBeNull();
  });

  test('gives nobody and no estimate when the request fails', async () => {
    api.get.mockRejectedValue(new Error('offline'));
    expect(await fetchSendPreview('/x')).toEqual({ names: [], estimate: null });
  });
});

describe('describeSendEstimate', () => {
  test.each([
    [{ count: 5, seconds: 44 }, 'Sending 5 invitations. This takes about 45 seconds. Keep this page open.'],
    [{ count: 2, seconds: 11 }, 'Sending 2 invitations. This takes about 15 seconds. Keep this page open.'],
    [{ count: 7, seconds: 66 }, 'Sending 7 invitations. This takes about 1 minute. Keep this page open.'],
    [{ count: 14, seconds: 143 }, 'Sending 14 invitations. This takes about 2 minutes. Keep this page open.'],
    [{ count: 1, seconds: 0 }, 'Sending 1 invitation. Keep this page open.'],
    [{ count: 30, seconds: 0 }, 'Sending 30 invitations. Keep this page open.'],
    [{ count: 3, seconds: 3 }, 'Sending 3 invitations. Keep this page open.'],
  ])('%o reads "%s"', (estimate, text) => {
    expect(describeSendEstimate(estimate)).toBe(text);
  });

  test('is empty without an estimate', () => {
    expect(describeSendEstimate(null)).toBe('');
  });
});

describe('sendProgressPercent', () => {
  test('moves with the time that has passed', () => {
    expect(sendProgressPercent({ count: 5, seconds: 40 }, 0)).toBe(0);
    expect(sendProgressPercent({ count: 5, seconds: 40 }, 10000)).toBe(25);
    expect(sendProgressPercent({ count: 5, seconds: 40 }, 20000)).toBe(50);
  });

  test('stops short of the end: it is an estimate, and only the answer says the send is done', () => {
    expect(sendProgressPercent({ count: 5, seconds: 40 }, 40000)).toBe(95);
    expect(sendProgressPercent({ count: 5, seconds: 40 }, 400000)).toBe(95);
  });

  test('has nothing to show when the time is not known', () => {
    expect(sendProgressPercent({ count: 5, seconds: 0 }, 5000)).toBeNull();
    expect(sendProgressPercent(null, 5000)).toBeNull();
  });
});
