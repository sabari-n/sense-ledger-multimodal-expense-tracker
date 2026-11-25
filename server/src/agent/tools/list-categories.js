import { z } from 'zod';
import { TRANSACTION_TYPES } from '../../utils/enums.js';
import { defineTool } from './common/define-tool.js';

/**
 * list_categories — the valid category, subcategory and account names.
 *
 *   list_categories({}) → { expense_categories: [...], income_categories: [...], accounts: [...] }
 *
 * Lets the model look up an exact name before filtering, instead of guessing. Reads the
 * in-memory caches (ctx.categories, ctx.accounts); no SQL.
 */
export const listCategories = defineTool({
  name: 'list_categories',

  description: 'The valid category, subcategory and account names. Call this when unsure of an exact name before filtering.',

  schema: z.object({}).strict(),

  async run(_args, ctx) {
    const [categories, accounts] = await Promise.all([ctx.categories.findAll(), ctx.accounts.findAll()]);
    const byType = (type) => categories
      .filter((c) => c.transaction_type === type)
      .map((c) => ({ name: c.name, subcategories: c.subcategories || [] }));
    return {
      expense_categories: byType(TRANSACTION_TYPES.EXPENSE),
      income_categories: byType(TRANSACTION_TYPES.INCOME),
      accounts: accounts.map((a) => a.name),
    };
  },
});
