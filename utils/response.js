/**
 * Consistent success envelope used by every controller.
 * { success: true, message, data }
 */
function successResponse(res, statusCode, message, data = {}) {
  return res.status(statusCode).json({
    success: true,
    message,
    data
  });
}

/**
 * Consistent error envelope used by every controller and by the
 * centralized error handler in middleware/errorMiddleware.js.
 * { success: false, message }
 */
function errorResponse(res, statusCode, message) {
  return res.status(statusCode).json({
    success: false,
    message
  });
}

module.exports = { successResponse, errorResponse };
