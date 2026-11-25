import { z } from 'zod';
import { defineTool } from './common/define-tool.js';
import { filterShape } from './common/args.js';
import { resolveAccount } from './common/filters.js';
import { round2 } from './common/format.js';

/**
 * get_balances — current balance of each account.
 *
 *   get_balances({})                 → every account, lowest first, plus the net balance
 *   get_balances({ account: "Cash" }) → just that account
 *
 * Balances come from ctx.db.accountTotals(): the same SQL the app uses
 * (expense.repository#getAccountTotals), on the agent's read-only connection.
 */
export const getBalances = defineTool({
  name: 'get_balances',

  description: 'Current balance of every account (bank, cash, card, wallet), lowest first, plus the net balance. ' +
    'Use for questions about how much money is in an account or which account is low.',

  schema: z.object({
    account: filterShape.account.describe('Only this account, e.g. "Cash". Leave out for every account.'),
  }).strict(),

  async run(args, ctx) {
    const only = args.account ? await resolveAccount(args.account, ctx) : null;
    const [accounts, totals] = await Promise.all([ctx.accounts.findAll(), ctx.db.accountTotals()]);
    const byId = new Map(totals.map((t) => [t.account_id, t.balance]));
    const rows = accounts
      .map((a) => ({
        id: a.id,
        account: a.name,
        type: a.account_type,
        balance: round2(byId.get(a.id) ?? 0),
        counted_in_net_balance: Boolean(a.include_in_total),
      }))
      .sort((x, y) => x.balance - y.balance);

    if (only) {
      const { id, ...row } = rows.find((r) => r.id === only.id);
      return { currency: ctx.currency, as_of: ctx.today, ...row };
    }
    return {
      currency: ctx.currency,
      as_of: ctx.today,
      accounts: rows.map(({ id, ...row }) => row),
      net_balance: round2(rows.filter((r) => r.counted_in_net_balance).reduce((s, r) => s + r.balance, 0)),
      note: 'Accounts are sorted from lowest to highest balance.',
    };
  },
});
