import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanArgs, runTool, resolveFilters, periodRange, TOOL_DEFINITIONS, ToolInputError } from '../src/agent/tools/index.js';

// These cases fail validation before any database access, so no DB is needed.

test('every tool definition has a JSON-schema object for parameters', () => {
  const names = TOOL_DEFINITIONS.map((t) => t.function.name);
  assert.deepEqual(names, ['get_balances', 'list_categories', 'sum_transactions', 'list_transactions']);
  for (const t of TOOL_DEFINITIONS) {
    assert.equal(t.type, 'function');
    assert.equal(t.function.parameters.type, 'object');
    assert.ok(t.function.description.length > 20);
  }
  const sum = TOOL_DEFINITIONS.find((t) => t.function.name === 'sum_transactions').function.parameters;
  assert.deepEqual(sum.properties.group_by.enum, ['none', 'category', 'subcategory', 'account', 'month']);
  assert.match(sum.properties.month.description, /YYYY-MM/);
});

test('cleanArgs drops null, blank and "all" filters and parses JSON strings', () => {
  assert.deepEqual(cleanArgs({ month: '2026-10', category: null, account: '', subcategory: 'All' }), { month: '2026-10' });
  assert.deepEqual(cleanArgs('{"month":"2026-10"}'), { month: '2026-10' });
  assert.deepEqual(cleanArgs(undefined), {});
  assert.throws(() => cleanArgs('not json'), ToolInputError);
  assert.throws(() => cleanArgs([1]), ToolInputError);
});

test('unknown tool names are reported back to the model', async () => {
  const out = await runTool('drop_tables', {});
  assert.equal(out.ok, false);
  assert.match(out.error, /Unknown tool "drop_tables"/);
  assert.match(out.error, /sum_transactions/);
});

test('unsupported arguments are rejected, not silently ignored', async () => {
  const out = await runTool('sum_transactions', { month: '2026-10', merchant: 'Swiggy' });
  assert.equal(out.ok, false);
  assert.match(out.error, /unsupported argument\(s\) merchant/);
});

test('malformed values explain the expected format', async () => {
  const bad = await runTool('sum_transactions', { month: 'October' });
  assert.equal(bad.ok, false);
  assert.match(bad.error, /month must be written YYYY-MM/);

  const sqlish = await runTool('list_transactions', { month: '2026-10', sort: 'amount; DROP TABLE expenses' });
  assert.equal(sqlish.ok, false);
  assert.match(sqlish.error, /sort/);

  const tooMany = await runTool('list_transactions', { month: '2026-10', limit: 500 });
  assert.equal(tooMany.ok, false);
  assert.match(tooMany.error, /limit/);
});

test('resolveFilters requires a sensible period', async () => {
  const today = '2026-11-24';
  await assert.rejects(resolveFilters({}, { today }), /A period is required/);
  await assert.rejects(resolveFilters({ end_date: '2026-10-01' }, { today }), /needs a start_date/);
  await assert.rejects(resolveFilters({ month: '2026-10', start_date: '2026-10-01', end_date: '2026-10-31' }, { today }), /only one of/);
  await assert.rejects(resolveFilters({ period: 'this_year', month: '2026-01' }, { today }), /only one of/);
  await assert.rejects(resolveFilters({ start_date: '2026-10-31', end_date: '2026-10-01' }, { today }), /is after/);
  await assert.rejects(resolveFilters({ start_date: '2015-01-01', end_date: '2026-10-01' }, { today }), /at most 5 years/);
  await assert.rejects(resolveFilters({ month: '2027-01' }, { today }), /future/);
});

test('named periods resolve against today', () => {
  const today = '2026-03-15';
  assert.deepEqual(periodRange('today', today), { start: '2026-03-15', end: '2026-03-15' });
  assert.deepEqual(periodRange('last_7_days', today), { start: '2026-03-09', end: '2026-03-15' });
  assert.deepEqual(periodRange('this_month', today), { start: '2026-03-01', end: '2026-03-15' });
  assert.deepEqual(periodRange('last_month', today), { start: '2026-02-01', end: '2026-02-28' });
  assert.deepEqual(periodRange('this_year', today), { start: '2026-01-01', end: '2026-03-15' });
  assert.deepEqual(periodRange('last_year', today), { start: '2025-01-01', end: '2025-12-31' });
});

test('start_date alone runs to today ("since July")', async () => {
  const f = await resolveFilters({ start_date: '2026-07-01' }, { today: '2026-11-25' });
  assert.equal(f.start, '2026-07-01');
  assert.equal(f.end, '2026-11-25');
  await assert.rejects(resolveFilters({ start_date: '2026-07-01', period: 'this_year' }, { today: '2026-11-25' }), /pass only start_date/);
});

test('year resolves to the whole calendar year', async () => {
  const f = await resolveFilters({ year: '2025' }, { today: '2026-11-24' });
  assert.equal(f.start, '2025-01-01');
  assert.equal(f.end, '2025-12-31');
});

test('resolveFilters turns a month into an inclusive range and defaults to expenses', async () => {
  const f = await resolveFilters({ month: '2026-02' }, { today: '2026-11-24' });
  assert.equal(f.start, '2026-02-01');
  assert.equal(f.end, '2026-02-28');
  assert.equal(f.type, 'expense');
  assert.deepEqual(f.applied.period, { start_date: '2026-02-01', end_date: '2026-02-28' });
});
