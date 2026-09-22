// Builds the /api/health response from a Mongoose connection's state.
//
// A pure function (no Express, no real Mongo needed) so it can be unit tested
// with a plain object. mongoose.connection.readyState: 0 disconnected,
// 1 connected, 2 connecting, 3 disconnecting.

function getHealth(mongooseConnection) {
  const dbConnected = mongooseConnection.readyState === 1;
  return {
    status: dbConnected ? 'OK' : 'DEGRADED',
    database: dbConnected ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString(),
  };
}

module.exports = { getHealth };
