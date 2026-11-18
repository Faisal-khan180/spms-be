const { verifyToken } = require('../utils/jwt');
const { errorResponse } = require('../utils/response');

/**
 * Verifies the Bearer token on the Authorization header and attaches
 * { id, role } to req.user. Does NOT hit the database on every request
 * (the token itself carries id + role) — controllers that need fresh
 * profile data query the DB explicitly, e.g. GET /api/auth/me.
 */
function protect(req, res, next) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    return errorResponse(res, 401, 'Not authorized — no token provided.');
  }

  const token = header.slice('Bearer '.length).trim();

  try {
    const decoded = verifyToken(token);
    req.user = { id: decoded.id, role: decoded.role };
    return next();
  } catch (err) {
    const message = err.name === 'TokenExpiredError'
      ? 'Session expired — please log in again.'
      : 'Not authorized — invalid token.';
    return errorResponse(res, 401, message);
  }
}

/**
 * Restricts a route to specific roles. Must run after `protect`, since
 * it depends on req.user being set.
 *
 * Usage: router.post('/drives', protect, authorize('company', 'admin'), createDrive)
 */
function authorize(...allowedRoles) {
  return function checkRole(req, res, next) {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return errorResponse(res, 403, 'You do not have permission to perform this action.');
    }
    return next();
  };
}

module.exports = { protect, authorize };
