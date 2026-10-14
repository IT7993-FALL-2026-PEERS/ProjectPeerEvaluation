// The evaluation deadline on the browser side (CICD-67). The instructor chooses it in their own time; the
// server stores the exact moment and the zone name (used only for the emails). A student sees the same
// moment in their own time, with the zone named.
const pad = (n) => String(n).padStart(2, '0');

// "2026-10-16T23:59": the form a datetime-local input uses, in the browser's own time.
export function toLocalInputValue(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function browserZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

// The last deadline used for a course, offered again only while it is still ahead.
export function prefillDeadline(lastIso, now = new Date()) {
  if (!lastIso) return '';
  const last = new Date(lastIso);
  return Number.isNaN(last.getTime()) || last.getTime() <= now.getTime() ? '' : toLocalInputValue(last);
}

// False for a time the clock skips when daylight saving starts (2:30 when clocks jump from 2:00 to 3:00):
// the browser would quietly move it an hour later.
export function isRealLocalTime(localValue) {
  const when = new Date(localValue);
  return !Number.isNaN(when.getTime()) && toLocalInputValue(when) === localValue;
}

// What the send endpoints take: an exact moment and the zone the instructor chose it in. `keep` is the
// moment a prefilled value came from: sent back unchanged, it keeps that moment, so a deadline in the hour
// that repeats when clocks fall back is not moved to the first of the two.
export function toDeadlinePayload(localValue, { keep } = {}) {
  if (!localValue || !isRealLocalTime(localValue)) return null;
  const kept = keep && !Number.isNaN(new Date(keep).getTime()) && toLocalInputValue(new Date(keep)) === localValue;
  const when = kept ? new Date(keep) : new Date(localValue);
  return { deadline: when.toISOString(), deadline_zone: browserZone() };
}

export function formatDeadlineLocal(iso) {
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  }).format(when);
}
