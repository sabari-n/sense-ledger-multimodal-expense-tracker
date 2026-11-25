import { test } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { runTool, defineTool } from '../src/agent/tools/index.js';

/*
 * Tool logic with a fake context: no Postgres, no caches, a fixed "today". Each test checks
 * the SQL a tool builds and the values it binds, and how it shapes the rows it gets back.
 */

const CATEGORIES = [
  { id: 1, name: 'Food', transaction_type: 'expense', subcategories: ['Swiggy', 'Lunch'] },
  { id: 2, name: 'Household', transaction_type: 'expense', subcategories: ['Electricity'] },
  { id: 3, name: 'Salary', transaction_type: 'income', subcategories: ['Salary'] },
];
const ACCOUNTS = [
  { id: 10, name: 'Cash', account_type: 'cash', include_in_total: true },
  { id: 11, name: 'Union Bank', account_type: 'bank', include_in_total: true },
  { id: 12, name: 'Credit Card', account_type: 'credit_card', include_in_total: false },
];
const byName = (list) => async (where) =>
  list.find((x) => x.name.toLowerCase() === String(where?.name ?? where).toLowerCase()) || null;

/** A fake ToolContext. `rows` is what every SELECT returns, or a function (sql, values, n) → rows. */
function fakeCtx({ rows = [], totals = [], select } = {}) {
  const queries = [];
  const ctx = {
    db: {
      select: select || (async (sql, values) => {
        queries.push({ sql, values });
        return typeof rows === 'function' ? rows(sql, values, queries.length) : rows;
      }),
      accountTotals: async () => totals,
    },
    accounts: { findAll: async () => ACCOUNTS, findOne: byName(ACCOUNTS) },
    categories: { findAll: async () => CATEGORIES, findByName: byName(CATEGORIES) },
    today: '2026-11-25',
    timezone: 'Asia/Kolkata',
    currency: '₹',
  };
  return { ctx, queries };
}

// ─── sum_transactions ─────────────────────────────────────────────────────────

test('sum_transactions: month + category become a fixed WHERE with bound values', async () => {
  const { ctx, queries } = fakeCtx({ rows: [{ total: '21795.00', count: 29 }] });
  const out = await runTool('sum_transactions', { month: '2026-10', category: 'food' }, ctx);

  assert.equal(out.ok, true);
  assert.equal(out.result.total, 21795);
  assert.equal(out.result.transaction_count, 29);
  assert.equal(out.result.filters_applied.category, 'Food');
  assert.equal(queries.length, 1);
  assert.match(queries[0].sql, /e\.category_id = :categoryId/);
  assert.doesNotMatch(queries[0].sql, /subcategory|account_id = :accountId/);   // only filters that were given
  assert.doesNotMatch(queries[0].sql, /2026|Food/);                             // no values inside the SQL text
  assert.deepEqual(
    { ...queries[0].values, subcategory: undefined, accountId: undefined },
    { start: '2026-10-01', end: '2026-10-31', tz: 'Asia/Kolkata', type: 'expense', adjustment: 'adjustment',
      categoryId: 1, subcategory: undefined, accountId: undefined },
  );
});

test('sum_transactions: "since" a date runs to ctx.today', async () => {
  const { ctx, queries } = fakeCtx({ rows: [{ total: '12670', count: 8 }] });
  const out = await runTool('sum_transactions', { start_date: '2026-07-01', category: 'Household' }, ctx);
  assert.equal(out.ok, true);
  assert.equal(queries[0].values.start, '2026-07-01');
  assert.equal(queries[0].values.end, '2026-11-25');
});

test('sum_transactions: a category implies its type, and a subcategory finds its category', async () => {
  const salary = fakeCtx({ rows: [{ total: '85000', count: 1 }] });
  await runTool('sum_transactions', { period: 'last_month', category: 'Salary' }, salary.ctx);
  assert.equal(salary.queries[0].values.type, 'income');

  const swiggy = fakeCtx({ rows: [{ total: '1450', count: 4 }] });
  const out = await runTool('sum_transactions', { period: 'last_month', subcategory: 'swiggy' }, swiggy.ctx);
  assert.equal(out.result.filters_applied.category, 'Food');
  assert.equal(swiggy.queries[0].values.categoryId, 1);
  assert.equal(swiggy.queries[0].values.subcategory, 'Swiggy');
  assert.match(swiggy.queries[0].sql, /lower\(e\.subcategory\) = lower\(:subcategory\)/);
});

test('sum_transactions: group_by month adds a breakdown and fills empty months with 0', async () => {
  const rows = (sql, _v, n) => (n === 1 ? [{ total: '300', count: 2 }] : [{ key: '2026-10', total: '300', count: 2 }]);
  const { ctx, queries } = fakeCtx({ rows });
  const out = await runTool('sum_transactions', { start_date: '2026-08-01', group_by: 'month' }, ctx);

  assert.equal(queries.length, 2);
  assert.match(queries[1].sql, /to_char\(e\.date AT TIME ZONE :tz, 'YYYY-MM'\) AS key/);
  assert.match(queries[1].sql, /GROUP BY 1 ORDER BY 1/);
  assert.deepEqual(out.result.groups.map((g) => [g.month, g.total]), [
    ['2026-08', 0], ['2026-09', 0], ['2026-10', 300], ['2026-11', 0],
  ]);
});

