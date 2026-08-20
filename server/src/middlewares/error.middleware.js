import { logger } from '../config/logger.js';

/**
 * Central Express error handler.
 * Reads `err.statusCode`, `err.code`, and `err.message` from AppError instances.
 *
 * @type {import('express').ErrorRequestHandler}
 */
// eslint-disable-next-line no-unused-vars
export function errorMiddleware(err, req, res, next) {
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
