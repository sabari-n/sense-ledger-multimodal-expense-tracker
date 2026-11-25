import { env } from '../../../config/env.js';
import * as accountRepo from '../../../repositories/account.repository.js';
import * as categoryRepo from '../../../repositories/category.repository.js';
import { getAccountTotals } from '../../../repositories/expense.repository.js';
import { readOnlyDb, agentSelect } from '../../db.js';
import { localToday } from '../../dates.js';

/**
 * Everything a tool may use, passed in as `run(args, ctx)` instead of imported.
 *
 * This is the only place the tools are wired to the real database, caches and config, so
 * tests can hand a tool a fake context and check exactly which SQL and values it produces —
 * without Postgres — and pin "today" so date logic is deterministic.
 *
 * @typedef {object} ToolContext
 * @property {{ select: (sql: string, replacements?: object) => Promise<object[]>,
 *              accountTotals: () => Promise<{account_id:number, balance:number}[]> }} db  read-only
 * @property {{ findAll: () => Promise<object[]>, findOne: (where: object) => Promise<object|null> }} accounts
 * @property {{ findAll: () => Promise<object[]>, findByName: (name: string) => Promise<object|null> }} categories
 * @property {string} today     'YYYY-MM-DD' in the app timezone
 * @property {string} timezone  IANA zone, e.g. 'Asia/Kolkata'
 * @property {string} currency  e.g. '₹'
 */

/** @returns {ToolContext} */
export function createToolContext({ now = new Date() } = {}) {
  return {
    db: {
      select: agentSelect,
      accountTotals: () => getAccountTotals({ connection: readOnlyDb }),
    },
    accounts: { findAll: accountRepo.findAll, findOne: accountRepo.findOne },
    categories: { findAll: categoryRepo.findAll, findByName: categoryRepo.findByName },
    today: localToday(env.timezone, now),
    timezone: env.timezone,
    currency: env.defaults.currencySymbol,
  };
}
