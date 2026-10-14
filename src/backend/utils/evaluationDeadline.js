// The deadline of an evaluation round (CICD-67). The instructor picks it with each send; it becomes the
// expiry of every link that send issues. The request carries an exact moment (an ISO date-time) and the
// zone the instructor chose it in; the zone is only used to write the deadline in emails.
const { validationError } = require('./inputGuards');

const MAX_DEADLINE_DAYS = 366;
const DAY_MS = 24 * 60 * 60 * 1000;
// A full date and time with its offset ("Z" or "-04:00"). Without one, Date would read the time in the
// server's own zone, so the same request would mean a different moment on another machine.
const ISO_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;

// Date quietly rolls impossible dates over ("2027-02-29" becomes March 1); this refuses them instead.
function isRealDateTime(match) {
  const [year, month, day, hour, minute, second = '0'] = match.slice(1, 7).map((part) => (part === undefined ? undefined : Number(part)));
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth
    && hour <= 23 && minute <= 59 && Number(second) <= 59;
}

function isTimeZone(zone) {
  if (typeof zone !== 'string' || zone === '') return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

// `now` is in milliseconds. Throws a 400 VALIDATION_ERROR the dialog can show as it is.
function parseDeadline(body, { now = Date.now() } = {}) {
  const raw = body ? body.deadline : undefined;
  if (typeof raw !== 'string' || raw.trim() === '') {
    throw validationError('A deadline is required. Choose the date and time the evaluations are due.');
  }
  const match = ISO_DATE_TIME.exec(raw.trim());
  const deadline = new Date(raw.trim());
  if (!match || !isRealDateTime(match) || Number.isNaN(deadline.getTime())) {
    throw validationError('The deadline is not a valid date and time.');
  }
  if (deadline.getTime() <= now) throw validationError('The deadline must be in the future.');
  if (deadline.getTime() > now + MAX_DEADLINE_DAYS * DAY_MS) {
    throw validationError('The deadline can be at most one year from now.');
  }
  const zone = body.deadline_zone === undefined || body.deadline_zone === null ? 'UTC' : body.deadline_zone;
  if (!isTimeZone(zone)) throw validationError('The time zone is not recognised.');
  return { deadline, zone };
}

// "Thu, Oct 15, 2026, 11:59 PM EDT": the moment in the instructor's zone, because the server does not know
// the student's. The student's own page shows it in their local time.
function formatDeadline(deadline, zone = 'UTC') {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZone: zone, timeZoneName: 'short',
  }).format(new Date(deadline));
}

module.exports = { MAX_DEADLINE_DAYS, parseDeadline, formatDeadline };
