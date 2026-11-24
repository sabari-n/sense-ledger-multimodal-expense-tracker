import { ForeignKeyConstraintError, DatabaseError } from 'sequelize';
import { logger } from '../config/logger.js';
import { AppError } from '../errors/AppError.js';

/**
 * Turn database constraint violations into client errors instead of 500s:
 * a category/account still used by transactions, or a row breaking a CHECK constraint.
 */
function fromDatabaseError(err) {
  if (err instanceof ForeignKeyConstraintError) {
    return new AppError('This record is still used by transactions, so it cannot be removed.', 409, 'IN_USE');
  }
  if (err instanceof DatabaseError && err.parent?.code === '23514') {
    return new AppError(`Invalid transaction data (${err.parent.constraint}).`, 400, 'VALIDATION_ERROR');
  }
  return err;
}

/**
 * Central Express error handler.
 * Reads `err.statusCode`, `err.code`, and `err.message` from AppError instances.
 *
 * @type {import('express').ErrorRequestHandler}
 */
// eslint-disable-next-line no-unused-vars
export function errorMiddleware(err, req, res, next) {
  err = fromDatabaseError(err);
  const statusCode = err.statusCode || 500;
  const code = err.code || 'INTERNAL_ERROR';
  const message = err.message || 'Internal Server Error';

  if (!err.isOperational) {
    // Unexpected error — log the full stack
    logger.error(`[${code}] ${message}`, err.stack);
  } else {
    logger.warn(`[${code}] ${message}`);
  }

  return res.status(statusCode).json({ success: false, code, error: message });
}

export default errorMiddleware;
