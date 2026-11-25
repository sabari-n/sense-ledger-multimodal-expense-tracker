import { TRANSACTION_SOURCES } from '../../../utils/enums.js';

/*
 * SQL pieces shared by sum_transactions and list_transactions.
 *
 * The model never writes SQL. These fragments are fixed text; the only values that come from
 * the model's arguments arrive through `replacementsFor()` as placeholders (:start, :type…),
 * already validated and resolved by common/filters.js. Queries run on the agent's read-only
 * connection (agent/db.js).
 */

export const FROM_SQL = `
  FROM expenses e
  JOIN categories c ON c.id = e.category_id
  JOIN accounts   a ON a.id = e.account_id`;

/** Fixed WHERE clause built from resolved filters; only the filters that are set are added. */
export function whereSql(f) {
  const conditions = [
    'e.date >= (CAST(CAST(:start AS date) AS timestamp) AT TIME ZONE :tz)',
    'e.date <  (CAST(CAST(:end AS date) + 1 AS timestamp) AT TIME ZONE :tz)',
    'e.transaction_type = :type',
    'e.source <> :adjustment', // opening balances and balance edits are never spending or income
  ];
  if (f.categoryId) conditions.push('e.category_id = :categoryId');
  if (f.subcategory) conditions.push('lower(e.subcategory) = lower(:subcategory)');
  // For transfers an account can be the source or the destination.
  if (f.accountId) conditions.push('(e.account_id = :accountId OR e.to_account_id = :accountId)');
  return conditions.join(' AND ');
}

/** Values for the placeholders in `whereSql()` (plus any tool-specific extras, e.g. :limit). */
export function replacementsFor(f, ctx, extra = {}) {
  return {
    start: f.start,
    end: f.end,
    tz: ctx.timezone,
    type: f.type,
    adjustment: TRANSACTION_SOURCES.ADJUSTMENT,
    categoryId: f.categoryId,
    subcategory: f.subcategory,
    accountId: f.accountId,
    ...extra,
  };
}
