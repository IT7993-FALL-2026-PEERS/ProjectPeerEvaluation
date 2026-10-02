const test = require('node:test');
const assert = require('node:assert/strict');
const { asText, firstNonText, escapeRegex } = require('../utils/inputGuards');

// asText is applied to a request value at the exact point where it enters a database query
// (CICD-24). The handlers already reject non-text values with a 400; this is the second
// layer, so that even if a check were ever skipped an operator object could not reach the
// filter, and so that CodeQL can see that the value is text there. It is a plain
// `typeof ... ? value : ''` conditional on purpose: CodeQL recognises that, but not a
// check hidden inside another function such as firstNonText.

test('TC-SEC-10: asText returns text unchanged', () => {
  assert.equal(asText('alice@example.com'), 'alice@example.com');
  assert.equal(asText(''), '');
  assert.equal(asText('  padded  '), '  padded  ');
});

test('TC-SEC-11: asText turns anything that is not text into an empty string, never an object', () => {
  for (const value of [{ $ne: null }, { $gt: '' }, ['a'], 42, true, null, undefined, () => 'x', Symbol('s')]) {
    assert.equal(asText(value), '', String(typeof value));
  }
});

test('TC-SEC-12: an operator object cannot survive asText into a filter', () => {
  const filter = { email: asText({ $ne: null }) };
  assert.deepEqual(filter, { email: '' });
  assert.equal(typeof filter.email, 'string');
});

test('firstNonText still names the first field that is present but not text', () => {
  assert.equal(firstNonText({ a: 'x', b: { $ne: null }, c: 3 }, ['a', 'b', 'c']), 'b');
  assert.equal(firstNonText({ a: 'x' }, ['a', 'b']), undefined, 'a missing value is not "not text"');
  assert.equal(firstNonText({ a: null }, ['a']), undefined, 'null counts as missing');
  assert.equal(firstNonText(undefined, ['a']), undefined);
});

test('escapeRegex makes pattern characters literal', () => {
  assert.equal(escapeRegex('C++ (A) [b] .*'), 'C\\+\\+ \\(A\\) \\[b\\] \\.\\*');
  assert.ok(new RegExp(escapeRegex('[')).test('a[b'));
});