test('sum_transactions: an unknown name is an error for the model, and no SQL runs', async () => {
  const { ctx, queries } = fakeCtx();
  const out = await runTool('sum_transactions', { month: '2026-10', category: "Food'; DROP TABLE expenses; --" }, ctx);
  assert.equal(out.ok, false);
  assert.match(out.error, /Unknown category .* Valid categories: Food, Household, Salary/);
  assert.equal(queries.length, 0);
});

// ─── list_transactions ────────────────────────────────────────────────────────

test('list_transactions: sort and limit come from a whitelist and a bound value', async () => {
  const rows = [
    { id: 1, date: '2026-10-03', amount: '18000.00', category: 'Rent', subcategory: 'Rent', account: 'Union Bank',
      to_account: null, description: 'House rent', total_matching: 57, total_amount_matching: '112404.00' },
  ];
  const { ctx, queries } = fakeCtx({ rows });
  const out = await runTool('list_transactions', { period: 'last_month', sort: 'amount', limit: '3' }, ctx);

  assert.equal(out.ok, true);
  assert.match(queries[0].sql, /ORDER BY e\.amount DESC, e\.date DESC/);
  assert.match(queries[0].sql, /LIMIT :limit/);
  assert.equal(queries[0].values.limit, 3);                       // "3" from the model coerced to a number
  assert.equal(out.result.sorted_by, 'amount, largest first');
  assert.equal(out.result.total_matching, 57);
  assert.equal(out.result.total_amount_matching, 112404);
  assert.deepEqual(out.result.transactions[0], {
    id: 1, date: '2026-10-03', amount: 18000, category: 'Rent', subcategory: 'Rent', account: 'Union Bank', description: 'House rent',
  });
});

test('list_transactions: defaults to newest first, 10 rows; empty results are well-formed', async () => {
  const { ctx, queries } = fakeCtx({ rows: [] });
  const out = await runTool('list_transactions', { month: '2026-10' }, ctx);
  assert.match(queries[0].sql, /ORDER BY e\.date DESC, e\.id DESC/);
  assert.equal(queries[0].values.limit, 10);
  assert.equal(out.result.total_matching, 0);
  assert.equal(out.result.total_amount_matching, 0);
  assert.deepEqual(out.result.transactions, []);
});

// ─── get_balances / list_categories ───────────────────────────────────────────

test('get_balances: lowest first, net balance only counts included accounts', async () => {
  const totals = [{ account_id: 10, balance: 3265 }, { account_id: 11, balance: 171530 }, { account_id: 12, balance: -13698 }];
  const { ctx } = fakeCtx({ totals });
  const all = await runTool('get_balances', {}, ctx);
  assert.deepEqual(all.result.accounts.map((a) => [a.account, a.balance]), [['Credit Card', -13698], ['Cash', 3265], ['Union Bank', 171530]]);
  assert.equal(all.result.net_balance, 174795);                    // Credit Card excluded
  assert.equal(all.result.as_of, '2026-11-25');

  const cash = await runTool('get_balances', { account: 'cash' }, ctx);
  assert.equal(cash.result.account, 'Cash');
  assert.equal(cash.result.balance, 3265);
  assert.equal(cash.result.id, undefined);                         // internal ids are not shown to the model
});

test('list_categories: names grouped by type, plus accounts', async () => {
  const { ctx } = fakeCtx();
  const out = await runTool('list_categories', {}, ctx);
  assert.deepEqual(out.result.expense_categories.map((c) => c.name), ['Food', 'Household']);
  assert.deepEqual(out.result.income_categories.map((c) => c.name), ['Salary']);
  assert.deepEqual(out.result.accounts, ['Cash', 'Union Bank', 'Credit Card']);
});

// ─── runTool / defineTool ─────────────────────────────────────────────────────

test('runTool: a database failure becomes a generic error, not a crash', async () => {
  const { ctx } = fakeCtx({ select: async () => { throw new Error('connection reset'); } });
  const out = await runTool('sum_transactions', { month: '2026-10' }, ctx);
  assert.equal(out.ok, false);
  assert.match(out.error, /internal error/);
  assert.doesNotMatch(out.error, /connection reset/);              // internals aren't leaked to the model
});

test('defineTool rejects tools that break the contract', () => {
  const ok = { name: 'get_thing', description: 'Gets the thing when the user asks for it.', schema: z.object({}).strict(), run: async () => ({}) };
  assert.doesNotThrow(() => defineTool(ok));
  assert.throws(() => defineTool({ ...ok, name: 'Get Thing' }), /snake_case/);
  assert.throws(() => defineTool({ ...ok, description: 'thing' }), /description/);
  assert.throws(() => defineTool({ ...ok, schema: z.object({}) }), /strict/);
  assert.throws(() => defineTool({ ...ok, schema: { type: 'object' } }), /Zod object/);
  assert.throws(() => defineTool({ ...ok, run: undefined }), /run must be a function/);
  assert.equal(Object.isFrozen(defineTool(ok)), true);
});
