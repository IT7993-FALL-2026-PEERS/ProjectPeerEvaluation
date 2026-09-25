// Render recommends keeping idle connections open longer than its load balancer does,
// or requests on a reused connection can fail with a 502.
const KEEP_ALIVE_TIMEOUT_MS = 120 * 1000;

function applyServerTimeouts(server) {
  server.keepAliveTimeout = KEEP_ALIVE_TIMEOUT_MS;
  server.headersTimeout = KEEP_ALIVE_TIMEOUT_MS;
  return server;
}

module.exports = { applyServerTimeouts, KEEP_ALIVE_TIMEOUT_MS };
