/**
 * Send a successful JSON response.
 *
 * @param {import('express').Response} res
 * @param {*}      data     Payload to include under the `data` key
 * @param {string} [message]
 * @param {number} [status=200]
 */
export function successResponse(res, data, message = 'Success', status = 200) {
  return res.status(status).json({ success: true, message, data });
}

/**
 * Send an error JSON response.
 *
 * @param {import('express').Response} res
 * @param {string} message
 * @param {number} [status=500]
 */
export function errorResponse(res, message, status = 500) {
  return res.status(status).json({ success: false, error: message });
}
