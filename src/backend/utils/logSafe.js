// What may go into the backend log about an error (CICD-92). The deployed service keeps its console
// output in Render's log, so an error is never logged as the whole object: a database write error carries
// the documents it tried to write (student records, ratings, feedback) and an email error the recipients.
// Some messages quote data too, so those errors are summarised by name and field names only:
// - a duplicate key (E11000) quotes the key, e.g. a student's university ID;
// - a Mongoose validation or cast error quotes the rejected value, e.g. an email address.
// Everything else keeps its stack (name, message and call sites), which is what debugging needs.
function frames(err) {
  return typeof err.stack === 'string' ? err.stack.split('\n').slice(1).join('\n') : '';
}

function withFrames(summary, err) {
  const f = frames(err);
  return f ? `${summary}\n${f}` : summary;
}

function errorText(err) {
  if (!err || typeof err !== 'object') return String(err);
  const name = err.name || 'Error';
  if (err.code === 11000 || err.code === 11001) {
    const fields = err.keyPattern ? Object.keys(err.keyPattern) : [];
    return withFrames(`${name}: duplicate key (E${err.code})${fields.length ? ` on ${fields.join(', ')}` : ''}`, err);
  }
  if (name === 'ValidationError' && err.errors && typeof err.errors === 'object') {
    return withFrames(`ValidationError on ${Object.keys(err.errors).join(', ')}`, err);
  }
  if (name === 'CastError') {
    return withFrames(`CastError on ${err.path || 'a field'} (${err.kind || 'value'})`, err);
  }
  if (typeof err.stack === 'string') return err.stack;
  if (typeof err.message === 'string') return `${name}: ${err.message}`;
  return String(err);
}

// An email failure: only the error's code and the SMTP status, since the message itself can quote the
// recipient's address ("Recipient address rejected: <...>").
function emailErrorText(err) {
  if (!err) return 'unknown error';
  const parts = [err.code || err.name || 'Error'];
  if (err.responseCode) parts.push(`SMTP ${err.responseCode}`);
  return parts.join(', ');
}

module.exports = { errorText, emailErrorText };
