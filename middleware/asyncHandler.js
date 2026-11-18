/**
 * Wraps an async controller so a rejected promise (thrown error) is
 * forwarded to Express's error-handling middleware via next(err),
 * instead of crashing the process or requiring a try/catch in every
 * controller function.
 *
 * Usage: router.post('/login', asyncHandler(login));
 */
function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = asyncHandler;
