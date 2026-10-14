const test = require('node:test');
const assert = require('node:assert/strict');
const { parseDeadline, formatDeadline, MAX_DEADLINE_DAYS } = require('../utils/evaluationDeadline');

// CICD-67: every send needs a deadline chosen by the instructor.
const NOW = Date.UTC(2026, 9, 14, 12, 0, 0);
const DAY = 24 * 60 * 60 * 1000;
const iso = (ms) => new Date(ms).toISOString();
const refused = (error) => error.status === 400 && error.code === 'VALIDATION_ERROR';

test('TC-10-50: a deadline in the future is accepted as a Date, and the zone defaults to UTC', () => {
  const { deadline, zone } = parseDeadline({ deadline: iso(NOW + DAY) }, { now: NOW });
  assert.ok(deadline instanceof Date);
  assert.equal(deadline.getTime(), NOW + DAY);
  assert.equal(zone, 'UTC');
});

test('TC-10-51: a missing, empty or non-text deadline is refused, and so is a missing body', () => {
  for (const body of [undefined, null, {}, { deadline: '' }, { deadline: '   ' }, { deadline: 123 }, { deadline: {} }, { deadline: ['2030-01-01T00:00:00Z'] }, { deadline: null }]) {
    assert.throws(() => parseDeadline(body, { now: NOW }), refused, JSON.stringify(body));
  }
});

test('TC-10-52: text that is not an ISO date and time is refused', () => {
  for (const text of ['tomorrow', 'Oct 16', '2026-10-16', '16/10/2026', '2026-13-45T10:00:00Z', 'next friday at noon']) {
    assert.throws(() => parseDeadline({ deadline: text }, { now: NOW }), refused, text);
  }
});

// Codex review: a time with no zone would be read in the server's own zone, and Date quietly rolls
// "February 29" in a non-leap year into March 1. Both must be refused, not guessed.
test('TC-10-61: the deadline must name its offset and be a real calendar date', () => {
  for (const text of ['2026-10-16T23:59', '2026-10-16T23:59:00', '2027-02-29T12:00:00Z', '2026-04-31T12:00:00Z', '2026-10-16T24:30:00Z', '2026-10-16T23:60:00Z']) {
    assert.throws(() => parseDeadline({ deadline: text }, { now: NOW }), refused, text);
  }
  const offset = parseDeadline({ deadline: '2026-10-16T23:59:00-04:00' }, { now: NOW });
  assert.equal(offset.deadline.toISOString(), '2026-10-17T03:59:00.000Z');
  assert.equal(parseDeadline({ deadline: '2028-02-29T12:00:00.000Z' }, { now: Date.UTC(2027, 11, 1) }).deadline.toISOString(), '2028-02-29T12:00:00.000Z', 'a leap day is fine');
});

test('TC-10-53: a deadline that is not after now is refused', () => {
  for (const ms of [NOW, NOW - 1, NOW - DAY]) {
    assert.throws(() => parseDeadline({ deadline: iso(ms) }, { now: NOW }), refused, iso(ms));
  }
  assert.doesNotThrow(() => parseDeadline({ deadline: iso(NOW + 1000) }, { now: NOW }));
});

test('TC-10-54: a deadline more than 366 days ahead is refused; exactly 366 days is accepted', () => {
  assert.equal(MAX_DEADLINE_DAYS, 366);
  assert.doesNotThrow(() => parseDeadline({ deadline: iso(NOW + 366 * DAY) }, { now: NOW }));
  assert.throws(() => parseDeadline({ deadline: iso(NOW + 366 * DAY + 1) }, { now: NOW }), refused);
});

test('TC-10-55: the zone is optional, must be a real IANA zone when given, and does not change the moment', () => {
  const body = { deadline: iso(NOW + DAY), deadline_zone: 'America/New_York' };
  const { deadline, zone } = parseDeadline(body, { now: NOW });
  assert.equal(zone, 'America/New_York');
  assert.equal(deadline.getTime(), NOW + DAY);
  for (const bad of ['Nowhere/City', '', 5, {}, 'EDT-ish']) {
    assert.throws(() => parseDeadline({ ...body, deadline_zone: bad }, { now: NOW }), refused, JSON.stringify(bad));
  }
  assert.equal(parseDeadline({ ...body, deadline_zone: null }, { now: NOW }).zone, 'UTC');
});

test('TC-10-56: formatDeadline writes the moment in the given zone with its short name, UTC by default', () => {
  const moment = new Date('2026-10-16T03:59:00Z');
  assert.match(formatDeadline(moment, 'America/New_York'), /Oct 15, 2026.*11:59 PM EDT/);
  assert.match(formatDeadline(moment), /Oct 16, 2026.*3:59 AM UTC/);
});
