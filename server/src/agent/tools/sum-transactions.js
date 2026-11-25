import { z } from 'zod';
import { shiftMonth } from '../dates.js';
import { defineTool } from './common/define-tool.js';
import { filterShape } from './common/args.js';
import { resolveFilters } from './common/filters.js';
import { FROM_SQL, whereSql, replacementsFor } from './common/sql.js';
import { round2 } from './common/format.js';

/**
 * sum_transactions — totals for a period, optionally broken down.
 *
 *   sum_transactions({ month: "2026-10", category: "Food" })            → one total
 *   sum_transactions({ period: "this_year", group_by: "month" })        → total + one row per month
 *   sum_transactions({ start_date: "2026-07-01", group_by: "category" }) → total + one row per category
 *
 * Runs one query (ctx.db.select) for the overall total, and a second for the breakdown when group_by is set.
 */

const GROUP_BY = ['none', 'category', 'subcategory', 'account', 'month'];
const MAX_GROUPS = 40;

// Whitelisted GROUP BY expressions — the model picks a key, never the SQL.
const GROUP_SQL = {
  category: 'c.name',
  subcategory: "COALESCE(NULLIF(e.subcategory, ''), '(none)')",
  account: 'a.name',
  month: "to_char(e.date AT TIME ZONE :tz, 'YYYY-MM')",
};

export const sumTransactions = defineTool({
  name: 'sum_transactions',

  description: 'Total amount and count of transactions in a period, optionally filtered by type, category, subcategory ' +
    'or account, and optionally broken down with group_by. Use for every "how much", "total" or "sum" question. ' +
    'To compare periods, call it once per period or use group_by "month".',

  schema: z.object({
    ...filterShape,
    group_by: z.enum(GROUP_BY)
      .describe('Break the total down by category, subcategory, account or month. "none" (default) gives one total.')
      .optional(),
  }).strict(),

  async run(args, ctx) {
    const f = await resolveFilters(args, ctx);
    const groupBy = args.group_by || 'none';
    const where = whereSql(f);
    const replacements = replacementsFor(f, ctx);

    // 1. Overall total for the period and filters.
    const [totals] = await ctx.db.select(
      `SELECT COALESCE(SUM(e.amount), 0) AS total, COUNT(*)::int AS count ${FROM_SQL} WHERE ${where}`,
      replacements
    );

    const result = {
      currency: ctx.currency,
      filters_applied: f.applied,
      total: round2(totals.total),
      transaction_count: totals.count,
    };
    if (groupBy === 'none') return result;

    // 2. Breakdown: biggest first, or chronological for months.
    const rows = await ctx.db.select(
      `SELECT ${GROUP_SQL[groupBy]} AS key, SUM(e.amount) AS total, COUNT(*)::int AS count
       ${FROM_SQL} WHERE ${where}
       GROUP BY 1 ORDER BY ${groupBy === 'month' ? '1' : '2 DESC'} LIMIT ${MAX_GROUPS}`,
      replacements
    );
    let groups = rows.map((r) => ({ [groupBy]: r.key, total: round2(r.total), count: r.count }));

    // Show empty months as 0 so period comparisons don't silently skip a month.
    if (groupBy === 'month') {
      const found = new Map(groups.map((g) => [g.month, g]));
      groups = [];
      for (let m = f.start.slice(0, 7); m <= f.end.slice(0, 7) && groups.length < MAX_GROUPS; m = shiftMonth(m, 1)) {
        groups.push(found.get(m) || { month: m, total: 0, count: 0 });
      }
    }
    return { ...result, group_by: groupBy, groups };
  },
});
