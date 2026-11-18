const { errorResponse } = require('../utils/response');

// Catches any request that didn't match a route.
function notFound(req, res, next) {
  res.status(404);
  next(new Error(`Route not found - ${req.originalUrl}`));
}

// Centralized error handler
function errorHandler(err, req, res, next) {
  const statusCode = res.statusCode && res.statusCode !== 200 ? res.statusCode : 500;

  if (statusCode >= 500) {
    console.error('Request failed with a server error.', {
      method: req.method,
      path: req.originalUrl,
      code: err.code,
      message: err.message,
      stack: err.stack
    });
  }

  const message = statusCode >= 500
    ? 'Internal Server Error'
    : err.message;

  return errorResponse(res, statusCode, message);
}

module.exports = { notFound, errorHandler };
