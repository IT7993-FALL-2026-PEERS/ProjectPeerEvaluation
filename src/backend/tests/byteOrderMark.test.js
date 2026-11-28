const test = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('stream');
const { stripByteOrderMark } = require('../utils/byteOrderMark');

// CICD-93: the UTF-8 byte-order mark (EF BB BF) Excel writes is removed before the CSV parser reads the file.
const MARK = Buffer.from([0xef, 0xbb, 0xbf]);

async function through(chunks) {
  const out = [];
  for await (const piece of Readable.from(chunks, { objectMode: false }).pipe(stripByteOrderMark())) out.push(piece);
  return Buffer.concat(out).toString('utf8');
}

test('TC-06-98: the mark is removed from the start of the file, and only from the start', async () => {
  assert.equal(await through([Buffer.concat([MARK, Buffer.from('student_id,name\r\n1,Ann\r\n')])]), 'student_id,name\r\n1,Ann\r\n');
  assert.equal(await through([Buffer.from('student_id,name\n'), Buffer.concat([MARK, Buffer.from('x')])]), 'student_id,name\n' + MARK.toString('utf8') + 'x',
    'a mark later in the file is data and is kept');
  assert.equal(await through([Buffer.from('student_id,name\n1,Ann\n')]), 'student_id,name\n1,Ann\n', 'a file without the mark is unchanged');
});

test('TC-06-99: a mark split across the first chunks, and files shorter than the mark, are handled', async () => {
  assert.equal(await through([MARK.subarray(0, 1), MARK.subarray(1, 2), Buffer.concat([MARK.subarray(2), Buffer.from('id')])]), 'id');
  assert.equal(await through([Buffer.from('a')]), 'a');
  assert.equal(await through([MARK]), '');
  assert.equal(await through([]), '');
});
