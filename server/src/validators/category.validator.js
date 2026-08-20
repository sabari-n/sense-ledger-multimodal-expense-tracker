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

export const validateCreateCategory = validate((body) => {
  const errors = [];
  if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
    errors.push('name is required');
  }
  if (body.transaction_type && !['expense', 'income'].includes(body.transaction_type)) {
    errors.push('transaction_type must be expense or income');
  }
  if (body.subcategories !== undefined && !Array.isArray(body.subcategories)) {
    errors.push('subcategories must be an array');
  }
  return errors;
});

export const validateUpdateCategory = validate((body) => {
  const errors = [];
  if (body.subcategories !== undefined && !Array.isArray(body.subcategories)) {
    errors.push('subcategories must be an array');
  }
  return errors;
});
