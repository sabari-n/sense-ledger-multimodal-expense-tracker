import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localToday, isValidDate, monthRange, shiftMonth, shiftDate, daysBetween, calendarContext } from '../src/agent/dates.js';

test('localToday uses the given timezone, not UTC', () => {
  // 20:00 UTC on 31 Oct is already 1 Nov in India.
  const now = new Date('2026-10-31T20:00:00Z');
  assert.equal(localToday('UTC', now), '2026-10-31');
  assert.equal(localToday('Asia/Kolkata', now), '2026-11-01');
});

test('isValidDate rejects impossible dates and bad formats', () => {
  assert.equal(isValidDate('2026-02-28'), true);
  assert.equal(isValidDate('2028-02-29'), true);
  assert.equal(isValidDate('2026-02-29'), false);
  assert.equal(isValidDate('2026-13-01'), false);
  assert.equal(isValidDate('2026-1-01'), false);
  assert.equal(isValidDate('yesterday'), false);
});

test('monthRange returns first and last day', () => {
  assert.deepEqual(monthRange('2026-02'), { start: '2026-02-01', end: '2026-02-28' });
  assert.deepEqual(monthRange('2028-02'), { start: '2028-02-01', end: '2028-02-29' });
  assert.deepEqual(monthRange('2026-12'), { start: '2026-12-01', end: '2026-12-31' });
});

test('shiftMonth and shiftDate cross year boundaries', () => {
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
  assert.equal(shiftMonth('2026-12', 1), '2027-01');
  assert.equal(shiftDate('2026-03-01', -1), '2026-02-28');
  assert.equal(shiftDate('2026-12-31', 1), '2027-01-01');
});

test('daysBetween is inclusive', () => {
  assert.equal(daysBetween('2026-10-01', '2026-10-31'), 31);
  assert.equal(daysBetween('2026-10-05', '2026-10-05'), 1);
});

test('calendarContext gives this/last month and rolling ranges', () => {
  const cal = calendarContext('Asia/Kolkata', new Date('2026-01-10T06:00:00Z'));
  assert.equal(cal.today, '2026-01-10');
  assert.equal(cal.thisMonth, '2026-01');
  assert.equal(cal.lastMonth, '2025-12');
  assert.equal(cal.weekday, 'Saturday');
  assert.deepEqual(cal.last7Days, { start: '2026-01-04', end: '2026-01-10' });
});
