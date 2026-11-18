const { errorResponse } = require('../utils/response');

// Catches any request that didn't match a route.
function notFound(req, res, next) {
  res.status(404);
  next(new Error(`Route not found - ${req.originalUrl}`));
}

// Centralized error handler
function errorHandler(err, req, res, next) {
  const statusCode = res.statusCode && res.statusCode !== 200 ? res.statusCode : 500;

  // Only log stack traces for actual server errors (500), not routine 404s
  if (statusCode >= 500 && process.env.NODE_ENV !== 'production') {
    console.error(err.stack);
  }

  const message = statusCode === 500 && process.env.NODE_ENV === 'production'
    ? 'Internal Server Error'
    : err.message;

  return errorResponse(res, statusCode, message);
}

module.exports = { notFound, errorHandler };
