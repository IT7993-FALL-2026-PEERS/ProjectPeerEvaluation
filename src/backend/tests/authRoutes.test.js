const test = require('node:test');
const assert = require('node:assert/strict');

test('auth routes: loads silently and registers each POST endpoint once', (t) => {
  const originalSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'auth-routes-test-secret-at-least-32-characters';
  t.after(() => {
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
  });
  const log = t.mock.method(console, 'log', () => {});
  const router = require('../routes/auth');
  assert.equal(log.mock.callCount(), 0);
  const routes = router.stack.filter(layer => layer.route).map(layer => layer.route);
  const paths = ['/login', '/register', '/logout', '/refresh', '/verify-mfa', '/reset-password', '/update-password'];
  assert.equal(routes.length, paths.length);
  for (const path of paths) {
    const matches = routes.filter(route => route.path === path);
    assert.equal(matches.length, 1, path + ' should be registered once');
    assert.deepEqual(matches[0].methods, { post: true });
  }
});
