import api from '../api';
import { fetchNobodyToRate, describeNobodyToRate } from '../sendPreview';

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
