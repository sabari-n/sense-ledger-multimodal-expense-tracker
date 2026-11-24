import { z } from 'zod';
import { AppError } from '../errors/AppError.js';
import { VALIDATION_ERROR } from '../errors/errorCodes.js';

/**
 * Express middleware that validates a request against Zod schemas.
 *
 *   router.put('/:id', validate({ params: idParams, body: updateExpenseSchema }), handler)
 *
 * On success the parsed values replace req.body / req.params / req.query, so handlers get
 * coerced types (e.g. numeric strings → numbers) and unknown body keys are dropped.
 * On failure it responds 400 VALIDATION_ERROR with every issue joined by "; ".
 *
 * @param {{ body?: z.ZodType, params?: z.ZodType, query?: z.ZodType }} schemas
 * @returns {import('express').RequestHandler}
 */
export function validate(schemas) {
  return (req, res, next) => {
    const messages = [];
    for (const part of ['params', 'query', 'body']) {
      const schema = schemas[part];
      if (!schema) continue;
      const result = schema.safeParse(req[part] ?? {});
      if (result.success) {
        req[part] = result.data;
      } else {
        messages.push(...result.error.issues.map((issue) => issue.message));
      }
    }
    if (messages.length > 0) {
      return next(new AppError([...new Set(messages)].join('; '), VALIDATION_ERROR.status, VALIDATION_ERROR.code));
    }
    next();
  };
}

// ─── Reusable field schemas ───────────────────────────────────────────────────

const isBlank = (v) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');

/** Numeric strings from form inputs ("250.50") become numbers; anything else is left for Zod to reject. */
const toNumber = (v) => (typeof v === 'string' && v.trim() !== '' ? Number(v) : v);

/** Treat '' and null as "not provided" (forms send empty strings for untouched fields). */
export const optional = (schema) => z.preprocess((v) => (isBlank(v) ? undefined : v), schema.optional());

/** A required, non-blank string. */
export const requiredString = (field) =>
  z.string({ error: `${field} is required` }).refine((s) => s.trim().length > 0, `${field} is required`);

/** A positive amount; accepts numbers or numeric strings and outputs a number. */
export const positiveAmount = (field = 'amount') => z.preprocess(
  toNumber,
  z.number({ error: (issue) => (isBlank(issue.input) ? `${field} is required` : `${field} must be a positive number`) })
    .positive(`${field} must be a positive number`)
);

/** Any finite number (e.g. a balance, which may be negative); accepts numeric strings. */
export const finiteNumber = (field) => z.preprocess(toNumber, z.number({ error: `${field} must be a number` }));

/** Transaction date: must parse, and can't be more than a day in the future (timezone slack). Kept as sent. */
export const transactionDate = optional(
  z.union([z.string(), z.number()], { error: 'date must be a valid date' })
    .refine((d) => !isNaN(new Date(d).getTime()), { error: 'date must be a valid date', abort: true })
    .refine((d) => new Date(d).getTime() <= Date.now() + 24 * 60 * 60 * 1000, 'date cannot be in the future')
);

/** `:id` route parameter. */
export const idParams = z.object({
  id: z.coerce.number({ error: 'id must be a positive integer' }).int('id must be a positive integer').positive('id must be a positive integer'),
});
