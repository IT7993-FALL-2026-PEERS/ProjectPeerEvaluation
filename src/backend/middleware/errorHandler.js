// Global error handler middleware for standardized error responses
// Express only treats middleware with four parameters as an error handler, so
// `_next` has to stay even though it isn't called.
module.exports = (err, req, res, _next) => {
  const status = err.status || 500;
  res.status(status).json({
    error: {
      code: err.code || 'SERVER_ERROR',
      message: err.message || 'Internal server error',
      details: err.details || {},
      timestamp: new Date().toISOString()
    }
  });
};
