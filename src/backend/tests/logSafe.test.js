const test = require('node:test');
const assert = require('node:assert/strict');
const { errorText, emailErrorText } = require('../utils/logSafe');

// CICD-92: an error goes into the log by its stack only, never as the whole object.

test('TC-SEC-33: a database write error is logged without the documents it carried', () => {
  const err = new Error('E11000 duplicate key error');
  err.writeErrors = [{ op: { name: 'Quinn Quartz', email: 'quinn.quartz@example.edu', ratings: { professionalism: 4 } } }];
  const text = errorText(err);
  assert.match(text, /E11000 duplicate key error/);
  assert.match(text, /logSafe\.test\.js/, 'the stack is kept for debugging');
  assert.doesNotMatch(text, /Quinn Quartz|quinn\.quartz@example\.edu|professionalism/);
});

test('TC-SEC-36: a duplicate-key error is logged by the key fields, not the key values its message quotes', () => {
  const err = new Error('E11000 duplicate key error collection: peer.students index: student_id_1_course_id_1 dup key: { student_id: "987654", course_id: ObjectId(\'0000000000000000000000c1\') }');
  err.name = 'MongoBulkWriteError';
  err.code = 11000;
  err.keyPattern = { student_id: 1, course_id: 1 };
  const text = errorText(err);
  assert.match(text, /^MongoBulkWriteError: duplicate key \(E11000\) on student_id, course_id/);
  assert.doesNotMatch(text, /987654/);
});

test('TC-SEC-37: a validation or cast error is logged by the field names, not the rejected values', () => {
  const validation = new Error('Student validation failed: email: Path `email` is invalid (quinn.quartz@example).');
  validation.name = 'ValidationError';
  validation.errors = { email: { message: 'Path `email` is invalid (quinn.quartz@example).' } };
  assert.match(errorText(validation), /^ValidationError on email/);
  assert.doesNotMatch(errorText(validation), /quinn/);

  const cast = new Error('Cast to ObjectId failed for value "Quinn Quartz" (type string) at path "_id"');
  cast.name = 'CastError';
  cast.path = '_id';
  cast.kind = 'ObjectId';
  assert.match(errorText(cast), /^CastError on _id \(ObjectId\)/);
  assert.doesNotMatch(errorText(cast), /Quinn/);
});

test('TC-SEC-34: values that are not errors are still logged as text', () => {
  assert.equal(errorText('plain failure'), 'plain failure');
  assert.equal(errorText({ name: 'MongoError', message: 'boom' }), 'MongoError: boom');
  assert.equal(errorText(undefined), 'undefined');
});

test('TC-SEC-35: an email failure is logged by its code and SMTP status, never the recipient', () => {
  const err = new Error("Can't send mail - all recipients were rejected: 550 5.1.1 <quinn.quartz@example.edu>: Recipient address rejected");
  err.code = 'EENVELOPE';
  err.responseCode = 550;
  err.rejected = ['quinn.quartz@example.edu'];
  assert.equal(emailErrorText(err), 'EENVELOPE, SMTP 550');
  assert.equal(emailErrorText(null), 'unknown error');
});
