const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { ESLint } = require('eslint');

// Guards the backend lint config itself: if a later change drops a rule these
// cases rely on, the tests fail instead of the gap going unnoticed.
const backendRoot = path.join(__dirname, '..');
const eslint = new ESLint({ cwd: backendRoot });

async function lint(code) {
  const [result] = await eslint.lintText(code, { filePath: path.join(backendRoot, 'controllers', 'lint-fixture.js') });
  return result.messages.map((m) => m.ruleId);
}

// API-8 was an object with `_id` twice, where the second silently replaced the first.
test('a duplicate object key fails lint', async () => {
  const rules = await lint('module.exports = { find: { _id: 1, _id: 2 } };\n');
  assert.ok(rules.includes('no-dupe-keys'), `got ${JSON.stringify(rules)}`);
});

test('an unused variable fails lint', async () => {
  const rules = await lint('const unused = 1;\nmodule.exports = {};\n');
  assert.ok(rules.includes('no-unused-vars'), `got ${JSON.stringify(rules)}`);
});

test('an Express error handler may keep an unused _next', async () => {
  const rules = await lint('module.exports = (err, req, res, _next) => res.status(500).json({ err });\n');
  assert.deepEqual(rules, []);
});
