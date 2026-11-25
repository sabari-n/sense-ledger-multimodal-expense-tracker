/**
 * Calendar helpers for the agent. Dates are plain 'YYYY-MM-DD' / 'YYYY-MM' strings in the
 * app's timezone: small models are bad at date arithmetic, so the system prompt gives them
 * ready-made ranges and the tools accept a whole month instead of exact timestamps.
 */

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

const pad = (n) => String(n).padStart(2, '0');

/** Today's date ('YYYY-MM-DD') in `timeZone`. */
export function localToday(timeZone, now = new Date()) {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** True for a real calendar date ('2026-02-30' is false). */
export function isValidDate(s) {
  if (!DATE_RE.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** First and last day of a 'YYYY-MM' month. */
export function monthRange(month) {
  const [y, m] = month.split('-').map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { start: `${month}-01`, end: `${month}-${pad(lastDay)}` };
}

/** 'YYYY-MM' shifted by `delta` months. */
export function shiftMonth(month, delta) {
  const [y, m] = month.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}`;
}

/** 'YYYY-MM-DD' shifted by `delta` days. */
export function shiftDate(date, delta) {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

/** Days from `start` to `end` inclusive. */
export function daysBetween(start, end) {
  const toMs = (s) => Date.UTC(...s.split('-').map((n, i) => Number(n) - (i === 1 ? 1 : 0)));
  return Math.round((toMs(end) - toMs(start)) / 86_400_000) + 1;
}

/** Reference dates the system prompt hands the model. */
export function calendarContext(timeZone, now = new Date()) {
  const today = localToday(timeZone, now);
  const thisMonth = today.slice(0, 7);
  const lastMonth = shiftMonth(thisMonth, -1);
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'long' }).format(now);
  return {
    today,
    weekday,
    thisMonth,
    lastMonth,
    thisYear: today.slice(0, 4),
    last7Days: { start: shiftDate(today, -6), end: today },
    last30Days: { start: shiftDate(today, -29), end: today },
  };
}
