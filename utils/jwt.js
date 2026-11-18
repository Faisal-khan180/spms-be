const jwt = require('jsonwebtoken');

/**
 * Signs a JWT for a user. Payload is intentionally minimal (id + role
 * only) — anything else (name, email) should be re-fetched from the DB
 * when needed rather than trusted from an old token, since profile data
 * can change after the token was issued.
 */
function generateToken(payload) {
  if (!process.env.JWT_SECRET) {
    // Fails loudly at request time rather than silently signing with
    // `undefined`, which would produce tokens that look valid but can
    // never be verified correctly.
    throw new Error('JWT_SECRET is not configured on the server.');
  }
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  });
}

function verifyToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}

module.exports = { generateToken, verifyToken };
