// Logs each request's method and URL. Student evaluation links carry their token
// in the path (/api/evaluate/<token>), and these logs go to Render's log stream,
// so the token is replaced before logging. Case-insensitive, like Express routing.
function redactUrl(url) {
  return url.replace(/^(\/api\/evaluate\/)[^/?#]+/i, '$1[redacted]');
}

function requestLogger(req, res, next) {
  console.log(`[${new Date().toISOString()}] ${req.method} ${redactUrl(req.originalUrl)}`);
  next();
}

module.exports = { requestLogger, redactUrl };
