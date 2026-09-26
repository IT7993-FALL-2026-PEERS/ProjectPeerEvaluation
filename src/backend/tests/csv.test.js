const test = require('node:test');
const assert = require('node:assert/strict');
const { toCsv } = require('../utils/csv');

test('serializes plain rows with newline separators', () => {
  assert.equal(toCsv([['Name', 'Score'], ['John', 80]]), 'Name,Score\nJohn,80');
  assert.equal(toCsv([]), '');
});

test('escapes commas, quotes, carriage returns and newlines', () => {
  assert.equal(toCsv([['Smith, John', 'Team "A"', 'a\nb', 'a\rb']]),
    '"Smith, John","Team ""A""","a\nb","a\rb"');
});

test('preserves null fields, booleans and numbers including negative improvement', () => {
  assert.equal(toCsv([[null, undefined, '', 0, -2.5, 12, true, false]]), ',,,0,-2.5,12,true,false');
});

for (const prefix of ['=', '+', '-', '@', '\t', '\r']) {
  test(`neutralizes string prefix ${JSON.stringify(prefix)}`, () => {
    const field = "'" + prefix + 'value';
    assert.equal(toCsv([[prefix + 'value']]), prefix === '\r' ? '"' + field + '"' : field);
  });
}

test('neutralizes formulas before escaping and only at the start', () => {
  assert.equal(toCsv([['=SUM(1,2)', '-2.5', 'a=b']]), '"\'=SUM(1,2)",\'-2.5,a=b');
});
