// Express 5 leaves req.body undefined when a request carries no body (Express 4 set it to {}).
// Handlers destructure req.body, and the course page posts some actions with nothing to send, so
// give those requests an empty object, as before.
module.exports = function defaultBody(req, res, next) {
  if (req.body === undefined) req.body = {};
  next();
};
