import { z } from 'zod';
import { optional, requiredString } from './validate.js';

const subcategories = z.array(z.string({ error: 'subcategories must be strings' }), {
  error: 'subcategories must be an array',
}).optional();

export const createCategorySchema = z.object({
  name:             requiredString('name'),
  emoji:            optional(z.string()),
  // Transfers use the built-in Transfer category, so custom ones are expense or income.
  transaction_type: optional(z.enum(['expense', 'income'], { error: 'transaction_type must be expense or income' })),
  subcategories,
});

export const updateCategorySchema = z.object({
  name:          optional(requiredString('name')),
  emoji:         optional(z.string()),
  subcategories,
});

export const categoryListQuery = z.object({
  type: optional(z.enum(['expense', 'income', 'transfer'], { error: 'type must be expense, income, or transfer' })),
});
