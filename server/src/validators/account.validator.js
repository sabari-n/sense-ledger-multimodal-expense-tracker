import { z } from 'zod';
import { optional, requiredString, positiveAmount, finiteNumber, transactionDate } from './validate.js';

const accountFields = {
  account_type:     optional(z.string()),
  // A balance (may be negative). Setting it records an adjustment transaction.
  balance:          optional(finiteNumber('balance')),
  icon:             optional(z.string()),
  color:            optional(z.string()),
  include_in_total: z.boolean({ error: 'include_in_total must be true or false' }).optional(),
};

export const createAccountSchema = z.object({
  name: requiredString('name'),
  ...accountFields,
});

// Omitted fields keep their current value.
export const updateAccountSchema = z.object({
  name: optional(requiredString('name')),
  ...accountFields,
});

export const transferSchema = z.object({
  from_account: requiredString('from_account'),
  to_account:   requiredString('to_account'),
  amount:       positiveAmount(),
  description:  z.string().nullish(),
  date:         transactionDate,
});
