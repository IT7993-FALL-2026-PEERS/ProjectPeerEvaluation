const test = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const path = require('node:path');
const { execFile } = require('node:child_process');

// Express 5 hands a failed bind (EADDRINUSE) to app.listen's callback instead of throwing. The
// callback used to log "Server running" regardless, so a second copy of the server looked started.
test('startup: a port that is already taken stops the server with an error, not a "Server running" line', async (t) => {
  const blocker = net.createServer();
  // No host: bind the same wildcard address app.listen uses, or Windows lets both bind.
  await new Promise((resolve) => blocker.listen(0, resolve));
  t.after(() => blocker.close());
  const { port } = blocker.address();

  const result = await new Promise((resolve) => {
    execFile(process.execPath, [path.join(__dirname, '..', 'index.js')], {
      cwd: path.join(__dirname, '..'),
      timeout: 20000,
      env: {
        PATH: process.env.PATH,
        SystemRoot: process.env.SystemRoot,
        PORT: String(port),
        // Nothing listens on port 1; the connection attempt fails fast and is only logged.
        MONGODB_URI: 'mongodb://127.0.0.1:1/startup-test?serverSelectionTimeoutMS=300',
        JWT_SECRET: 'startup-test-secret-at-least-32-characters',
      },
    }, (error, stdout, stderr) => resolve({ code: error ? error.code : 0, killed: Boolean(error && error.killed), stdout, stderr }));
  });

  assert.equal(result.killed, false, 'the process should exit by itself');
  assert.notEqual(result.code, 0, 'the exit code should say it failed');
  assert.doesNotMatch(result.stdout, /Server running/);
  assert.match(result.stderr, /Could not listen on port/);
});
