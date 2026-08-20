import { AppError } from '../errors/AppError.js';
import { VALIDATION_ERROR } from '../errors/errorCodes.js';

/**
 * Generic middleware factory — runs `schemaFn(req.body)` and collects error strings.
 * Calls next(AppError) if any are found; otherwise calls next().
 *
 * @param {(body: object) => string[]} schemaFn
 * @returns {import('express').RequestHandler}
 */
function validate(schemaFn) {
  return (req, res, next) => {
    const errors = schemaFn(req.body);
    if (errors.length > 0) {
      return next(new AppError(errors.join('; '), VALIDATION_ERROR.status, VALIDATION_ERROR.code));
    }
    next();
  };
}

export const validateCreateExpense = validate((body) => {
  const errors = [];
  if (body.amount === undefined || body.amount === null || body.amount === '') {
    errors.push('amount is required');
  } else if (isNaN(Number(body.amount)) || Number(body.amount) <= 0) {
    errors.push('amount must be a positive number');
  }
  if (!body.category || typeof body.category !== 'string' || !body.category.trim()) {
    errors.push('category is required');
  }
  if (body.transaction_type && !['expense', 'income', 'transfer'].includes(body.transaction_type)) {
    errors.push('transaction_type must be expense, income, or transfer');
  }
  return errors;
});

export const validateUpdateExpense = validate((body) => {
  const errors = [];
  if (body.amount !== undefined && (isNaN(Number(body.amount)) || Number(body.amount) <= 0)) {
    errors.push('amount must be a positive number');
  }
  if (body.transaction_type && !['expense', 'income', 'transfer'].includes(body.transaction_type)) {
    errors.push('transaction_type must be expense, income, or transfer');
  }
  return errors;
});
