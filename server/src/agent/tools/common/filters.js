import { matchAccountAlias } from '../../../utils/heuristics.js';
import { TRANSACTION_TYPES } from '../../../utils/enums.js';
import { monthRange, shiftMonth, shiftDate, daysBetween } from '../../dates.js';
import { ToolInputError } from './errors.js';

/*
 * Filter resolution: turn the model's validated arguments into concrete values the SQL can use.
 *   names  → ids         ("Food" → category 1; unknown names are an error listing valid ones)
 *   period → dates       ("last_month" → 2026-10-01 … 2026-10-31, in the app timezone)
 *
 * Lookups go through the tool context (`ctx.accounts`, `ctx.categories`, `ctx.today`), so tests
 * can supply fakes.
 */

export async function resolveAccount(name, ctx) {
  const direct = await ctx.accounts.findOne({ name });
  if (direct) return direct;
  const alias = matchAccountAlias(name.toLowerCase());
  const viaAlias = alias ? await ctx.accounts.findOne({ name: alias }) : null;
  if (viaAlias) return viaAlias;
  const names = (await ctx.accounts.findAll()).map((a) => a.name);
  throw new ToolInputError(`Unknown account "${name}". Valid accounts: ${names.join(', ')}.`);
}

async function resolveCategory(name, ctx) {
  const cat = await ctx.categories.findByName(name);
  if (cat) return cat;
  const names = (await ctx.categories.findAll()).map((c) => c.name);
  throw new ToolInputError(`Unknown category "${name}". Valid categories: ${names.join(', ')}.`);
}

function findSubcategory(category, name) {
  return (category.subcategories || []).find((s) => s.toLowerCase() === name.toLowerCase()) || null;
}

/** A named period (see PERIODS) as an inclusive date range, relative to `today`. */
export function periodRange(period, today) {
  const year = Number(today.slice(0, 4));
  switch (period) {
    case 'today': return { start: today, end: today };
    case 'last_7_days': return { start: shiftDate(today, -6), end: today };
    case 'last_30_days': return { start: shiftDate(today, -29), end: today };
    case 'this_month': return { start: monthRange(today.slice(0, 7)).start, end: today };
    case 'last_month': return monthRange(shiftMonth(today.slice(0, 7), -1));
    case 'this_year': return { start: `${year}-01-01`, end: today };
    case 'last_year': return { start: `${year - 1}-01-01`, end: `${year - 1}-12-31` };
    default: throw new ToolInputError(`Unknown period "${period}".`);
  }
}

const MAX_RANGE_DAYS = 5 * 366;

/**
 * Turn validated arguments into concrete SQL inputs. Also returns `applied`: the filters
 * actually used, echoed in every result so the model (and the user, in the trace) can see
 * exactly what was counted — e.g. that a default of transaction_type=expense was applied.
 */
export async function resolveFilters(args, ctx) {
  const { today } = ctx;
  const ways = [args.period, args.month, args.year, args.start_date || args.end_date].filter(Boolean).length;
  if (ways === 0) {
    throw new ToolInputError('A period is required: pass period (e.g. "this_year"), month (YYYY-MM), year (YYYY), ' +
      'or start_date (YYYY-MM-DD) with an optional end_date.');
  }
  if (ways > 1) {
    throw new ToolInputError('Give only one of: period, month, year, or start_date (+ optional end_date). ' +
      'For "since <date>" pass only start_date; the period then runs to today.');
  }

  let start;
  let end;
  if (args.period) {
    ({ start, end } = periodRange(args.period, today));
  } else if (args.month) {
    ({ start, end } = monthRange(args.month));
  } else if (args.year) {
    start = `${args.year}-01-01`;
    end = `${args.year}-12-31`;
  } else if (args.start_date) {
    // Open-ended ranges ("since July") run to today.
    start = args.start_date;
    end = args.end_date || today;
  } else {
    throw new ToolInputError('end_date needs a start_date too. For "until <date>" questions, give the start of the period as well.');
  }
  if (start > end) throw new ToolInputError(`start_date ${start} is after end_date ${end}.`);
  if (daysBetween(start, end) > MAX_RANGE_DAYS) throw new ToolInputError('The period can be at most 5 years.');
  if (start > today) throw new ToolInputError(`The period starts after today (${today}); there is no data for the future.`);

  let category = null;
  let subcategory = null;
  if (args.category) category = await resolveCategory(args.category, ctx);
  if (args.subcategory) {
    if (category) {
      subcategory = findSubcategory(category, args.subcategory);
      if (!subcategory) {
        throw new ToolInputError(`"${args.subcategory}" is not a subcategory of ${category.name}. ` +
          `Its subcategories: ${(category.subcategories || []).join(', ') || 'none'}.`);
      }
    } else {
      // No category given: find the one category that owns this subcategory.
      const owners = (await ctx.categories.findAll()).filter((c) => findSubcategory(c, args.subcategory));
      if (owners.length !== 1) {
        throw new ToolInputError(owners.length
          ? `Subcategory "${args.subcategory}" exists in several categories (${owners.map((c) => c.name).join(', ')}); pass category too.`
          : `Unknown subcategory "${args.subcategory}". Call list_categories to see valid names.`);
      }
      category = owners[0];
      subcategory = findSubcategory(category, args.subcategory);
    }
  }

  // A category implies its type ("Salary" is income) unless the model said otherwise.
  const type = args.transaction_type || category?.transaction_type || TRANSACTION_TYPES.EXPENSE;
  const account = args.account ? await resolveAccount(args.account, ctx) : null;

  return {
    start,
    end,
    type,
    categoryId: category?.id ?? null,
    subcategory,
    accountId: account?.id ?? null,
    applied: {
      period: { start_date: start, end_date: end },
      transaction_type: type,
      ...(category ? { category: category.name } : {}),
      ...(subcategory ? { subcategory } : {}),
      ...(account ? { account: account.name } : {}),
      excludes: 'balance adjustments and opening balances',
    },
  };
}
