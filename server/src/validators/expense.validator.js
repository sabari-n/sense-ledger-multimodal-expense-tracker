import { z } from 'zod';
import { optional, requiredString, positiveAmount, transactionDate } from './validate.js';
import { TRANSACTION_TYPES } from '../utils/enums.js';

const transactionType = optional(z.enum(Object.values(TRANSACTION_TYPES), {
  error: 'transaction_type must be expense, income, or transfer',
}));

// Names are resolved to known accounts/categories by the service (with alias matching),
// so here they only need to be strings. null/'' are allowed: "not set" / "clear".
const name = z.string().nullish();

export const createExpenseSchema = z.object({
  amount:           positiveAmount(),
  category:         requiredString('category'),
  subcategory:      name,
  transaction_type: transactionType,
  account:          name,
  to_account:       name,
  original_text:    name,
  date:             transactionDate,
});

// Every field optional: only the fields sent are changed.
export const updateExpenseSchema = z.object({
  amount:           optional(positiveAmount()),
  category:         name,
  subcategory:      name,
  transaction_type: transactionType,
  account:          name,
  to_account:       name,
  original_text:    name,
  date:             transactionDate,
});
