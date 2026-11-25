import { z } from 'zod';
import { TRANSACTION_TYPES } from '../../../utils/enums.js';
import { MONTH_RE, isValidDate } from '../../dates.js';
import { ToolInputError } from './errors.js';

/*
 * Argument schemas shared by the tools, plus the clean-up and error formatting every tool call
 * goes through before its own code runs.
 */

const dateArg = (what) => z.string()
  .refine(isValidDate, `${what} must be a real date written YYYY-MM-DD`)
  .describe(`${what}, YYYY-MM-DD (inclusive).`);

// Named periods, resolved against today's date in the app timezone. Small models pick a
// name far more reliably than they compute a range ("this year" became month "2026-01").
export const PERIODS = ['today', 'last_7_days', 'last_30_days', 'this_month', 'last_month', 'this_year', 'last_year'];

/** Period + filter arguments used by sum_transactions and list_transactions. */
export const filterShape = {
  period: z.enum(PERIODS)
    .describe('A named period relative to today. Use exactly one of: period, month, year, or start_date (+ optional end_date).')
    .optional(),
  month: z.string().regex(MONTH_RE, 'month must be written YYYY-MM, e.g. "2026-10"')
    .describe('A whole calendar month, YYYY-MM (e.g. "2026-10").')
    .optional(),
  year: z.string().regex(/^\d{4}$/, 'year must be written YYYY, e.g. "2025"')
    .describe('A whole calendar year, YYYY (e.g. "2025").')
    .optional(),
  start_date: dateArg('First day of the period. Alone (no end_date) the period runs to today, e.g. "since July" = start_date only').optional(),
  end_date: dateArg('Last day of the period; leave out to mean today').optional(),
  transaction_type: z.enum([TRANSACTION_TYPES.EXPENSE, TRANSACTION_TYPES.INCOME, TRANSACTION_TYPES.TRANSFER])
    .describe('"expense" = spending (the default), "income" = money received, "transfer" = money moved between own accounts.')
    .optional(),
  category: z.string().trim().min(1).max(100)
    .describe('Exact category name from list_categories, e.g. "Food". Leave out for all categories.')
    .optional(),
  subcategory: z.string().trim().min(1).max(100)
    .describe('Exact subcategory name from list_categories, e.g. "Swiggy".')
    .optional(),
  account: z.string().trim().min(1).max(100)
    .describe('Exact account name from list_categories or get_balances, e.g. "ICICI". Leave out for all accounts.')
    .optional(),
};

/**
 * Small models send `null`, `""` or "all" for arguments they mean to leave out, and sometimes
 * the whole argument object as a JSON string. Normalise that before validating.
 */
export function cleanArgs(raw) {
  let args = raw;
  if (typeof args === 'string') {
    try { args = JSON.parse(args || '{}'); } catch { throw new ToolInputError('Arguments must be a JSON object.'); }
  }
  if (args == null) return {};
  if (typeof args !== 'object' || Array.isArray(args)) throw new ToolInputError('Arguments must be a JSON object.');

  const out = {};
  for (const [key, value] of Object.entries(args)) {
    if (value === null || value === undefined) continue;
    if (typeof value === 'string') {
      const v = value.trim();
      if (v === '' || (['category', 'subcategory', 'account'].includes(key) && /^(all|any|none)$/i.test(v))) continue;
      out[key] = v;
    } else {
      out[key] = value;
    }
  }
  return out;
}

/** Turn a Zod failure into one message the model can act on. */
export function formatZodError(err, schema) {
  const allowed = Object.keys(schema.shape);
  const issues = err.issues.map((issue) => {
    if (issue.code === 'unrecognized_keys') {
      return `unsupported argument(s) ${issue.keys.join(', ')}; allowed: ${allowed.join(', ') || 'none'}`;
    }
    const where = issue.path.length ? issue.path.join('.') : 'arguments';
    return `${where}: ${issue.message}`;
  });
  return `Invalid arguments — ${issues.join('; ')}.`;
}
