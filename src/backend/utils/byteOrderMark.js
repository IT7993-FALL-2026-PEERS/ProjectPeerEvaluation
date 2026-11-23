const { Transform } = require('stream');

// Excel's "CSV UTF-8" save starts the file with a UTF-8 byte-order mark (bytes EF BB BF). Left in, it
// becomes part of the first column name, so "student_id" is not found and every row is refused (CICD-93).
// It is removed from the bytes before the CSV parser sees them: removing it from the parsed header would
// be too late for a quoted header (\uFEFF"student_id"), where the parser has already kept the quotes.
function stripByteOrderMark() {
  let head = Buffer.alloc(0);
  let done = false;
  return new Transform({
    transform(chunk, _encoding, callback) {
      if (done) return callback(null, chunk);
      head = Buffer.concat([head, chunk]);
      if (head.length < 3) return callback(); // wait for the first three bytes
      done = true;
      const hasMark = head[0] === 0xef && head[1] === 0xbb && head[2] === 0xbf;
      callback(null, hasMark ? head.subarray(3) : head);
    },
    flush(callback) {
      // a file shorter than three bytes cannot hold a mark and a header
      callback(null, done ? undefined : head);
    },
  });
}

module.exports = { stripByteOrderMark };
