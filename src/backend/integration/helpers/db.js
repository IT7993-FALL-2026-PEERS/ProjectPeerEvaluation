const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');

// A real MongoDB for the integration tests (ADR 0001). One member, replica-set mode, so
// transactions work as they do on Atlas. The version is pinned to the staging Atlas cluster
// (8.0.x); override it with MONGOMS_VERSION. Set MONGOMS_DOWNLOAD_DIR to choose where the
// binary is cached (CI caches that folder).
const ATLAS_MONGODB_VERSION = '8.0.32';

// Requiring the models registers them, so init() below can build every index up front.
// Mongoose builds indexes in the background, and a duplicate-key test could otherwise pass
// or fail by timing.
require('../../models/Professor');
require('../../models/Course');
require('../../models/Student');
require('../../models/Team');
require('../../models/Evaluation');
require('../../models/Report');

async function startDatabase() {
  const replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1 },
    binary: { version: process.env.MONGOMS_VERSION || ATLAS_MONGODB_VERSION },
  });
  await mongoose.connect(replSet.getUri('peers-integration'));
  await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
  return replSet;
}

async function stopDatabase(replSet) {
  await mongoose.disconnect();
  await replSet.stop();
}

// Empties every collection but keeps the indexes. Call it before each test that writes.
async function clearDatabase() {
  await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
}

module.exports = { startDatabase, stopDatabase, clearDatabase, ATLAS_MONGODB_VERSION };
