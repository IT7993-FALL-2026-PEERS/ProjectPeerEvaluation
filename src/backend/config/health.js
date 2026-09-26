// Builds the /api/health response from a Mongoose connection's state.
//
// A pure function (no Express, no real Mongo needed) so it can be unit tested
// with a plain object. mongoose.connection.readyState: 0 disconnected,
// 1 connected, 2 connecting, 3 disconnecting. `commit` is the deployed git commit,
// which Render provides as RENDER_GIT_COMMIT (null when running elsewhere).

function getHealth(mongooseConnection, env = process.env) {
  const dbConnected = mongooseConnection.readyState === 1;
  return {
    status: dbConnected ? 'OK' : 'DEGRADED',
    database: dbConnected ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString(),
    commit: env.RENDER_GIT_COMMIT || null,
  };
}

module.exports = { getHealth };
