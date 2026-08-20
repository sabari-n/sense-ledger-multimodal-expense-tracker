export class AppError extends Error {
  /**
   * @param {string} message   Human-readable description
   * @param {number} statusCode HTTP status code (default 500)
   * @param {string} code      Machine-readable error code string
   */
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR') {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

export default AppError;
