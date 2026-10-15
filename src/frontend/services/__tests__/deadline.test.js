import { browserZone, formatDeadlineLocal, isRealLocalTime, prefillDeadline, toDeadlinePayload, toLocalInputValue } from '../deadline';

// CICD-67: the instructor picks a deadline in their own browser time; the server stores the exact moment.
describe('deadline helpers', () => {
  test('toLocalInputValue writes a date in the form a datetime-local input uses, in local time', () => {
    expect(toLocalInputValue(new Date(2026, 9, 16, 23, 59))).toBe('2026-10-16T23:59');
    expect(toLocalInputValue(new Date(2026, 0, 5, 7, 5))).toBe('2026-01-05T07:05');
  });

  test('toDeadlinePayload turns the local value into an exact ISO moment and names the browser\'s zone', () => {
    const payload = toDeadlinePayload('2026-10-16T23:59');
    expect(payload.deadline).toBe(new Date(2026, 9, 16, 23, 59).toISOString());
    expect(payload.deadline_zone).toBe(browserZone());
    expect(browserZone()).toMatch(/\S/);
  });

  test('toDeadlinePayload gives nothing for an empty or unreadable value', () => {
    for (const bad of ['', undefined, null, 'soon']) expect(toDeadlinePayload(bad)).toBeNull();
  });

  test('prefillDeadline offers the last deadline only while it is still ahead', () => {
    const now = new Date(2026, 9, 14, 12, 0);
    expect(prefillDeadline(new Date(2026, 9, 20, 9, 30).toISOString(), now)).toBe('2026-10-20T09:30');
    expect(prefillDeadline(new Date(2026, 9, 13, 9, 30).toISOString(), now)).toBe('');
    expect(prefillDeadline(now.toISOString(), now)).toBe('');
    for (const bad of [null, undefined, '', 'not a date']) expect(prefillDeadline(bad, now)).toBe('');
  });

  test('formatDeadlineLocal writes the moment in local time with the zone named, and nothing for a bad value', () => {
    const when = new Date(2026, 9, 16, 23, 59);
    const text = formatDeadlineLocal(when.toISOString());
    // The zone's own short name, worked out independently ("EDT", "GMT+9"), not just any capital letters
    const zoneName = new Intl.DateTimeFormat(undefined, { timeZoneName: 'short' })
      .formatToParts(when).find((part) => part.type === 'timeZoneName').value;
    expect(text).toContain(zoneName);
    expect(text).toMatch(/2026/);
    expect(text).toMatch(/:59/);
    expect(formatDeadlineLocal('nope')).toBe('');
  });
});

// Codex review: around a daylight-saving change a local time can be ambiguous (clocks fall back) or not
// exist (clocks spring forward). Pinned to New York so the two transitions are known.
describe('deadline helpers across daylight-saving changes', () => {
  const zone = process.env.TZ;
  beforeEach(() => { process.env.TZ = 'America/New_York'; });
  afterEach(() => { if (zone === undefined) delete process.env.TZ; else process.env.TZ = zone; });

  test('an unchanged prefill keeps the exact moment it came from, even in the repeated hour', () => {
    const second130 = '2026-11-01T06:30:00.000Z'; // 1:30 EST, the second 1:30 that night
    const shown = prefillDeadline(second130, new Date('2026-10-01T00:00:00Z'));
    expect(shown).toBe('2026-11-01T01:30');
    expect(toDeadlinePayload(shown, { keep: second130 }).deadline).toBe(second130);
    expect(toDeadlinePayload('2026-11-01T01:45', { keep: second130 }).deadline).not.toBe(second130);
  });

  test('a local time that does not exist (clocks jump from 2:00 to 3:00) is refused', () => {
    expect(toDeadlinePayload('2027-03-14T02:30')).toBeNull();
    expect(isRealLocalTime('2027-03-14T02:30')).toBe(false);
    expect(isRealLocalTime('2027-03-14T03:30')).toBe(true);
  });
});
