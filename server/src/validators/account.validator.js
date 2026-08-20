import { AppError } from '../errors/AppError.js';
import { VALIDATION_ERROR } from '../errors/errorCodes.js';

function validate(schemaFn) {
  return (req, res, next) => {
    const errors = schemaFn(req.body);
    if (errors.length > 0) {
      return next(new AppError(errors.join('; '), VALIDATION_ERROR.status, VALIDATION_ERROR.code));
    }
    next();
  };
}

export const validateCreateAccount = validate((body) => {
  const errors = [];
  if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
    errors.push('name is required');
  }
  if (body.balance !== undefined && isNaN(Number(body.balance))) {
    errors.push('balance must be a number');
  }
  return errors;
});

export const validateUpdateAccount = validate((body) => {
  const errors = [];
  if (body.balance !== undefined && isNaN(Number(body.balance))) {
    errors.push('balance must be a number');
  }
  return errors;
});

export const validateTransfer = validate((body) => {
  const errors = [];
  if (!body.from_account || typeof body.from_account !== 'string' || !body.from_account.trim()) {
    errors.push('from_account is required');
  }
  if (!body.to_account || typeof body.to_account !== 'string' || !body.to_account.trim()) {
    errors.push('to_account is required');
  }
  if (body.amount === undefined || body.amount === null || body.amount === '') {
    errors.push('amount is required');
  } else if (isNaN(Number(body.amount)) || Number(body.amount) <= 0) {
    errors.push('amount must be a positive number');
  }
  return errors;
});
