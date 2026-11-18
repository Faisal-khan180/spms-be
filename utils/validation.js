// Small, dependency-free validation helpers shared across controllers.
// express-validator handles per-route schema validation; these cover
// the plain business-rule checks called directly from services
// (e.g. eligibilityService) as well as controllers.

function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidCGPA(value) {
  const num = Number(value);
  return !Number.isNaN(num) && num >= 0 && num <= 10;
}

function isValidPercentage(value) {
  const num = Number(value);
  return !Number.isNaN(num) && num >= 0 && num <= 100;
}

function isNonNegativeInteger(value) {
  const num = Number(value);
  return Number.isInteger(num) && num >= 0;
}

function isValidPassingYear(value) {
  const num = Number(value);
  const currentYear = new Date().getFullYear();
  return Number.isInteger(num) && num >= currentYear - 10 && num <= currentYear + 10;
}

function isValidPassword(value) {
  // Kept intentionally simple for now (length only) — complexity rules
  // (uppercase/number/symbol) can be tightened later without touching
  // callers, since they all go through this one function.
  return typeof value === 'string' && value.length >= 8;
}

module.exports = {
  isValidEmail,
  isValidCGPA,
  isValidPercentage,
  isNonNegativeInteger,
  isValidPassingYear,
  isValidPassword
};
