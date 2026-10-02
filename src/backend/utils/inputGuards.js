// Request values that end up in a MongoDB filter must be text. Express parses
// {"token": {"$ne": null}} (and ?status[$ne]=x) into an object, and an object in a filter is an
// operator, not a value: it can match every document instead of one. That is how
// updatePassword could be used to set another professor's password (CodeQL
// js/sql-injection, backlog CICD-24). Check the fields before they reach the database.

// The first of `fields` that is present in `source` but is not text, or undefined.
// A missing or null value is not "not text": the handlers already reject missing
// required fields, and optional ones may be absent.
function firstNonText(source, fields) {
  const values = source && typeof source === 'object' ? source : {};
  return fields.find((field) => values[field] !== undefined && values[field] !== null && typeof values[field] !== 'string');
}

// The value, if it is text, otherwise an empty string. Use it where a request value enters a
// database filter or update: the handlers already answer 400 to a non-text value, so this is
// the second layer, and an operator object can never become part of a query. It is a plain
// typeof conditional on purpose: CodeQL recognises that as a type check, but not one that is
// hidden inside another function such as firstNonText (which is why alerts stayed open).
function asText(value) {
  return typeof value === 'string' ? value : '';
}

function validationError(message) {
  const err = new Error(message);
  err.code = 'VALIDATION_ERROR';
  err.status = 400;
  return err;
}

// Text that is used as a search pattern is matched literally: "[" or "C++" must not be read as
// regular expression syntax (an invalid pattern is a 500, and a crafted one can burn database CPU).
function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = { asText, firstNonText, validationError, escapeRegex };
